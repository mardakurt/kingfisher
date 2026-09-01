import { describe, expect, it } from 'vitest';

import { positionKey, START_FEN } from '@/chess/fen';
import { parsePgn } from '@/chess/pgn';
import { createTree } from '@/chess/tree/tree';
import { asSan, asUci } from '@/chess/types';
import { createMemoryRepositories } from '@/persistence/repositories';
import type { AppRepositories } from '@/persistence/types';

import { normalizeGame } from './import-game';

import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  createWorkspaceBackup,
  parseWorkspaceBackup,
  restoreWorkspaceBackup,
} from './backup';
import { STORE_NAMES } from './schema/migrations';

const NOW = Date.UTC(2026, 8, 1, 12);

/** One of everything the backup is supposed to carry, plus a game to link to. */
async function buildWorkspace(repositories: AppRepositories) {
  const study = await repositories.studies.create({ title: 'Candidates' });
  await repositories.studies.createChapter({
    studyId: study.id,
    title: 'Round one',
    tree: createTree(START_FEN),
  });
  const repertoire = await repositories.repertoires.create({ title: 'White main', color: 'w' });
  await repositories.repertoires.upsertPosition({
    repertoireId: repertoire.id,
    fen: START_FEN,
    sideToMove: 'w',
    depth: 0,
    moves: [{ uci: asUci('e2e4'), san: asSan('e4'), role: 'main', updatedAt: NOW }],
    note: 'Everything starts here.',
  });

  const parsed = parsePgn('[White "Fischer"]\n[Black "Spassky"]\n[Result "1-0"]\n\n1. e4 *')
    .games[0];
  if (!parsed) throw new Error('backup fixture did not parse');
  const game = normalizeGame(parsed.tree, 1);
  await repositories.games.persist(game, []);

  const link = await repositories.modelGames.create({
    gameId: game.id,
    kinds: ['model', 'theory'],
    positionKey: positionKey(START_FEN),
    repertoireId: repertoire.id,
    note: 'The classic treatment.',
    tags: ['reference'],
  });

  const item = await repositories.training.create(
    {
      mode: 'repertoire-recall',
      positionKey: positionKey(START_FEN),
      fen: START_FEN,
      sideToMove: 'w',
      prompt: 'Play your prepared move.',
      solutionUci: [asUci('e2e4')],
      solutionSan: [asSan('e4')],
      candidatesUci: [],
      plans: [],
      tags: ['opening'],
      source: { kind: 'repertoire', id: repertoire.id, label: repertoire.title },
    },
    NOW,
  );
  const reviewed = await repositories.training.review(item.id, 'good', true, NOW + 1_000);
  await repositories.profile.setAliases(['Metin Arda Kurt', 'M. A. Kurt']);

  return { study, repertoire, game, link, item, reviewed };
}

describe('workspace backup', () => {
  it('round-trips authored work and preferences semantically', async () => {
    const source = createMemoryRepositories();
    const study = await source.studies.create({ title: 'Candidates' });
    await source.studies.createChapter({
      studyId: study.id,
      title: 'Round one',
      tree: createTree(START_FEN),
    });
    const repertoire = await source.repertoires.create({ title: 'White main', color: 'w' });
    await source.repertoires.upsertPosition({
      repertoireId: repertoire.id,
      fen: START_FEN,
      sideToMove: 'w',
      depth: 0,
      moves: [{ uci: asUci('e2e4'), san: asSan('e4'), role: 'main', updatedAt: NOW }],
    });
    const item = await source.training.create(
      {
        mode: 'repertoire-recall',
        positionKey: START_FEN.split(' ').slice(0, 4).join(' '),
        fen: START_FEN,
        sideToMove: 'w',
        prompt: 'Play your prepared move.',
        solutionUci: [asUci('e2e4')],
        solutionSan: [asSan('e4')],
        candidatesUci: [],
        plans: [],
        tags: ['opening'],
        source: { kind: 'repertoire', id: repertoire.id, label: repertoire.title },
      },
      NOW,
    );
    await source.training.review(item.id, 'good', true, NOW + 1_000);
    await source.profile.setAliases(['Metin Arda Kurt', 'M. A. Kurt']);

    const backup = await createWorkspaceBackup(
      source.raw,
      { theme: 'dark', boardTheme: 'slate' },
      { now: NOW },
    );
    const target = createMemoryRepositories();
    const result = await restoreWorkspaceBackup(target.raw, backup, 'replace');

    expect(result.includesGames).toBe(false);
    expect(result.preferences).toEqual({ theme: 'dark', boardTheme: 'slate' });
    expect(await target.studies.get(study.id)).toEqual(await source.studies.get(study.id));
    expect(await target.repertoires.get(repertoire.id)).toEqual(
      await source.repertoires.get(repertoire.id),
    );
    expect(await target.training.get(item.id)).toEqual(await source.training.get(item.id));
    expect(await target.training.history(item.id)).toEqual(await source.training.history(item.id));
    expect(await target.profile.get()).toEqual(await source.profile.get());
  });

  /**
   * The acceptance sequence the phase brief asks for, in one test: build a
   * whole workspace, back it up, restore it into an empty database, and check
   * that every entity and every link between them survived.
   */
  it('restores a complete workspace into an empty database', async () => {
    const source = createMemoryRepositories();
    const built = await buildWorkspace(source);

    const backup = await createWorkspaceBackup(source.raw, { pieceSet: 'line' }, { now: NOW });
    const target = createMemoryRepositories();
    await restoreWorkspaceBackup(target.raw, JSON.parse(JSON.stringify(backup)), 'replace');

    expect((await target.studies.list()).map((entry) => entry.title)).toEqual(['Candidates']);
    expect(await target.repertoires.get(built.repertoire.id)).toEqual(
      await source.repertoires.get(built.repertoire.id),
    );
    expect(await target.training.get(built.item.id)).toEqual(
      await source.training.get(built.item.id),
    );
    expect(await target.training.history(built.item.id)).toHaveLength(1);
    expect((await target.profile.get()).aliases).toEqual(['Metin Arda Kurt', 'M. A. Kurt']);

    // The link is a reference; it has to point at the same game and position.
    const links = await target.modelGames.forRepertoire(built.repertoire.id);
    expect(links).toEqual(await source.modelGames.forRepertoire(built.repertoire.id));
    expect(links[0]?.kinds).toEqual(['model', 'theory']);

    // The schedule is the point of a training backup: a restored item must be
    // due when the original was, not reset to new.
    const restored = await target.training.get(built.item.id);
    expect(restored?.schedule.reviewCount).toBe(1);
    expect(restored?.schedule.dueAt).toBe(built.reviewed.schedule.dueAt);
  });

  it('leaves the imported game collection alone unless it was asked to include it', async () => {
    const source = createMemoryRepositories();
    await buildWorkspace(source);

    const portable = await createWorkspaceBackup(source.raw, {}, { now: NOW });
    expect(portable.includesGames).toBe(false);
    expect(portable.stores[STORE_NAMES.games]).toBeUndefined();

    const complete = await createWorkspaceBackup(source.raw, {}, { now: NOW, includeGames: true });
    expect(complete.includesGames).toBe(true);
    expect(complete.stores[STORE_NAMES.games]).toHaveLength(1);

    // Replace from a portable backup must not empty a database of games.
    const target = createMemoryRepositories();
    await buildWorkspace(target);
    await restoreWorkspaceBackup(target.raw, portable, 'replace');
    expect(await target.games.count()).toBe(1);
  });

  it('merges without discarding work the backup never knew about', async () => {
    const source = createMemoryRepositories();
    const built = await buildWorkspace(source);
    const backup = await createWorkspaceBackup(source.raw, {}, { now: NOW });

    const target = createMemoryRepositories();
    const local = await target.studies.create({ title: 'Written after the backup' });
    await restoreWorkspaceBackup(target.raw, backup, 'merge');

    expect((await target.studies.list()).map((entry) => entry.title).sort()).toEqual([
      'Candidates',
      'Written after the backup',
    ]);
    expect(await target.studies.get(local.id)).not.toBeNull();
    expect(await target.repertoires.get(built.repertoire.id)).not.toBeNull();
  });

  /**
   * Two unique indexes make a merge more than a series of writes. The same
   * position or the same game, written independently on two devices, has two
   * primary keys and one unique key; both cannot be stored.
   */
  it('replaces a record the backup collides with rather than aborting the merge', async () => {
    const source = createMemoryRepositories();
    const built = await buildWorkspace(source);
    const backup = await createWorkspaceBackup(source.raw, {}, { now: NOW, includeGames: true });

    const target = createMemoryRepositories();
    // The same repertoire and the same game, created independently: same
    // position key and same fingerprint, different record ids.
    await target.repertoires.create({ title: 'White main', color: 'w' });
    const rebuilt = await buildWorkspace(target);
    const localPosition = await target.repertoires.getPosition(
      rebuilt.repertoire.id,
      positionKey(START_FEN),
    );

    // Give the incoming repertoire the id the local one already uses, so the
    // unique [repertoireId, positionKey] pair genuinely collides.
    const incoming = JSON.parse(JSON.stringify(backup)) as typeof backup;
    const retargeted = {
      ...incoming,
      stores: {
        ...incoming.stores,
        [STORE_NAMES.repertoires]: (
          incoming.stores[STORE_NAMES.repertoires] as { id: string }[]
        ).map((record) => ({ ...record, id: rebuilt.repertoire.id })),
        [STORE_NAMES.repertoirePositions]: (
          incoming.stores[STORE_NAMES.repertoirePositions] as { id: string }[]
        ).map((record) => ({ ...record, repertoireId: rebuilt.repertoire.id })),
      },
    };

    await restoreWorkspaceBackup(target.raw, retargeted, 'merge');

    const positions = await target.repertoires.get(rebuilt.repertoire.id);
    const forStart = (positions?.positions ?? []).filter(
      (entry) => entry.positionKey === positionKey(START_FEN),
    );
    expect(forStart).toHaveLength(1);
    expect(forStart[0]?.id).not.toBe(localPosition?.id);

    // One game, one fingerprint: the colliding local copy went with it.
    expect(await target.games.count()).toBe(1);
    expect(await target.games.get(built.game.id)).not.toBeNull();
  });

  it('validates everything before replace, preserving current data on failure', async () => {
    const repositories = createMemoryRepositories();
    const existing = await repositories.studies.create({ title: 'Keep me' });
    const malformed = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: NOW,
      database: 'kingfisher',
      includesGames: false,
      preferences: {},
      stores: {
        [STORE_NAMES.studies]: [{ id: 'broken' }],
        [STORE_NAMES.chapters]: [],
        [STORE_NAMES.drafts]: [],
        [STORE_NAMES.repertoires]: [],
        [STORE_NAMES.repertoirePositions]: [],
        [STORE_NAMES.trainingItems]: [],
        [STORE_NAMES.trainingReviews]: [],
        [STORE_NAMES.modelGameLinks]: [],
        [STORE_NAMES.profile]: [],
      },
    };

    await expect(restoreWorkspaceBackup(repositories.raw, malformed, 'replace')).rejects.toThrow(
      'Backup rejected',
    );
    expect(await repositories.studies.get(existing.id)).not.toBeNull();
  });

  it('rejects unsupported versions and partial game payloads', () => {
    expect(() => parseWorkspaceBackup({ format: BACKUP_FORMAT, version: 99 })).toThrow(
      'not supported',
    );
    expect(() =>
      parseWorkspaceBackup({
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        createdAt: NOW,
        database: 'kingfisher',
        includesGames: false,
        preferences: {},
        stores: {
          [STORE_NAMES.studies]: [],
          [STORE_NAMES.chapters]: [],
          [STORE_NAMES.drafts]: [],
          [STORE_NAMES.repertoires]: [],
          [STORE_NAMES.repertoirePositions]: [],
          [STORE_NAMES.trainingItems]: [],
          [STORE_NAMES.trainingReviews]: [],
          [STORE_NAMES.modelGameLinks]: [],
          [STORE_NAMES.profile]: [],
          [STORE_NAMES.games]: [],
        },
      }),
    ).toThrow('not marked as including games');
  });
});
