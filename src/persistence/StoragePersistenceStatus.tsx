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
 * Phase 38 (PART P-Q): the visible state is now driven by two
 * signals, not one. The write tracker tells us whether any
 * user-authored write is in flight or has rejected since the
 * last success. The storage-persistence probe tells us whether
 * the runtime will keep our work. The composed copy is:
 *
 *   - "Saving…" if a write is in flight (regardless of persistence)
 *   - "Save failed" if a write has rejected since the last success
 *   - "Saved on this device" once everything is on disk and durable
 *   - "Storage is not protected" if durable storage was never granted
 *   - "Storage protection unavailable" if the runtime has no API
 *   - "Storage status…" while the first probe is still pending
 *
 * The previous "green dot, no text" UX did not say a write was
 * in flight. Now it does.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { useUi } from '@/stores/ui-store';

import { composeSavedState, type SavedStatePersistence } from './saved-state';
import { useStoragePersistence } from './use-storage-persistence';
import { useWriteTracker } from './use-write-tracker';

const isDesktop =
  typeof navigator !== 'undefined' && /Kingfisher|Electron/i.test(navigator.userAgent);

export function StoragePersistenceStatus({ compact = false }: { readonly compact?: boolean }) {
  const { status: persistence, request } = useStoragePersistence();
  const { status: writeStatus, failureLabel } = useWriteTracker();
  const router = useRouter();
  const notify = useUi((state) => state.notify);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const view = composeSavedState(
    persistence as SavedStatePersistence,
    writeStatus,
    failureLabel,
  );

  return (
    <div
      className="relative flex items-center gap-2"
      data-storage-persistence={persistence}
      data-write-state={writeStatus}
      data-testid="storage-persistence-status"
    >
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${view.dotClass}`}
        aria-hidden
      />
      <button
        type="button"
        disabled={!view.requestable && !view.openable && writeStatus !== 'failed'}
        onClick={async () => {
          if (view.requestable) {
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
          if (view.openable || writeStatus === 'failed') {
            setPopoverOpen((value) => !value);
          }
        }}
        title={view.detail}
        aria-haspopup={view.openable || writeStatus === 'failed' ? 'true' : undefined}
        aria-expanded={view.openable || writeStatus === 'failed' ? popoverOpen : undefined}
        className={`min-w-0 truncate text-left text-[10.5px] ${view.tone} ${
          view.requestable || view.openable || writeStatus === 'failed'
            ? 'cursor-pointer underline-offset-2 hover:underline'
            : 'cursor-default'
        } ${compact ? 'sr-only' : ''}`}
      >
        {view.label}
      </button>
      {popoverOpen && (view.openable || writeStatus === 'failed') ? (
        <div
          role="dialog"
          aria-label="Saved status"
          className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-[5px] border border-line bg-surface-1 p-3 text-[12px] text-secondary shadow-lg"
        >
          <p className="font-medium text-primary">{view.label}</p>
          <p className="mt-1 text-[11px] text-tertiary">{view.detail}</p>
          {writeStatus === 'failed' ? (
            <p className="mt-2 text-[11px] text-tertiary">
              The most recent change did not reach local storage. A retry or a backup download is the safest
              next step.
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-tertiary">
              Backups are portable JSON. Streaming cache is excluded — it is reproducible, not work.
            </p>
          )}
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
              {writeStatus === 'failed' ? 'Download backup before retrying' : 'Download backup'}
            </Button>
            <Button
              size="sm"
              variant="subtle"
              onClick={() => {
                setPopoverOpen(false);
                // The settings page is the deeper surface for
                // storage and import/export.
                router.push('/settings');
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
