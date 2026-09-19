/**
 * Is this a fresh launch, or the same session coming back?
 *
 * The draft — what was on the board — is written so that a refresh, a crash
 * or a closed laptop does not lose work that was never filed. Restoring it
 * on *every* start went further than that: a person who opened Kingfisher
 * on Monday found Sunday's half-played line on the board, and the Mac
 * application, whose every launch is a new window, never once opened on the
 * initial position. The owner's rule (Phase 72): opening the application is
 * opening a chessboard. The draft stays stored and Recent offers it as
 * "Continue …"; it comes back to the board on request, and automatically
 * only within the session it belongs to.
 *
 * "The same session" is what `sessionStorage` is for: it survives a reload
 * and an in-app navigation of the same tab, and is empty in a new tab, a new
 * window and every launch of the desktop shell. A browser that restores its
 * tabs restores their `sessionStorage` too, which is the right call — a
 * restored tab is the session it was.
 */

export const SESSION_KEY = 'kingfisher.session';
/**
 * Set when a launch decided to hold the stored draft rather than restore it.
 * The decision belongs to the session, not to the page load that made it: a
 * person who lands on `/recent`, does not press Continue and then opens
 * `/analysis` must still get a chessboard. Cleared when they do press
 * Continue, and irrelevant once they have played something (the draft is
 * then theirs again).
 */
export const HELD_KEY = 'kingfisher.session.held';

export interface SessionStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Marks the session as started and reports whether it was already: `true`
 * for a fresh launch, `false` for a reload of a running session. Without a
 * usable store every start is a fresh launch — the safer of the two answers,
 * since it shows a chessboard rather than someone else's position.
 */
export function beginSession(store: SessionStore | null, now: Date = new Date()): boolean {
  try {
    if (!store) return true;
    const fresh = store.getItem(SESSION_KEY) === null;
    if (fresh) store.setItem(SESSION_KEY, now.toISOString());
    return fresh;
  } catch {
    return true;
  }
}

/** Whether the draft should stay off the board: a fresh launch, or a session that already decided to hold it. */
export function shouldHoldDraft(store: SessionStore | null, freshLaunch: boolean): boolean {
  if (freshLaunch) {
    markDraftHeld(store);
    return true;
  }
  try {
    return store?.getItem(HELD_KEY) === '1';
  } catch {
    return false;
  }
}

export function markDraftHeld(store: SessionStore | null): void {
  try {
    store?.setItem(HELD_KEY, '1');
  } catch {
    /* Without storage the rule falls back to per-load, which still shows a board. */
  }
}

/** The person asked for their work back: this session restores it from now on. */
export function releaseHeldDraft(store: SessionStore | null): void {
  try {
    store?.removeItem(HELD_KEY);
  } catch {
    /* Nothing to release. */
  }
}
