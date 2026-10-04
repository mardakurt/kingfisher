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
/**
 * The session (`kingfisher.session`, one per tab) that wrote the unload draft.
 *
 * `localStorage` is shared by every tab, and so is the IndexedDB draft. A tab
 * that reloaded inside the autosave window, while another tab was writing its
 * own draft, came back with the other tab's work: the stored draft was newer,
 * the unload draft — the only copy of the reloading tab's last edit — was
 * taken, lost the comparison and was dropped (found by
 * `e2e/cross-tab-stress.spec.ts`). Recording the owner lets a reload keep its
 * own work, and lets another tab's load leave that work for its owner.
 */
export const UNLOAD_OWNER_KEY = 'kingfisher.unload-draft.session';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function writeUnloadDraft(
  storage: Storage | null,
  draft: DraftRecord,
  session: string | null = null,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(UNLOAD_DRAFT_KEY, JSON.stringify(draft));
    if (session) storage.setItem(UNLOAD_OWNER_KEY, session);
    else storage.removeItem(UNLOAD_OWNER_KEY);
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

/**
 * The unload draft this load may take, and whether its own session wrote it.
 *
 * Another live tab's draft is left in place for that tab's reload — unless
 * this is a fresh launch, when whatever the last page left is the previous
 * session's work and is taken as before (it is then held, not restored).
 * A draft written before owners were recorded is taken as before.
 */
export function takeOwnUnloadDraft(
  storage: Storage | null,
  session: string | null,
  freshLaunch: boolean,
): { readonly draft: DraftRecord | null; readonly own: boolean } {
  if (!storage) return { draft: null, own: false };
  let owner: string | null = null;
  try {
    owner = storage.getItem(UNLOAD_OWNER_KEY);
  } catch {
    return { draft: null, own: false };
  }
  const own = owner !== null && session !== null && owner === session;
  if (owner !== null && !own && !freshLaunch) return { draft: null, own: false };
  const draft = takeUnloadDraft(storage);
  try {
    storage.removeItem(UNLOAD_OWNER_KEY);
  } catch {
    /* The draft itself is gone; a stale owner names nothing. */
  }
  return { draft, own: own && draft !== null };
}

/**
 * Which draft a reload restores.
 *
 * Ordinarily the newer. But this tab's own unload draft is its last work, and
 * a newer stored draft that is *different* work can only have been written by
 * another tab meanwhile — restoring that put the other tab's document on this
 * tab's board and dropped this one's edit. The same work written a moment
 * later by the save `pagehide` started is still preferred (`continuesUnload`).
 */
export function chooseDraft(
  unload: DraftRecord | null,
  stored: DraftRecord | null,
  own: boolean,
): DraftRecord | null {
  if (own && unload && stored && !continuesUnload(unload, stored)) return unload;
  return newerDraft(unload, stored);
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

/**
 * Whether the draft a load restores is the work the last page left as it
 * went away.
 *
 * `pagehide` writes the unload draft and also starts the ordinary IndexedDB
 * save, whose draft is stamped a few milliseconds later. When that write
 * lands before the page goes, the stored draft is the newer of the two — and
 * it is the same work: same document, same moves. Treating only the unload
 * draft itself as the continuation made that case look like a rival version,
 * so the load opened the stored chapter and offered the moves as a recovery:
 * one reload in five lost the two moves `e2e/study-reload.spec.ts` plays
 * (Phase 85's full run found it).
 */
export function continuesUnload(unload: DraftRecord | null, chosen: DraftRecord | null): boolean {
  if (!unload || !chosen) return false;
  if (chosen === unload) return true;
  const a = unload.document as { kind: string; chapterId?: string; revision?: number };
  const b = chosen.document as { kind: string; chapterId?: string; revision?: number };
  if (a.kind !== b.kind || a.chapterId !== b.chapterId || a.revision !== b.revision) return false;
  const left = Object.keys(unload.tree.nodes);
  if (left.length !== Object.keys(chosen.tree.nodes).length) return false;
  return left.every((id) => {
    const one = unload.tree.nodes[id];
    const other = chosen.tree.nodes[id];
    return Boolean(other) && one?.move?.san === other?.move?.san && one?.comment === other?.comment;
  });
}
