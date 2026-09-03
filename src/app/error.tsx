'use client';

import { useEffect } from 'react';

import { useWorkspaceLayout } from '@/stores/workspace-layout-store';

/**
 * Last line of defence. Anything that escapes a panel's boundary lands here;
 * the message is shown verbatim because the user of this application is a
 * developer's peer, not someone to be protected from a stack trace.
 *
 * A layout that fails to render is the one failure this screen names a fix
 * for, rather than just retrying: §17 requires an escape that does not route
 * through Settings, because Settings is itself part of the workspace that
 * just failed to render.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const restoreWorkspace = () => {
    useWorkspaceLayout.getState().resetAllLayouts();
    reset();
  };

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-surface-0 px-6 text-center">
      <h1 className="text-sm font-semibold text-primary">The workspace hit an error</h1>
      <p className="max-w-[52ch] font-mono text-2xs leading-relaxed text-tertiary">
        {error.message}
        {error.digest ? ` (${error.digest})` : ''}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-[4px] bg-accent px-3 py-1.5 text-xs font-medium text-accent-contrast transition-colors hover:bg-accent-hover"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={restoreWorkspace}
          className="rounded-[4px] border border-line bg-surface-2 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-surface-3"
        >
          Restore default workspace
        </button>
        <a
          href="/analysis"
          className="rounded-[4px] border border-line bg-surface-2 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-surface-3"
        >
          Start a new analysis
        </a>
      </div>
    </div>
  );
}
