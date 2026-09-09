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
 * Phase 30 (PART AH-BW): a click on the persistent status
 * opens a small popover with a "Download backup" action
 * that uses the existing backup system. The copy adapts to
 * the platform: "this Mac" on the desktop, "this device"
 * in a browser. The status never mentions IndexedDB, sync
 * or cloud.
 *
 * The state mapping is:
 *   persistent      -> "Saved on this device" / "Saved on this Mac"
 *   not-persistent  -> "Storage is not protected"  (clickable to request)
 *   unavailable     -> "Storage protection unavailable" (informational only)
 *   pending         -> "Storage status…" (placeholder until first async probe)
 */

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { useUi } from '@/stores/ui-store';

import { useStoragePersistence } from './use-storage-persistence';

const isDesktop =
  typeof navigator !== 'undefined' && /Kingfisher|Electron/i.test(navigator.userAgent);

const COPY = {
  pending: {
    label: isDesktop ? 'Storage status…' : 'Storage status…',
    detail: 'Checking how this runtime stores your work.',
  },
  persistent: {
    label: isDesktop ? 'Saved on this Mac' : 'Saved on this device',
    detail: isDesktop
      ? 'Your work is kept on this Mac, even if the application is under pressure.'
      : 'Your work is kept here, even if the browser is under pressure.',
  },
  'not-persistent': {
    label: 'Storage is not protected',
    detail: 'Click to ask the runtime to keep your work even under pressure.',
  },
  unavailable: {
    label: 'Storage protection unavailable',
    detail: isDesktop
      ? 'This runtime does not expose durable storage, so the OS may evict your work.'
      : 'This runtime does not expose durable storage, so the browser may evict your work.',
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
  const [popoverOpen, setPopoverOpen] = useState(false);
  const copy = COPY[status];
  const tone = TONE[status];

  const requestable = status === 'not-persistent';
  const persistent = status === 'persistent';

  return (
    <div
      className="relative flex items-center gap-2"
      data-storage-persistence={status}
      data-testid="storage-persistence-status"
    >
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${tone === 'text-tertiary' ? 'bg-tertiary' : tone === 'text-success' ? 'bg-success' : tone === 'text-warning' ? 'bg-warning' : 'bg-caution'}`}
        aria-hidden
      />
      <button
        type="button"
        disabled={!requestable && !persistent}
        onClick={async () => {
          if (requestable) {
            const granted = await request();
            if (granted === 'persistent') {
              notify({
                tone: 'success',
                message: isDesktop
                  ? 'Storage protection granted. Your work is kept on this Mac.'
                  : 'Storage protection granted. Your work is kept on this device.',
              });
            } else if (granted === 'unavailable') {
              notify({
                tone: 'info',
                message: 'This runtime does not expose durable storage.',
              });
            } else {
              notify({
                tone: 'info',
                message:
                  'The runtime declined the request. Your work is still saved; storage is not protected from pressure events.',
              });
            }
            return;
          }
          if (persistent) {
            setPopoverOpen((value) => !value);
          }
        }}
        title={copy.detail}
        aria-haspopup={persistent ? 'true' : undefined}
        aria-expanded={persistent ? popoverOpen : undefined}
        className={`min-w-0 truncate text-left text-[10.5px] ${tone} ${requestable || persistent ? 'cursor-pointer underline-offset-2 hover:underline' : 'cursor-default'} ${compact ? 'sr-only' : ''}`}
      >
        {copy.label}
      </button>
      {popoverOpen && persistent ? (
        <div
          role="dialog"
          aria-label="Saved status"
          className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-[5px] border border-line bg-surface-1 p-3 text-[12px] text-secondary shadow-lg"
        >
          <p className="font-medium text-primary">{copy.label}</p>
          <p className="mt-1 text-[11px] text-tertiary">{copy.detail}</p>
          <p className="mt-2 text-[11px] text-tertiary">
            Backups are portable JSON. Streaming cache is excluded — it is reproducible, not work.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="accent"
              onClick={async () => {
                setPopoverOpen(false);
                const { downloadWorkspaceBackup } = await import('./backup');
                try {
                  const result = await downloadWorkspaceBackup();
                  if (result.ok) {
                    notify({
                      tone: 'success',
                      message: 'Backup downloaded. Keep it somewhere safe.',
                    });
                  } else {
                    notify({
                      tone: 'error',
                      message: result.message,
                    });
                  }
                } catch (error) {
                  notify({
                    tone: 'error',
                    message: 'The backup could not be created.',
                    detail: error instanceof Error ? error.message : undefined,
                  });
                }
              }}
            >
              Download backup
            </Button>
            <Button
              size="sm"
              variant="subtle"
              onClick={() => {
                setPopoverOpen(false);
                // The settings page is the deeper surface for
                // storage and import/export.
                window.location.hash = '#/settings';
              }}
            >
              Storage settings
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
