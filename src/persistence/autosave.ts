/**
 * When to write.
 *
 * Autosave has two competing obligations: never write on every keystroke or
 * engine tick, and never let a long editing session accumulate unsaved work.
 * A debounce alone fails the second — someone annotating steadily can keep
 * resetting the timer forever — so a maximum wait caps how long the first
 * unsaved change may sit. The decision is a pure function of timestamps so it
 * can be tested without a clock, a store or a database.
 */

export const AUTOSAVE_DEBOUNCE_MS = 900;
export const AUTOSAVE_MAX_WAIT_MS = 5_000;

export interface AutosaveInput {
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly now: number;
  /** When the most recent change landed. */
  readonly lastChangeAt: number;
  /** When the document first became dirty; null when it is clean. */
  readonly firstUnsavedAt: number | null;
  readonly debounceMs?: number;
  readonly maxWaitMs?: number;
}

/**
 * Milliseconds to wait before saving, or null when there is nothing to do.
 * Zero means "save now".
 */
export function autosaveDelay(input: AutosaveInput): number | null {
  if (!input.dirty || input.saving) return null;

  const debounceMs = input.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
  const maxWaitMs = input.maxWaitMs ?? AUTOSAVE_MAX_WAIT_MS;

  const sinceChange = Math.max(0, input.now - input.lastChangeAt);
  const debounced = Math.max(0, debounceMs - sinceChange);
  if (input.firstUnsavedAt === null) return debounced;

  const sinceFirstUnsaved = Math.max(0, input.now - input.firstUnsavedAt);
  const remainingBudget = Math.max(0, maxWaitMs - sinceFirstUnsaved);
  return Math.min(debounced, remainingBudget);
}
