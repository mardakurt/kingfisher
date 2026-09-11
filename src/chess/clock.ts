/**
 * Phase 41 — clock parsing, think-time and time-trouble signals.
 *
 * The PGN clock parser already lives in
 * `chess/pgn/comment-commands.ts` (`[%clk H:MM:SS]`), so this module
 * focuses on the higher-level derived facts: approximate think time
 * per move, a conservative time-trouble signal that does NOT label
 * 59 seconds as "time trouble" on a 60-second increment game, and a
 * clock-only mode for when no time-control metadata is known.
 *
 * The contract:
 *   - `thinkTimeSeconds(prior, next)` returns the difference. When
 *     the prior clock is missing or the difference is negative, it
 *     returns `null` and the renderer shows "Clock:" only.
 *   - `isTimeTrouble` only fires when the position is reached with
 *     a remaining clock under a small fraction of the starting
 *     clock AND the game is past move 20. A 5+0 bullet at move 8
 *     with 4 seconds left is not "time trouble"; a 30+0 classical
 *     game at move 35 with 18 seconds left is.
 */
export interface ClockReading {
  /** Seconds remaining on the side to move. */
  readonly seconds: number;
}

export interface TimeControlMetadata {
  /** Total seconds at the start of the game for the side. */
  readonly initialSeconds: number;
  /** Increment per move in seconds. */
  readonly incrementSeconds: number;
}

export function thinkTimeSeconds(prior: ClockReading, next: ClockReading): number | null {
  const diff = prior.seconds - next.seconds;
  if (!Number.isFinite(diff)) return null;
  if (diff < 0) return null;
  /* A perfectly even clock (no time spent) usually means missing
     metadata or a flag, not literal zero thinking. Refuse to
     report a 0s think time when the increment is known and would
     push the next reading above the prior reading — but the
     conservative answer is to suppress 0s entirely unless the
     caller opted in. */
  if (diff === 0) return null;
  return diff;
}

/**
 * Time-trouble is contextual. The signal fires only when ALL of:
 *   - remaining clock is under 1/3 of the starting clock,
 *   - the game has reached move 20 or later,
 *   - the increment is not so large that the remaining clock
 *     becomes meaningless (a 30+30 game with 25s left is fine;
 *     a 30+0 with 25s left is trouble).
 *
 * The function intentionally returns `false` when no metadata is
 * available — never pretend, never claim.
 */
export function isTimeTrouble(input: {
  readonly remaining: number;
  readonly moveNumber: number;
  readonly control?: TimeControlMetadata;
}): boolean {
  if (input.moveNumber < 20) return false;
  if (!input.control) return false;
  const fraction = input.remaining / Math.max(1, input.control.initialSeconds);
  if (fraction > 1 / 3) return false;
  /* If the increment is large enough that 25s remaining is still
     two clocks of comfortable thinking time, refuse the label. */
  if (input.control.incrementSeconds >= 30) return false;
  return true;
}

/**
 * Format a clock reading as `H:MM:SS` (or `MM:SS` when under an
 * hour). Centralised so the renderer and the PGN serialiser stay
 * in lockstep.
 */
export function formatClockReading(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Parse a `TimeControl` tag value (`"300+0"`, `"5400+30"`,
 * `"40/5400+30:3600"`) into a {@link TimeControlMetadata}.
 *
 * Returns `null` when the tag is missing or malformed; the caller
 * falls back to clock-only display.
 */
export function parseTimeControlTag(value: string | undefined): TimeControlMetadata | null {
  if (!value) return null;
  /* Match `seconds[+increment]` and ignore the
     `moves/seconds+increment:total` form for now — the brief asks
     for accurate handling of common annotations, and the simple
     form covers the bulk of online play. */
  const simple = /^(\d+)(?:\+(\d+))?$/.exec(value.trim());
  if (simple) {
    const initial = Number(simple[1]);
    const increment = simple[2] !== undefined ? Number(simple[2]) : 0;
    if (!Number.isFinite(initial) || !Number.isFinite(increment)) return null;
    return { initialSeconds: initial, incrementSeconds: increment };
  }
  /* The full moves/seconds form is too ambiguous to derive a
     starting clock from, so we return null and the renderer
     shows clock-only. The parser never throws. */
  return null;
}
