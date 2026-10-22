'use client';

import { Close } from '@/components/icons';
import { cn } from '@/lib/cn';
import { useUi } from '@/stores/ui-store';

/** Errors that a user can act on, shown without stealing focus. */
export function Notices() {
  const notices = useUi((state) => state.notices);
  const dismiss = useUi((state) => state.dismiss);

  if (notices.length === 0) return null;

  return (
    /*
      Above the phone's bottom navigation (3.5 rem) and the home bar, and no
      wider than the screen: at 380 px it ran off both sides of a 320 px phone.
    */
    <div className="pointer-events-none fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex w-[min(380px,calc(100vw-1.5rem))] -translate-x-1/2 flex-col gap-1.5 md:bottom-[calc(2rem+env(safe-area-inset-bottom))]">
      {notices.map((notice) => (
        <div
          key={notice.id}
          role="status"
          className={cn(
            'pointer-events-none flex items-start gap-2 rounded-[var(--radius-panel)] border bg-surface-2 px-3 py-2 shadow-[var(--shadow-popover)] animate-rise',
            notice.tone === 'error' ? 'border-negative/45' : 'border-line',
          )}
        >
          <div className="min-w-0 flex-1">
            <p
              className={cn('text-xs', notice.tone === 'error' ? 'text-negative' : 'text-primary')}
            >
              {notice.message}
            </p>
            {notice.detail && (
              <p className="mt-0.5 text-2xs leading-relaxed text-tertiary">{notice.detail}</p>
            )}
            {notice.action && (
              <button
                type="button"
                onClick={() => {
                  dismiss(notice.id);
                  notice.action?.run();
                }}
                className="pointer-events-auto mt-1.5 rounded-[var(--radius-control)] border border-line px-2 py-0.5 text-2xs font-medium text-accent-ink transition-colors hover:bg-surface-3"
              >
                {notice.action.label}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismiss(notice.id)}
            className="pointer-events-auto mt-0.5 text-tertiary transition-colors hover:text-primary"
            aria-label="Dismiss"
          >
            <Close className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
