import { describe, expect, it } from 'vitest';

import type { GameSearchQuery, GameSummary } from '@/persistence/types';

import {
  copyGames,
  findDuplicates,
  moveGames,
  previewMerge,
  removeExactDuplicates,
} from './operations';
import type {
  DuplicateKeyPage,
  GameCollection,
  GameCollectionRef,
  TransferGame,
  TransferPage,
  WriteOutcome,
} from './types';

/**
 * An in-memory collection with the same contract as the real two.
 *
 * Written as a double rather than driven through IndexedDB because what these
 * tests are about is the *protocol* between source and destination — how a
 * failed write is reported, what a move does when verification comes back
 * short, what a cancel leaves behind. Those are properties of the loop, and a
 * double can be made to fail in ways a real store cannot be asked to.
 */
class FakeCollection implements GameCollection {
  readonly ref: GameCollectionRef;
  games = new Map<string, TransferGame>();

  /** Fingerprints this collection will silently refuse to store. */
  refuse = new Set<string>();
  /** When true, `write` claims success but stores nothing. */
  lie = false;
  writeCalls = 0;

  constructor(id: string, name = id, seed: readonly TransferGame[] = []) {
    this.ref = { id, kind: 'indexeddb', name };
    for (const game of seed) this.games.set(game.summary.fingerprint, game);
  }

  async count() {
    return this.games.size;
  }

  async read(
    query: GameSearchQuery | null,
    after: string | null,
    limit: number,
  ): Promise<TransferPage> {
    const ordered = [...this.games.values()].sort((a, b) =>
      a.summary.fingerprint.localeCompare(b.summary.fingerprint),
    );
    const start =
      after === null ? 0 : ordered.findIndex((g) => g.summary.fingerprint === after) + 1;
    const slice = ordered.slice(start, start + limit);
    const games = query
      ? slice.filter((game) => !query.player || game.summary.whiteKey === query.player)
      : slice;
    return {
      games,
      nextAfter:
        start + limit >= ordered.length ? null : (slice.at(-1)?.summary.fingerprint ?? null),
    };
  }

  async have(fingerprints: readonly string[]) {
    return new Set(fingerprints.filter((fingerprint) => this.games.has(fingerprint)));
  }

  async write(games: readonly TransferGame[]): Promise<WriteOutcome> {
    this.writeCalls += 1;
    let written = 0;
    let duplicates = 0;
    for (const game of games) {
      const fingerprint = game.summary.fingerprint;
      if (this.refuse.has(fingerprint)) continue;
      if (this.games.has(fingerprint)) {
        duplicates += 1;
        continue;
      }
      if (!this.lie) this.games.set(fingerprint, game);
      written += 1;
    }
    return { written, duplicates, present: games.map((game) => game.summary.fingerprint) };
  }

  async removeByFingerprint(fingerprints: readonly string[]) {
    let removed = 0;
    for (const fingerprint of fingerprints) {
      if (this.games.delete(fingerprint)) removed += 1;
    }
    return removed;
  }

  async duplicateKeys(after: string | null, limit: number): Promise<DuplicateKeyPage> {
    const ordered = [...this.games.values()].sort((a, b) =>
      a.summary.fingerprint.localeCompare(b.summary.fingerprint),
    );
    const start =
      after === null ? 0 : ordered.findIndex((g) => g.summary.fingerprint === after) + 1;
    const slice = ordered.slice(start, start + limit);
    return {
      games: slice.map((game) => ({
        id: game.summary.fingerprint,
        fingerprint: game.summary.fingerprint,
        white: game.summary.white,
        black: game.summary.black,
        ...(game.summary.date ? { date: game.summary.date } : {}),
        ...(game.summary.event ? { event: game.summary.event } : {}),
        ...(game.summary.round ? { round: game.summary.round } : {}),
        result: game.summary.result,
      })),
      nextAfter:
        start + limit >= ordered.length ? null : (slice.at(-1)?.summary.fingerprint ?? null),
    };
  }
}

let seq = 0;
function game(
  fingerprint: string,
  overrides: Partial<GameSummary> = {},
  pgn = `1. e4 e5 ${(seq += 1)}`,
): TransferGame {
  return {
    summary: {
      fingerprint,
      white: 'White',
      black: 'Black',
      whiteKey: 'white',
      blackKey: 'black',
      playerKeys: ['white', 'black'],
      result: '1-0',
      importedAt: 1,
      ...overrides,
    } as Omit<GameSummary, 'id'>,
    pgn,
    positions: [],
  };
}

const games = (...fingerprints: string[]) => fingerprints.map((f) => game(f));

describe('copying games between collections', () => {
  it('copies everything and leaves the source untouched', async () => {
    const source = new FakeCollection('a', 'A', games('f1', 'f2', 'f3'));
    const destination = new FakeCollection('b');

    const result = await copyGames(source, destination, { pageSize: 2 });

    expect(result.stage).toBe('complete');
    expect(result.written).toBe(3);
    expect(result.removed).toBe(0);
    expect(source.games.size).toBe(3);
    expect(destination.games.size).toBe(3);
  });

  it('counts games the destination already had rather than failing', async () => {
    const source = new FakeCollection('a', 'A', games('f1', 'f2'));
    const destination = new FakeCollection('b', 'B', games('f1'));

    const result = await copyGames(source, destination);

    expect(result.written).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(destination.games.size).toBe(2);
  });

  it('copies only the filtered result when given a query', async () => {
    const source = new FakeCollection('a', 'A', [
      game('f1', { whiteKey: 'carlsen' }),
      game('f2', { whiteKey: 'other' }),
    ]);
    const destination = new FakeCollection('b');

    await copyGames(source, destination, { query: { player: 'carlsen' } });

    expect([...destination.games.keys()]).toEqual(['f1']);
  });

  it('copies only the selected games when given fingerprints', async () => {
    const source = new FakeCollection('a', 'A', games('f1', 'f2', 'f3'));
    const destination = new FakeCollection('b');

    await copyGames(source, destination, { fingerprints: ['f2'] });

    expect([...destination.games.keys()]).toEqual(['f2']);
  });

  it('refuses to copy a collection into itself', async () => {
    const source = new FakeCollection('a', 'A', games('f1'));
    await expect(copyGames(source, source)).rejects.toThrow(/same collection/i);
  });

  it('reports games the destination could not store', async () => {
    const source = new FakeCollection('a', 'A', games('f1', 'f2'));
    const destination = new FakeCollection('b');
    destination.refuse.add('f2');

    const result = await copyGames(source, destination);

    expect(result.written).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('keeps what it copied when cancelled part-way', async () => {
    const source = new FakeCollection('a', 'A', games('f1', 'f2', 'f3', 'f4'));
    const destination = new FakeCollection('b');
    const controller = new AbortController();

    const result = await copyGames(source, destination, {
      pageSize: 1,
      signal: controller.signal,
      onProgress: (progress) => {
        if (progress.written === 2) controller.abort();
      },
    });

    expect(result.stage).toBe('cancelled');
    expect(destination.games.size).toBe(2);
    expect(source.games.size).toBe(4);
  });
});

describe('moving games', () => {
  it('copies, verifies, then deletes from the source', async () => {
    const source = new FakeCollection('a', 'A', games('f1', 'f2', 'f3'));
    const destination = new FakeCollection('b');

    const result = await moveGames(source, destination, { pageSize: 2 });

    expect(result.written).toBe(3);
    expect(result.removed).toBe(3);
    expect(source.games.size).toBe(0);
    expect(destination.games.size).toBe(3);
  });

  it('DELETES NOTHING when the destination reported success but stored nothing', async () => {
    /*
      The invariant. A destination that answers "written: 3" and holds none of
      them is exactly the failure a move implemented as copy-then-delete loses
      data to. Verification catches it because it asks the destination what it
      has rather than what it said.
    */
    const source = new FakeCollection('a', 'A', games('f1', 'f2', 'f3'));
    const destination = new FakeCollection('b');
    destination.lie = true;

    const result = await moveGames(source, destination);

    expect(source.games.size).toBe(3);
    expect(result.removed).toBe(0);
    expect(result.undeletedAfterCopy).toBe(3);
  });

  it('deletes only the games the destination confirmed, not the whole page', async () => {
    const source = new FakeCollection('a', 'A', games('f1', 'f2', 'f3'));
    const destination = new FakeCollection('b');
    destination.refuse.add('f2');

    const result = await moveGames(source, destination, { pageSize: 3 });

    expect([...source.games.keys()]).toEqual(['f2']);
    expect(result.removed).toBe(2);
    expect(result.undeletedAfterCopy).toBe(1);
  });

  it('leaves finished pages moved and unfinished pages in the source', async () => {
    const source = new FakeCollection('a', 'A', games('f1', 'f2', 'f3', 'f4'));
    const destination = new FakeCollection('b');
    const controller = new AbortController();

    await moveGames(source, destination, {
      pageSize: 1,
      signal: controller.signal,
      onProgress: (progress) => {
        if (progress.removed === 2) controller.abort();
      },
    });

    /*
      The invariant, and the only thing worth asserting: every game is in
      exactly one of the two collections. How far the move got before the
      cancel landed depends on where in the page the signal was raised, and
      pinning that would be testing the scheduler rather than the contract.
    */
    const everywhere = [...source.games.keys(), ...destination.games.keys()].sort();
    expect(everywhere).toEqual(['f1', 'f2', 'f3', 'f4']);
    expect(source.games.size).toBeGreaterThan(0);
    expect(destination.games.size).toBeGreaterThan(0);
  });

  it('treats a game the destination already held as safely moved', async () => {
    const source = new FakeCollection('a', 'A', games('f1'));
    const destination = new FakeCollection('b', 'B', games('f1'));

    const result = await moveGames(source, destination);

    expect(result.duplicates).toBe(1);
    expect(result.removed).toBe(1);
    expect(source.games.size).toBe(0);
    expect(destination.games.size).toBe(1);
  });
});

describe('previewing a merge', () => {
  it('reports exact overlap, not an estimate', async () => {
    const source = new FakeCollection('a', 'A', games('f1', 'f2', 'f3', 'f4'));
    const destination = new FakeCollection('b', 'B', games('f2', 'f4', 'f9'));

    const preview = await previewMerge(source, destination, { pageSize: 2 });

    expect(preview.sourceGames).toBe(4);
    expect(preview.alreadyPresent).toBe(2);
    expect(preview.newGames).toBe(2);
    expect(preview.partial).toBe(false);
  });

  it('marks a cancelled preview as partial rather than reporting it as a total', async () => {
    const source = new FakeCollection('a', 'A', games('f1', 'f2', 'f3', 'f4'));
    const destination = new FakeCollection('b');
    const controller = new AbortController();

    const preview = await previewMerge(source, destination, {
      pageSize: 1,
      onProgress: (scanned) => {
        if (scanned >= 2) controller.abort();
      },
      signal: controller.signal,
    });

    expect(preview.partial).toBe(true);
    expect(preview.sourceGames).toBeLessThan(4);
  });
});

describe('finding duplicates across collections', () => {
  const identical = {
    white: 'Carlsen',
    black: 'Nepo',
    date: '2021.12.03',
    event: 'WCh',
    round: '6',
  };

  it('groups games that are byte-identical as exact duplicates', async () => {
    const a = new FakeCollection('a', 'Archive', [game('same', identical)]);
    const b = new FakeCollection('b', 'Prep', [game('same', identical)]);

    const result = await findDuplicates([a, b]);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.kind).toBe('exact');
    expect(result.groups[0]?.members.map((m) => m.collectionName).sort()).toEqual([
      'Archive',
      'Prep',
    ]);
  });

  it('flags the same game with different annotations without calling it exact', async () => {
    const a = new FakeCollection('a', 'Archive', [game('fp-a', identical)]);
    const b = new FakeCollection('b', 'Prep', [game('fp-b', identical)]);

    const result = await findDuplicates([a, b]);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.kind).toBe('annotations-differ');
  });

  it('does not report the same games twice under both kinds', async () => {
    const a = new FakeCollection('a', 'Archive', [game('same', identical)]);
    const b = new FakeCollection('b', 'Prep', [game('same', identical)]);
    const c = new FakeCollection('c', 'Old', [game('same', identical)]);

    const result = await findDuplicates([a, b, c]);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.members).toHaveLength(3);
  });

  it('separates an exact pair from a third differently-annotated copy', async () => {
    const a = new FakeCollection('a', 'A', [game('same', identical)]);
    const b = new FakeCollection('b', 'B', [game('same', identical)]);
    const c = new FakeCollection('c', 'C', [game('other', identical)]);

    const result = await findDuplicates([a, b, c]);

    // The exact pair is a group; the odd one out is not a group of one.
    expect(result.groups.map((group) => group.kind)).toEqual(['exact']);
  });

  it('leaves distinct games alone', async () => {
    const a = new FakeCollection('a', 'A', [game('f1', { white: 'Carlsen' })]);
    const b = new FakeCollection('b', 'B', [game('f2', { white: 'Firouzja' })]);

    expect((await findDuplicates([a, b])).groups).toHaveLength(0);
  });
});

describe('removing exact duplicates', () => {
  it('keeps the chosen copy and removes the rest', async () => {
    const a = new FakeCollection('a', 'A', [game('same')]);
    const b = new FakeCollection('b', 'B', [game('same')]);
    const found = await findDuplicates([a, b]);
    const group = found.groups[0];
    if (!group) throw new Error('expected a group');
    const keep = group.members.find((member) => member.collectionId === 'a');
    if (!keep) throw new Error('expected a member in A');

    const removed = await removeExactDuplicates(
      group,
      keep,
      new Map([
        ['a', a],
        ['b', b],
      ]),
    );

    expect(removed).toBe(1);
    expect(a.games.size).toBe(1);
    expect(b.games.size).toBe(0);
  });

  it('refuses to decide between differently-annotated copies', async () => {
    const a = new FakeCollection('a', 'A', [game('fp-a', { event: 'WCh', round: '6' })]);
    const b = new FakeCollection('b', 'B', [game('fp-b', { event: 'WCh', round: '6' })]);
    const found = await findDuplicates([a, b]);
    const group = found.groups[0];
    if (!group) throw new Error('expected a group');

    await expect(
      removeExactDuplicates(group, group.members[0]!, new Map([['a', a]])),
    ).rejects.toThrow(/only exact duplicates/i);
    expect(a.games.size).toBe(1);
    expect(b.games.size).toBe(1);
  });
});
