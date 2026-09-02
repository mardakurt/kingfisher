'use client';

/**
 * Telling the other tabs what just landed.
 *
 * Two Kingfisher tabs on one chapter is an ordinary thing to do — a study open
 * beside the game it came from — and IndexedDB will happily let both of them
 * write. The revision check in `saveChapter` is what makes the second write
 * fail instead of silently winning; this channel is what stops the loser
 * finding out minutes later, by which time it has more unsaved work to lose.
 *
 * Deliberately an announcement, not a protocol. No leader election, no shared
 * state, no merging: a tab says "chapter X is now at revision N" and any tab
 * holding an older copy decides for itself what to do about it. A message that
 * never arrives costs nothing, because the revision check still refuses the
 * stale write — this only makes the refusal earlier and kinder.
 */

import type { ChapterId } from './types';

export interface ChapterSavedMessage {
  readonly kind: 'chapter-saved';
  readonly chapterId: ChapterId;
  readonly revision: number;
  /** So a tab ignores the echo of its own write. */
  readonly origin: string;
}

export type CrossTabMessage = ChapterSavedMessage;

const CHANNEL_NAME = 'kingfisher.documents';

/** Identifies this tab for the life of the page. */
export const TAB_ID: string =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}`;

let channel: BroadcastChannel | null = null;
let unavailable = false;

/**
 * `BroadcastChannel` is not universal, and the fallback is to do nothing
 * rather than to reimplement it over `storage` events: without it the app is
 * exactly as safe, just less immediate, and a half-working second mechanism is
 * more code to be wrong in.
 */
function open(): BroadcastChannel | null {
  if (unavailable) return null;
  if (channel) return channel;
  if (typeof BroadcastChannel === 'undefined') {
    unavailable = true;
    return null;
  }
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    return channel;
  } catch {
    unavailable = true;
    return null;
  }
}

export function announceChapterSaved(chapterId: ChapterId, revision: number): void {
  const message: ChapterSavedMessage = {
    kind: 'chapter-saved',
    chapterId,
    revision,
    origin: TAB_ID,
  };
  try {
    open()?.postMessage(message);
  } catch {
    // A failed announcement is not a failed save. The revision check is the
    // guarantee; this is only the courtesy.
  }
}

/** Subscribe to writes made by *other* tabs. Returns an unsubscribe function. */
export function subscribeCrossTab(listener: (message: CrossTabMessage) => void): () => void {
  const target = open();
  if (!target) return () => {};
  const handle = (event: MessageEvent<unknown>) => {
    const message = event.data;
    if (!isChapterSaved(message) || message.origin === TAB_ID) return;
    listener(message);
  };
  target.addEventListener('message', handle);
  return () => target.removeEventListener('message', handle);
}

function isChapterSaved(value: unknown): value is ChapterSavedMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    message.kind === 'chapter-saved' &&
    typeof message.chapterId === 'string' &&
    typeof message.origin === 'string' &&
    typeof message.revision === 'number' &&
    Number.isFinite(message.revision)
  );
}
