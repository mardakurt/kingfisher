/**
 * Workspace tabs, as data.
 *
 * Pure: no React, no storage, no router. Every rule about which tab is open,
 * which becomes active when one closes, and how many there may be lives here
 * so it can be tested without a browser. See `docs/design/workspace-tabs.md`.
 */

import { NAV_SECTIONS } from '@/features/shell/navigation';

export interface WorkspaceTab {
  readonly id: string;
  /** The place: a route and its query, e.g. `/games?q=Carlsen`. */
  readonly href: string;
  /** What the strip shows. Written when the tab is left, or by `useTabTitle`. */
  readonly title: string;
}

export interface TabsState {
  readonly tabs: readonly WorkspaceTab[];
  readonly activeId: string;
}

/** A thirteenth tab would leave each one too narrow to say what it holds. */
export const MAX_TABS = 12;

export const NEW_TAB_HREF = '/analysis';

export function initialTabs(id: string, href: string = NEW_TAB_HREF): TabsState {
  return { tabs: [{ id, href, title: sectionTitle(href) }], activeId: id };
}

export const activeTab = (state: TabsState): WorkspaceTab | undefined =>
  state.tabs.find((tab) => tab.id === state.activeId);

/** Open a tab to the right of the active one, and make it active. */
export function openTab(state: TabsState, tab: WorkspaceTab): TabsState {
  if (state.tabs.length >= MAX_TABS) return state;
  const at = state.tabs.findIndex((entry) => entry.id === state.activeId);
  const tabs = [...state.tabs];
  tabs.splice(at < 0 ? tabs.length : at + 1, 0, tab);
  return { tabs, activeId: tab.id };
}

/**
 * Close a tab.
 *
 * The last tab never closes: it is where the application is. Closing the
 * active tab activates its right-hand neighbour, or its left one at the end
 * of the strip — what every browser does, so it is what a hand expects.
 */
export function closeTab(state: TabsState, id: string): TabsState {
  if (state.tabs.length <= 1) return state;
  const index = state.tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return state;
  const tabs = state.tabs.filter((tab) => tab.id !== id);
  if (state.activeId !== id) return { tabs, activeId: state.activeId };
  const next = tabs[Math.min(index, tabs.length - 1)] as WorkspaceTab;
  return { tabs, activeId: next.id };
}

export function activate(state: TabsState, id: string): TabsState {
  if (!state.tabs.some((tab) => tab.id === id)) return state;
  return { ...state, activeId: id };
}

/** The tab `step` places along from the active one, wrapping at the ends. */
export function neighbour(state: TabsState, step: 1 | -1): WorkspaceTab | undefined {
  const index = state.tabs.findIndex((tab) => tab.id === state.activeId);
  if (index < 0 || state.tabs.length < 2) return undefined;
  return state.tabs[(index + step + state.tabs.length) % state.tabs.length];
}

export function updateTab(
  state: TabsState,
  id: string,
  patch: Partial<Omit<WorkspaceTab, 'id'>>,
): TabsState {
  let changed = false;
  const tabs = state.tabs.map((tab) => {
    if (tab.id !== id) return tab;
    const next = { ...tab, ...patch };
    if (next.href === tab.href && next.title === tab.title) return tab;
    changed = true;
    return next;
  });
  return changed ? { ...state, tabs } : state;
}

/** Move a tab to another index, for drag-to-reorder. */
export function moveTab(state: TabsState, id: string, to: number): TabsState {
  const from = state.tabs.findIndex((tab) => tab.id === id);
  if (from < 0) return state;
  const target = Math.max(0, Math.min(state.tabs.length - 1, to));
  if (target === from) return state;
  const tabs = [...state.tabs];
  const [moved] = tabs.splice(from, 1);
  tabs.splice(target, 0, moved as WorkspaceTab);
  return { ...state, tabs };
}

/**
 * Add tabs for board work nobody's list names.
 *
 * A backup restore brings `tab:` drafts back without the `localStorage` list
 * that pointed at them. Work that exists must be reachable, so each orphan
 * becomes a tab at the end of the strip, up to the limit.
 */
export function adoptOrphans(
  state: TabsState,
  orphans: readonly { readonly id: string; readonly title: string }[],
): TabsState {
  const known = new Set(state.tabs.map((tab) => tab.id));
  const tabs = [...state.tabs];
  for (const orphan of orphans) {
    if (known.has(orphan.id) || tabs.length >= MAX_TABS) continue;
    tabs.push({ id: orphan.id, href: NEW_TAB_HREF, title: orphan.title });
    known.add(orphan.id);
  }
  return tabs.length === state.tabs.length ? state : { ...state, tabs };
}

/** Anything read back from storage, made into a valid state or nothing. */
/**
 * Section names a stored tab may still carry after the section was renamed:
 * Phase 83 renamed Games to Library, and a tab saved before it kept saying
 * "Games" until it was visited. A tab whose title is a retired name for its
 * own route is given the current one when it is read back.
 */
const RETIRED_SECTION_TITLES: Readonly<Record<string, readonly string[]>> = {
  '/games': ['Games', 'My games'],
};

function storedTitle(href: string, title: unknown): string {
  if (typeof title !== 'string') return sectionTitle(href);
  return RETIRED_SECTION_TITLES[pathOf(href)]?.includes(title) ? sectionTitle(href) : title;
}

export function sanitizeTabs(value: unknown): TabsState | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as { tabs?: unknown; activeId?: unknown };
  if (!Array.isArray(raw.tabs)) return null;
  const seen = new Set<string>();
  const tabs: WorkspaceTab[] = [];
  for (const entry of raw.tabs) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { id, href, title } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue;
    if (typeof href !== 'string' || !href.startsWith('/')) continue;
    seen.add(id);
    tabs.push({ id, href, title: storedTitle(href, title) });
    if (tabs.length === MAX_TABS) break;
  }
  if (tabs.length === 0) return null;
  const activeId =
    typeof raw.activeId === 'string' && seen.has(raw.activeId)
      ? raw.activeId
      : (tabs[0] as WorkspaceTab).id;
  return { tabs, activeId };
}

const pathOf = (href: string): string => href.split(/[?#]/)[0] ?? href;

/** The routes whose subject is the analysis document on the board. */
const DOCUMENT_ROUTES = new Set(['/analysis', '/model-game']);

/** The section a place belongs to, named as the sidebar names it. */
export function sectionTitle(href: string): string {
  const path = pathOf(href);
  if (DOCUMENT_ROUTES.has(path)) return 'Analysis board';
  const section = NAV_SECTIONS.find(
    (entry) => path === entry.href || path.startsWith(`${entry.href}/`),
  );
  if (section) return section.label;
  if (path.startsWith('/position')) return 'Position';
  if (path.startsWith('/settings')) return 'Settings';
  if (path.startsWith('/player')) return 'Player';
  return 'Kingfisher';
}

/**
 * The title a tab shows while it is active.
 *
 * On the analysis board it names the document, as a Mac document window
 * does: `Analysis: Sicilian Najdorf`. Elsewhere a route may publish a better
 * title than its section name (`Preparation against Karpov`); failing that,
 * the section name.
 */
export function liveTitle(
  href: string,
  documentTitle: string | null,
  published: string | null,
): string {
  if (published) return published;
  const path = pathOf(href);
  if (DOCUMENT_ROUTES.has(path) && documentTitle && documentTitle !== 'Untitled analysis') {
    return `Analysis: ${documentTitle}`;
  }
  return sectionTitle(href);
}
