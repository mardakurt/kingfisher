/**
 * Input limits for the universal search box.
 *
 * Search is untrusted input. The brief asks for a hard cap, not a polite
 * truncation: a 20 MB paste into a search box should not OOM the providers
 * and should land on a clear error pointing at the PGN importer. This is
 * the single place every entry point consults, so a change here is
 * consistent across the palette, the position search and the move parser.
 */

/** A search query that fits in this many characters is small enough to score locally. */
export const QUERY_MAX_LENGTH = 240;

/** Past this point, we tell the user to use the PGN importer rather than search. */
export const PGN_HINT_THRESHOLD = 4_000;

/** Hard ceiling regardless of hint. Anything past this is rejected outright. */
export const QUERY_HARD_CEILING = 32_000;

export interface QueryAssessment {
  /** True when the query is small enough to be considered for search. */
  readonly ok: boolean;
  /** True when the query looks like it was meant for the PGN importer. */
  readonly suggestPgn: boolean;
  /** A user-facing message when the query is rejected. */
  readonly reason?: string;
}

export function assessQuery(raw: string): QueryAssessment {
  const length = raw.length;
  if (length === 0) return { ok: true, suggestPgn: false };
  if (length > QUERY_HARD_CEILING) {
    return {
      ok: false,
      suggestPgn: true,
      reason: `Search input is ${length.toLocaleString()} characters. Use the PGN importer for long games.`,
    };
  }
  if (length > QUERY_MAX_LENGTH) {
    return {
      ok: false,
      suggestPgn: length > PGN_HINT_THRESHOLD,
      reason:
        length > PGN_HINT_THRESHOLD
          ? `That looks like a full PGN. Use the PGN importer instead.`
          : `Search input is too long (${length.toLocaleString()} characters).`,
    };
  }
  return { ok: true, suggestPgn: false };
}
