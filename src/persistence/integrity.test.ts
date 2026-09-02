/**
 * Deliberately broken databases.
 *
 * Every fixture here breaks exactly one relationship, because a checker that
 * only works on a database with a single problem is not much use, and one that
 * reports three issues for one broken row is worse than useless.
 *
 * The false-positive tests matter as much as the detection ones: a scan that
 * cries wolf on a healthy database teaches people to ignore it.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { playSanAt } from '@/chess/game';
import { expect as unwrap } from '@/chess/result';
import { createTree } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';

import { collectIssues, isHealthy, repairIntegrity, scanIntegrity } from './integrity';
import type { IntegrityInput } from './integrity';
import { createMemoryRepositories } from './repositories';
import { STORE_NAMES } from './schema/migrations';
import type { AppRepositories } from './types';

const tree = (moves: readonly string[] = ['e4', 'c5']): GameTree => {
  let current = createTree(START_FEN);
  let cursor = current.rootId;
  for (const san of moves) {
    const played = unwrap(playSanAt(current, cursor, san));
    current = played.tree;
    cursor = played.nodeId;
  }
  return current;
};

const empty: IntegrityInput = {
  studies: [],
  chapters: [],
  games: [],
  content: [],
  positions: [],
  repertoires: [],
  repertoirePositions: [],
  training: [],
  reviews: [],
  modelGames: [],
  draft: null,
};

const game = (id: string) =>
  ({
    id,
    fingerprint: `fp-${id}`,
    white: 'White',
    black: 'Black',
    result: '1-0',
    whiteKey: 'white',
    blackKey: 'black',
    playerKeys: ['white', 'black'],
    importedAt: 1,
  }) as IntegrityInput['games'][number];

const study = (id: string, title = 'Study') =>
  ({ id, title, createdAt: 1, updatedAt: 1 }) as IntegrityInput['studies'][number];

const chapter = (id: string, studyId: string, order: number) =>
  ({
    id,
    studyId,
    title: 'Chapter',
    order,
    tree: tree(),
    createdAt: 1,
    updatedAt: 1,
    revision: 0,
  }) as IntegrityInput['chapters'][number];

const categories = (input: IntegrityInput) => collectIssues(input).map((issue) => issue.category);

describe('a database with nothing wrong', () => {
  it('reports no issues when it is empty', () => {
    expect(collectIssues(empty)).toEqual([]);
  });

  it('reports no issues for a consistent database', () => {
    expect(
      categories({
        ...empty,
        studies: [study('s1')],
        chapters: [chapter('c1', 's1', 0), chapter('c2', 's1', 1)],
        games: [game('g1')],
        content: [{ id: 'g1', tree: tree(), normalizedPgn: '1. e4 c5' }],
        positions: [
          {
            id: 'p1',
            positionKey: 'k',
            gameId: 'g1',
            ply: 1,
            moveUci: 'e2e4',
            moveSan: 'e4',
            mover: 'w',
          } as IntegrityInput['positions'][number],
        ],
      }),
    ).toEqual([]);
  });

  it('does not complain about a game that has content but no positions when it also has none stored', () => {
    // A game with content and no index entries is a real inconsistency, so
    // this asserts the *opposite* case: an empty index with no games is fine.
    expect(categories({ ...empty, positions: [] })).toEqual([]);
  });
});

describe('game storage', () => {
  it('finds a summary whose moves are missing', () => {
    const issues = collectIssues({ ...empty, games: [game('g1')] });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.category).toBe('missing-content');
    expect(issues[0]!.ids).toEqual(['g1']);
  });

  it('refuses to repair a missing tree, because it cannot be invented', () => {
    const issues = collectIssues({ ...empty, games: [game('g1')] });
    expect(issues[0]!.repairable).toBe(false);
  });

  it('finds moves left behind by a deleted game', () => {
    const issues = collectIssues({
      ...empty,
      content: [{ id: 'ghost', tree: tree(), normalizedPgn: '' }],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.category).toBe('orphaned-reference');
    expect(issues[0]!.repairable).toBe(true);
  });

  it('finds index entries pointing at a deleted game', () => {
    const issues = collectIssues({
      ...empty,
      positions: [
        {
          id: 'p1',
          positionKey: 'k',
          gameId: 'gone',
          ply: 1,
          moveUci: 'e2e4',
          moveSan: 'e4',
          mover: 'w',
        } as IntegrityInput['positions'][number],
      ],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.category).toBe('index-inconsistency');
    expect(issues[0]!.repairable).toBe(true);
  });

  it('finds a game that was imported but never indexed', () => {
    const issues = collectIssues({
      ...empty,
      games: [game('g1')],
      content: [{ id: 'g1', tree: tree(), normalizedPgn: '' }],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.category).toBe('index-inconsistency');
    expect(issues[0]!.title).toMatch(/missing from the position index/i);
    // Rebuilding an index means replaying chess; that is the importer's job.
    expect(issues[0]!.repairable).toBe(false);
  });
});

describe('studies', () => {
  it('finds a chapter whose study is gone, and refuses to delete the analysis', () => {
    const issues = collectIssues({ ...empty, chapters: [chapter('c1', 'gone', 0)] });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.category).toBe('orphaned-reference');
    expect(issues[0]!.repairable).toBe(false);
  });

  it('finds a gap in chapter ordering', () => {
    const issues = collectIssues({
      ...empty,
      studies: [study('s1', 'Najdorf')],
      chapters: [chapter('c1', 's1', 0), chapter('c2', 's1', 3)],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.category).toBe('invalid-order');
    expect(issues[0]!.detail).toContain('Najdorf');
    expect(issues[0]!.repairable).toBe(true);
  });

  it('finds duplicated chapter order values', () => {
    const issues = collectIssues({
      ...empty,
      studies: [study('s1')],
      chapters: [chapter('c1', 's1', 0), chapter('c2', 's1', 0)],
    });
    expect(issues.map((issue) => issue.category)).toEqual(['invalid-order']);
  });

  it('accepts a correctly ordered study', () => {
    expect(
      categories({
        ...empty,
        studies: [study('s1')],
        chapters: [chapter('c1', 's1', 0), chapter('c2', 's1', 1), chapter('c3', 's1', 2)],
      }),
    ).toEqual([]);
  });
});

describe('links between entities', () => {
  it('finds repertoire decisions whose repertoire is gone', () => {
    const issues = collectIssues({
      ...empty,
      repertoirePositions: [
        { id: 'rp1', repertoireId: 'gone', positionKey: 'k' } as never,
      ] as IntegrityInput['repertoirePositions'],
    });
    expect(issues.map((issue) => issue.category)).toEqual(['orphaned-reference']);
    expect(issues[0]!.repairable).toBe(true);
  });

  it('finds reviews for a deleted training item', () => {
    const issues = collectIssues({
      ...empty,
      reviews: [
        {
          id: 'r1',
          itemId: 'gone',
          reviewedAt: 1,
          grade: 'good',
          intervalDays: 1,
          correct: true,
        } as never,
      ] as IntegrityInput['reviews'],
    });
    expect(issues.map((issue) => issue.category)).toEqual(['orphaned-reference']);
  });

  it('reports a training item citing a deleted game but keeps the drill', () => {
    const issues = collectIssues({
      ...empty,
      training: [
        {
          id: 't1',
          source: { kind: 'game', id: 'gone', label: 'A game' },
          schedule: {},
        } as never,
      ] as IntegrityInput['training'],
    });
    expect(issues.map((issue) => issue.category)).toEqual(['unknown-entity']);
    expect(issues[0]!.repairable).toBe(false);
  });

  it('accepts a training item with no source at all', () => {
    expect(
      categories({
        ...empty,
        training: [{ id: 't1', schedule: {} } as never] as IntegrityInput['training'],
      }),
    ).toEqual([]);
  });

  it('finds a model-game link whose game is gone', () => {
    const issues = collectIssues({
      ...empty,
      modelGames: [{ id: 'm1', gameId: 'gone', kinds: ['model'] } as never],
    });
    expect(issues.map((issue) => issue.category)).toEqual(['orphaned-reference']);
    expect(issues[0]!.repairable).toBe(true);
  });

  it('finds a model-game link whose study is gone even when the game survives', () => {
    const issues = collectIssues({
      ...empty,
      games: [game('g1')],
      content: [{ id: 'g1', tree: tree(), normalizedPgn: '' }],
      positions: [{ id: 'p1', positionKey: 'k', gameId: 'g1' } as never],
      modelGames: [{ id: 'm1', gameId: 'g1', studyId: 'gone' } as never],
    });
    expect(issues.map((issue) => issue.category)).toEqual(['orphaned-reference']);
  });
});

describe('the open draft', () => {
  it('reports a draft pointing at a deleted chapter without offering to delete it', () => {
    const issues = collectIssues({
      ...empty,
      draft: {
        id: 'active',
        document: {
          kind: 'study-chapter',
          title: 'C',
          studyId: 's1',
          studyTitle: 'S',
          chapterId: 'gone',
          revision: 0,
        },
        tree: tree(),
        currentId: 'root',
        orientation: 'w',
        updatedAt: 1,
      },
    });
    expect(issues.map((issue) => issue.category)).toEqual(['unknown-entity']);
    // The draft holds the tree that was on screen; deleting it loses the work.
    expect(issues[0]!.repairable).toBe(false);
  });

  it('accepts an untitled draft, which points at nothing by design', () => {
    expect(
      categories({
        ...empty,
        draft: {
          id: 'active',
          document: { kind: 'untitled', title: 'Untitled analysis' },
          tree: tree(),
          currentId: 'root',
          orientation: 'w',
          updatedAt: 1,
        },
      }),
    ).toEqual([]);
  });
});

describe('scanning and repairing a real database', () => {
  let repositories: AppRepositories;

  beforeEach(() => {
    repositories = createMemoryRepositories();
  });

  it('reports a healthy database as healthy', async () => {
    const created = await repositories.studies.create({ title: 'Najdorf' });
    await repositories.studies.createChapter({
      studyId: created.id,
      title: 'Main line',
      tree: tree(),
    });
    const report = await scanIntegrity(repositories.raw);
    expect(isHealthy(report)).toBe(true);
    expect(report.counts.chapters).toBe(1);
  });

  it('removes orphaned index entries and leaves everything else alone', async () => {
    const study = await repositories.studies.create({ title: 'Keep me' });
    await repositories.studies.createChapter({ studyId: study.id, title: 'A', tree: tree() });
    await repositories.raw.put(STORE_NAMES.positions, {
      id: 'ghost-position',
      positionKey: 'k',
      gameId: 'deleted-game',
      ply: 1,
      moveUci: 'e2e4',
      moveSan: 'e4',
      mover: 'w',
    });

    const before = await scanIntegrity(repositories.raw);
    expect(before.issues).toHaveLength(1);

    const result = await repairIntegrity(repositories.raw, before.issues);
    expect(result.removed).toBe(1);

    const after = await scanIntegrity(repositories.raw);
    expect(isHealthy(after)).toBe(true);
    // The repair must not have taken the study or its chapter with it.
    expect((await repositories.studies.get(study.id))?.chapters).toHaveLength(1);
  });

  it('renumbers a gapped study without reordering it', async () => {
    const study = await repositories.studies.create({ title: 'Gapped' });
    const first = await repositories.studies.createChapter({
      studyId: study.id,
      title: 'First',
      tree: tree(),
    });
    const second = await repositories.studies.createChapter({
      studyId: study.id,
      title: 'Second',
      tree: tree(),
    });
    await repositories.raw.put(STORE_NAMES.chapters, { ...second, order: 7 });

    const before = await scanIntegrity(repositories.raw);
    expect(before.issues.map((issue) => issue.category)).toEqual(['invalid-order']);

    const result = await repairIntegrity(repositories.raw, before.issues);
    expect(result.renumbered).toBe(1);

    const after = await repositories.studies.get(study.id);
    expect(after?.chapters.map((entry) => entry.title)).toEqual(['First', 'Second']);
    expect(after?.chapters.map((entry) => entry.order)).toEqual([0, 1]);
    expect(isHealthy(await scanIntegrity(repositories.raw))).toBe(true);
    expect(first.order).toBe(0);
  });

  it('never deletes anything for an issue it has not marked repairable', async () => {
    // A game summary with no content: the one record proving it was imported.
    await repositories.raw.put(STORE_NAMES.games, game('lonely'));

    const before = await scanIntegrity(repositories.raw);
    expect(before.issues.map((issue) => issue.category)).toEqual(['missing-content']);

    const result = await repairIntegrity(repositories.raw, before.issues);
    expect(result).toEqual({ removed: 0, renumbered: 0 });
    expect(await repositories.raw.get(STORE_NAMES.games, 'lonely')).toBeDefined();
  });

  it('does nothing at all when the database is healthy', async () => {
    const report = await scanIntegrity(repositories.raw);
    expect(await repairIntegrity(repositories.raw, report.issues)).toEqual({
      removed: 0,
      renumbered: 0,
    });
  });
});
