/**
 * Which positions in an analysed game are worth thinking about again.
 *
 * This is the one place in Kingfisher that comes closest to judging a move, so
 * it is also the place that most needs a rule about what it may say. The rule:
 * a suggestion is a *reason*, never a verdict. Every candidate carries the
 * facts that produced it — "engine evaluation changed from +0.40 to −1.10
 * after 24.Rd1" — and the vocabulary has no room for mistake, blunder or
 * brilliant. A player reading a reason can disagree with it; a player reading
 * a label can only accept it.
 *
 * Everything here is deterministic and derived from evidence already stored:
 * the same game and the same saved evaluations produce the same suggestions,
 * in the same order, on every machine. Nothing is inferred from a model.
 *
 * The measure is **expected result**, not centipawns. A drop from +0.2 to −0.1
 * is a different event from a drop from +6.0 to +5.7, and centipawns call them
 * the same size; the logistic curve in `winningChances` is the honest scale
 * for "how much did this change the game".
 */

import { formatScore, winningChances, type Score } from '@/chess/evaluation';
import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import type { ReviewCategory, ReviewSignal } from '@/persistence/domain';

/** One saved engine answer, reduced to what the suggester reads. */
export interface EvidencePoint {
  readonly nodeId: NodeId;
  readonly score: Score;
  /** The engine's own first choice at this position, when it was stored. */
  readonly bestMoveUci?: string;
  readonly depth?: number;
  /**
   * The first move of every line the engine offered here, best first,
   * including its first choice.
   *
   * Fewer than two — undefined, empty, or a single line — all mean the same
   * thing to the rule that reads this, and it declines to fire on all of them.
   * A single-line search makes every move but one "outside the candidates",
   * which is true and would put most of a game in the queue; an older record
   * has nothing to say either way. Neither is evidence that the engine
   * considered nothing.
   */
  readonly candidateUcis?: readonly string[];
}

export interface SuggestOptions {
  /**
   * How much a single move must change White's expected result before the
   * position before it becomes a candidate. 0.10 is ten percentage points of
   * expected score, which is roughly the difference between a balanced
   * position and one where a strong player would expect to be pressed.
   */
  readonly swingThreshold?: number;
  /** Never return more than this, newest game or not. */
  readonly limit?: number;
  /**
   * Whose decisions to suggest.
   *
   * A player reviewing their own game wants their own moves, and this is where
   * that can actually be honoured. It is deliberately *not* applied when
   * choosing which positions to analyse: judging a move needs the evaluation
   * before it and after it, and because a side moves at every other ply, the
   * union of "before and after each of White's moves" is every position in the
   * game. Narrowing the analysis therefore saves at most one position, whatever
   * the game's length — arithmetic, not an implementation detail.
   *
   * So the choice belongs here. The pass still evaluates the whole game,
   * because it must; the review only offers the decisions the player asked
   * about. A position the player marked critical is kept whoever was to move,
   * because that marker is their own and not a judgement about a side.
   */
  readonly sides?: 'both' | 'w' | 'b';
}

export interface ReviewCandidate {
  readonly nodeId: NodeId;
  readonly ply: number;
  readonly fen: string;
  readonly positionKey: string;
  readonly sideToMove: 'w' | 'b';
  /** The move actually played from this position, when there was one. */
  readonly playedSan?: string;
  readonly reason: string;
  readonly signals: readonly ReviewSignal[];
  readonly category?: ReviewCategory;
  /** Expected-result change caused by the move played, for ordering. */
  readonly magnitude: number;
}

export function suggestReviewCandidates(
  tree: GameTree,
  evidence: readonly EvidencePoint[],
  positionKeyOf: (fen: string) => string,
  options: SuggestOptions = {},
): readonly ReviewCandidate[] {
  const swingThreshold = options.swingThreshold ?? 0.1;
  const limit = options.limit ?? 12;
  const sides = options.sides ?? 'both';
  const byNode = new Map(evidence.map((point) => [point.nodeId, point]));
  const path = mainlinePath(tree);
  const candidates: ReviewCandidate[] = [];

  for (let index = 0; index < path.length; index += 1) {
    const nodeId = path[index] as NodeId;
    const node = tree.nodes[nodeId];
    if (!node) continue;
    const childId = path[index + 1];
    const child = childId ? tree.nodes[childId] : undefined;
    const signals: ReviewSignal[] = [];
    let magnitude = 0;
    let reason = '';

    // The player's own marker always qualifies, on its own, with no number.
    const marked = node.meta.critical;
    if (marked) {
      signals.push({ kind: 'critical-marker', detail: `You marked this position: ${marked}.` });
      reason = `You marked this position for review (${marked}).`;
    }

    const here = byNode.get(nodeId);
    const next = childId ? byNode.get(childId as NodeId) : undefined;
    const sideToMove = sideToMoveOf(node.fen);

    if (here && next && child?.move) {
      /*
        Signed so that a positive loss always means "worse for the player who
        just moved", whichever colour that was. Without the flip, every Black
        move that improved Black's position would look like a collapse.
      */
      const before = winningChances(here.score);
      const after = winningChances(next.score);
      const loss = sideToMove === 'w' ? before - after : after - before;
      if (loss >= swingThreshold) {
        magnitude = loss;
        const detail =
          `${formatScore(here.score, { alwaysSign: true })} → ` +
          `${formatScore(next.score, { alwaysSign: true })}`;
        signals.push({ kind: 'evaluation-swing', detail });
        reason =
          reason ||
          `Suggested because engine evaluation changed from ` +
            `${formatScore(here.score, { alwaysSign: true })} to ` +
            `${formatScore(next.score, { alwaysSign: true })} after ${moveLabel(child.ply, child.move.san)}.`;
      }

      /*
        A supporting signal only. On its own "the engine preferred something
        else" describes most moves in most games and would flood the queue;
        beside a measured change it says what the alternative was.
      */
      if (
        here.bestMoveUci &&
        here.bestMoveUci !== child.move.uci &&
        signals.some((signal) => signal.kind === 'evaluation-swing')
      ) {
        signals.push({
          kind: 'best-move-change',
          detail: `The engine's first choice here was ${here.bestMoveUci}, not ${child.move.uci}.`,
        });
      }

      /*
        The played move was not among the engine's candidates at all.

        This is a different event from a large swing and qualifies on its own,
        because it can happen without one: a move that keeps the evaluation and
        that a multi-line search never considered is exactly the position worth
        a second look. It fires only when several lines were actually recorded
        — with one line every move but one is "outside the candidates", which
        would be true and useless.

        The magnitude it contributes is the loss when there was one, so a
        position that is only this does not outrank a real collapse.
      */
      const engineCandidates = here.candidateUcis;
      if (
        engineCandidates &&
        engineCandidates.length > 1 &&
        !engineCandidates.includes(child.move.uci)
      ) {
        signals.push({
          kind: 'outside-candidates',
          detail:
            `${child.move.san} was not among the engine's ${engineCandidates.length} ` +
            `candidate moves here (${engineCandidates.join(', ')}).`,
        });
        reason =
          reason ||
          `Suggested because ${moveLabel(child.ply, child.move.san)} was not among the ` +
            `${engineCandidates.length} moves the engine considered here.`;
      }
    }

    if (signals.length === 0) continue;
    /*
      Whose decisions were asked for.

      Applied after the signals are computed rather than before, so that a
      position the player marked themselves survives the filter: that marker
      is their own judgement about what mattered, not a claim about a side,
      and dropping it because the other colour was to move would be this code
      overruling them.
    */
    if (sides !== 'both' && sideToMove !== sides && !marked) continue;
    candidates.push({
      nodeId,
      ply: node.ply,
      fen: node.fen,
      positionKey: positionKeyOf(node.fen),
      sideToMove,
      ...(child?.move ? { playedSan: child.move.san } : {}),
      reason,
      signals,
      ...(marked ? { category: marked } : {}),
      magnitude,
    });
  }

  /*
    Largest change first, and a hand-marked position ahead of a computed one at
    equal magnitude: the player's own judgement about what mattered outranks
    the suggester's.
  */
  return candidates
    .sort((a, b) => {
      const aMarked = a.signals.some((signal) => signal.kind === 'critical-marker') ? 1 : 0;
      const bMarked = b.signals.some((signal) => signal.kind === 'critical-marker') ? 1 : 0;
      return bMarked - aMarked || b.magnitude - a.magnitude || a.ply - b.ply;
    })
    .slice(0, limit);
}

/**
 * A repertoire deviation, as a review signal.
 *
 * Kept separate because it needs the repertoire rather than engine evidence,
 * and because the two are answers to different questions: one is "this went
 * badly", the other is "this left what I prepared".
 */
export function repertoireDeviationSignal(
  playedSan: string,
  preparedSan: readonly string[],
): ReviewSignal | null {
  if (preparedSan.length === 0 || preparedSan.includes(playedSan)) return null;
  return {
    kind: 'repertoire-deviation',
    detail: `Your repertoire says ${preparedSan.join(' or ')} here; ${playedSan} was played.`,
  };
}

/** A tablebase result that changed, which is the one signal that is a fact. */
export function tablebaseChangeSignal(before: string, after: string): ReviewSignal | null {
  if (before === after) return null;
  return {
    kind: 'tablebase-change',
    detail: `Tablebase result changed from ${before} to ${after}.`,
  };
}

const sideToMoveOf = (fen: string): 'w' | 'b' => (fen.split(/\s+/)[1] === 'b' ? 'b' : 'w');

/** "24.Rd1" or "24...Rd1", the way a player would write it. */
export const moveLabel = (ply: number, san: string): string => {
  const moveNumber = Math.ceil(ply / 2);
  return ply % 2 === 1 ? `${moveNumber}.${san}` : `${moveNumber}...${san}`;
};
