/**
 * Generate a training set from a coverage report.
 *
 * The bridge the brief asks for: data → repertoire gap → training. Reference
 * data tells us what to train. The user's repertoire tells us *which*
 * positions to train. The user's repertoire move, not the reference move,
 * is the correct response. Reuse the existing Training scheduler rather
 * than introducing a new one.
 *
 * The function is intentionally narrow: it does not decide whether to train,
 * does not rank prompts by some opaque score, does not invent evaluation
 * bands. Each gap becomes one position-keyed prompt; transpositions collapse
 * to one prompt (the same canonical position has one TrainingItemRecord);
 * the source is named in the prompt so the player can see where the gap came
 * from.
 */

import type { CoverageReport } from '@/repertoire/coverage';
import { positionKey } from '@/chess/fen';
import type { Fen } from '@/chess/types';
import type { TrainingItemRecord, TrainingMode } from '@/persistence/domain';

/**
 * The shape the training item generator needs from each gap.
 *
 * The full coverage report carries the source's own Uci for the reply the
 * repertoire has not filed. That uci is *not* the answer to the prompt: it
 * is the move the prompt asks the player to respond to. The answer the
 * player supplies when they create the item is what goes into `solutionUci`.
 * The generator leaves that empty so the caller can decide what to teach.
 */
export interface GapMove {
  readonly uci: string;
  readonly san: string;
  readonly games: number;
  readonly share: number;
}

export interface TrainingSetPrompt {
  /** Canonical key the prompt is keyed on. */
  readonly positionKey: string;
  /** A representative FEN for the position. */
  readonly fen: Fen;
  /** The side to move here. */
  readonly sideToMove: 'w' | 'b';
  /** The most played move the repertoire has not decided here. */
  readonly opponentMove: GapMove;
  /**
   * Every move the repertoire has not decided here, most played first.
   *
   * A position is one prompt however many replies it has; a card that named
   * only the first reply hid the other two the source reported at the same
   * position, and the player who answered d4 was not told Nf3 and c4 were
   * gaps too.
   */
  readonly opponentMoves: readonly GapMove[];
  /**
   * Source the prompt was derived from. Surfaced so the player can see which
   * population the gap came from.
   */
  readonly source: {
    readonly id: string;
    readonly name: string;
  };
}

/**
 * The default prompt wording. The data tells us the move the opponent played
 * and the population they played it in; the rest of the prompt is left to
 * the caller, because the wording depends on whether the user is preparing
 * for a tournament or revising after a session.
 */
export function defaultPrompt(prompt: TrainingSetPrompt): string {
  const describe = (move: GapMove) =>
    `${move.san} (${move.games.toLocaleString()} games, ${move.share ? `${(move.share * 100).toFixed(1)}%` : '—'})`;
  const moves = prompt.opponentMoves.length > 0 ? prompt.opponentMoves : [prompt.opponentMove];
  if (moves.length === 1) {
    return `Find your response to ${describe(moves[0]!)} in ${prompt.source.name}.`;
  }
  const list = moves.map(describe);
  return `Find your responses to ${list.slice(0, -1).join(', ')} and ${list.at(-1)} in ${prompt.source.name}.`;
}

/**
 * Build the training prompts for one coverage report.
 *
 * Empty gaps means the repertoire has decided every reply in the source — no
 * training prompts are generated. A position can produce one prompt even if
 * the source reports many moves; the player's response to the position is
 * the question, and one question per position is the right shape.
 */
export function buildTrainingPrompts(
  reports: readonly CoverageReport[],
  sourceName: string,
): readonly TrainingSetPrompt[] {
  /*
    One prompt per canonical position, carrying every gap reported there.
    Two move orders that reach the same position are one prompt (the first
    report's source names it), and a position with three undecided replies
    is one card that names all three rather than three cards or one that
    names the first.
  */
  const byPosition = new Map<string, { prompt: TrainingSetPrompt; moves: GapMove[] }>();
  for (const report of reports) {
    if (report.gaps.length === 0) continue;
    const canonical = positionKeyForTraining(report.positionKey);
    const moves = report.gaps.map((gap) => ({
      uci: gap.uci,
      san: gap.san,
      games: gap.games,
      share: gap.share,
    }));
    const held = byPosition.get(canonical);
    if (held) {
      for (const move of moves) {
        if (!held.moves.some((known) => known.uci === move.uci)) held.moves.push(move);
      }
      continue;
    }
    byPosition.set(canonical, {
      moves,
      prompt: {
        positionKey: canonical,
        fen: fenForKey(canonical),
        sideToMove: sideToMoveOf(canonical),
        opponentMove: moves[0]!,
        opponentMoves: [],
        source: { id: report.sourceId, name: report.sourceName || sourceName },
      },
    });
  }
  return [...byPosition.values()].map(({ prompt, moves }) => {
    const ordered = [...moves].sort((a, b) => b.games - a.games);
    return { ...prompt, opponentMove: ordered[0]!, opponentMoves: ordered };
  });
}

/**
 * A full FEN for a canonical key: the four identity fields plus the
 * counters a FEN needs. The key has no counters by design (ADR 0009); a
 * training item stores a position, which does.
 */
function fenForKey(key: string): Fen {
  const fields = key.trim().split(/\s+/);
  return (fields.length >= 6 ? fields.join(' ') : `${fields.slice(0, 4).join(' ')} 0 1`) as Fen;
}

/** Whose move it is at a key — the second field, never assumed. */
function sideToMoveOf(key: string): 'w' | 'b' {
  return key.split(/\s+/)[1] === 'b' ? 'b' : 'w';
}

/** Canonical key used to dedupe transposed prompts. */
export function positionKeyForTraining(fen: string): string {
  return positionKey(fen as Fen);
}

/**
 * The shape the caller needs to feed a prompt into the existing Training
 * scheduler. A generator returns this; the caller (typically a button on
 * the coverage panel) creates TrainingItemRecords through the existing
 * `repositories.training.create(...)` path.
 */
export interface DraftTrainingItem {
  readonly prompt: string;
  readonly mode: TrainingMode;
  readonly positionKey: string;
  readonly fen: Fen;
  readonly sideToMove: 'w' | 'b';
  readonly tags: readonly string[];
  readonly explanation: string;
}

/**
 * Reduce a training prompt to the shape the existing Training scheduler
 * needs. The solution is empty, because the player still has to choose
 * what to play — the reference data tells us what to train, the user's
 * repertoire move is the answer.
 */
export function draftTrainingItem(prompt: TrainingSetPrompt): DraftTrainingItem {
  return {
    prompt: defaultPrompt(prompt),
    mode: 'repertoire-recall',
    positionKey: prompt.positionKey,
    fen: prompt.fen,
    sideToMove: prompt.sideToMove,
    tags: [
      `source:${prompt.source.id}`,
      'data-generated',
      ...(prompt.opponentMoves.length > 0 ? prompt.opponentMoves : [prompt.opponentMove]).map(
        (move) => `opponent:${move.uci}`,
      ),
    ],
    explanation: `Generated from ${prompt.source.name} (${prompt.opponentMove.games} games for the most played reply). The repertoire does not currently have a decision for this position.`,
  };
}

/**
 * Build a list of TrainingItemRecord-shaped drafts from a coverage report.
 *
 * The drafts can be passed to `repositories.training.create(...)` in the
 * usual way. We do not write to the store here: the caller decides whether
 * to create them, and the training scheduler's existing transactional
 * semantics stay in charge of how a set is committed.
 */
export function draftTrainingSet(
  reports: readonly CoverageReport[],
  sourceName: string,
): readonly DraftTrainingItem[] {
  return buildTrainingPrompts(reports, sourceName).map(draftTrainingItem);
}

/**
 * Re-export for callers that want to persist the items in one batch.
 */
export type { TrainingItemRecord };
