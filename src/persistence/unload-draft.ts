/**
 * The draft written while the page is going away.
 *
 * Autosave waits 900 ms after a change before it writes, and IndexedDB is
 * asynchronous: a reload or a closed tab inside that window started a write
 * the page did not live to finish. A move played in a study chapter and
 * followed by a reload was lost — while the header said "Saved" (Phase 84,
 * found by the chapter-questions browser test).
 *
 * `localStorage` is the one store a page can write synchronously as it goes.
 * On `pagehide`, with unsaved work, the draft is written here too; the next
 * load takes it (read and removed) and, when it is newer than the IndexedDB
 * draft, restores it instead. It is one slot, bounded by the browser's quota:
 * a draft too large to fit is not written, and the IndexedDB draft is then
 * the best there is — which is what there was before.
 */

import type { DraftRecord } from './types';

export const UNLOAD_DRAFT_KEY = 'kingfisher.unload-draft';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function writeUnloadDraft(storage: Storage | null, draft: DraftRecord): boolean {
  if (!storage) return false;
  try {
    storage.setItem(UNLOAD_DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    // Quota, or storage disabled: nothing better can be done synchronously.
    return false;
  }
}

/** The draft the last page left, removed as it is read; null when there is none. */
export function takeUnloadDraft(storage: Storage | null): DraftRecord | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(UNLOAD_DRAFT_KEY);
    storage.removeItem(UNLOAD_DRAFT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as DraftRecord;
    const valid =
      draft?.id === 'active' &&
      typeof draft.updatedAt === 'number' &&
      typeof draft.currentId === 'string' &&
      typeof draft.tree?.rootId === 'string' &&
      typeof draft.tree.nodes === 'object' &&
      draft.tree.nodes !== null &&
      Boolean(draft.tree.nodes[draft.tree.rootId]) &&
      typeof draft.document?.kind === 'string';
    return valid ? draft : null;
  } catch {
    return null;
  }
}

/** The newer of two drafts; the unload one wins a tie, being the later write. */
export function newerDraft(
  unload: DraftRecord | null,
  stored: DraftRecord | null,
): DraftRecord | null {
  if (!unload) return stored;
  if (!stored) return unload;
  return unload.updatedAt >= stored.updatedAt ? unload : stored;
}
