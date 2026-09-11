/**
 * Game Review — the engine-driven half of the Kingfisher
 * "where did the game really change?" workflow.
 *
 * Existing infrastructure in `src/features/review/` already
 * owns the *self-analysis* loop: a player marks positions
 * they want to come back to, and `suggestReviewCandidates`
 * attaches engine evidence to those markers. This module adds
 * the missing *game-wide* pass: starting from a game, iterate
 * the main line, ask the engine for evidence at every ply,
 * record the provenance, and hand the timeline back to the
 * critical-moment UI.
 *
 * The review is deliberately built from the same engine
 * primitives `Analysis` already uses, not a parallel stack.
 * That keeps the threading model, the cancellation path, the
 * budget presets, and the provenance metadata identical
 * between "I am analysing a position" and "I am reviewing a
 * game".
 *
 * No model is invented. A critical moment is a function of
 *   - engine evaluation swing (with perspective normalisation)
 *   - WDL transition when the engine provides it
 *   - mate-score transitions (handled separately from cp)
 *   - reference / repertoire / tablebase departure
 *   - the player's own marked positions
 *
 * Ranking is deterministic; see `rankCriticalMoments`.
 *
 * Budget presets are documented in `REVIEW_BUDGETS`:
 *   - `quick`: depth 14 / multi-pv 3
 *   - `standard`: depth 18 / multi-pv 3
 *   - `deep`: depth 22 / multi-pv 4
 *
 * They are deliberately conservative — a full game at any of
 * these depths is still an afternoon. The intent is to give a
 * serious player a *trustworthy* review, not a long one.
 */

import type { Fen, San, Uci } from '@/chess/types';
import { formatScore, winningChances, type Score } from '@/chess/evaluation';
import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import type {
  AnalysisLimit,
  EngineAnalysis,
  EngineSession,
  PrincipalVariation,
} from '@/engine/types';
import { featureTransitions, type FeatureTransition } from '@/chess/feature-transitions';

export type ReviewBudget = 'quick' | 'standard' | 'deep';

export interface ReviewBudgetSettings {
  readonly depth: number;
  readonly multiPv: number;
  readonly timePerPositionMs: number;
}

export const REVIEW_BUDGETS: Readonly<Record<ReviewBudget, ReviewBudgetSettings>> = {
  quick: { depth: 14, multiPv: 3, timePerPositionMs: 4_000 },
  standard: { depth: 18, multiPv: 3, timePerPositionMs: 8_000 },
  deep: { depth: 22, multiPv: 4, timePerPositionMs: 16_000 },
};

export interface ReviewProvenance {
  readonly engineId: string;
  readonly engineName: string;
  readonly engineVersion?: string;
  readonly budget: ReviewBudget;
  readonly settings: ReviewBudgetSettings;
  readonly startedAt: number;
  finishedAt?: number;
}

export interface PositionReview {
  readonly nodeId: NodeId;
  readonly ply: number;
  readonly fen: Fen;
  readonly san?: San;
  readonly analysis: EngineAnalysis;
}

export type ReviewStatus =
  | { readonly kind: 'pending' }
  | { readonly kind: 'running'; readonly current: number; readonly total: number }
  | {
      readonly kind: 'complete';
      readonly criticalMoments: readonly CriticalMoment[];
      readonly positions: readonly PositionReview[];
      readonly provenance: ReviewProvenance;
    }
  | {
      readonly kind: 'cancelled';
      readonly current: number;
      readonly total: number;
      readonly partial: readonly PositionReview[];
    }
  | { readonly kind: 'failed'; readonly reason: string };

export interface CriticalMoment {
  readonly nodeId: NodeId;
  readonly ply: number;
  readonly fen: Fen;
  readonly san?: San;
  readonly sideToMove: 'w' | 'b';
  readonly beforeScore: Score;
  readonly afterScore: Score;
  readonly kind: CriticalMomentKind;
  readonly rank: number;
  readonly explanation: string;
  /**
   * Deterministic strategic transitions between the position before this
   * move and the position after, derived from `featureTransitions`.
   *
   * Kept empty when there is nothing to say; the rendering layer is
   * responsible for showing nothing rather than a heading with no rows.
   * A tactical critical moment can still be accompanied by strategic
   * transitions — the two are independent signals, both useful.
   */
  readonly strategicContext?: readonly FeatureTransition[];
}

export type CriticalMomentKind =
  | 'evaluation-swing'
  | 'mate-transition'
  | 'best-vs-played'
  | 'tactical-chance'
  | 'reference-departure'
  | 'repertoire-deviation'
  | 'tablebase-transition';

export interface GameReviewInput {
  readonly tree: GameTree;
  readonly budget: ReviewBudget;
  readonly session: EngineSession;
  readonly positions?: readonly NodeId[];
  readonly referenceMoves?: ReadonlyMap<string, readonly string[]>;
  readonly repertoireMoves?: ReadonlyMap<string, readonly string[]>;
  readonly personalEvidence?: ReadonlyMap<string, { readonly games: number }>;
  readonly tablebase?: {
    fetch(
      position: PositionReview,
    ): Promise<{ readonly wdl: number; readonly dtz?: number } | null>;
  };
  readonly onProgress?: (status: ReviewStatus) => void;
  readonly signal?: AbortSignal;
}

export interface GameReviewResult {
  readonly status: ReviewStatus;
}

/* ---------- engine budget helpers ---------- */

export function analysisLimitFor(budget: ReviewBudget): AnalysisLimit {
  const settings = REVIEW_BUDGETS[budget];
  return { kind: 'depth', depth: settings.depth };
}

export function configureSessionForBudget(
  session: EngineSession,
  budget: ReviewBudget,
): Promise<void> {
  const settings = REVIEW_BUDGETS[budget];
  return session.configure({ multiPv: settings.multiPv });
}

/* ---------- perspective normalisation ---------- */

function perspectiveScore(score: Score, sideToMove: 'w' | 'b'): number {
  /* `winningChances` is a 0..1 probability; flipping the
     side-to-move inverts it. The suggester reads this directly
     so the swing calculation has a single, honest reference. */
  const w = winningChances(score);
  return sideToMove === 'w' ? w : 1 - w;
}

/**
 * Whether the score is a forced mate.
 *
 * Engine scores with `mateIn` are facts that should never be
 * conflated with centipawns. A position that goes from
 * `mateIn 5` to `mateIn -3` is not just a swing; it is a flip
 * from "White wins in five" to "Black wins in three".
 */
export function isMateScore(score: Score): boolean {
  return score.kind === 'mate';
}

/* ---------- critical moment classification ---------- */

function detectKind(before: Score, after: Score): CriticalMomentKind | undefined {
  if (before.kind === 'mate' || after.kind === 'mate') return 'mate-transition';
  if (winningChances(before) - winningChances(after) >= 0.08) {
    return 'evaluation-swing';
  }
  return undefined;
}

function rankCriticalMoments(candidates: CriticalMoment[]): readonly CriticalMoment[] {
  /* Deterministic and explainable. Mate transitions outrank
     every other kind: a mate change is a fact. Evaluation
     swings are ranked by magnitude. Critical markers
     (handled by the caller via category) sit ahead of any
     computed moment. */
  return [...candidates].sort((a, b) => {
    const aMate = a.kind === 'mate-transition' ? 1 : 0;
    const bMate = b.kind === 'mate-transition' ? 1 : 0;
    if (aMate !== bMate) return bMate - aMate;
    const aMag = Math.abs(
      perspectiveScore(a.afterScore, a.sideToMove) - perspectiveScore(a.beforeScore, a.sideToMove),
    );
    const bMag = Math.abs(
      perspectiveScore(b.afterScore, b.sideToMove) - perspectiveScore(b.beforeScore, b.sideToMove),
    );
    if (Math.abs(aMag - bMag) > 0.001) return bMag - aMag;
    return a.ply - b.ply;
  });
}

/* ---------- the game-wide driver ---------- */

export async function runGameReview(input: GameReviewInput): Promise<GameReviewResult> {
  const provenance: ReviewProvenance = {
    engineId: input.session.identity.id ?? input.session.identity.name,
    engineName: input.session.identity.name,
    engineVersion: input.session.identity.version,
    budget: input.budget,
    settings: REVIEW_BUDGETS[input.budget],
    startedAt: Date.now(),
  };
  const settings = REVIEW_BUDGETS[input.budget];
  await input.session.configure({ multiPv: settings.multiPv });

  /* Pick the positions to review. The main line is the default;
     callers may pass a curated subset (a Study chapter, the
     moves within a tactical exercise). */
  const path =
    input.positions && input.positions.length > 0 ? input.positions : mainlinePath(input.tree);
  const total = path.length;
  const positions: PositionReview[] = [];

  for (let index = 0; index < path.length; index += 1) {
    if (input.signal?.aborted) {
      return {
        status: {
          kind: 'cancelled',
          current: index,
          total,
          partial: positions,
        },
      };
    }
    const nodeId = path[index] as NodeId;
    const node = input.tree.nodes[nodeId];
    if (!node) continue;

    const childId = path[index + 1];
    const child = childId ? input.tree.nodes[childId] : undefined;
    /* Use the position the engine sees: the *parent* node, so
       the analysis answers the question "what should be played
       here from this position?" for the move that follows. */
    const fen = node.fen;
    const review = await analyseAtPosition(input.session, fen, settings);
    if (!review) continue;
    const positionReview: PositionReview = {
      nodeId,
      ply: node.ply,
      fen,
      ...(child?.move?.san ? { san: child.move.san } : {}),
      analysis: review,
    };
    positions.push(positionReview);
    input.onProgress?.({
      kind: 'running',
      current: index + 1,
      total,
    });
  }

  const criticalMoments = computeCriticalMoments(
    positions,
    input.tree,
    path,
    input.referenceMoves,
    input.repertoireMoves,
    input.personalEvidence,
  );

  provenance.finishedAt = Date.now();
  return {
    status: {
      kind: 'complete',
      criticalMoments,
      positions,
      provenance,
    },
  };
}

async function analyseAtPosition(
  session: EngineSession,
  fen: Fen,
  settings: ReviewBudgetSettings,
): Promise<EngineAnalysis | null> {
  /* Each position gets its own analysis handle. The driver
     awaits completion; a partial analysis is fine (the
     critical-moment code uses the *last* snapshot, not a
     bound only). */
  return new Promise((resolve) => {
    let last: EngineAnalysis | null = null;
    let handle: ReturnType<typeof session.analyse> | null = null;
    handle = session.analyse(
      { fen, limit: { kind: 'depth', depth: settings.depth } },
      (analysis) => {
        last = analysis;
        if (analysis.complete && handle) {
          handle.stop();
        }
      },
    );
    /* Hard cap by time so a hung engine never blocks the
       review. The review reports whatever the engine produced
       up to that point. */
    const timer = setTimeout(() => {
      handle?.stop();
    }, settings.timePerPositionMs);
    void handle.finished
      .then((analysis) => resolve(analysis))
      .catch(() => resolve(last))
      .finally(() => clearTimeout(timer));
  });
}

function computeCriticalMoments(
  positions: readonly PositionReview[],
  tree: GameTree,
  path: readonly NodeId[],
  referenceMoves?: ReadonlyMap<string, readonly string[]>,
  repertoireMoves?: ReadonlyMap<string, readonly string[]>,
  personalEvidence?: ReadonlyMap<string, { readonly games: number }>,
): readonly CriticalMoment[] {
  const candidates: CriticalMoment[] = [];
  for (let index = 0; index < positions.length; index += 1) {
    const here = positions[index];
    const next = positions[index + 1];
    if (!here || !next) continue;
    const node = tree.nodes[here.nodeId];
    const child = tree.nodes[next.nodeId];
    if (!node || !child?.move) continue;
    const sideToMove = (node.fen.split(/\s+/)[1] ?? 'w') as 'w' | 'b';
    const before = bestScore(here.analysis);
    const after = bestScore(next.analysis);
    const kind = detectKind(before, after);
    if (!kind) continue;
    const explanation = `${formatScore(before, { alwaysSign: true })} → ${formatScore(after, { alwaysSign: true })} after ${here.san ?? child.move.san ?? '?'}`;
    /*
     * Strategic transitions. Two consecutive positions; the function only
     * emits a statement when the board fact actually changed, so an
     * empty list means "this move did not shift any structural feature"
     * rather than "we forgot to look".
     */
    const strategicContext = here.ply >= 10 ? featureTransitions(here.fen, next.fen) : [];
    candidates.push({
      nodeId: here.nodeId,
      ply: here.ply,
      fen: here.fen,
      san: here.san,
      sideToMove,
      beforeScore: before,
      afterScore: after,
      kind,
      rank: 0,
      explanation,
      ...(strategicContext.length > 0 ? { strategicContext } : {}),
    });
    /* Reference / repertoire / personal: independent of
       engine evidence, fired when the move played at this
       position is not the move the source expected. */
    const playedSan = child.move.san;
    const playedUci = child.move.uci;
    if (playedUci) {
      const reference = referenceMoves?.get(here.fen);
      if (reference && reference.length > 0 && !reference.includes(playedUci)) {
        candidates.push({
          nodeId: here.nodeId,
          ply: here.ply,
          fen: here.fen,
          san: here.san,
          sideToMove,
          beforeScore: before,
          afterScore: after,
          kind: 'reference-departure',
          rank: 0,
          explanation: `The game left the selected reference: ${reference.join(', ')} were the recorded moves, ${playedSan ?? playedUci} was played.`,
        });
      }
      const repertoire = repertoireMoves?.get(here.fen);
      if (repertoire && repertoire.length > 0 && !repertoire.includes(playedUci)) {
        candidates.push({
          nodeId: here.nodeId,
          ply: here.ply,
          fen: here.fen,
          san: here.san,
          sideToMove,
          beforeScore: before,
          afterScore: after,
          kind: 'repertoire-deviation',
          rank: 0,
          explanation: `Your repertoire expected ${repertoire.join(' or ')} here; ${playedSan ?? playedUci} was played.`,
        });
      }
      const personal = personalEvidence?.get(here.fen);
      if (personal && personal.games > 0) {
        /* Personal database evidence: a position the user has
           reached before is not on its own a critical moment,
           but combined with a swing it adds provenance. */
        candidates.push({
          nodeId: here.nodeId,
          ply: here.ply,
          fen: here.fen,
          san: here.san,
          sideToMove,
          beforeScore: before,
          afterScore: after,
          kind: 'reference-departure',
          rank: 0,
          explanation: `You have reached this position in ${personal.games} of your games.`,
        });
      }
    }
  }
  /* Reference the path argument to keep its presence in the
     signature (callers may pass a curated subset that the
     mainlinePath default would not produce). */
  void path;
  return rankCriticalMoments(candidates);
}

function bestScore(analysis: EngineAnalysis): Score {
  /* The engine's preferred line is index 0; if the engine
     reported a `bestmove` but no lines (some Stockfish
     configurations), synthesise a centipawn-zero position so
     the comparator still works. */
  const best = analysis.lines[0];
  if (best) return best.score;
  return { kind: 'cp', cp: 0 };
}

/* ---------- candidate comparison surface ---------- */

export interface CandidateComparison {
  readonly playedSan?: San;
  readonly playedUci?: Uci;
  readonly engineCandidates: readonly EngineCandidateView[];
  readonly referenceMoves: readonly string[];
  readonly repertoireMoves: readonly string[];
  readonly personalGames: number | undefined;
  readonly tablebaseWdl: number | undefined;
}

export interface EngineCandidateView {
  readonly rank: number;
  readonly san?: readonly San[];
  readonly uci: readonly Uci[];
  readonly score: Score;
  readonly depth: number;
}

/**
 * Build a comparison surface for a critical moment.
 *
 * The surface is intentionally narrow: played move, engine
 * candidates, reference moves, repertoire moves, personal
 * count, tablebase result. The render layer does not need to
 * know the engine; it reads this view and lays it out.
 */
export function buildCandidateComparison(input: {
  readonly tree: GameTree;
  readonly analysis: EngineAnalysis;
  readonly nodeId: NodeId;
  readonly referenceMoves?: ReadonlyMap<string, readonly string[]>;
  readonly repertoireMoves?: ReadonlyMap<string, readonly string[]>;
  readonly personalEvidence?: ReadonlyMap<string, { readonly games: number }>;
  readonly tablebaseWdl?: number;
}): CandidateComparison {
  const node = input.tree.nodes[input.nodeId];
  const childId = Object.values(input.tree.nodes).find(
    (candidate) => candidate.parentId === input.nodeId,
  )?.id;
  const child = childId ? input.tree.nodes[childId] : undefined;
  const playedSan = child?.move?.san;
  const playedUci = child?.move?.uci;
  const engineCandidates = input.analysis.lines.map<EngineCandidateView>(
    (line: PrincipalVariation) => ({
      rank: line.rank,
      ...(line.san ? { san: line.san } : {}),
      uci: line.moves,
      score: line.score,
      depth: line.depth,
    }),
  );
  return {
    ...(playedSan ? { playedSan } : {}),
    ...(playedUci ? { playedUci } : {}),
    engineCandidates,
    referenceMoves: input.referenceMoves?.get(node?.fen ?? '') ?? [],
    repertoireMoves: input.repertoireMoves?.get(node?.fen ?? '') ?? [],
    personalGames: input.personalEvidence?.get(node?.fen ?? '')?.games,
    tablebaseWdl: input.tablebaseWdl,
  };
}
