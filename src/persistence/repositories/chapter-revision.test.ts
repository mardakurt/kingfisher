/**
 * Two tabs, one chapter.
 *
 * These tests model the thing that actually happens: a workspace loads a
 * chapter, holds the revision it loaded, and offers that revision back when it
 * writes. A second workspace that loaded the same revision must not be able to
 * write over the first one's work just because it saved later.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { playSanAt } from '@/chess/game';
import { expect as unwrap } from '@/chess/result';
import { createTree, mainlinePath } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';

import * as crossTab from '../cross-tab';
import { MemoryPersistenceDatabase } from '../indexeddb/memory';
import type { PersistenceDatabase, PersistenceTransaction } from '../indexeddb/database';
import { STORE_NAMES, withRevision } from '../schema/migrations';
import type { AppRepositories, ChapterRecord, StudyRecord } from '../types';
import { StaleChapterWriteError } from '../types';
import { createMemoryRepositories } from './index';
import { LocalStudyRepository } from './study-repository';

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

  it('tags the chapter that is stored, and tells other tabs the new revision', async () => {
    const saved = await repositories.studies.saveChapter({
      ...chapter,
      tree: { ...line(['d4']), headers: { White: 'Saved later' } },
    });
    const announce = vi.spyOn(crossTab, 'announceChapterSaved');
    try {
      const tagged = await repositories.studies.tagChapter(chapter.id, ['Najdorf']);
      expect(tagged.revision).toBe(saved.revision + 1);
      expect(tagged.tags).toEqual(['najdorf']);
      expect(tagged.tree.headers.White).toBe('Saved later');
      expect(sanOf(tagged.tree)).toEqual(['d4']);
      expect(announce).toHaveBeenCalledWith(tagged.id, tagged.revision);

      await expect(
        repositories.studies.saveChapter({ ...chapter, tree: line(['e4']) }),
      ).rejects.toBeInstanceOf(StaleChapterWriteError);
    } finally {
      announce.mockRestore();
    }
  });

  it('a tag written from a revision-0 snapshot does not replace a chapter already saved at revision 1', async () => {
    // The read that starts a tag can observe revision 0 while another tab
    // commits revision 1 before the tag's write. Holding that read open is
    // the window. The stored header has to survive, and the tag is a
    // conflict rather than a second write of the old tree at revision 1.
    const memory = new MemoryPersistenceDatabase();
    const gate = new ChapterReadGate(memory);
    const studies = new LocalStudyRepository(gate);
    const study = await studies.create({ title: 'Najdorf' });
    const created = await studies.createChapter({
      studyId: study.id,
      title: 'Main line',
      tree: line(['e4', 'c5']),
    });

    gate.holdNextChapterRead();
    const pending = studies.tagChapter(created.id, ['sicilian']);
    await gate.opened;

    const live = await memory.get<ChapterRecord>(STORE_NAMES.chapters, created.id);
    await studies.saveChapter({
      ...live!,
      tree: { ...line(['d4']), headers: { White: 'Saved later' } },
    });
    gate.release();

    const error = await pending.then(
      () => null,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(StaleChapterWriteError);
    const stale = error as StaleChapterWriteError;
    expect(stale.attemptedRevision).toBe(0);
    expect(stale.current.revision).toBe(1);
    expect(stale.current.tree.headers.White).toBe('Saved later');

    const stored = await studies.getChapter(created.id);
    expect(stored?.revision).toBe(1);
    expect(stored?.tags).toBeUndefined();
    expect(stored?.tree.headers.White).toBe('Saved later');
    expect(sanOf(stored!.tree)).toEqual(['d4']);
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

/**
 * Holds the next chapter `get` open after it has already read the record.
 *
 * That is the window `tagChapter` used to have: the snapshot is revision 0,
 * and another tab can commit revision 1 before the tag writes. The write
 * transaction itself is not held — `saveChapter` has to be able to land
 * during the pause.
 */
class ChapterReadGate implements PersistenceDatabase {
  private armed = false;
  private entered: (() => void) | null = null;
  private resume: (() => void) | null = null;
  readonly opened: Promise<void>;
  private readonly released: Promise<void>;

  constructor(private readonly inner: MemoryPersistenceDatabase) {
    this.opened = new Promise<void>((resolve) => {
      this.entered = resolve;
    });
    this.released = new Promise<void>((resolve) => {
      this.resume = resolve;
    });
  }

  holdNextChapterRead(): void {
    this.armed = true;
  }

  release(): void {
    this.resume?.();
  }

  async get<T>(
    store: Parameters<PersistenceDatabase['get']>[0],
    key: IDBValidKey,
  ): Promise<T | undefined> {
    const value = await this.inner.get<T>(store, key);
    if (this.armed && store === STORE_NAMES.chapters) {
      this.armed = false;
      this.entered?.();
      await this.released;
    }
    return value;
  }

  getAll<T>(store: Parameters<PersistenceDatabase['getAll']>[0]) {
    return this.inner.getAll<T>(store);
  }
  count(store: Parameters<PersistenceDatabase['count']>[0]) {
    return this.inner.count(store);
  }
  countRange(
    store: Parameters<PersistenceDatabase['countRange']>[0],
    index: Parameters<PersistenceDatabase['countRange']>[1],
    range?: Parameters<PersistenceDatabase['countRange']>[2],
  ) {
    return this.inner.countRange(store, index, range);
  }
  scan<T>(
    store: Parameters<PersistenceDatabase['scan']>[0],
    options?: Parameters<PersistenceDatabase['scan']>[1],
  ) {
    return this.inner.scan<T>(store, options);
  }
  getAllFromIndex<T>(
    store: Parameters<PersistenceDatabase['getAllFromIndex']>[0],
    index: string,
    key?: Parameters<PersistenceDatabase['getAllFromIndex']>[2],
  ) {
    return this.inner.getAllFromIndex<T>(store, index, key);
  }
  getAllKeysFromIndex(
    store: Parameters<PersistenceDatabase['getAllKeysFromIndex']>[0],
    index: string,
    key?: Parameters<PersistenceDatabase['getAllKeysFromIndex']>[2],
  ) {
    return this.inner.getAllKeysFromIndex(store, index, key);
  }
  put<T>(store: Parameters<PersistenceDatabase['put']>[0], value: T) {
    return this.inner.put(store, value);
  }
  delete(store: Parameters<PersistenceDatabase['delete']>[0], key: IDBValidKey) {
    return this.inner.delete(store, key);
  }
  clear(store: Parameters<PersistenceDatabase['clear']>[0]) {
    return this.inner.clear(store);
  }
  transaction<T>(
    stores: Parameters<PersistenceDatabase['transaction']>[0],
    mode: Parameters<PersistenceDatabase['transaction']>[1],
    work: (transaction: PersistenceTransaction) => Promise<T>,
  ) {
    return this.inner.transaction(stores, mode, work);
  }
  close() {
    this.inner.close();
  }
}
