import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';

import { indexGame, normalizeGame } from '../import-game';
import { openPersistenceDatabaseAt } from '../indexeddb/database';
import { DATABASE_VERSION, STORE_NAMES } from './migrations';

/**
 * Historical migration fixtures.
 *
 * §6-9 of Phase 11 ask for real installations at old schema versions to
 * migrate cleanly through to the current one, with nothing lost. A recorder
 * double (as in `migrations.test.ts`) proves the migration *asks* IndexedDB
 * for the right stores and indexes; it cannot prove a real upgrade
 * transaction actually preserves a chapter's comments, a repertoire's
 * decisions, or a v1 game's fields once whiteKey/blackKey exist alongside
 * them. This file runs the real migration path (`openPersistenceDatabaseAt`,
 * exactly what a browser upgrade runs) against fake-indexeddb, which is a
 * spec-compliant IndexedDB implementation — not a re-description of the
 * schema — so a bug here is a bug a real browser would also have.
 *
 * Each fixture opens a *fresh* database at an old version (which itself runs
 * the real migrations 0..oldVersion, creating exactly the shape a real
 * installation at that version has), inserts records the way a real session
 * at that version would have written them, closes, and reopens at the
 * current DATABASE_VERSION — running the real remaining migrations against
 * that seeded data. What comes out the other side is checked for semantic
 * equality with what went in, not just "did not throw".
 */

let counter = 0;
/** A fresh database name per fixture, so fixtures never share state. */
const dbName = () => `kingfisher-migration-fixture-${++counter}`;

const CHAPTER_PGN =
  '[White "Fixture"]\n[Black "Fixture"]\n\n' +
  '1. e4 e5 2. Nf3 {A main line comment, kept exactly.} Nc6 ' +
  '(2... Nf6 3. Nxe5 {A side variation, with its own comment.} d6) ' +
  '3. Bb5 a6 *';

function chapterTree() {
  const parsed = parsePgn(CHAPTER_PGN).games[0];
  if (!parsed) throw new Error('fixture PGN did not parse');
  return parsed.tree;
}

describe('migrating a Phase 2 installation (v1 games, pre-backfill) to current', () => {
  it('preserves games, backfills player keys, and keeps every later store queryable', async () => {
    const name = dbName();

    // --- A real v1 installation: games without whiteKey/blackKey/playerKeys.
    const v1 = await openPersistenceDatabaseAt(1, name);
    const v1Game = {
      id: 'g1',
      fingerprint: 'fp-1',
      white: 'Kasparov, Garry',
      black: 'Karpov, Anatoly',
      result: '1-0',
      date: '1985.09.03',
      year: 1985,
      eco: 'C92',
      opening: 'Ruy Lopez',
      importedAt: 1000,
      tree: chapterTree(),
      normalizedPgn: CHAPTER_PGN,
    };
    await v1.put(STORE_NAMES.games, v1Game);
    v1.close();

    // --- Upgraded to v2: player keys should be backfilled onto the existing game.
    const v2 = await openPersistenceDatabaseAt(2, name);
    const afterV2 = await v2.get<Record<string, unknown>>(STORE_NAMES.games, 'g1');
    expect(afterV2?.whiteKey).toBe('kasparov, garry');
    expect(afterV2?.blackKey).toBe('karpov, anatoly');
    expect(afterV2?.playerKeys).toEqual(['kasparov, garry', 'karpov, anatoly']);
    // Nothing about the original record was disturbed by the backfill.
    expect(afterV2?.white).toBe('Kasparov, Garry');
    expect(afterV2?.eco).toBe('C92');
    v2.close();

    // --- Upgraded to the current version in one step, simulating a long-idle install.
    const current = await openPersistenceDatabaseAt(DATABASE_VERSION, name);

    // The game summary survived the v2-to-v3 split: it is readable...
    const summary = await current.get<Record<string, unknown>>(STORE_NAMES.games, 'g1');
    expect(summary?.white).toBe('Kasparov, Garry');
    expect(summary?.whiteKey).toBe('kasparov, garry');
    // ...and does not carry the tree any more.
    expect(summary?.tree).toBeUndefined();
    expect(summary?.normalizedPgn).toBeUndefined();

    // The tree moved to gameContent, byte-identical: no comment or variation lost.
    const content = await current.get<{ tree: unknown; normalizedPgn: string }>(
      STORE_NAMES.gameContent,
      'g1',
    );
    expect(content?.tree).toEqual(v1Game.tree);
    expect(content?.normalizedPgn).toBe(CHAPTER_PGN);

    // Every store added by a later migration exists and is queryable, even
    // though this installation never wrote anything into most of them.
    for (const store of Object.values(STORE_NAMES)) {
      await expect(current.getAll(store)).resolves.toEqual(expect.any(Array));
    }
    expect(await current.getAll(STORE_NAMES.preparationSessions)).toEqual([]);
    expect(await current.getAll(STORE_NAMES.openingFiles)).toEqual([]);

    // Querying a v9 structural index against a game indexed before v9 existed
    // must return nothing — not throw, and not fabricate a match.
    expect(
      await current.getAllFromIndex(STORE_NAMES.positions, 'structureSignature', 'anything'),
    ).toEqual([]);

    current.close();
  });
});

describe('migrating a Phase 3-4 study (pre-revision chapters) to current', () => {
  it('keeps the chapter tree exactly, and backfills revision 0', async () => {
    const name = dbName();
    const tree = chapterTree();

    // A v3 installation: gameContent exists, but chapters predate revisions (v4).
    const v3 = await openPersistenceDatabaseAt(3, name);
    await v3.put(STORE_NAMES.studies, {
      id: 's1',
      title: 'Ruy Lopez, Closed',
      createdAt: 1000,
      updatedAt: 1000,
    });
    await v3.put(STORE_NAMES.chapters, {
      id: 'c1',
      studyId: 's1',
      title: 'Main line',
      order: 0,
      tree,
      createdAt: 1000,
      updatedAt: 1000,
      // No `revision` — this is exactly the pre-v4 shape.
    });
    v3.close();

    const current = await openPersistenceDatabaseAt(DATABASE_VERSION, name);
    const study = await current.get<Record<string, unknown>>(STORE_NAMES.studies, 's1');
    const chapter = await current.get<Record<string, unknown>>(STORE_NAMES.chapters, 'c1');

    expect(study?.title).toBe('Ruy Lopez, Closed');
    expect(chapter?.title).toBe('Main line');
    expect(chapter?.revision).toBe(0);
    // The tree — including the comment and the side variation — is untouched
    // by a migration that only ever added a sibling field.
    expect(chapter?.tree).toEqual(tree);

    current.close();
  });
});

describe('migrating a Phase 6-7 installation (references and background jobs) to current', () => {
  it('keeps references resolvable and background jobs intact', async () => {
    const name = dbName();

    const v6 = await openPersistenceDatabaseAt(6, name);
    await v6.put(STORE_NAMES.studies, {
      id: 's1',
      title: 'Najdorf prep',
      createdAt: 1,
      updatedAt: 1,
    });
    await v6.put(STORE_NAMES.chapters, {
      id: 'c1',
      studyId: 's1',
      title: 'Main',
      order: 0,
      tree: chapterTree(),
      createdAt: 1,
      updatedAt: 1,
      revision: 0,
    });
    await v6.put(STORE_NAMES.studyReferences, {
      id: 'ref1',
      chapterId: 'c1',
      kind: 'model-game',
      targetId: 'g1',
      createdAt: 1,
    });
    v6.close();

    const v7 = await openPersistenceDatabaseAt(7, name);
    await v7.put(STORE_NAMES.analysisQueue, {
      id: 'job1',
      status: 'pending',
      gameId: 'g1',
      createdAt: 2,
    });
    await v7.put(STORE_NAMES.engineEvidence, {
      id: 'ev1',
      jobId: 'job1',
      gameId: 'g1',
      positionKey: 'pk1',
    });
    v7.close();

    const current = await openPersistenceDatabaseAt(DATABASE_VERSION, name);

    const reference = await current.get<Record<string, unknown>>(
      STORE_NAMES.studyReferences,
      'ref1',
    );
    expect(reference?.chapterId).toBe('c1');
    expect(reference?.targetId).toBe('g1');
    // Resolves through its compound index, exactly as the reference repository reads it.
    const byChapter = await current.getAllFromIndex(STORE_NAMES.studyReferences, 'chapterId', 'c1');
    expect(byChapter).toHaveLength(1);

    const job = await current.get<Record<string, unknown>>(STORE_NAMES.analysisQueue, 'job1');
    expect(job?.status).toBe('pending');
    const evidence = await current.getAllFromIndex(STORE_NAMES.engineEvidence, 'jobId', 'job1');
    expect(evidence).toHaveLength(1);

    current.close();
  });
});

describe('migrating a Phase 8 installation (decisions, review, training sets, profile) to current', () => {
  it('keeps review history and backfills the profile without disturbing existing themes', async () => {
    const name = dbName();

    // A profile written before v8 has no `customThemes` at all.
    const v7 = await openPersistenceDatabaseAt(7, name);
    await v7.put(STORE_NAMES.profile, { id: 'profile', displayName: 'A. Player' });
    v7.close();

    const v8 = await openPersistenceDatabaseAt(8, name);
    await v8.put(STORE_NAMES.decisions, {
      id: 'd1',
      positionKey: 'pk1',
      gameId: 'g1',
      createdAt: 1,
      themes: ['isolated-queen-pawn'],
      note: 'Thought Bxh7 won a pawn cleanly; missed …Nxg4 in reply.',
    });
    await v8.put(STORE_NAMES.reviewItems, {
      id: 'r1',
      positionKey: 'pk1',
      status: 'pending',
      gameId: 'g1',
      createdAt: 1,
      themes: ['isolated-queen-pawn'],
      identityKey: 'g1:pk1',
    });
    await v8.put(STORE_NAMES.trainingSets, { id: 'ts1', name: 'Endgame drills', createdAt: 1 });
    v8.close();

    const current = await openPersistenceDatabaseAt(DATABASE_VERSION, name);

    // The pre-v8 profile is backfilled, not replaced.
    const profile = await current.get<Record<string, unknown>>(STORE_NAMES.profile, 'profile');
    expect(profile?.displayName).toBe('A. Player');
    expect(profile?.customThemes).toEqual([]);

    const decision = await current.get<Record<string, unknown>>(STORE_NAMES.decisions, 'd1');
    expect(decision?.note).toBe('Thought Bxh7 won a pawn cleanly; missed …Nxg4 in reply.');

    const review = await current.get<Record<string, unknown>>(STORE_NAMES.reviewItems, 'r1');
    expect(review?.status).toBe('pending');
    // Uniqueness on identityKey still holds after migrating through it.
    const byIdentity = await current.getAllFromIndex(
      STORE_NAMES.reviewItems,
      'identityKey',
      'g1:pk1',
    );
    expect(byIdentity).toHaveLength(1);

    const trainingSet = await current.get<Record<string, unknown>>(STORE_NAMES.trainingSets, 'ts1');
    expect(trainingSet?.name).toBe('Endgame drills');

    current.close();
  });
});

describe('migrating a Phase 9-10 installation (structure indexes, preparation) to current', () => {
  it('keeps structural claims searchable and preparation/opening-file records intact', async () => {
    const name = dbName();

    const parsed = parsePgn(CHAPTER_PGN).games[0];
    if (!parsed) throw new Error('fixture PGN did not parse');
    const game = normalizeGame(parsed.tree, 500);
    const positions = indexGame(game);
    expect(positions.some((position) => position.structureSignature)).toBe(true);

    const v9 = await openPersistenceDatabaseAt(9, name);
    await v9.put(STORE_NAMES.games, game);
    await v9.put(STORE_NAMES.gameContent, {
      id: game.id,
      tree: parsed.tree,
      normalizedPgn: game.normalizedPgn,
    });
    for (const position of positions) await v9.put(STORE_NAMES.positions, position);
    v9.close();

    const v10 = await openPersistenceDatabaseAt(10, name);
    await v10.put(STORE_NAMES.preparationSessions, {
      id: 'prep1',
      updatedAt: 1,
      opponentKey: 'a rival',
      gameDate: '2026.01.01',
    });
    await v10.put(STORE_NAMES.openingFiles, {
      id: 'of1',
      name: 'Black vs 1.e4, Najdorf',
      color: 'b',
      updatedAt: 1,
      positionKey: 'pk1',
    });
    v10.close();

    const current = await openPersistenceDatabaseAt(DATABASE_VERSION, name);

    const withSignature = positions.find((position) => position.structureSignature);
    if (!withSignature?.structureSignature) throw new Error('fixture has no structure signature');
    const bySignature = await current.getAllFromIndex(
      STORE_NAMES.positions,
      'structureSignature',
      withSignature.structureSignature,
    );
    expect(bySignature.length).toBeGreaterThan(0);

    const prep = await current.get<Record<string, unknown>>(
      STORE_NAMES.preparationSessions,
      'prep1',
    );
    expect(prep?.opponentKey).toBe('a rival');

    const openingFile = await current.get<Record<string, unknown>>(STORE_NAMES.openingFiles, 'of1');
    expect(openingFile?.name).toBe('Black vs 1.e4, Najdorf');

    current.close();
  });
});

describe('opening an already-current database', () => {
  it('runs no migration and disturbs nothing', async () => {
    const name = dbName();
    const version = DATABASE_VERSION;

    const first = await openPersistenceDatabaseAt(version, name);
    await first.put(STORE_NAMES.studies, {
      id: 's1',
      title: 'Current',
      createdAt: 1,
      updatedAt: 1,
    });
    first.close();

    const second = await openPersistenceDatabaseAt(version, name);
    const study = await second.get<Record<string, unknown>>(STORE_NAMES.studies, 's1');
    expect(study?.title).toBe('Current');
    second.close();
  });
});
