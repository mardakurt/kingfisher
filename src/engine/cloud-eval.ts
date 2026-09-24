/**
 * The Lichess cloud evaluation of a position, as a stored result.
 *
 * Lichess keeps the deepest evaluation anybody's browser has computed for
 * roughly 320 million positions — most of them from openings — and serves it
 * without an account (`GET /api/cloud-eval`). For a player on a laptop, or on
 * a phone where the browser Stockfish reaches depth 18 in the time a desktop
 * reaches 30, it is depth they cannot produce themselves. ChessBase's answer
 * to the same need is a rented cloud engine behind a subscription; this is a
 * free lookup, and it is only that.
 *
 * So it is kept apart from everything the engine on this machine says:
 *
 * - it is a **stored** result, not a search — its depth and node count are
 *   the ones Lichess recorded, and nothing here runs;
 * - it is **never** written into the engine's lines, the evaluation bar or
 *   a saved evaluation, and it carries its own name wherever it appears;
 * - most positions have none, and "no stored evaluation" is an answer, not
 *   an error;
 * - asking sends the position to Lichess, so nothing is asked until the
 *   person turns it on (`engineCloudEval`, off by default).
 *
 * The response's `cp` and `mate` are from White's point of view, which is the
 * convention `Score` already uses; they pass through unchanged.
 */

import { cp, mate, type Score } from '@/chess/evaluation';
import type { Fen, Uci } from '@/chess/types';

export const CLOUD_EVAL_ENDPOINT = 'https://lichess.org/api/cloud-eval';

/** Lichess stores at most five lines per position. */
export const CLOUD_EVAL_MAX_LINES = 5;

export interface CloudLine {
  readonly moves: readonly Uci[];
  /** From White's point of view. */
  readonly score: Score;
}

export type CloudEval =
  | {
      readonly kind: 'found';
      readonly fen: Fen;
      readonly depth: number;
      /** Thousands of nodes, as Lichess reports them. */
      readonly knodes: number;
      readonly lines: readonly CloudLine[];
    }
  /** Lichess holds no stored evaluation for this position. */
  | { readonly kind: 'none'; readonly fen: Fen }
  | { readonly kind: 'rate-limited'; readonly fen: Fen; readonly retryAfterMs?: number }
  | { readonly kind: 'unavailable'; readonly fen: Fen; readonly message: string };

interface RawPv {
  readonly moves?: unknown;
  readonly cp?: unknown;
  readonly mate?: unknown;
}

function parseLine(raw: RawPv): CloudLine | null {
  if (typeof raw.moves !== 'string' || raw.moves.trim() === '') return null;
  const moves = raw.moves.trim().split(/\s+/) as Uci[];
  if (typeof raw.mate === 'number' && Number.isFinite(raw.mate)) {
    return { moves, score: mate(raw.mate) };
  }
  if (typeof raw.cp === 'number' && Number.isFinite(raw.cp)) return { moves, score: cp(raw.cp) };
  return null;
}

/**
 * Read a cloud-eval response. Anything that is not the documented shape is
 * `unavailable` with a reason, never a guess.
 */
export function parseCloudEval(fen: Fen, payload: unknown): CloudEval {
  if (!payload || typeof payload !== 'object') {
    return { kind: 'unavailable', fen, message: 'Lichess answered with something unreadable.' };
  }
  const body = payload as { depth?: unknown; knodes?: unknown; pvs?: unknown };
  const lines = Array.isArray(body.pvs)
    ? body.pvs
        .map((pv) => parseLine(pv as RawPv))
        .filter((line): line is CloudLine => line !== null)
    : [];
  if (typeof body.depth !== 'number' || lines.length === 0) {
    return { kind: 'unavailable', fen, message: 'Lichess answered without an evaluation.' };
  }
  return {
    kind: 'found',
    fen,
    depth: body.depth,
    knodes: typeof body.knodes === 'number' ? body.knodes : 0,
    lines,
  };
}

export async function fetchCloudEval(
  fen: Fen,
  lines: number,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<CloudEval> {
  const url = new URL(CLOUD_EVAL_ENDPOINT);
  url.searchParams.set('fen', fen);
  url.searchParams.set('multiPv', String(Math.max(1, Math.min(CLOUD_EVAL_MAX_LINES, lines))));
  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      headers: { Accept: 'application/json' },
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    return { kind: 'unavailable', fen, message: 'Lichess could not be reached.' };
  }
  if (response.status === 404) return { kind: 'none', fen };
  if (response.status === 429) {
    const seconds = Number(response.headers.get('Retry-After'));
    return {
      kind: 'rate-limited',
      fen,
      ...(Number.isFinite(seconds) && seconds > 0 ? { retryAfterMs: seconds * 1000 } : {}),
    };
  }
  if (!response.ok) {
    return { kind: 'unavailable', fen, message: `Lichess answered ${response.status}.` };
  }
  try {
    return parseCloudEval(fen, await response.json());
  } catch {
    return { kind: 'unavailable', fen, message: 'Lichess answered with something unreadable.' };
  }
}
