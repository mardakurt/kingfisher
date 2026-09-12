/**
 * Whether a service that has just died should be started again.
 *
 * The shell revives its own web server and companion (`main.mjs`); this is
 * the rule it applies, kept apart from the shell so it can be tested with a
 * clock and no processes.
 *
 * Two things can end a service, and they must not share a budget:
 *
 * - **It crashed.** It exited on its own — a non-zero code, SIGSEGV, SIGBUS,
 *   SIGABRT — and if it does so within seconds of every start, restarting it
 *   for ever would only hide the reason. Three such restarts in five
 *   minutes, then it stays down and the log says why.
 * - **It was killed.** SIGKILL or SIGTERM never come from the process
 *   itself: a person, the operating system, a test. A healthy server killed
 *   four times in a minute is not in a crash loop, and Phase 47's packaged
 *   fault walk found the shell treating it as one — the fourth kill left
 *   the window on a dead origin. Kills are restarted every time, with their
 *   own, looser bound so that even a process that kills the server on sight
 *   cannot make the shell spin: ten in five minutes.
 *
 * An exit after a long healthy run resets the crash count: a service that
 * ran for an hour and then died is not looping.
 */

export const CRASH_LOOP_LIMIT = 3;
export const KILL_LIMIT = 10;
export const WINDOW_MS = 5 * 60_000;
/** An exit this soon after a start is a crash loop, not a healthy service that died. */
export const CRASH_LOOP_MS = 30_000;

const EXTERNAL_SIGNALS = new Set(['SIGKILL', 'SIGTERM', 'SIGINT', 'SIGHUP']);

/** Was this exit inflicted from outside the process? */
export function isExternalKill(exit) {
  return typeof exit?.signal === 'string' && EXTERNAL_SIGNALS.has(exit.signal);
}

export class RevivalBudget {
  #crashes = [];
  #kills = [];
  #startedAt = 0;

  /** Note a start, so the next exit can be timed against it. */
  started(now = Date.now()) {
    this.#startedAt = now;
  }

  /**
   * Decide about an exit. `{ restart, detail }` — `detail` is the sentence
   * for the log either way.
   */
  decide(exit, now = Date.now()) {
    const reason = exit?.signal ?? exit?.code ?? 'unknown';
    const ran = this.#startedAt ? Math.round((now - this.#startedAt) / 1000) : null;
    const within = (list) => list.filter((at) => now - at < WINDOW_MS);
    this.#crashes = within(this.#crashes);
    this.#kills = within(this.#kills);

    if (isExternalKill(exit)) {
      if (this.#kills.length >= KILL_LIMIT) {
        return {
          restart: false,
          detail: `exited (${reason}) and was not restarted: killed ${KILL_LIMIT} times in five minutes`,
        };
      }
      this.#kills.push(now);
      return { restart: true, detail: `exited unexpectedly (${reason}); restarting` };
    }

    const crashLoop = this.#startedAt !== 0 && now - this.#startedAt < CRASH_LOOP_MS;
    if (crashLoop && this.#crashes.length >= CRASH_LOOP_LIMIT) {
      return {
        restart: false,
        detail: `exited (${reason}) ${ran} s after starting and was not restarted: ${CRASH_LOOP_LIMIT} crash-loop restarts in five minutes`,
      };
    }
    if (crashLoop) this.#crashes.push(now);
    else this.#crashes = [];
    return { restart: true, detail: `exited unexpectedly (${reason}); restarting` };
  }
}
