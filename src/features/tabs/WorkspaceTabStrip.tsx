'use client';

/**
 * The strip of working tabs under the page header.
 *
 * One rounded track across the width of the page, the tabs sharing it
 * equally, the active one raised in the page's own white, and + at the end —
 * the shape of the tab bar in a Mac document window. Titles are the tab's
 * place and document; a tab closes with its ×, a middle click or its menu,
 * and tabs reorder by dragging.
 */

import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { Close, Plus } from '@/components/icons';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ContextMenu } from '@/components/ui/Menu';
import { cn } from '@/lib/cn';
import { useAnalysis } from '@/stores/analysis-store';
import { useOpeningClassification } from '@/theory/useOpeningClassification';

import {
  boardSubject,
  followNavigation,
  newTab,
  requestCloseTab,
  startTabs,
  switchTab,
} from './tab-actions';
import { liveTitle, MAX_TABS } from './tab-model';
import { useTabs } from './tab-store';

export function WorkspaceTabStrip() {
  const router = useRouter();
  const pathname = usePathname();
  const tabs = useTabs((state) => state.tabs);
  const activeId = useTabs((state) => state.activeId);
  const ready = useTabs((state) => state.ready);
  const published = useTabs((state) => state.published);
  const pendingClose = useTabs((state) => state.pendingClose);
  const askToClose = useTabs((state) => state.askToClose);
  const move = useTabs((state) => state.move);
  const document = useAnalysis((state) => state.document);
  const tree = useAnalysis((state) => state.tree);
  const currentId = useAnalysis((state) => state.currentId);
  const opening = useOpeningClassification(tree, currentId);
  const subject = boardSubject(
    document,
    currentId === tree.rootId ? null : (opening?.name ?? null),
  );
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const dragged = useRef<string | null>(null);

  useEffect(() => {
    startTabs();
  }, []);
  useEffect(() => {
    followNavigation();
  }, [pathname]);

  // The strip's box is drawn at once, so the page does not move when the
  // list arrives; the tabs fill it after the list is read back, so the
  // server's markup (which cannot know the list) never disagrees with the
  // first client paint.
  if (!ready || tabs.length === 0) {
    return (
      <div
        className="flex h-9 shrink-0 items-center border-b border-line-subtle px-3 [@media(max-height:859px)]:h-7"
        data-workspace-tabs="pending"
        aria-hidden
      >
        <div className="h-[26px] flex-1 rounded-[7px] bg-surface-2 [@media(max-height:859px)]:h-[22px]" />
      </div>
    );
  }

  const title = (id: string, stored: string, href: string) =>
    id === activeId ? liveTitle(pathname ?? href, subject, published) : stored;

  const onAuxClick = (event: MouseEvent, id: string) => {
    if (event.button !== 1) return;
    event.preventDefault();
    void requestCloseTab(id, router);
  };

  const onDrop = (event: DragEvent, index: number) => {
    event.preventDefault();
    if (dragged.current) move(dragged.current, index);
    dragged.current = null;
  };

  return (
    <div
      className="flex h-9 shrink-0 items-center gap-1.5 border-b border-line-subtle px-3 [@media(max-height:859px)]:h-7"
      data-workspace-tabs
    >
      <div
        role="tablist"
        aria-label="Workspace tabs"
        className="flex h-[26px] min-w-0 flex-1 items-stretch gap-0.5 rounded-[7px] bg-surface-2 p-[2px] [@media(max-height:859px)]:h-[22px]"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === activeId;
          const label = title(tab.id, tab.title, tab.href);
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              title={label}
              draggable
              onDragStart={() => {
                dragged.current = tab.id;
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onDrop(event, index)}
              onClick={() => void switchTab(tab.id, router)}
              onAuxClick={(event) => onAuxClick(event, tab.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({ id: tab.id, x: event.clientX, y: event.clientY });
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                  const next = tabs[index + (event.key === 'ArrowRight' ? 1 : -1)];
                  if (next) void switchTab(next.id, router);
                }
              }}
              data-tab={tab.id}
              className={cn(
                'group relative flex min-w-0 flex-1 cursor-default items-center justify-center rounded-[5px] px-6 text-[11.5px] transition-colors select-none',
                selected
                  ? 'bg-surface-1 font-medium text-primary shadow-[0_0_0_0.5px_rgb(0_0_0/0.08),0_1px_2px_rgb(0_0_0/0.08)]'
                  : 'text-secondary hover:bg-black/[0.035] dark:hover:bg-white/[0.05]',
              )}
            >
              <span className="truncate">{label}</span>
              {tabs.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Close ${label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void requestCloseTab(tab.id, router);
                  }}
                  className={cn(
                    'absolute left-1 flex size-4 items-center justify-center rounded-[4px] text-tertiary hover:bg-black/[0.08] hover:text-primary dark:hover:bg-white/[0.1]',
                    selected
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100 focus:opacity-100',
                  )}
                >
                  <Close className="size-2.5" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        aria-label="New tab"
        title={
          tabs.length >= MAX_TABS ? 'Twelve tabs are open, the most Kingfisher shows' : 'New tab'
        }
        disabled={tabs.length >= MAX_TABS}
        onClick={() => void newTab(router)}
        className="flex size-[26px] shrink-0 items-center justify-center rounded-[6px] [@media(max-height:859px)]:size-[22px] text-secondary hover:bg-surface-2 hover:text-primary disabled:opacity-35"
      >
        <Plus className="size-3.5" />
      </button>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          sections={[
            {
              id: 'tab',
              items: [
                {
                  id: 'duplicate',
                  label: 'Duplicate tab',
                  disabled: tabs.length >= MAX_TABS,
                  run: () =>
                    void switchTab(menu.id, router).then(() => newTab(router, { duplicate: true })),
                },
                {
                  id: 'close',
                  label: 'Close tab',
                  disabled: tabs.length <= 1,
                  run: () => void requestCloseTab(menu.id, router),
                },
                {
                  id: 'close-others',
                  label: 'Close other tabs',
                  disabled: tabs.length <= 1,
                  run: () =>
                    void (async () => {
                      await switchTab(menu.id, router);
                      for (const tab of useTabs.getState().tabs) {
                        if (tab.id !== menu.id) await requestCloseTab(tab.id, router);
                      }
                    })(),
                },
              ],
            },
          ]}
        />
      ) : null}

      <ConfirmDialog
        open={pendingClose !== null}
        title="Close this tab?"
        description={pendingClose?.reason}
        confirmLabel="Close tab"
        danger
        onConfirm={() => {
          if (pendingClose) void requestCloseTab(pendingClose.id, router, true);
        }}
        onCancel={() => askToClose(null)}
      />
    </div>
  );
}

/**
 * Give the active tab a better title than its section's name while this
 * route is on screen — `Preparation against Karpov, Anatoly`.
 */
export function useTabTitle(title: string | null | undefined): void {
  const publish = useTabs((state) => state.publish);
  useEffect(() => {
    publish(title ?? null);
    return () => publish(null);
  }, [publish, title]);
}
