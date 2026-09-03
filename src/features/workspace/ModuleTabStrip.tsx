'use client';

import { Menu, type MenuSection } from '@/components/ui/Menu';
import { cn } from '@/lib/cn';

import type { WorkspaceModuleId } from './layout-model';

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
        run: () => onChange(tab.id),
      })),
    },
  ];

  return (
    <div className="flex shrink-0 items-stretch border-b border-line-subtle">
      <div role="tablist" className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {shown.map((tab) => {
          const selected = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              title={tab.unavailable ?? tab.label}
              onClick={() => onChange(tab.id)}
              className={cn(
                'relative flex h-8 shrink-0 items-center gap-1.5 px-3 text-xs font-medium tracking-wide transition-colors',
                selected
                  ? 'bg-surface-2 text-primary'
                  : 'text-tertiary hover:bg-surface-2/50 hover:text-secondary',
              )}
            >
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
                className="flex h-8 shrink-0 items-center gap-1 px-3 text-xs font-medium text-tertiary hover:bg-surface-2/50 hover:text-secondary"
              >
                More
                <span aria-hidden className="text-[9px]">
                  ▾
                </span>
                <span className="sr-only">{overflow.length} more tools</span>
              </button>
            )}
          />
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-stretch">{actions}</div> : null}
    </div>
  );
}
