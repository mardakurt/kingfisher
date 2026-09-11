/**
 * Phase 41 — Calculation Training, as a distinct item type.
 *
 * Repertoire training (the existing mode) picks the answer from the
 * user's repertoire. Calculation Review is a different thing: the
 * answer comes from a position the player has actually faced, and
 * the trainer grades the player's pick against an acceptable
 * candidate set rather than against a single canonical move.
 *
 * Why a separate item type:
 *   - the training page filter "Repertoire / Game Review / All" only
 *     works when the two are distinguishable in storage,
 *   - the scheduler can use a different cadence for calculation
 *     items without affecting repertoire training,
 *   - the renderer never accidentally calls a repertoire answer
 *     "the right move" for a position the user just blundered in.
 *
 * The function below is the single entry point: it takes a marked
 * review item and produces a {@link CalculationTrainingItemDraft}
 * the caller persists through the existing training repository.
 * It does NOT itself persist, so the action stays in the caller's
 * control (the user has to click "Train this position", per the
 * brief).
 */
import type {
  CalculationReviewProvenance,
  PositionKey,
  TrainingItemRecord,
} from '@/persistence/domain';
import type { Color, Fen, San, Uci } from '@/chess/types';

export interface CalculationTrainingItemDraft {
  readonly positionKey: PositionKey;
  readonly fen: Fen;
  readonly sideToMove: Color;
  /**
   * The set of moves the player can pick from — engine candidates,
   * tablebase winning moves, or any subset the user selected.
   * The renderer hides the engine's best-move label until the
   * player has chosen.
   */
  readonly allowedMoves: readonly San[];
  /**
   * Engine candidates ordered by evaluation, used by the renderer
   * to show the canonical answer after the player reveals.
   */
  readonly candidates: readonly { readonly san: San; readonly uci: Uci; readonly cp: number }[];
  /**
   * The single "best" move in human-readable SAN — what the
   * trainer calls "the engine's top move" once revealed. Kept
   * separately from `candidates` because the top of the list
   * is the engine's pick, and the trainer never claims the
   * top move is the only acceptable answer.
   */
  readonly topSan?: San;
  readonly explanation?: string;
  readonly tags: readonly string[];
  readonly source: TrainingItemRecord['source'];
  readonly provenance: CalculationReviewProvenance;
}

/**
 * Build a draft calculation item from an engine candidate list.
 *
 * The default "Train this position" action calls this. It does not
 * itself persist; the caller hands the draft to the training
 * repository. Provenance is what makes the item's answer honest.
 */
export function calculationTrainingFromCandidates(input: {
  readonly reviewItemId: string;
  readonly positionKey: PositionKey;
  readonly fen: Fen;
  readonly sideToMove: Color;
  readonly gameId?: string;
  readonly gameLabel?: string;
  readonly nodeId?: string;
  readonly ply?: number;
  readonly candidates: readonly { readonly san: San; readonly uci: Uci; readonly cp: number }[];
  /** Engine version string for the provenance. */
  readonly engineVersion?: string;
  /** Acceptable candidate band in centipawns (e.g. 50 = within 0.5). */
  readonly acceptableBandCp?: number;
  readonly tablebaseWdl?: number;
  readonly tags?: readonly string[];
}): CalculationTrainingItemDraft {
  const candidates = [...input.candidates].sort((a, b) => b.cp - a.cp);
  const allowed = candidates.map((candidate) => candidate.san);
  const topSan = candidates[0]?.san;
  const answerSource: CalculationReviewProvenance['answerSource'] =
    input.tablebaseWdl !== undefined ? 'tablebase' : 'engine-candidates';
  const provenance: CalculationReviewProvenance = {
    reviewItemId: input.reviewItemId,
    positionKey: input.positionKey,
    fen: input.fen,
    sideToMove: input.sideToMove,
    ...(input.gameId ? { gameId: input.gameId } : {}),
    ...(input.gameLabel ? { gameLabel: input.gameLabel } : {}),
    ...(input.nodeId ? { nodeId: input.nodeId } : {}),
    ...(input.ply !== undefined ? { ply: input.ply } : {}),
    answerSource,
    ...(input.engineVersion ? { engineVersion: input.engineVersion } : {}),
    ...(input.acceptableBandCp !== undefined ? { acceptableBandCp: input.acceptableBandCp } : {}),
    ...(input.tablebaseWdl !== undefined ? { tablebaseWdl: input.tablebaseWdl } : {}),
    createdAt: Date.now(),
  };
  return {
    positionKey: input.positionKey,
    fen: input.fen,
    sideToMove: input.sideToMove,
    allowedMoves: allowed,
    candidates,
    ...(topSan ? { topSan } : {}),
    tags: input.tags ?? ['calculation-review'],
    source: {
      kind: 'game-review',
      label: input.gameLabel ?? 'Game Review',
      ...(input.gameId ? { id: input.gameId } : {}),
      ...(input.nodeId ? { nodeId: input.nodeId } : {}),
    },
    provenance,
  };
}

/**
 * Grade a player's pick against the acceptable candidate band.
 *
 * The grader never reports "WRONG" because the player chose
 * engine #2 at +0.42 instead of engine #1 at +0.45. It returns
 * the rank of the pick in the candidate list, the centipawn
 * distance from the top, and a `best` flag only when the pick is
 * the canonical best. This is the honest grading surface the
 * brief asks for.
 */
export function gradeCalculationPick(
  draft: CalculationTrainingItemDraft,
  pick: San,
): {
  readonly rank: number;
  readonly deltaCp: number;
  readonly acceptable: boolean;
  readonly isTablebaseWinning: boolean;
} {
  const candidates = draft.candidates;
  const index = candidates.findIndex((candidate) => candidate.san === pick);
  const topCp = candidates[0]?.cp ?? 0;
  const pickCp = index >= 0 ? (candidates[index] as { readonly cp: number }).cp : topCp - 9999;
  const deltaCp = topCp - pickCp;
  const band = draft.provenance.acceptableBandCp ?? 30;
  const acceptable = index >= 0 && deltaCp <= band;
  const isTablebaseWinning =
    draft.provenance.answerSource === 'tablebase' &&
    typeof draft.provenance.tablebaseWdl === 'number' &&
    draft.provenance.tablebaseWdl > 0 &&
    index === 0;
  return {
    rank: index < 0 ? Number.POSITIVE_INFINITY : index + 1,
    deltaCp,
    acceptable,
    isTablebaseWinning,
  };
}
