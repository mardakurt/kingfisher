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
export interface TrainingSetPrompt {
  /** Canonical key the prompt is keyed on. */
  readonly positionKey: string;
  /** A representative FEN for the position. */
  readonly fen: Fen;
  /** The side to move here. */
  readonly sideToMove: 'w' | 'b';
  /** The opponent move that the repertoire has not decided. */
  readonly opponentMove: {
    readonly uci: string;
    readonly san: string;
    readonly games: number;
    readonly share: number;
  };
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
  const share = prompt.opponentMove.share
    ? `${(prompt.opponentMove.share * 100).toFixed(1)}%`
    : '—';
  return `Find your response to ${prompt.opponentMove.san} (${prompt.opponentMove.games} games in ${prompt.source.name}, ${share}).`;
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
  const prompts: TrainingSetPrompt[] = [];
  for (const report of reports) {
    for (const gap of report.gaps) {
      prompts.push({
        positionKey: report.positionKey,
        fen: positionKeyForTraining(report.positionKey) as Fen,
        sideToMove: 'w',
        opponentMove: {
          uci: gap.uci,
          san: gap.san,
          games: gap.games,
          share: gap.share,
        },
        source: {
          id: report.sourceId,
          name: report.sourceName || sourceName,
        },
      });
    }
  }
  /*
    Transposition deduplication: two move orders that reach the same canonical
    position are one prompt. The first one survives, because it is the one
    that was the strongest evidence.
  */
  const seen = new Set<string>();
  return prompts.filter((prompt) => {
    const canonical = positionKeyForTraining(prompt.fen);
    if (seen.has(canonical)) return false;
    seen.add(canonical);
    return true;
  });
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
    tags: [`source:${prompt.source.id}`, 'data-generated', `opponent:${prompt.opponentMove.uci}`],
    explanation: `Generated from ${prompt.source.name} (${prompt.opponentMove.games} games). The repertoire does not currently have a decision for this position.`,
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
