/**
 * The persistent entities Phase 3 adds.
 *
 * Kept apart from `types.ts` (which holds the Phase 1–2 studies and games
 * model) so the repertoire, training and preparation vocabulary can be read on
 * its own. Everything here is plain data: no React, no storage, no engine.
 */

import type { Color, Fen, San, Uci } from '@/chess/types';
import type { NodeId } from '@/chess/tree/types';
import type { Score } from '@/chess/evaluation';
import type { AnalysisLimit } from '@/engine/types';

export type RepertoireId = string;
export type RepertoirePositionId = string;
export type TrainingItemId = string;
export type ModelGameLinkId = string;
export type StudyReferenceId = string;

/** A canonical position key, as produced by `positionKey`. See ADR 0009. */
export type PositionKey = string;

// --- Repertoires -----------------------------------------------------------

export interface RepertoireRecord {
  readonly id: RepertoireId;
  readonly title: string;
  /** The side this repertoire is played from. */
  readonly color: 'w' | 'b';
  readonly description?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * What a move means inside a repertoire.
 *
 * Four roles, not fifteen. `main` is what you intend to play, `alternative` is
 * a second prepared answer you are equally happy with, `candidate` is under
 * consideration and not yet trusted, and `avoid` records a move you have
 * decided against — which is knowledge worth keeping, because otherwise you
 * rediscover and re-reject it every six months.
 */
export type RepertoireRole = 'main' | 'alternative' | 'candidate' | 'avoid';

export const REPERTOIRE_ROLES: readonly RepertoireRole[] = [
  'main',
  'alternative',
  'candidate',
  'avoid',
];

export interface RepertoireMove {
  readonly uci: Uci;
  readonly san: San;
  readonly role: RepertoireRole;
  /**
   * An observed/expected opponent continuation rather than a move the user
   * intends to play. Kept on the same position record so deviations and gaps
   * remain position-keyed and transposition aware.
   */
  readonly expected?: boolean;
  readonly note?: string;
  /** Epoch ms; lets "needs review" be derived rather than stored as a status. */
  readonly updatedAt: number;
}

/**
 * One position in a repertoire, keyed canonically.
 *
 * This is the heart of the design: a repertoire is a map from *positions* to
 * intended moves, never a tree of move sequences. Two move orders that reach
 * the same position are therefore the same entry automatically, which is what
 * stops a repertoire fragmenting into unrelated islands. See ADR 0010.
 */
export interface RepertoirePositionRecord {
  readonly id: RepertoirePositionId;
  readonly repertoireId: RepertoireId;
  readonly positionKey: PositionKey;
  /** A representative FEN for the position, for display and board setup. */
  readonly fen: Fen;
  /** Whose move it is here; `own` positions are the ones you must know. */
  readonly sideToMove: 'w' | 'b';
  readonly moves: readonly RepertoireMove[];
  readonly note?: string;
  /** Distance in plies from the repertoire's starting position, when known. */
  readonly depth: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** Authoring revision used for transactional stale-write protection. */
  readonly revision: number;
}

export class StaleRepertoirePositionWriteError extends Error {
  override readonly name = 'StaleRepertoirePositionWriteError';
  constructor(
    readonly current: RepertoirePositionRecord,
    readonly attemptedRevision: number | undefined,
  ) {
    super('This repertoire position changed in another Kingfisher tab.');
  }
}

export interface RepertoireWithPositions {
  readonly repertoire: RepertoireRecord;
  readonly positions: readonly RepertoirePositionRecord[];
}

// --- Training --------------------------------------------------------------

export type TrainingMode = 'repertoire-recall' | 'best-move' | 'candidates' | 'evaluate' | 'plan';

/** Broad evaluation bands, which is the resolution a human actually has. */
export type EvaluationBand =
  'white-clear' | 'white-slight' | 'equal' | 'black-slight' | 'black-clear';

export const EVALUATION_BANDS: readonly { id: EvaluationBand; label: string }[] = [
  { id: 'white-clear', label: 'Clearly better for White' },
  { id: 'white-slight', label: 'Slightly better for White' },
  { id: 'equal', label: 'Equal' },
  { id: 'black-slight', label: 'Slightly better for Black' },
  { id: 'black-clear', label: 'Clearly better for Black' },
];

export interface TrainingPlan {
  readonly color: 'w' | 'b';
  readonly text: string;
}

/**
 * Scheduling state for one item.
 *
 * Deliberately legible: every field here is one the user could be shown and
 * would understand. See ADR 0011 for the algorithm.
 */
export interface ScheduleState {
  /** Consecutive successful reviews; reset to 0 by a lapse. */
  readonly streak: number;
  /** Days until the next review, from the last review. */
  readonly intervalDays: number;
  /** SM-2 ease factor, clamped to [1.3, 2.8]. */
  readonly ease: number;
  readonly dueAt: number;
  readonly lastReviewedAt: number | null;
  readonly reviewCount: number;
  readonly lapses: number;
}

/**
 * Where an item's accepted answer came from.
 *
 * Recorded because "the engine liked this at depth 30" and "this is my
 * repertoire move" are different claims, and neither is the same as "I decided
 * this is right". A training item that cannot say which one it is invites the
 * user to treat a search result as truth. See ADR 0011.
 */
export type AnswerSource = 'user' | 'engine' | 'repertoire';

export const ANSWER_SOURCE_LABEL: Record<AnswerSource, string> = {
  user: 'User-defined',
  engine: 'Saved engine line',
  repertoire: 'Repertoire',
};

export interface TrainingItemRecord {
  readonly id: TrainingItemId;
  readonly mode: TrainingMode;
  readonly positionKey: PositionKey;
  readonly fen: Fen;
  readonly sideToMove: 'w' | 'b';
  /** What the user is asked to do, in their own words. */
  readonly prompt: string;
  /** Accepted answers for move-based modes, in UCI. */
  readonly solutionUci: readonly Uci[];
  /** The same answers in SAN, for display without replaying the position. */
  readonly solutionSan: readonly San[];
  /** Candidate moves for `candidates`, beyond the single best. */
  readonly candidatesUci: readonly Uci[];
  readonly expectedBand?: EvaluationBand;
  readonly plans: readonly TrainingPlan[];
  readonly explanation?: string;
  readonly tags: readonly string[];
  readonly source?: TrainingSource;
  /** Provenance of `solutionUci`; absent on items written before it existed. */
  readonly answerSource?: AnswerSource;
  readonly schedule: ScheduleState;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** Authoring revision; review appends deliberately do not advance it. */
  readonly revision: number;
}

export class StaleTrainingItemWriteError extends Error {
  override readonly name = 'StaleTrainingItemWriteError';
  constructor(
    readonly current: TrainingItemRecord,
    readonly attemptedRevision: number,
  ) {
    super('This training item changed in another Kingfisher tab.');
  }
}

export interface TrainingSource {
  readonly kind: 'study' | 'game' | 'repertoire' | 'analysis';
  readonly id?: string;
  readonly label: string;
  readonly nodeId?: NodeId;
}

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

export interface TrainingReviewRecord {
  readonly id: string;
  readonly itemId: TrainingItemId;
  readonly reviewedAt: number;
  readonly grade: ReviewGrade;
  /** The interval this review produced, in days. */
  readonly intervalDays: number;
  readonly correct: boolean;
}

// --- Model games -----------------------------------------------------------

export type ModelGameTag = 'model' | 'theory' | 'strategic' | 'tactical' | 'endgame';

export const MODEL_GAME_TAGS: readonly { id: ModelGameTag; label: string }[] = [
  { id: 'model', label: 'Model game' },
  { id: 'theory', label: 'Theoretical game' },
  { id: 'strategic', label: 'Strategic example' },
  { id: 'tactical', label: 'Tactical example' },
  { id: 'endgame', label: 'Endgame example' },
];

/**
 * A reference from a game to somewhere it is worth studying.
 *
 * A link, never a copy: the game record stays the single source of truth, so
 * annotating a game once improves every place it is referenced from.
 */
export interface ModelGameLinkRecord {
  readonly id: ModelGameLinkId;
  readonly gameId: string;
  readonly kinds: readonly ModelGameTag[];
  /** The canonical position this game illustrates, when it is position-specific. */
  readonly positionKey?: PositionKey;
  readonly studyId?: string;
  readonly chapterId?: string;
  readonly repertoireId?: RepertoireId;
  readonly note?: string;
  readonly tags: readonly string[];
  readonly createdAt: number;
}

// --- Study references ------------------------------------------------------

export type StudyReferenceKind = 'model-game' | 'repertoire-position' | 'training-item';

/** A typed link from a chapter to existing chess evidence; never a copy. */
export interface StudyReferenceRecord {
  readonly id: StudyReferenceId;
  readonly chapterId: string;
  readonly kind: StudyReferenceKind;
  readonly targetId: string;
  /** Snapshot used as a useful label even when the target later disappears. */
  readonly label: string;
  readonly createdAt: number;
}

export interface ResolvedStudyReference {
  readonly reference: StudyReferenceRecord;
  readonly missing: boolean;
  readonly label: string;
  readonly repertoireId?: RepertoireId;
  readonly gameId?: string;
  readonly trainingItemId?: TrainingItemId;
}

// --- Background analysis ---------------------------------------------------

export type AnalysisQueueStatus =
  'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type AnalysisQueuePreset = 'quick' | 'standard' | 'deep' | 'custom';
export type AnalysisQueueStrategy = 'every-move' | 'after-opening';

export interface AnalysisQueueJobRecord {
  readonly id: string;
  readonly gameId: string;
  readonly gameLabel: string;
  readonly engineId: string;
  readonly preset: AnalysisQueuePreset;
  readonly multiPv: number;
  readonly limit: AnalysisLimit;
  readonly strategy: AnalysisQueueStrategy;
  readonly startPly: number;
  readonly status: AnalysisQueueStatus;
  readonly nextIndex: number;
  readonly totalPositions: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly ownerId?: string;
  readonly heartbeatAt?: number;
  readonly error?: string;
}

/** One final engine answer for one queued position; intermediate ticks are not stored. */
export interface StoredEngineEvidenceRecord {
  readonly id: string;
  readonly jobId: string;
  readonly gameId: string;
  readonly nodeId: NodeId;
  readonly positionKey: PositionKey;
  readonly fen: Fen;
  readonly engineId: string;
  readonly engineName: string;
  readonly score: Score;
  readonly depth: number;
  readonly nodes: number;
  readonly timeMs: number;
  readonly pv: readonly Uci[];
  readonly analysedAt: number;
}

// --- Improvement review ----------------------------------------------------

/**
 * What the player thought, recorded before the computer was allowed to speak.
 *
 * The whole point of this record is that it is written *first*. Nothing in the
 * application may rewrite a decision after the engine has been revealed —
 * `revealedAt` marks the moment the evidence became visible, and every field
 * above it was authored without it. An improvement log whose entries drift
 * toward the engine's opinion after the fact records nothing at all.
 */
export interface DecisionRecord {
  readonly id: string;
  readonly positionKey: PositionKey;
  readonly fen: Fen;
  readonly sideToMove: Color;
  /** Where the position came from, when it came from something stored. */
  readonly gameId?: string;
  readonly chapterId?: string;
  readonly nodeId?: NodeId;
  /** Half-move index, so a game's decisions read in the order they happened. */
  readonly ply?: number;
  /** The move the player would actually play. */
  readonly chosenUci?: Uci;
  readonly chosenSan?: San;
  readonly candidates: readonly DecisionCandidate[];
  readonly estimate?: EvaluationEstimate;
  readonly plan?: string;
  readonly calculationNotes?: string;
  readonly confidence?: DecisionConfidence;
  readonly themes: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
  /** Set once, when the player chose to see the evidence. Never cleared. */
  readonly revealedAt?: number;
  readonly revision: number;
}

/** One move the player actually considered, with what they thought about it. */
export interface DecisionCandidate {
  readonly uci: Uci;
  readonly san: San;
  readonly note?: string;
  /** The line the player calculated, in SAN, as they entered it. */
  readonly line?: readonly San[];
  readonly estimate?: EvaluationEstimate;
}

/**
 * The player's own assessment, before reveal.
 *
 * A band and an optional number, because a strong player often knows "slightly
 * better for White" without wanting to commit to +0.35 — and sometimes wants
 * exactly that. Both are compared against engine evidence after reveal, and
 * the comparison is presented as a difference, never as a score.
 */
export interface EvaluationEstimate {
  readonly band: EvaluationBandId;
  /** Pawns, White's point of view, when the player gave a number. */
  readonly pawns?: number;
}

export type EvaluationBandId =
  'clearly-white' | 'slightly-white' | 'equal' | 'slightly-black' | 'clearly-black';

export type DecisionConfidence = 'low' | 'medium' | 'high';

export class StaleDecisionWriteError extends Error {
  override readonly name = 'StaleDecisionWriteError';
  constructor(
    readonly current: DecisionRecord,
    readonly attemptedRevision: number,
  ) {
    super('This decision record changed in another Kingfisher tab.');
  }
}

/**
 * A position waiting to be reviewed, or already reviewed.
 *
 * Critical marks live in the game tree (`NodeMeta.critical`), which is right —
 * they belong to the analysis. But a tree is not a work queue: it cannot be
 * filtered, counted or worked through. A review item is the queue entry, and
 * it carries why it is there.
 */
export interface ReviewItemRecord {
  readonly id: string;
  /**
   * Derived identity: position, source document and node.
   *
   * Stored rather than computed at query time so it can carry a unique index,
   * which is what makes "suggest review candidates" idempotent.
   */
  readonly identityKey: string;
  readonly positionKey: PositionKey;
  readonly fen: Fen;
  readonly sideToMove: Color;
  readonly source: ReviewItemSource;
  readonly gameId?: string;
  readonly gameLabel?: string;
  readonly chapterId?: string;
  readonly nodeId?: NodeId;
  readonly ply?: number;
  /** The user's own category, when they marked it themselves. */
  readonly category?: ReviewCategory;
  readonly status: ReviewStatus;
  /**
   * Why this position is in the queue, as a sentence naming the facts.
   *
   * Set for a suggested candidate ("engine evaluation changed from +0.4 to
   * -1.1"), absent for one the player marked by hand. Never a judgement.
   */
  readonly reason?: string;
  readonly signals: readonly ReviewSignal[];
  readonly themes: readonly string[];
  readonly decisionId?: string;
  readonly trainingItemId?: string;
  readonly createdAt: number;
  readonly reviewedAt?: number;
  readonly revision: number;
}

export type ReviewItemSource = 'marked' | 'suggested' | 'manual';
export type ReviewStatus = 'unreviewed' | 'reviewed' | 'converted' | 'ignored';

/** The categories the game tree already uses for a critical mark. */
export type ReviewCategory = 'opening' | 'calculation' | 'strategy' | 'endgame' | 'time-trouble';

/**
 * A factual reason a position was suggested for review.
 *
 * Deterministic and derived only from evidence already stored: an evaluation
 * that moved, a best move that changed, lines that separated, a repertoire
 * deviation, a tablebase result that flipped, or the player's own marker. None
 * of these is a verdict on the move played, and none of them is allowed to
 * become one — the vocabulary has no room for "blunder".
 */
export type ReviewSignalKind =
  | 'evaluation-swing'
  | 'best-move-change'
  | 'line-separation'
  | 'critical-marker'
  | 'repertoire-deviation'
  | 'tablebase-change';

export interface ReviewSignal {
  readonly kind: ReviewSignalKind;
  /** The measured facts behind it, already formatted for display. */
  readonly detail: string;
}

export class StaleReviewItemWriteError extends Error {
  override readonly name = 'StaleReviewItemWriteError';
  constructor(
    readonly current: ReviewItemRecord,
    readonly attemptedRevision: number,
  ) {
    super('This review item changed in another Kingfisher tab.');
  }
}

/**
 * The improvement themes Kingfisher ships with.
 *
 * A closed default list so summaries can be compared over months, plus
 * user-defined tags for anything this list does not name. Nothing assigns
 * these automatically: a theme is the player's own reading of their own
 * mistake, and an engine score cannot supply it.
 */
export const IMPROVEMENT_THEMES = [
  'calculation',
  'missed-tactic',
  'candidate-generation',
  'piece-placement',
  'trade-decision',
  'pawn-break',
  'king-safety',
  'opening-knowledge',
  'time-management',
  'endgame-technique',
  'evaluation-error',
  'plan-selection',
] as const;

export type BuiltInTheme = (typeof IMPROVEMENT_THEMES)[number];

export const THEME_LABEL: Record<BuiltInTheme, string> = {
  calculation: 'Calculation',
  'missed-tactic': 'Missed tactic',
  'candidate-generation': 'Candidate generation',
  'piece-placement': 'Piece placement',
  'trade-decision': 'Trade decision',
  'pawn-break': 'Pawn break',
  'king-safety': 'King safety',
  'opening-knowledge': 'Opening knowledge',
  'time-management': 'Time management',
  'endgame-technique': 'Endgame technique',
  'evaluation-error': 'Evaluation error',
  'plan-selection': 'Plan selection',
};

/** A theme id is a built-in slug or a user tag; both are plain strings. */
export const themeLabel = (id: string): string =>
  (THEME_LABEL as Record<string, string | undefined>)[id] ??
  id.replace(/-/g, ' ').replace(/^./, (letter) => letter.toUpperCase());

// --- Training sets ---------------------------------------------------------

/**
 * A named group of training items.
 *
 * Membership, never a copy: a static set holds item ids, a dynamic set holds
 * the query that decides membership when it is opened. Duplicating a training
 * item into a set would fork its schedule and its review history, which is
 * exactly what a spaced-repetition system must not do.
 */
export interface TrainingSetRecord {
  readonly id: string;
  readonly name: string;
  readonly kind: TrainingSetKind;
  /** Static sets only. */
  readonly itemIds: readonly TrainingItemId[];
  /** Dynamic sets only. */
  readonly query?: TrainingSetQuery;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly revision: number;
}

export type TrainingSetKind = 'static' | 'dynamic';

/** Every field is optional and every present field narrows. */
export interface TrainingSetQuery {
  readonly themes?: readonly string[];
  readonly modes?: readonly TrainingMode[];
  readonly tags?: readonly string[];
  /** Items created within this many days. */
  readonly withinDays?: number;
  /** Only items whose source is a stored game of the user's. */
  readonly fromMyGames?: boolean;
}

export class StaleTrainingSetWriteError extends Error {
  override readonly name = 'StaleTrainingSetWriteError';
  constructor(
    readonly current: TrainingSetRecord,
    readonly attemptedRevision: number,
  ) {
    super('This training set changed in another Kingfisher tab.');
  }
}

// --- The user --------------------------------------------------------------

/**
 * Who the user is, in their own games.
 *
 * Explicitly configured and never inferred. Guessing identity from an imported
 * archive is how a tool ends up telling somebody their score against a player
 * who happens to share a surname.
 */
export interface UserProfileRecord {
  readonly id: 'me';
  readonly aliases: readonly string[];
  /**
   * Improvement themes the player added themselves.
   *
   * Stored on the profile rather than in a store of their own: a tag has no
   * identity beyond its name, no revision worth protecting, and there are
   * never more of them than a person can read.
   */
  readonly customThemes?: readonly string[];
  readonly updatedAt: number;
}

export const EMPTY_PROFILE: UserProfileRecord = {
  id: 'me',
  aliases: [],
  customThemes: [],
  updatedAt: 0,
};
