import { describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { createTree } from '@/chess/tree/tree';

import type { DraftRecord } from './types';
import {
  UNLOAD_DRAFT_KEY,
  continuesUnload,
  newerDraft,
  takeUnloadDraft,
  writeUnloadDraft,
} from './unload-draft';

function memoryStorage(limit = Infinity) {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (value.length > limit) throw new DOMException('full', 'QuotaExceededError');
      values.set(key, value);
    },
    removeItem: (key: string) => void values.delete(key),
  };
}

const draft = (updatedAt: number): DraftRecord => ({
  id: 'active',
  document: { kind: 'untitled', title: 'Untitled analysis' },
  tree: createTree(START_FEN),
  currentId: 'r',
  orientation: 'w',
  updatedAt,
  unsaved: false,
});

describe('the draft written as the page goes', () => {
  it('is written synchronously, and taken once', () => {
    const storage = memoryStorage();
    expect(writeUnloadDraft(storage, draft(5))).toBe(true);
    expect(takeUnloadDraft(storage)?.updatedAt).toBe(5);
    expect(takeUnloadDraft(storage)).toBeNull();
    expect(storage.values.has(UNLOAD_DRAFT_KEY)).toBe(false);
  });

  it('gives up quietly when the storage is full, leaving the stored draft to stand', () => {
    expect(writeUnloadDraft(memoryStorage(10), draft(5))).toBe(false);
    expect(writeUnloadDraft(null, draft(5))).toBe(false);
  });

  it('refuses something that is not a draft', () => {
    const storage = memoryStorage();
    storage.setItem(UNLOAD_DRAFT_KEY, '{"id":"active","tree":{}}');
    expect(takeUnloadDraft(storage)).toBeNull();
    storage.setItem(UNLOAD_DRAFT_KEY, 'not json');
    expect(takeUnloadDraft(storage)).toBeNull();
  });

  it('is used only when it is newer than the stored draft', () => {
    expect(newerDraft(draft(9), draft(5))?.updatedAt).toBe(9);
    expect(newerDraft(draft(5), draft(9))?.updatedAt).toBe(9);
    expect(newerDraft(null, draft(9))?.updatedAt).toBe(9);
    expect(newerDraft(draft(1), null)?.updatedAt).toBe(1);
  });
});

describe('the load that follows a page going away', () => {
  const chapter = (updatedAt: number, sans: readonly string[], revision = 3): DraftRecord => {
    const tree = createTree(START_FEN);
    const nodes: Record<string, unknown> = { ...tree.nodes };
    sans.forEach((san, index) => {
      nodes[`n${index}`] = { id: `n${index}`, move: { san }, children: [] };
    });
    return {
      ...draft(updatedAt),
      document: {
        kind: 'study-chapter',
        studyId: 's',
        chapterId: 'c',
        revision,
        title: 'C',
      } as DraftRecord['document'],
      tree: { ...tree, nodes: nodes as DraftRecord['tree']['nodes'] },
      unsaved: true,
    };
  };

  it('continues the work when the stored draft is the same work written a moment later', () => {
    const unload = chapter(100, ['e4', 'e5']);
    const stored = chapter(104, ['e4', 'e5']);
    // The race: the save pagehide started landed, and is newer.
    expect(newerDraft(unload, stored)).toBe(stored);
    expect(continuesUnload(unload, stored)).toBe(true);
  });

  it('is not a continuation when the stored draft is different work', () => {
    const unload = chapter(100, ['e4', 'e5']);
    expect(continuesUnload(unload, chapter(104, ['d4']))).toBe(false);
    expect(continuesUnload(unload, chapter(104, ['e4', 'e5'], 4))).toBe(false);
    expect(continuesUnload(null, unload)).toBe(false);
  });
});
