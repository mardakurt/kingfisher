'use client';

/**
 * The header every page without a board shares, and the tab strip under it.
 *
 * A title row the height of a Mac window's toolbar — the page's name, a quiet
 * line saying what it holds, and its actions to the right — with the working
 * tabs beneath. The board routes have the same two rows through
 * `WorkspaceFrame`. One shape, so a person who has learned one page has
 * learned the header of all of them.
 */

import type { ReactNode } from 'react';

import { WorkspaceTabStrip } from '@/features/tabs/WorkspaceTabStrip';
import { cn } from '@/lib/cn';

import { NavButton } from './NavButton';

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
          'flex h-14 min-w-0 shrink-0 items-center gap-2 bg-surface-1 px-3 sm:px-4',
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
        {actions ? (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>
        ) : null}
      </header>
      <WorkspaceTabStrip />
    </>
  );
}
