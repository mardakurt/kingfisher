/**
 * Two tabs, one chapter.
 *
 * These tests model the thing that actually happens: a workspace loads a
 * chapter, holds the revision it loaded, and offers that revision back when it
 * writes. A second workspace that loaded the same revision must not be able to
 * write over the first one's work just because it saved later.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { playSanAt } from '@/chess/game';
import { expect as unwrap } from '@/chess/result';
import { createTree, mainlinePath } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';

import { withRevision } from '../schema/migrations';
import type { AppRepositories, ChapterRecord, StudyRecord } from '../types';
import { StaleChapterWriteError } from '../types';
import { createMemoryRepositories } from './index';

let repositories: AppRepositories;
let study: StudyRecord;
let chapter: ChapterRecord;

const line = (moves: readonly string[]): GameTree => {
  let tree = createTree(START_FEN);
  let cursor = tree.rootId;
  for (const san of moves) {
    const played = unwrap(playSanAt(tree, cursor, san));
    tree = played.tree;
    cursor = played.nodeId;
  }
  return tree;
};

const sanOf = (tree: GameTree): readonly string[] =>
  mainlinePath(tree)
    .slice(1)
    .map((id) => tree.nodes[id]?.move?.san ?? '?');

beforeEach(async () => {
  repositories = createMemoryRepositories();
  study = await repositories.studies.create({ title: 'Najdorf' });
  chapter = await repositories.studies.createChapter({
    studyId: study.id,
    title: 'Main line',
    tree: line(['e4', 'c5']),
  });
});

describe('chapter write revisions', () => {
  it('starts a new chapter at revision zero', () => {
    expect(chapter.revision).toBe(0);
  });

  it('advances the revision on every accepted write', async () => {
    const first = await repositories.studies.saveChapter({ ...chapter, tree: line(['e4', 'c5']) });
    expect(first.revision).toBe(1);

    const second = await repositories.studies.saveChapter({ ...first, tree: line(['d4']) });
    expect(second.revision).toBe(2);
  });

  it('refuses a write from a workspace holding an older revision', async () => {
    // Both tabs opened the chapter at revision 0.
    const tabA = chapter;
    const tabB = chapter;

    const written = await repositories.studies.saveChapter({
      ...tabA,
      tree: line(['e4', 'c5', 'Nf3']),
    });
    expect(written.revision).toBe(1);

    await expect(
      repositories.studies.saveChapter({ ...tabB, tree: line(['d4', 'd5']) }),
    ).rejects.toBeInstanceOf(StaleChapterWriteError);
  });

  it('leaves the stored chapter untouched when a write is refused', async () => {
    await repositories.studies.saveChapter({ ...chapter, tree: line(['e4', 'c5', 'Nf3']) });
    await repositories.studies
      .saveChapter({ ...chapter, tree: line(['d4', 'd5']) })
      .catch(() => undefined);

    const stored = await repositories.studies.getChapter(chapter.id);
    expect(sanOf(stored!.tree)).toEqual(['e4', 'c5', 'Nf3']);
    expect(stored?.revision).toBe(1);
  });

  it('hands the winning record to the loser so it can be offered without a second read', async () => {
    await repositories.studies.saveChapter({ ...chapter, tree: line(['e4', 'e5']) });

    const error = await repositories.studies
      .saveChapter({ ...chapter, tree: line(['c4']) })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(StaleChapterWriteError);
    const stale = error as StaleChapterWriteError;
    expect(stale.attemptedRevision).toBe(0);
    expect(stale.current.revision).toBe(1);
    expect(sanOf(stale.current.tree)).toEqual(['e4', 'e5']);
  });

  it('lets the loser continue once it adopts the stored revision', async () => {
    await repositories.studies.saveChapter({ ...chapter, tree: line(['e4', 'e5']) });
    const thrown = await repositories.studies
      .saveChapter({ ...chapter, tree: line(['c4']) })
      .catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(StaleChapterWriteError);
    const stale = thrown as StaleChapterWriteError;

    const resolved = await repositories.studies.saveChapter({
      ...stale.current,
      tree: line(['c4', 'e5']),
    });
    expect(resolved.revision).toBe(2);
    expect(sanOf(resolved.tree)).toEqual(['c4', 'e5']);
  });

  it('moves the revision on when a rename rewrites the record', async () => {
    const renamed = await repositories.studies.renameChapter(chapter.id, 'Poisoned Pawn');
    expect(renamed.revision).toBe(1);

    // A workspace still holding revision 0 must notice the rename.
    await expect(
      repositories.studies.saveChapter({ ...chapter, tree: line(['e4']) }),
    ).rejects.toBeInstanceOf(StaleChapterWriteError);
  });

  it('moves the revision on when reordering rewrites a chapter', async () => {
    const second = await repositories.studies.createChapter({
      studyId: study.id,
      title: 'Sidelines',
      tree: line(['e4', 'e5']),
    });

    await repositories.studies.reorderChapters(study.id, [second.id, chapter.id]);

    const moved = await repositories.studies.getChapter(chapter.id);
    expect(moved?.order).toBe(1);
    expect(moved?.revision).toBe(1);
    await expect(
      repositories.studies.saveChapter({ ...chapter, tree: line(['e4']) }),
    ).rejects.toBeInstanceOf(StaleChapterWriteError);
  });

  it('does not churn revisions for chapters a reorder leaves in place', async () => {
    await repositories.studies.createChapter({
      studyId: study.id,
      title: 'Sidelines',
      tree: line(['e4', 'e5']),
    });
    const before = await repositories.studies.get(study.id);
    const ids = before!.chapters.map((entry) => entry.id);

    await repositories.studies.reorderChapters(study.id, ids);

    const after = await repositories.studies.get(study.id);
    expect(after!.chapters.map((entry) => entry.revision)).toEqual([0, 0]);
  });

  it('reports a deleted chapter as gone rather than as a conflict', async () => {
    await repositories.studies.deleteChapter(chapter.id);
    await expect(
      repositories.studies.saveChapter({ ...chapter, tree: line(['e4']) }),
    ).rejects.toThrow(/no longer exists/i);
  });
});

describe('the version 4 upgrade', () => {
  it('gives an existing chapter revision zero', () => {
    expect(withRevision({ id: 'chapter-1', title: 'Old' })).toEqual({
      id: 'chapter-1',
      title: 'Old',
      revision: 0,
    });
  });

  it('leaves a chapter that already has a revision alone', () => {
    expect(withRevision({ id: 'chapter-1', revision: 7 })).toEqual({
      id: 'chapter-1',
      revision: 7,
    });
  });

  it('replaces a revision that is not a usable number', () => {
    expect(withRevision({ id: 'chapter-1', revision: Number.NaN })).toEqual({
      id: 'chapter-1',
      revision: 0,
    });
  });

  it('passes non-records through untouched', () => {
    expect(withRevision(null)).toBeNull();
  });
});
