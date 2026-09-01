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
    <div className="pointer-events-none fixed bottom-8 left-1/2 z-50 flex w-[380px] -translate-x-1/2 flex-col gap-1.5">
      {notices.map((notice) => (
        <div
          key={notice.id}
          role="status"
          className={cn(
            'pointer-events-auto flex items-start gap-2 rounded-[5px] border bg-surface-2 px-3 py-2 shadow-lg animate-rise',
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
          </div>
          <button
            type="button"
            onClick={() => dismiss(notice.id)}
            className="mt-0.5 text-tertiary transition-colors hover:text-primary"
            aria-label="Dismiss"
          >
            <Close className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
