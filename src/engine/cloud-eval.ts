/**
 * Lichess cloud evaluation: stored analysis of a position, labelled as such.
 *
 * Lichess keeps the deepest analysis anybody's browser has contributed for
 * tens of millions of positions and answers `GET /api/cloud-eval` without an
 * account. For a player on a weak machine it is depth 40–60 in a moment; for
 * everyone it is a second opinion that did not come from their own engine.
 * It is what ChessBase sells as "Let's Check" and the Engine Cloud, and it
 * costs nothing — but it is not a search Kingfisher ran, and it must never be
 * read as one:
 *
 * - it is *stored*: somebody else's search, of unknown age, at the depth and
 *   node count Lichess reports, which is shown with it;
 * - it is *asked for*: a position is sent to lichess.org only while the
 *   player has the cloud section open, and the privacy page says so;
 * - it is *kept apart*: nothing here writes to the tree, the evaluation bar,
 *   the arrows or the review — `src/engine/cloud-eval.test.ts` and the engine
 *   panel's own test hold that line.
 *
 * Scores are from White's point of view, as Lichess reports them and as
 * Kingfisher stores every score.
 */

import { Position } from '@/chess/position';
import { parseUci } from '@/chess/moves';
import type { Score } from '@/chess/evaluation';
import type { Fen, San } from '@/chess/types';

export const CLOUD_EVAL_ENDPOINT = 'https://lichess.org/api/cloud-eval';

export interface CloudLine {
  readonly score: Score;
  /** The principal variation in SAN, as far as it is legal from the position. */
  readonly san: readonly San[];
  readonly uci: readonly string[];
}

export interface CloudEvaluation {
  readonly source: 'lichess-cloud';
  readonly fen: Fen;
  readonly depth: number;
  /** Thousands of nodes the stored search examined. */
  readonly knodes: number;
  readonly lines: readonly CloudLine[];
}

export type CloudAnswer =
  | { readonly status: 'found'; readonly evaluation: CloudEvaluation }
  /** Lichess has no stored analysis of this position. */
  | { readonly status: 'absent' }
  /** Lichess asked us to slow down; the answer is "try later", not "none". */
  | { readonly status: 'rate-limited' }
  | { readonly status: 'failed'; readonly message: string };

interface RawPv {
  readonly moves?: string;
  readonly cp?: number;
  readonly mate?: number;
}

export async function fetchCloudEvaluation(
  fen: Fen,
  options: {
    readonly multiPv?: number;
    readonly fetch?: typeof fetch;
    readonly signal?: AbortSignal;
  } = {},
): Promise<CloudAnswer> {
  const request = options.fetch ?? fetch;
  const url = `${CLOUD_EVAL_ENDPOINT}?fen=${encodeURIComponent(fen)}&multiPv=${options.multiPv ?? 3}`;
  let response: Response;
  try {
    response = await request(url, {
      headers: { Accept: 'application/json' },
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') throw error;
    return { status: 'failed', message: 'lichess.org could not be reached.' };
  }
  if (response.status === 404) return { status: 'absent' };
  if (response.status === 429) return { status: 'rate-limited' };
  if (!response.ok)
    return { status: 'failed', message: `lichess.org answered ${response.status}.` };

  let body: { depth?: number; knodes?: number; pvs?: readonly RawPv[] };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    return { status: 'failed', message: 'lichess.org sent something that is not an evaluation.' };
  }
  const lines = (body.pvs ?? [])
    .map((pv) => lineFrom(fen, pv))
    .filter((line): line is CloudLine => line !== null);
  if (lines.length === 0 || typeof body.depth !== 'number') return { status: 'absent' };
  return {
    status: 'found',
    evaluation: {
      source: 'lichess-cloud',
      fen,
      depth: body.depth,
      knodes: typeof body.knodes === 'number' ? body.knodes : 0,
      lines,
    },
  };
}

/**
 * Lichess writes castling in some answers as the king taking its own rook
 * (`e1h1`), the Chess960 convention. Tried only when the move as written is
 * not legal, so a real king move to h1 is never reinterpreted.
 */
const CASTLING_ALIAS: Readonly<Record<string, string>> = {
  e1h1: 'e1g1',
  e1a1: 'e1c1',
  e8h8: 'e8g8',
  e8a8: 'e8c8',
};

function playUci(position: Position, text: string | undefined) {
  if (!text) return null;
  const intent = parseUci(text);
  if (!intent.ok) return null;
  const played = position.play(intent.value);
  return played.ok ? played.value : null;
}

/**
 * One stored line, replayed through Kingfisher's own rules: a move the rules
 * refuse ends the line there rather than being displayed on trust.
 */
function lineFrom(fen: Fen, pv: RawPv): CloudLine | null {
  const score: Score | null =
    typeof pv.mate === 'number'
      ? { kind: 'mate', moves: pv.mate }
      : typeof pv.cp === 'number'
        ? { kind: 'cp', cp: pv.cp }
        : null;
  if (!score) return null;
  const start = Position.fromFen(fen);
  if (!start.ok) return null;
  let position = start.value;
  const san: San[] = [];
  const uci: string[] = [];
  for (const text of (pv.moves ?? '').split(' ').filter(Boolean)) {
    const played = playUci(position, text) ?? playUci(position, CASTLING_ALIAS[text]);
    if (!played) break;
    san.push(played.san);
    uci.push(played.uci);
    position = Position.fromTrustedFen(played.after);
  }
  return { score, san, uci };
}
