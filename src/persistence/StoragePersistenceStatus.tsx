'use client';

/**
 * A quiet "Saved on this device" status indicator.
 *
 * Phase 29 (PART AJ-AK) wants the user to know whether their
 * work is durably stored, but explicitly NOT next to the board.
 * The status is therefore shown in the sidebar bottom area,
 * next to the theme and settings controls, where chrome lives.
 *
 * The brief is clear that we must not imply cross-device
 * backup exists when it does not. The copy below reflects that:
 * the status reports one device's storage state, never
 * "synced" or "cloud", and a non-persistent state offers a
 * one-click path to ask the browser to make it durable.
 *
 * The state mapping is:
 *   persistent      -> "Saved on this device"
 *   not-persistent  -> "Storage is not protected"  (clickable to request)
 *   unavailable     -> "Storage protection unavailable" (informational only)
 *   pending         -> "Storage status…" (placeholder until first async probe)
 */

import { useUi } from '@/stores/ui-store';

import { useStoragePersistence } from './use-storage-persistence';

const COPY = {
  pending: {
    label: 'Storage status…',
    detail: 'Checking how this browser stores your work.',
  },
  persistent: {
    label: 'Saved on this device',
    detail: 'Your work is kept here, even if the browser is under pressure.',
  },
  'not-persistent': {
    label: 'Storage is not protected',
    detail: 'Click to ask the browser to keep your work even under pressure.',
  },
  unavailable: {
    label: 'Storage protection unavailable',
    detail: 'This runtime does not expose durable storage, so the browser may evict your work.',
  },
} as const;

const TONE = {
  pending: 'text-tertiary',
  persistent: 'text-success',
  'not-persistent': 'text-warning',
  unavailable: 'text-caution',
} as const;

export function StoragePersistenceStatus({ compact = false }: { readonly compact?: boolean }) {
  const { status, request } = useStoragePersistence();
  const notify = useUi((state) => state.notify);
  const copy = COPY[status];
  const tone = TONE[status];

  const clickable = status === 'not-persistent';

  return (
    <div
      className="flex items-center gap-2"
      data-storage-persistence={status}
      data-testid="storage-persistence-status"
    >
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${tone === 'text-tertiary' ? 'bg-tertiary' : tone === 'text-success' ? 'bg-success' : tone === 'text-warning' ? 'bg-warning' : 'bg-caution'}`}
        aria-hidden
      />
      <button
        type="button"
        disabled={!clickable}
        onClick={async () => {
          if (!clickable) return;
          const granted = await request();
          if (granted === 'persistent') {
            notify({
              tone: 'success',
              message: 'Storage protection granted. Your work is kept on this device.',
            });
          } else if (granted === 'unavailable') {
            notify({
              tone: 'info',
              message: 'This browser does not expose durable storage.',
            });
          } else {
            notify({
              tone: 'info',
              message:
                'The browser declined the request. Your work is still saved; storage is not protected from pressure events.',
            });
          }
        }}
        title={copy.detail}
        className={`min-w-0 truncate text-left text-[10.5px] ${tone} ${clickable ? 'cursor-pointer underline-offset-2 hover:underline' : 'cursor-default'} ${compact ? 'sr-only' : ''}`}
      >
        {copy.label}
      </button>
    </div>
  );
}
