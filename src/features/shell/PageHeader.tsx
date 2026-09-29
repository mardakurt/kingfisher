'use client';

/**
 * The plain title row, and the tab strip under it.
 *
 * A title row the height of a Mac window's toolbar — the page's name, a quiet
 * line saying what it holds, and its actions to the right — with the working
 * tabs beneath. The board routes draw the same two rows through
 * `WorkspaceFrame`, which adds the rail toggle, the position menu and the
 * fold that protects the title when a route's actions are wide. One shape, so
 * a person who has learned one page has learned the header of all of them.
 *
 * It is not a second way of drawing the same header: it is the header for the
 * pages that have no board to give a column to. Three pages that had rolled
 * their own row — Search, the Position page and Players — were using this
 * before and were on 14px and 16px titles, two of them with a rule under them
 * that this does not draw. See `GlobalControls.tsx` for the controls at the
 * right, which are shared with `WorkspaceFrame` for the same reason.
 */

import type { ReactNode } from 'react';

import { WorkspaceTabStrip } from '@/features/tabs/WorkspaceTabStrip';
import { cn } from '@/lib/cn';

import { ControlDivider, GlobalControls } from './GlobalControls';
import { NavButton } from './NavButton';

import { TITLEBAR_BAND_CLASS } from '@/features/workspace/breakpoints';

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  children,
  className,
}: {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly icon?: ReactNode;
  /** Right-aligned controls. */
  readonly actions?: ReactNode;
  /** Content between the title and the actions — a search field. */
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <>
      <header
        data-titlebar-drag=""
        data-page-header=""
        className={cn(
          'flex min-w-0 shrink-0 items-center gap-2 bg-surface-1 px-3 sm:px-4',
          TITLEBAR_BAND_CLASS,
          className,
        )}
      >
        <NavButton />
        {icon ? (
          <span className="shrink-0 text-secondary [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>
        ) : null}
        <div className="min-w-0 shrink" data-header-title>
          <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-primary">
            {title}
          </h1>
          {subtitle ? (
            <p className="hidden truncate text-[11px] text-tertiary sm:block">{subtitle}</p>
          ) : null}
        </div>
        {children}
        {/*
          The route's own actions, then the two controls that are the same on
          every route. The free space is taken by this group as a whole, so
          the header's right edge is in the same place whether a route has
          three actions, one, or none — which is what a person moving between
          the Library and the Position page should not have to notice.
        */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {actions}
          <ControlDivider />
          <GlobalControls />
        </div>
      </header>
      <WorkspaceTabStrip />
    </>
  );
}
