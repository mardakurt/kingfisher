'use client';

/**
 * Switching tabs: the one place a tab's board work leaves the store and
 * comes back.
 *
 * The analysis store holds the active tab's work and nothing else. Leaving a
 * tab writes its work to the `drafts` store as `tab:<id>`; entering a tab
 * reads it back with `openDocument` and removes the copy, so exactly one
 * place holds each tab's work at any moment. Every operation is queued, so a
 * double click cannot interleave two switches and cross their trees.
 */

import { START_FEN } from '@/chess/fen';
import { workspaceRestored } from '@/features/persistence/useWorkspacePersistence';
import { stableId } from '@/persistence/ids';
import { getRepositories } from '@/persistence/repositories';
import type { DraftRecord, TabDraftId } from '@/persistence/types';
import { selectDirty, useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import { openingIndexIfLoaded } from '@/theory/openings';
import { classifyPath } from '@/theory/useOpeningClassification';

import {
  activeTab,
  initialTabs,
  liveTitle,
  MAX_TABS,
  neighbour,
  NEW_TAB_HREF,
  sanitizeTabs,
} from './tab-model';
import { useTabs } from './tab-store';

export interface Navigate {
  push(href: string): void;
}

const draftId = (tabId: string): TabDraftId => `tab:${tabId}`;

const here = (): string =>
  typeof window === 'undefined' ? NEW_TAB_HREF : window.location.pathname + window.location.search;

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function failed(error: unknown, message: string): void {
  useUi.getState().notify({
    tone: 'error',
    message,
    detail: error instanceof Error ? error.message : String(error),
  });
}

/**
 * What the board holds, in a few words: the document's title, or — for an
 * untitled analysis with moves on it — the opening it is in, as the
 * classification dataset names it (`Analysis: Bogo-Indian Defense`).
 */
export function boardSubject(
  document: { readonly kind: string; readonly title: string },
  opening: string | null,
): string | null {
  if (document.kind !== 'untitled') return document.title;
  return opening;
}

/** The title the active tab shows right now. */
export function currentTitle(): string {
  const state = useAnalysis.getState();
  const index = openingIndexIfLoaded();
  const opening =
    index && state.currentId !== state.tree.rootId
      ? (classifyPath(index, state.tree, state.currentId)?.name ?? null)
      : null;
  return liveTitle(here(), boardSubject(state.document, opening), useTabs.getState().published);
}

/** Does the work on the board hold something closing would lose? */
function boardRisk(record: {
  readonly document: DraftRecord['document'];
  readonly tree: DraftRecord['tree'];
  readonly unsaved: boolean;
}): string | null {
  if (record.document.kind === 'study-chapter' && record.unsaved) {
    return `“${record.document.title}” has edits that have not been written to its study yet.`;
  }
  if (record.document.kind === 'untitled' && Object.keys(record.tree.nodes).length > 1) {
    return 'This tab holds an analysis that has not been saved to a study.';
  }
  return null;
}

/** Write the active tab's place, title and board work before leaving it. */
async function captureActive(): Promise<void> {
  const tabs = useTabs.getState();
  const tab = activeTab(tabs);
  if (!tab) return;
  const state = useAnalysis.getState();
  tabs.update(tab.id, { href: here(), title: currentTitle() });
  const repositories = await getRepositories();
  await repositories.drafts.save({
    id: draftId(tab.id),
    document: state.document,
    tree: state.tree,
    currentId: state.currentId,
    orientation: state.orientation,
    updatedAt: Date.now(),
    unsaved: selectDirty(state),
  });
}

/** Put a tab's board work back on the board and go to its place. */
async function enter(id: string, navigate: Navigate): Promise<void> {
  const repositories = await getRepositories();
  const draft = await repositories.drafts.getTab(draftId(id));
  if (draft) {
    useAnalysis.getState().openDocument({
      tree: draft.tree,
      document: draft.document,
      currentId: draft.currentId,
      orientation: draft.orientation,
      // Unsaved chapter edits come back as unsaved, so autosave writes them.
      clean: !draft.unsaved,
    });
  } else {
    useAnalysis.getState().newGame(START_FEN);
  }
  const tabs = useTabs.getState();
  tabs.activate(id);
  tabs.publish(null);
  const target = tabs.tabs.find((tab) => tab.id === id);
  if (target) navigate.push(target.href);
  /*
    The board's draft is written now rather than left to autosave's debounce,
    and only then is the tab's copy removed. In between, a reload would find
    the previous tab's board in the draft and this tab's work nowhere.
  */
  await writeBoardDraft(draft?.unsaved === true);
  if (draft) await repositories.drafts.deleteTab(draftId(id));
}

/** Write what is on the board as the page's draft, as autosave would. */
async function writeBoardDraft(unsaved: boolean): Promise<void> {
  const state = useAnalysis.getState();
  const repositories = await getRepositories();
  await repositories.drafts.save({
    id: 'active',
    document: state.document,
    tree: state.tree,
    currentId: state.currentId,
    orientation: state.orientation,
    updatedAt: Date.now(),
    unsaved,
  });
}

function guarded(label: string, task: () => Promise<void>): Promise<void> {
  return serial(async () => {
    useTabs.getState().setSwitching(true);
    try {
      // Never capture a board the page load has not finished putting back.
      await workspaceRestored();
      await task();
    } catch (error) {
      failed(error, label);
    } finally {
      useTabs.getState().setSwitching(false);
    }
  });
}

export function switchTab(id: string, navigate: Navigate): Promise<void> {
  return guarded('The tab could not be opened.', async () => {
    if (useTabs.getState().activeId === id) return;
    if (!useTabs.getState().tabs.some((tab) => tab.id === id)) return;
    await captureActive();
    await enter(id, navigate);
  });
}

export function stepTab(step: 1 | -1, navigate: Navigate): Promise<void> {
  const target = neighbour(useTabs.getState(), step);
  return target ? switchTab(target.id, navigate) : Promise.resolve();
}

/** A new tab on a fresh analysis board, or a copy of the active one. */
export function newTab(navigate: Navigate, options: { duplicate?: boolean } = {}): Promise<void> {
  return guarded('A new tab could not be opened.', async () => {
    const tabs = useTabs.getState();
    if (tabs.tabs.length >= MAX_TABS) {
      useUi.getState().notify({
        tone: 'info',
        message: `Twelve tabs are open, the most Kingfisher shows. Close one to open another.`,
      });
      return;
    }
    const href = options.duplicate ? here() : NEW_TAB_HREF;
    const title = options.duplicate ? currentTitle() : 'Analysis board';
    await captureActive();
    const id = stableId('tab');
    useTabs.getState().open({ id, href, title });
    useTabs.getState().publish(null);
    // A duplicate keeps the board as it is: the store already holds a copy of
    // the work, and the original's copy was just written to its tab draft.
    if (!options.duplicate) useAnalysis.getState().newGame(START_FEN);
    navigate.push(href);
    // As in `enter`: the page's draft describes this tab from now on.
    await writeBoardDraft(options.duplicate === true && selectDirty(useAnalysis.getState()));
  });
}

/**
 * Close a tab, asking first when that would discard work.
 *
 * `confirmed` is passed by the dialog the question opens; nothing else sets it.
 */
export function requestCloseTab(id: string, navigate: Navigate, confirmed = false): Promise<void> {
  return guarded('The tab could not be closed.', async () => {
    const tabs = useTabs.getState();
    if (tabs.tabs.length <= 1) return;
    const active = tabs.activeId === id;
    const repositories = await getRepositories();

    if (!confirmed) {
      let risk: string | null;
      if (active) {
        const state = useAnalysis.getState();
        risk = boardRisk({ ...state, unsaved: selectDirty(state) });
      } else {
        const draft = await repositories.drafts.getTab(draftId(id));
        risk = draft ? boardRisk({ ...draft, unsaved: draft.unsaved === true }) : null;
      }
      if (risk) {
        useTabs.getState().askToClose({ id, reason: risk });
        return;
      }
    }

    useTabs.getState().askToClose(null);
    if (!active) {
      useTabs.getState().close(id);
      await repositories.drafts.deleteTab(draftId(id));
      return;
    }
    useTabs.getState().close(id);
    const next = useTabs.getState().activeId;
    // The closed tab's work is on the board, not in a tab draft; entering the
    // next tab replaces it, which is the close.
    await enter(next, navigate);
  });
}

/**
 * Read the list back, reconcile it with the page that loaded, and make any
 * orphaned tab work reachable. Once per page load.
 */
let started = false;
export function startTabs(): void {
  if (started) return;
  started = true;
  const tabs = useTabs.getState();
  const sane = sanitizeTabs({ tabs: tabs.tabs, activeId: tabs.activeId });
  const state = sane ?? initialTabs(stableId('tab'), here());
  useTabs.getState().init(state);
  // The page that loaded is where the active tab is now.
  useTabs.getState().update(state.activeId, { href: here() });
  void (async () => {
    try {
      const repositories = await getRepositories();
      const stored = await repositories.drafts.listTabs();
      useTabs
        .getState()
        .adopt(
          stored
            .map((draft) => ({ id: draft.id.slice('tab:'.length), title: draft.document.title }))
            .filter((entry) => entry.id !== useTabs.getState().activeId),
        );
    } catch {
      // The list still works; orphans are offered on the next launch.
    }
  })();
}

/** Keep the active tab's place in step with navigation inside it. */
export function followNavigation(): void {
  const tabs = useTabs.getState();
  if (!tabs.ready || tabs.switching) return;
  tabs.update(tabs.activeId, { href: here() });
}
