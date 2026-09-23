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
 *
 * A declined request opens the popover rather than a toast. Chromium
 * grants `persist()` from its own heuristics — the site is installed,
 * bookmarked, or has notification permission — and declines silently
 * otherwise, so "the runtime declined" was true and useless: the
 * person could not do anything with it. The popover says which of
 * those the browser accepts and offers the one Kingfisher can do for
 * them, installing as an app, when the browser has offered it.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { promptInstall, subscribeInstall, type InstallPromptState } from '@/pwa/install-prompt';
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
  const [declined, setDeclined] = useState(false);
  const [install, setInstall] = useState<InstallPromptState | null>(null);
  const view = composeSavedState(persistence as SavedStatePersistence, writeStatus, failureLabel);

  useEffect(() => subscribeInstall(setInstall), []);

  const explainable = view.openable || writeStatus === 'failed' || declined;

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
        /*
          Firefox restores a button's disabled state from before a reload
          along with form values. The server and the client both render this
          button disabled while the storage probe is pending, but a reloaded
          Firefox page had already enabled it, and the restored DOM disagreed
          with both — a hydration mismatch on every reload, in Firefox only.
          autocomplete="off" is the documented opt-out of that restoration.
        */
        {...({ autoComplete: 'off' } as Record<string, string>)}
        disabled={!view.requestable && !explainable}
        onClick={async () => {
          if (view.requestable && !declined) {
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
              // Declined: say why, and what would change the answer.
              setDeclined(true);
              setPopoverOpen(true);
            }
            return;
          }
          if (explainable) setPopoverOpen((value) => !value);
        }}
        title={view.detail}
        aria-haspopup={explainable ? 'true' : undefined}
        aria-expanded={explainable ? popoverOpen : undefined}
        className={`min-w-0 truncate text-left text-[10.5px] ${view.tone} ${
          view.requestable || explainable
            ? 'cursor-pointer underline-offset-2 hover:underline'
            : 'cursor-default'
        } ${compact ? 'sr-only' : ''}`}
      >
        {view.label}
      </button>
      {popoverOpen && explainable ? (
        <div
          role="dialog"
          aria-label="Saved status"
          className="absolute bottom-full left-0 z-50 mb-2 w-80 rounded-[7px] border border-line bg-surface-1 p-3 text-[12px] text-secondary shadow-lg"
        >
          <p className="font-medium text-primary">{view.label}</p>
          <p className="mt-1 text-[11px] text-tertiary">{view.detail}</p>
          {writeStatus === 'failed' ? (
            <p className="mt-2 text-[11px] text-tertiary">
              The most recent change did not reach local storage. A retry or a backup download is
              the safest next step.
            </p>
          ) : declined && view.requestable ? (
            <div className="mt-2 text-[11px] leading-relaxed text-tertiary" data-storage-declined>
              <p>
                Your work is saved. The browser declined to <em>promise</em> to keep it if it runs
                short of space, and it decides that from its own rules, not from a request:
              </p>
              <ul className="mt-1 list-disc pl-4">
                <li>
                  Chrome and Edge protect a site once it is installed as an app or bookmarked.
                </li>
                <li>Firefox asks you directly; if you dismissed it, the answer stands.</li>
                <li>Safari protects sites you use regularly and never asks.</li>
              </ul>
              <p className="mt-1">
                {install?.available
                  ? 'Installing Kingfisher as an app is the surest way, and the browser has offered it.'
                  : 'Bookmark this page, or install Kingfisher from the browser menu, then click the indicator again.'}{' '}
                A downloaded backup is protected whatever the browser decides.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-tertiary">
              Backups are portable JSON. Streaming cache is excluded — it is reproducible, not work.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {declined && view.requestable && install?.available ? (
              <Button
                size="sm"
                variant="accent"
                onClick={async () => {
                  const outcome = await promptInstall();
                  if (outcome === 'accepted') {
                    setPopoverOpen(false);
                    setDeclined(false);
                    notify({
                      tone: 'success',
                      message:
                        'Kingfisher is installing. Click the indicator once it opens as an app.',
                    });
                  }
                }}
              >
                Install as an app
              </Button>
            ) : null}
            {declined && view.requestable ? (
              <Button
                size="sm"
                onClick={async () => {
                  const granted = await request();
                  if (granted === 'persistent') {
                    setPopoverOpen(false);
                    setDeclined(false);
                    notify({ tone: 'success', message: 'Storage protection granted.' });
                  } else {
                    notify({
                      tone: 'info',
                      message: 'The browser still declines. Your work is saved.',
                    });
                  }
                }}
              >
                Ask again
              </Button>
            ) : null}
            <Button
              size="sm"
              variant={declined && view.requestable ? 'subtle' : 'accent'}
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
