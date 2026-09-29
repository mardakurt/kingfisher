'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { MoreHorizontal } from '@/components/icons';
import { Menu, type MenuSection } from '@/components/ui/Menu';
import { cn } from '@/lib/cn';

import type { WorkspaceModuleId } from './layout-model';
import { WORKSPACE_TOOL_ICONS } from './tool-icons';

export interface ModuleTab {
  readonly id: WorkspaceModuleId;
  readonly label: string;
  /** Shown when the tool cannot help here; the tab stays selectable. */
  readonly unavailable?: string | null;
}

/**
 * The tab strip for one region.
 *
 * Phase 9 rendered every tool as an equally weighted tab in a horizontally
 * scrolling row. On Analysis that was thirteen of them, which meant the last
 * five were off-screen behind a scrollbar most people never noticed, and the
 * strip's contents changed identity between routes. §26 and §27 are the fix:
 * a short row of pinned tools plus the active one, and everything else behind
 * a single, obvious "More".
 *
 * Tabs are 32px tall with real words on them rather than icons. Miniature
 * navigation is cheap to add and expensive to use, and §56 exists because it
 * has been reintroduced before.
 *
 * The strip never scrolls and never wraps. It used to scroll, with the More
 * button as the row's last child — and the More menu, a 370px-tall
 * absolutely positioned list, was clipped by the row's `overflow-x: auto`,
 * which the browser promotes to `overflow-y: auto` as well. Then (Phase 62)
 * it wrapped: a row narrower than its tabs put More and the collapse control
 * on a second line, which at the default 380px dock was a line holding
 * "More ▾" and 300px of nothing under every pinned tab — the blank band the
 * owner read as something missing.
 *
 * Phase 72: the row fits itself. It measures its own width and the width of
 * each tab; when the tabs do not all fit with their icons it draws them
 * without (the words are the tabs; the icons are decoration the More menu
 * keeps), and only what still does not fit is folded into More, in priority
 * order — the route's own panel, then the lower panel's content, then the
 * pinned tools. The active tab is always in the row, so choosing a tool from
 * More never sends it straight back into the menu. A dock resized narrower
 * folds tabs; resized wider unfolds them; nothing ever needs a second line.
 */
export function ModuleTabStrip({
  tabs,
  visible,
  value,
  onChange,
  actions,
}: {
  readonly tabs: readonly ModuleTab[];
  /** Ids that stay in the row; the rest go under More. */
  readonly visible: readonly WorkspaceModuleId[];
  readonly value: WorkspaceModuleId | null;
  readonly onChange: (id: WorkspaceModuleId) => void;
  readonly actions?: React.ReactNode;
}) {
  // The active tab is always in the row, whether or not it is pinned:
  // selecting something from More and watching it vanish back into the menu
  // is the discoverability bug in a new place.
  const wanted = tabs.filter((tab) => visible.includes(tab.id) || tab.id === value);

  const strip = useRef<HTMLDivElement>(null);
  const [rowWidth, setRowWidth] = useState(0);
  /*
    Everything measured lives in state, written from layout effects and read
    by render: the tab widths (a folded tab keeps the width it had when it
    was last drawn), and the width of the More box and the actions box.
  */
  const [measured, setMeasured] = useState<{
    /** Keyed by `${mode}:${id}`: a tab is a different width with its icon. */
    readonly widths: Readonly<Record<string, number>>;
    /** More is a word in a full row and an icon in a compact one: one width each. */
    readonly more: Readonly<Partial<Record<'full' | 'compact', number>>>;
    readonly actions: number;
  }>({ widths: {}, more: {}, actions: 0 });
  /*
    Before any tab is folded, the icons go. A tab's icon is 18 px of
    decoration beside a real word; at the default 380 px dock the four
    pinned Analysis tools fit on one row without them and do not with them.
    `compact` is decided from the measurements, below.
  */
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const element = strip.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const next = contentWidth(element);
      setRowWidth((current) => (current === next ? current : next));
    });
    observer.observe(element);
    setRowWidth(contentWidth(element));
    return () => observer.disconnect();
  }, []);

  // Re-measured whenever the row's contents could have changed size: the
  // set of tabs drawn, or the row itself. Written only when a number moved,
  // so the effect settles after one extra render at most.
  const drawn = wanted.map((tab) => tab.id).join('|');
  useLayoutEffect(() => {
    const element = strip.current;
    if (!element) return;
    // The observer reports size changes; this is the same number read again
    // whenever the contents change, so a width the observer has not delivered
    // yet is still caught on the next render.
    const width = contentWidth(element);
    setRowWidth((current) => (current === width ? current : width));
    const widths: Record<string, number> = {};
    const mode = element.dataset.tabStripCompact ? 'compact' : 'full';
    for (const tab of element.querySelectorAll<HTMLElement>('[data-tab-id]')) {
      const width = tab.offsetWidth;
      if (width > 0) widths[`${mode}:${tab.dataset.tabId!}`] = width;
    }
    const more = outerWidth(element.querySelector<HTMLElement>('[data-tab-strip-more-box]'));
    const actions = outerWidth(element.querySelector<HTMLElement>('[data-tab-strip-actions]'));
    setMeasured((current) => {
      const merged = { ...current.widths, ...widths };
      const changed =
        Object.keys(merged).some((id) => merged[id] !== current.widths[id]) ||
        (more > 0 && more !== current.more[mode]) ||
        actions !== current.actions;
      return changed
        ? {
            widths: merged,
            more: more > 0 ? { ...current.more, [mode]: more } : current.more,
            actions,
          }
        : current;
    });
  }, [drawn, rowWidth, value, compact]);

  const rest = tabs.filter((tab) => !wanted.includes(tab));
  /*
    A tab is measured only while it is drawn, so a tab folded in one mode has
    no measurement in that mode; the other mode's width, less or plus the
    icon and its gap, is the next best number — every wanted tab is drawn
    with its icon at least once, on the first, unmeasured render.
  */
  const widthIn = (mode: 'full' | 'compact', id: WorkspaceModuleId): number | undefined => {
    const own = measured.widths[`${mode}:${id}`];
    if (own !== undefined) return own;
    const other = measured.widths[`${mode === 'full' ? 'compact' : 'full'}:${id}`];
    if (other === undefined) return undefined;
    return mode === 'full' ? other + ICON_ALLOWANCE : other - ICON_ALLOWANCE;
  };
  const fit = (mode: 'full' | 'compact') =>
    fitTabs({
      wanted,
      active: value,
      /*
        Less the gap between items: one per tab, one before More and one
        before the actions. Until Phase 87 neither the row's padding nor its
        gaps were counted, and the last few pixels of the row — the collapse
        button — were clipped whenever the tabs fitted to within them.
      */
      rowWidth: rowWidth > 0 ? rowWidth - ROW_GAP * (wanted.length + 2) : 0,
      widthOf: (id) => widthIn(mode, id),
      moreWidth: measured.more[mode] ?? MORE_WIDTH_ESTIMATE[mode],
      actionsWidth: measured.actions,
      // The remaining tools are folded even when they are not pinned.
      rest,
      priority: visible,
    });
  const full = fit('full');
  // Icons stay while every wanted tab fits with them; otherwise the row is
  // drawn compact, and only what still does not fit is folded.
  const wantCompact = rowWidth > 0 && full.shown.length < wanted.length;
  if (wantCompact !== compact) setCompact(wantCompact);
  const { shown, overflow } = compact ? fit('compact') : full;

  const sections: readonly MenuSection[] = [
    {
      id: 'more',
      items: overflow.map((tab) => ({
        id: tab.id,
        label: tab.label,
        icon: (() => {
          const Icon = WORKSPACE_TOOL_ICONS[tab.id];
          return <Icon />;
        })(),
        run: () => onChange(tab.id),
      })),
    },
  ];

  return (
    <div
      ref={strip}
      role="tablist"
      /*
        Clipped on the x axis only. The row never needs to scroll, and the
        unmeasured first paint may briefly be wider than the strip — but the
        More menu is an absolutely positioned list hanging *below* the row,
        and `overflow-hidden` here cut it to one item (the Phase 72 audit's
        own regression, caught by the owner: "More shows only one option").
      */
      className="flex h-10 shrink-0 flex-nowrap items-center gap-0.5 overflow-x-clip overflow-y-visible border-b border-line-subtle px-1.5"
      data-tab-strip
      data-tab-strip-compact={compact ? 'true' : undefined}
    >
      {shown.map((tab) => {
        const selected = tab.id === value;
        const Icon = WORKSPACE_TOOL_ICONS[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab-id={tab.id}
            aria-selected={selected}
            title={tab.unavailable ?? tab.label}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative flex h-7 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] text-xs font-medium whitespace-nowrap transition-colors',
              // Compact drops the icon first and then 2px a side, before any tab is folded.
              compact ? 'px-1.5' : 'px-2',
              // Press is one step past hover, as everywhere else: these are the
              // most-pressed controls in the application.
              selected
                ? 'bg-surface-3 text-primary active:bg-surface-press'
                : 'text-secondary hover:bg-surface-2 hover:text-primary active:bg-surface-press',
            )}
          >
            {compact ? null : <Icon className="h-3.5 w-3.5 shrink-0" />}
            {tab.label}
            {/* A tool that cannot help still shows; the dot says so at a glance. */}
            {tab.unavailable ? (
              <span aria-hidden className="size-1 rounded-full bg-tertiary/50" />
            ) : null}
          </button>
        );
      })}
      {overflow.length > 0 ? (
        /*
          A small left margin keeps a visible separator while pulling More
          next to the tabs; `ml-auto` here once left a blank band the user
          read as "empty space where something is missing".
        */
        <div data-tab-strip-more-box className="ml-1 flex shrink-0 items-center">
          <Menu
            align="end"
            sections={sections}
            trigger={({ toggle, open, id }) => (
              <button
                type="button"
                id={id}
                onClick={toggle}
                aria-expanded={open}
                aria-haspopup="menu"
                data-tab-strip-more
                title={compact ? `More — ${overflow.length} more tools` : undefined}
                className={cn(
                  'flex h-7 shrink-0 items-center justify-center gap-1 rounded-[var(--radius-control)] text-xs font-medium whitespace-nowrap text-secondary hover:bg-surface-2 hover:text-primary',
                  compact ? 'w-7' : 'px-2',
                )}
              >
                {/*
                  In a compact row the word gives way to an icon, and gives the
                  tabs about thirty pixels: at a 300 px dock on Linux fonts the
                  word pushed a pinned Explorer tab into its own menu. The
                  accessible name is the same either way.
                */}
                {compact ? (
                  <>
                    <MoreHorizontal aria-hidden className="h-4 w-4" />
                    <span className="sr-only">More</span>
                  </>
                ) : (
                  <>
                    More
                    <span aria-hidden className="text-[9px]">
                      ▾
                    </span>
                  </>
                )}
                <span className="sr-only">{overflow.length} more tools</span>
              </button>
            )}
          />
        </div>
      ) : null}
      {actions ? (
        <div
          data-tab-strip-actions
          className={cn(
            '-mr-1.5 flex shrink-0 items-stretch self-stretch',
            overflow.length === 0 && 'ml-auto',
          )}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/** The row's `gap-0.5` between items. */
const ROW_GAP = 2;

/** The width a row has for its items: its client width less its padding. */
function contentWidth(element: HTMLElement): number {
  const style = getComputedStyle(element);
  return Math.floor(
    element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
  );
}

/** An item's width with its margins, which `offsetWidth` leaves out. */
function outerWidth(element: HTMLElement | null): number {
  if (!element) return 0;
  const style = getComputedStyle(element);
  return Math.ceil(
    element.offsetWidth + parseFloat(style.marginLeft) + parseFloat(style.marginRight),
  );
}

/** A tab's icon (14 px) and the gap after it (4 px). */
const ICON_ALLOWANCE = 18;
/** "More ▾" with its margin and border, before it has been drawn once. */
const MORE_WIDTH_ESTIMATE = { full: 60, compact: 32 } as const;
/** A tab that has never been drawn: icon, gap, a typical label, padding. */
const TAB_WIDTH_ESTIMATE = 84;

/**
 * Which tabs stay in one row. Pure, so the rule is unit-tested without a DOM.
 *
 * The active tab is placed first (whatever its position), then the wanted
 * tabs in their own order while they fit. Nothing is ever reordered on screen
 * — the row is drawn in `wanted` order — the active tab is only *reserved*
 * first so it can never be the one that is dropped. A row too narrow for even
 * the active tab still shows it: a strip with no tab at all has no tool.
 */
export function fitTabs({
  wanted,
  active,
  rowWidth,
  widthOf,
  moreWidth,
  actionsWidth,
  rest,
  priority = [],
}: {
  readonly wanted: readonly ModuleTab[];
  readonly active: WorkspaceModuleId | null;
  readonly rowWidth: number;
  readonly widthOf: (id: WorkspaceModuleId) => number | undefined;
  readonly moreWidth: number;
  readonly actionsWidth: number;
  readonly rest: readonly ModuleTab[];
  /** Ids in the order they deserve the row; absent ids come last. */
  readonly priority?: readonly WorkspaceModuleId[];
}): { readonly shown: readonly ModuleTab[]; readonly overflow: readonly ModuleTab[] } {
  // Unmeasured (the first render, or before layout): draw everything wanted.
  if (rowWidth <= 0) return { shown: wanted, overflow: rest };

  const width = (tab: ModuleTab) => widthOf(tab.id) ?? TAB_WIDTH_ESTIMATE;
  const total = wanted.reduce((sum, tab) => sum + width(tab), 0);
  if (total + actionsWidth <= rowWidth && rest.length === 0) {
    return { shown: wanted, overflow: [] };
  }
  // Something goes under More, so More is in the row and takes its share.
  const budget = rowWidth - actionsWidth - moreWidth;
  const kept = new Set<WorkspaceModuleId>();
  let used = 0;
  const activeTab = wanted.find((tab) => tab.id === active);
  if (activeTab) {
    kept.add(activeTab.id);
    used += width(activeTab);
  }
  // Kept in priority order — the `visible` list's order, which puts the
  // route's own panel first and the lower panel's content (the Move Tree on a
  // phone) before the pinned tools — but drawn in the row's own order.
  const rank = (tab: ModuleTab) => {
    const index = priority.indexOf(tab.id);
    return index === -1 ? priority.length : index;
  };
  for (const tab of [...wanted].sort((a, b) => rank(a) - rank(b))) {
    if (kept.has(tab.id)) continue;
    if (used + width(tab) > budget) break;
    kept.add(tab.id);
    used += width(tab);
  }
  const shown = wanted.filter((tab) => kept.has(tab.id));
  const overflow = [...wanted.filter((tab) => !kept.has(tab.id)), ...rest];
  return { shown, overflow };
}
