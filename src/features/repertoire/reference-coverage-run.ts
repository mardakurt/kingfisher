/**
 * Whether a reference-coverage run is finished.
 *
 * A rejected explore used to be swallowed by the bounded runner and never
 * counted, so `pending` stayed true and the gap list was only the successes.
 * A failure is a finished position: the run ends, and the position is named.
 */

export type CoverageAttempt<T> =
  | { readonly index: number; readonly ok: true; readonly report: T | null }
  | { readonly index: number; readonly ok: false; readonly position: string };

export interface CoverageRunState<T> {
  /** False once every position has settled, or the runner itself has ended. */
  readonly pending: boolean;
  /** Successes and failures. An empty explore result counts; it was read. */
  readonly completed: number;
  readonly successes: readonly T[];
  /** Positions whose explore rejected, in repertoire order. */
  readonly unread: readonly string[];
}

export function coverageRunState<T>(input: {
  readonly total: number;
  readonly attempts: readonly CoverageAttempt<T>[];
  /** True when the bounded run has settled, including rejected explores. */
  readonly runEnded: boolean;
}): CoverageRunState<T> {
  const attempts = [...input.attempts].sort((a, b) => a.index - b.index);
  const successes: T[] = [];
  const unread: string[] = [];
  for (const attempt of attempts) {
    if (attempt.ok) {
      if (attempt.report !== null) successes.push(attempt.report);
    } else {
      unread.push(attempt.position);
    }
  }
  const completed = attempts.length;
  return {
    pending: input.runEnded ? false : completed < input.total,
    completed,
    successes,
    unread,
  };
}
