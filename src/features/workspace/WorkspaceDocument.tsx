/**
 * The content of a route that takes over the workspace (Phase 86).
 *
 * A report or an index is read, not played on, so it replaces the rail,
 * board and dock (`WorkspaceFrame`'s `takeover`). It used to be passed as the
 * frame's `children`, which render after the workspace grid with no gutter and
 * outside every scroll region: Season and Daily sat under an unrelated board,
 * flush against the sidebar, their controls at the foot of the window. This
 * is the one place such content gets its gutters, its readable width, its
 * single scroll region and the space below its last line.
 */

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export function WorkspaceDocument({
  children,
  className,
  label,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  /** Names the region for assistive technology. */
  readonly label: string;
}) {
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      data-workspace-document
      role="region"
      aria-label={label}
    >
      <div
        className={cn(
          'mx-auto flex w-full max-w-[1080px] flex-col gap-4 px-4 pt-4 pb-12 sm:px-6 lg:px-8',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
