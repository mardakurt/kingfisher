import { describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { createTree } from '@/chess/tree/tree';

import type { DraftRecord } from './types';
import {
  UNLOAD_DRAFT_KEY,
  UNLOAD_OWNER_KEY,
  chooseDraft,
  continuesUnload,
  newerDraft,
  takeOwnUnloadDraft,
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

describe('the load that follows a page going away', () => {
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

/*
  Two tabs share both draft slots. Tab A reloads inside the autosave window, so
  its last edit exists only in the unload draft; meanwhile tab B writes its
  own, newer draft. A must come back with its own work (e2e/cross-tab-stress).
*/
describe('a reload while another tab is working', () => {
  it('takes only the unload draft its own session wrote', () => {
    const storage = memoryStorage();
    writeUnloadDraft(storage, chapter(100, ['e4']), 'tab-a');
    expect(storage.values.get(UNLOAD_OWNER_KEY)).toBe('tab-a');
    // Tab B loading meanwhile leaves A's work where A will look for it.
    expect(takeOwnUnloadDraft(storage, 'tab-b', false)).toEqual({ draft: null, own: false });
    expect(storage.values.has(UNLOAD_DRAFT_KEY)).toBe(true);
    const taken = takeOwnUnloadDraft(storage, 'tab-a', false);
    expect(taken.own).toBe(true);
    expect(taken.draft?.updatedAt).toBe(100);
    expect(storage.values.has(UNLOAD_DRAFT_KEY)).toBe(false);
    expect(storage.values.has(UNLOAD_OWNER_KEY)).toBe(false);
  });

  it("still takes the last page's draft on a fresh launch, as before", () => {
    const storage = memoryStorage();
    writeUnloadDraft(storage, chapter(100, ['e4']), 'yesterday');
    const taken = takeOwnUnloadDraft(storage, 'today', true);
    expect(taken.draft?.updatedAt).toBe(100);
    expect(taken.own).toBe(false);
  });

  it('takes a draft written before owners were recorded', () => {
    const storage = memoryStorage();
    writeUnloadDraft(storage, chapter(100, ['e4']));
    expect(takeOwnUnloadDraft(storage, 'tab-a', false).draft?.updatedAt).toBe(100);
  });

  it('restores its own work over a newer draft of different work from another tab', () => {
    const mine = chapter(100, ['e4', 'e5']);
    const theirs = chapter(150, ['d4']);
    expect(chooseDraft(mine, theirs, true)).toBe(mine);
    // Not its own: the newer stands, as before.
    expect(chooseDraft(mine, theirs, false)).toBe(theirs);
    // The same work saved a moment later by this tab's own pagehide still wins.
    const sameLater = chapter(104, ['e4', 'e5']);
    expect(chooseDraft(mine, sameLater, true)).toBe(sameLater);
  });
});
