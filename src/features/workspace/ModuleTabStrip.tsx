'use client';

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
 * The strip never scrolls. When the row is narrower than its tabs it wraps
 * onto a second line, so every pinned tool stays visible and clickable — a
 * pinned tab that has scrolled out of sight is not pinned. It used to scroll,
 * with the More button as the row's last child — and the More menu, a
 * 370px-tall absolutely positioned list, was clipped by the row's
 * `overflow-x: auto`, which the browser promotes to `overflow-y: auto` as
 * well. Opening More showed one item and scrolled the row sideways so the
 * pinned tabs vanished off its left edge: the user pressed More and found
 * themselves in what looked like a different layout with no way back. The
 * More button now sits outside the row, in a box that never clips.
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
  const shown = tabs.filter((tab) => visible.includes(tab.id) || tab.id === value);
  const overflow = tabs.filter((tab) => !shown.includes(tab));

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
    /*
      One wrapping row for everything. The tabs, the More button and the
      collapse control share the same flex flow, so a strip too narrow for its
      tabs wraps to a second line rather than squeezing the tabs into whatever
      is left beside two fixed buttons — which at a 300px dock was 204px, and
      four lines of tabs.
    */
    <div
      role="tablist"
      className="flex shrink-0 flex-wrap items-stretch border-b border-line-subtle"
    >
      {shown.map((tab) => {
        const selected = tab.id === value;
        const Icon = WORKSPACE_TOOL_ICONS[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            title={tab.unavailable ?? tab.label}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative flex h-8 shrink-0 items-center gap-1 px-2 text-xs font-medium whitespace-nowrap transition-colors',
              selected
                ? 'bg-surface-2 text-primary'
                : 'text-tertiary hover:bg-surface-2/50 hover:text-secondary',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {tab.label}
            {/* A tool that cannot help still shows; the dot says so at a glance. */}
            {tab.unavailable ? (
              <span aria-hidden className="size-1 rounded-full bg-tertiary/50" />
            ) : null}
            {selected ? <span className="absolute inset-x-0 bottom-0 h-px bg-accent" /> : null}
          </button>
        );
      })}
      {overflow.length > 0 ? (
        <div className="ml-auto flex shrink-0 items-stretch border-l border-line-subtle">
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
                className="flex h-8 shrink-0 items-center gap-1 px-2 text-xs font-medium text-tertiary hover:bg-surface-2/50 hover:text-secondary"
              >
                More
                <span aria-hidden className="text-[9px]">
                  ▾
                </span>
                <span className="sr-only">{overflow.length} more tools</span>
              </button>
            )}
          />
        </div>
      ) : null}
      {actions ? (
        <div className={cn('flex shrink-0 items-stretch', overflow.length === 0 && 'ml-auto')}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}
