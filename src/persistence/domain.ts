/**
 * The persistent entities Phase 3 adds.
 *
 * Kept apart from `types.ts` (which holds the Phase 1–2 studies and games
 * model) so the repertoire, training and preparation vocabulary can be read on
 * its own. Everything here is plain data: no React, no storage, no engine.
 */

import type { Fen, San, Uci } from '@/chess/types';
import type { NodeId } from '@/chess/tree/types';

export type RepertoireId = string;
export type RepertoirePositionId = string;
export type TrainingItemId = string;
export type ModelGameLinkId = string;

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
  readonly updatedAt: number;
}

export const EMPTY_PROFILE: UserProfileRecord = { id: 'me', aliases: [], updatedAt: 0 };
