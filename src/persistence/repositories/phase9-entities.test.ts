/**
 * The Phase 9 entities, and the properties that make them worth having.
 *
 * Every one of these records exists to *reference* work rather than copy it,
 * so the tests that matter are the ones about identity and staleness: that a
 * session holds ids, that a sheet card is owned outright, that two tabs cannot
 * silently overwrite each other, and that a position's piece count is counted
 * rather than guessed.
 */

import { describe, expect, it } from 'vitest';

import { START_FEN, positionKey } from '@/chess/fen';
import { asFen, asSan } from '@/chess/types';
import {
  StaleOpeningFileWriteError,
  StalePreparationSessionWriteError,
} from '@/persistence/domain';
import { createMemoryRepositories } from '@/persistence/repositories';
import { countPieces, matchesEndgameQuery } from './endgame-repository';
import type { EndgamePositionRecord } from '@/persistence/domain';

const KEY = positionKey(START_FEN);
/** Kh8/Kh1 plus a white rook: three pieces, comfortably tablebase-eligible. */
const ROOK_ENDING = asFen('7k/8/8/8/8/8/8/R6K w - - 0 1');

describe('preparation sessions', () => {
  it('normalizes the opponent so a session is findable from a player profile', async () => {
    const repositories = createMemoryRepositories();
    await repositories.preparation.create({
      title: 'Round 6',
      opponent: '  Carlsen, Magnus ',
      myColor: 'b',
      event: 'Candidates',
      round: '6',
      gameDate: '2026-04-12',
    });

    const found = await repositories.preparation.forOpponent('CARLSEN,   magnus');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      title: 'Round 6',
      opponent: 'Carlsen, Magnus',
      myColor: 'b',
      round: '6',
    });
  });

  it('references other work by id and never copies it', async () => {
    const repositories = createMemoryRepositories();
    const repertoire = await repositories.repertoires.create({
      title: 'Black vs 1.e4',
      color: 'b',
    });
    const session = await repositories.preparation.create({ title: 'Round 6', myColor: 'b' });

    const linked = await repositories.preparation.addReference(
      session.id,
      session.revision,
      'repertoireIds',
      repertoire.id,
    );
    expect(linked.repertoireIds).toEqual([repertoire.id]);

    // Adding the same reference twice is a slip, not a second reference.
    const again = await repositories.preparation.addReference(
      linked.id,
      linked.revision,
      'repertoireIds',
      repertoire.id,
    );
    expect(again.repertoireIds).toEqual([repertoire.id]);

    // Renaming the repertoire changes what the session shows, because the
    // session never held a copy of the title in the first place.
    await repositories.repertoires.update(repertoire.id, { title: 'Najdorf only' });
    const reread = await repositories.repertoires.get(again.repertoireIds[0]!);
    expect(reread?.repertoire.title).toBe('Najdorf only');
  });

  it('owns the game-day sheet, keeps its order, and refuses a duplicate position', async () => {
    const repositories = createMemoryRepositories();
    let session = await repositories.preparation.create({ title: 'Round 6', myColor: 'b' });

    session = await repositories.preparation.addSheetCard(session.id, session.revision, {
      positionKey: KEY,
      fen: START_FEN,
      line: [asSan('e4'), asSan('c5')],
      why: 'He always plays this',
      intendedSan: asSan('Nf6'),
      source: 'explorer',
    });
    session = await repositories.preparation.addSheetCard(session.id, session.revision, {
      positionKey: `${KEY} second`,
      fen: START_FEN,
      line: [asSan('d4')],
    });
    expect(session.sheet.map((card) => card.line.join(' '))).toEqual(['e4 c5', 'd4']);

    await expect(
      repositories.preparation.addSheetCard(session.id, session.revision, {
        positionKey: KEY,
        fen: START_FEN,
        line: [asSan('e4')],
      }),
    ).rejects.toThrow(/already on the game-day sheet/);

    // Order is the order it is read in, so it has to be editable.
    const moved = await repositories.preparation.moveSheetCard(
      session.id,
      session.revision,
      session.sheet[1]!.id,
      0,
    );
    expect(moved.sheet.map((card) => card.line.join(' '))).toEqual(['d4', 'e4 c5']);
  });

  it('refuses a write from a tab holding an older revision', async () => {
    const repositories = createMemoryRepositories();
    const session = await repositories.preparation.create({ title: 'Round 6', myColor: 'w' });
    await repositories.preparation.update(session.id, session.revision, { notes: 'first' });

    await expect(
      repositories.preparation.update(session.id, session.revision, { notes: 'second' }),
    ).rejects.toBeInstanceOf(StalePreparationSessionWriteError);
  });
});

describe('opening files', () => {
  it('gathers references and the positions the file is about', async () => {
    const repositories = createMemoryRepositories();
    let file = await repositories.openingFiles.create({
      name: 'Black vs 1.e4 — Najdorf',
      color: 'b',
      positionKey: KEY,
      fen: START_FEN,
      eco: 'B90',
    });

    file = await repositories.openingFiles.addPosition(file.id, file.revision, {
      positionKey: 'najdorf-key',
      fen: START_FEN,
      line: [asSan('e4'), asSan('c5'), asSan('Nf3')],
      note: 'The tabiya',
    });
    expect(file.positions).toHaveLength(1);

    // The same position added twice is one position.
    const same = await repositories.openingFiles.addPosition(file.id, file.revision, {
      positionKey: 'najdorf-key',
      fen: START_FEN,
      line: [asSan('e4')],
    });
    expect(same.positions).toHaveLength(1);

    // Findable both by its root and by a position added to it.
    expect(await repositories.openingFiles.forPosition(KEY)).toHaveLength(1);
    expect(await repositories.openingFiles.forPosition('najdorf-key')).toHaveLength(1);
    expect(await repositories.openingFiles.forPosition('nothing')).toHaveLength(0);
  });

  it('refuses a duplicate name and a stale write', async () => {
    const repositories = createMemoryRepositories();
    const file = await repositories.openingFiles.create({ name: 'Catalan', color: 'w' });
    await expect(repositories.openingFiles.create({ name: 'Catalan', color: 'w' })).rejects.toThrow(
      /already exists/,
    );

    await repositories.openingFiles.update(file.id, file.revision, { notes: 'first' });
    await expect(
      repositories.openingFiles.update(file.id, file.revision, { notes: 'second' }),
    ).rejects.toBeInstanceOf(StaleOpeningFileWriteError);
  });
});

describe('the endgame library', () => {
  it('counts pieces from the board rather than trusting the caller', async () => {
    const repositories = createMemoryRepositories();
    const saved = await repositories.endgames.create({
      positionKey: positionKey(ROOK_ENDING),
      fen: ROOK_ENDING,
      sideToMove: 'w',
      title: 'Lucena',
      category: 'rook',
      goal: 'convert-win',
      tags: ['lucena', 'lucena'],
    });

    expect(saved.pieceCount).toBe(3);
    expect(saved.tags).toEqual(['lucena']);
    expect(countPieces(START_FEN)).toBe(32);
    // A FEN that cannot be parsed produces zero, not a plausible-looking
    // number that would make an illegal position look tablebase-eligible.
    expect(countPieces('not a fen')).toBe(0);
  });

  it('filters by category, goal and tablebase eligibility', () => {
    const record = {
      category: 'rook',
      goal: 'convert-win',
      pieceCount: 5,
      tags: ['lucena'],
    } as unknown as EndgamePositionRecord;

    expect(matchesEndgameQuery(record, {})).toBe(true);
    expect(matchesEndgameQuery(record, { category: 'rook', maxPieces: 7 })).toBe(true);
    expect(matchesEndgameQuery(record, { category: 'pawn' })).toBe(false);
    expect(matchesEndgameQuery(record, { maxPieces: 4 })).toBe(false);
    expect(matchesEndgameQuery(record, { goal: 'hold-draw' })).toBe(false);
    expect(matchesEndgameQuery(record, { tag: 'philidor' })).toBe(false);
  });

  it('counts the library by category for its header', async () => {
    const repositories = createMemoryRepositories();
    for (const category of ['rook', 'rook', 'pawn'] as const) {
      await repositories.endgames.create({
        positionKey: positionKey(ROOK_ENDING),
        fen: ROOK_ENDING,
        sideToMove: 'w',
        title: category,
        category,
        goal: 'study',
      });
    }
    const counts = await repositories.endgames.countsByCategory();
    expect(counts.get('rook')).toBe(2);
    expect(counts.get('pawn')).toBe(1);
    expect(counts.get('queen')).toBeUndefined();
  });
});

describe('pinned engine lines', () => {
  const pin = (
    over: Partial<
      Parameters<ReturnType<typeof createMemoryRepositories>['pinnedLines']['pin']>[0]
    > = {},
  ) => ({
    positionKey: KEY,
    fen: START_FEN,
    engineId: 'stockfish',
    engineName: 'Stockfish',
    engineVersion: '17.1',
    multiPv: 1,
    score: { kind: 'cp' as const, cp: 34 },
    depth: 30,
    nodes: 1_000_000,
    timeMs: 4_000,
    pvUci: [],
    pvSan: [asSan('e4')],
    ...over,
  });

  it('keys evidence by position, so a transposition inherits it', async () => {
    const repositories = createMemoryRepositories();
    await repositories.pinnedLines.pin(pin());
    await repositories.pinnedLines.pin(
      pin({ engineId: 'lc0', engineName: 'Lc0', depth: 12, score: { kind: 'cp', cp: 12 } }),
    );

    const lines = await repositories.pinnedLines.forPosition(KEY);
    expect(lines.map((line) => line.engineName)).toEqual(['Lc0', 'Stockfish']);
    expect(await repositories.pinnedLines.forPosition('elsewhere')).toHaveLength(0);
  });

  it('lets a conclusion be annotated without altering the measurement', async () => {
    const repositories = createMemoryRepositories();
    const pinned = await repositories.pinnedLines.pin(pin());
    const annotated = await repositories.pinnedLines.annotate(pinned.id, '  Settles the line.  ');

    expect(annotated.note).toBe('Settles the line.');
    expect(annotated.score).toEqual(pinned.score);
    expect(annotated.depth).toBe(pinned.depth);
    expect(annotated.createdAt).toBe(pinned.createdAt);

    await repositories.pinnedLines.unpin(pinned.id);
    expect(await repositories.pinnedLines.count()).toBe(0);
  });
});
