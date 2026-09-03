import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import { openPersistenceDatabaseAt } from '@/persistence/indexeddb/database';
import { indexGame, normalizeGame } from '@/persistence/prepare-game';
import { DATABASE_VERSION, STORE_NAMES } from '@/persistence/schema/migrations';
import type { GameSummary } from '@/persistence/types';

import { LocalClassificationTarget, positionKeysByPly } from './classification-targets';
import {
  backfillClassification,
  classifyKeys,
  openingDisplay,
  type ClassificationPage,
  type ClassificationTarget,
  type ClassifiedGame,
} from './classify-games';
import { loadOpeningIndex } from './openings';

const index = await loadOpeningIndex();

let counter = 0;
const dbName = () => `kingfisher-classification-${++counter}`;

const NAJDORF =
  '[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n' +
  '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 1-0';
const UNTAGGED_FRENCH =
  '[White "C"]\n[Black "D"]\n[Result "0-1"]\n\n1. e4 e6 2. d4 d5 3. Nc3 Bb4 0-1';

function storedGame(pgn: string) {
  const parsed = parsePgn(pgn).games[0];
  if (!parsed) throw new Error('fixture PGN did not parse');
  const game = normalizeGame(parsed.tree);
  return { game, positions: indexGame(game) };
}

/** A collection written the way a pre-Phase-12 import would have written it. */
async function seedUnclassified(pgns: readonly string[]) {
  const database = await openPersistenceDatabaseAt(DATABASE_VERSION, dbName());
  for (const pgn of pgns) {
    const { game, positions } = storedGame(pgn);
    const { tree, normalizedPgn, ...summary } = game;
    await database.put(STORE_NAMES.games, summary);
    await database.put(STORE_NAMES.gameContent, { id: summary.id, tree, normalizedPgn });
    for (const position of positions) await database.put(STORE_NAMES.positions, position);
  }
  return database;
}

describe('reading main-line positions out of the stored position index', () => {
  it('returns the positions after each ply, in order', () => {
    const { game, positions } = storedGame(NAJDORF);
    const keys = positionKeysByPly(positions);
    expect(keys.length).toBeGreaterThan(10);
    expect(classifyKeys(index, keys).classification?.name).toBe('Sicilian Defense');
    expect(classifyKeys(index, keys).classification?.variation).toContain('Najdorf');
    expect(game.classification).toBeUndefined();
  });

  it('skips ply 1, which holds the starting position and names nothing', () => {
    const { positions } = storedGame(NAJDORF);
    const keys = positionKeysByPly(positions);
    expect(keys[0]).not.toContain('RNBQKBNR w KQkq');
  });
});

describe('backfilling a collection imported before classification existed', () => {
  it('classifies every game and records which index did it', async () => {
    const database = await seedUnclassified([NAJDORF, UNTAGGED_FRENCH]);
    const target = new LocalClassificationTarget(database);

    expect(await target.remaining(index.digest)).toBe(2);
    const result = await backfillClassification(target, { pageSize: 1 });

    expect(result.stage).toBe('complete');
    expect(result.processed).toBe(2);
    expect(result.named).toBe(2);
    expect(await target.remaining(index.digest)).toBe(0);

    const stored = await database.getAll<GameSummary>(STORE_NAMES.games);
    const names = stored.map((game) => game.classification?.name).sort();
    expect(names).toEqual(['French Defense', 'Sicilian Defense']);
    for (const game of stored) expect(game.classifiedWith).toBe(index.digest);
    database.close();
  });

  it('is idempotent — a second run finds nothing to do', async () => {
    const database = await seedUnclassified([NAJDORF]);
    const target = new LocalClassificationTarget(database);
    await backfillClassification(target);
    const second = await backfillClassification(target);
    expect(second.processed).toBe(0);
    expect(second.stage).toBe('complete');
    database.close();
  });

  it('keeps the pages it committed when cancelled, and resumes from there', async () => {
    const database = await seedUnclassified([NAJDORF, UNTAGGED_FRENCH]);
    const target = new LocalClassificationTarget(database);
    const controller = new AbortController();

    const stopped = await backfillClassification(target, {
      pageSize: 1,
      signal: controller.signal,
      onProgress: (progress) => {
        if (progress.processed === 1) controller.abort();
      },
    });
    expect(stopped.stage).toBe('cancelled');
    expect(stopped.processed).toBe(1);
    expect(await target.remaining(index.digest)).toBe(1);

    const resumed = await backfillClassification(target, { pageSize: 1 });
    expect(resumed.processed).toBe(1);
    expect(await target.remaining(index.digest)).toBe(0);
    database.close();
  });

  it('never overwrites the tags the file declared', async () => {
    const tagged =
      '[White "E"]\n[Black "F"]\n[ECO "B20"]\n[Opening "Sicilian"]\n[Result "*"]\n\n' +
      '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 *';
    const database = await seedUnclassified([tagged]);
    await backfillClassification(new LocalClassificationTarget(database));

    const [stored] = await database.getAll<GameSummary>(STORE_NAMES.games);
    expect(stored?.eco).toBe('B20');
    expect(stored?.opening).toBe('Sicilian');
    expect(stored?.classification?.eco).toBe('B90');
    database.close();
  });

  it('marks a game it could not name, so it is not re-examined for ever', async () => {
    /*
      An endgame fragment, which is an ordinary thing to import and which no
      opening table names. The row must still record which index looked at it,
      or every future run would revisit it for ever.
    */
    const obscure =
      '[White "G"]\n[Black "H"]\n[Result "*"]\n' +
      '[SetUp "1"]\n[FEN "8/5k2/8/8/3Q4/8/5K2/8 w - - 0 60"]\n\n60. Qd5+ Kf6 61. Qe4 *';
    const database = await seedUnclassified([obscure]);
    const target = new LocalClassificationTarget(database);
    const result = await backfillClassification(target);

    expect(result.processed).toBe(1);
    expect(result.named).toBe(0);
    const [stored] = await database.getAll<GameSummary>(STORE_NAMES.games);
    expect(stored?.classification).toBeUndefined();
    expect(stored?.classifiedWith).toBe(index.digest);
    expect(await target.remaining(index.digest)).toBe(0);
    database.close();
  });
});

describe('the backfill loop over an arbitrary target', () => {
  /** Pages that are mostly already-classified games, to exercise empty pages. */
  function sparseTarget(
    total: number,
    unclassifiedIds: readonly string[],
  ): {
    target: ClassificationTarget;
    written: ClassifiedGame[];
  } {
    const written: ClassifiedGame[] = [];
    const ids = Array.from({ length: total }, (_, i) => `g${String(i).padStart(3, '0')}`);
    const target: ClassificationTarget = {
      async remaining() {
        return unclassifiedIds.length;
      },
      async page(_digest, limit, after): Promise<ClassificationPage> {
        const start = after === null ? 0 : ids.indexOf(after) + 1;
        const slice = ids.slice(start, start + limit);
        return {
          games: slice
            .filter((id) => unclassifiedIds.includes(id))
            .map((id) => ({ id, positionKeys: [] })),
          nextAfter: start + limit >= ids.length ? null : (slice.at(-1) ?? null),
        };
      },
      async apply(entries) {
        written.push(...entries);
      },
    };
    return { target, written };
  }

  it('walks past pages with nothing to do instead of stopping at the first one', async () => {
    const { target, written } = sparseTarget(20, ['g018']);
    const result = await backfillClassification(target, { pageSize: 5 });
    expect(result.stage).toBe('complete');
    expect(written.map((entry) => entry.id)).toEqual(['g018']);
  });
});

describe('what a game list should print', () => {
  const base = {
    id: 'g',
    fingerprint: 'f',
    white: 'A',
    black: 'B',
    whiteKey: 'a',
    blackKey: 'b',
    playerKeys: ['a', 'b'],
    result: '*',
    importedAt: 0,
  } as unknown as GameSummary;

  it('prefers what Kingfisher computed', () => {
    const display = openingDisplay({
      ...base,
      eco: 'B20',
      opening: 'Sicilian',
      classification: { eco: 'B90', name: 'Sicilian Defense', variation: 'Najdorf', ply: 10 },
    });
    expect(display.source).toBe('kingfisher');
    expect(display.eco).toBe('B90');
    expect(display.label).toBe('Sicilian Defense: Najdorf');
    expect(display.conflict).toBe(true);
  });

  it('does not call it a conflict when the codes agree', () => {
    const display = openingDisplay({
      ...base,
      eco: 'b90',
      classification: { eco: 'B90', name: 'Sicilian Defense', ply: 10 },
    });
    expect(display.conflict).toBe(false);
  });

  it('falls back to the file when nothing has been computed', () => {
    const display = openingDisplay({ ...base, eco: 'C42', opening: 'Petrov' });
    expect(display.source).toBe('file');
    expect(display.eco).toBe('C42');
    expect(display.conflict).toBe(false);
  });

  it('says nothing rather than guessing', () => {
    expect(openingDisplay(base).source).toBe('none');
  });
});
