/**
 * The pure state machine that decides what the workspace status
 * indicator should display.
 *
 * Two signals are composed:
 *
 *  1. The storage-persistence probe — does the runtime promise to
 *     keep the IndexedDB origin alive under pressure?
 *  2. The write tracker — is anything the user has just typed still
 *     on its way to disk, or has a write rejected since the last
 *     success?
 *
 * The brief (PART P-Q) says the visible state must be honest:
 * "Saving…" while a write is open, "Save failed" if a write has
 * rejected, and the storage-persistence label otherwise. The
 * React hook in `use-write-tracker.ts` is a thin shell around
 * this pure reducer; the test file imports it directly so we can
 * pin the contract without React.
 */

export type SavedStatePersistence = 'pending' | 'persistent' | 'not-persistent' | 'unavailable';
export type SavedStateWrite = 'saved' | 'saving' | 'failed';

export type SavedStateTone =
  'text-tertiary' | 'text-positive' | 'text-warning' | 'text-caution' | 'text-negative';

export interface SavedStateView {
  readonly label: string;
  readonly detail: string;
  readonly tone: SavedStateTone;
  readonly dotClass: 'bg-tertiary' | 'bg-positive' | 'bg-warning' | 'bg-caution' | 'bg-negative';
  readonly requestable: boolean;
  /** The popover offers a "Download backup" path when true. */
  readonly openable: boolean;
}

const isDesktopRuntime = (): boolean =>
  typeof navigator !== 'undefined' && /Kingfisher|Electron/i.test(navigator.userAgent);

export interface PersistCopy {
  readonly label: string;
  readonly detail: string;
}

const PERSIST_COPY: Record<SavedStatePersistence, PersistCopy> = {
  pending: {
    label: 'Storage status…',
    detail: 'Checking how this runtime stores your work.',
  },
  persistent: {
    label: isDesktopRuntime() ? 'Saved on this Mac' : 'Saved on this device',
    detail: isDesktopRuntime()
      ? 'Your work is kept on this Mac, even if the application is under pressure.'
      : 'Your work is kept here, even if the browser is under pressure.',
  },
  'not-persistent': {
    label: 'Storage is not protected',
    detail: 'Click to ask the runtime to keep your work even under pressure.',
  },
  unavailable: {
    label: 'Storage protection unavailable',
    detail: isDesktopRuntime()
      ? 'This runtime does not expose durable storage, so the OS may evict your work.'
      : 'This runtime does not expose durable storage, so the browser may evict your work.',
  },
};

export function composeSavedState(
  persistence: SavedStatePersistence,
  write: SavedStateWrite,
  failureLabel: string | null,
): SavedStateView {
  if (write === 'saving') {
    return {
      label: 'Saving…',
      detail: 'Your last change is being written to local storage.',
      tone: 'text-tertiary',
      dotClass: 'bg-tertiary',
      requestable: false,
      openable: false,
    };
  }
  if (write === 'failed') {
    return {
      label: 'Save failed',
      detail: failureLabel
        ? `Kingfisher could not save "${failureLabel}". Try again, or download a backup of your work.`
        : 'Kingfisher could not save this change locally. Try again, or download a backup of your work.',
      tone: 'text-negative',
      dotClass: 'bg-negative',
      requestable: false,
      openable: true,
    };
  }
  const copy = PERSIST_COPY[persistence];
  const tone: SavedStateTone =
    persistence === 'persistent'
      ? 'text-positive'
      : persistence === 'not-persistent'
        ? 'text-warning'
        : persistence === 'unavailable'
          ? 'text-caution'
          : 'text-tertiary';
  const dotClass: SavedStateView['dotClass'] =
    persistence === 'persistent'
      ? 'bg-positive'
      : persistence === 'not-persistent'
        ? 'bg-warning'
        : persistence === 'unavailable'
          ? 'bg-caution'
          : 'bg-tertiary';
  return {
    label: copy.label,
    detail: copy.detail,
    tone,
    dotClass,
    requestable: persistence === 'not-persistent',
    openable: persistence === 'persistent',
  };
}
