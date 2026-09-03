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
  /**
   * Why this game was saved, in the player's words.
   *
   * The question a model game has to answer is "what is this teaching me",
   * and only the person who saved it knows. Absent on links written before
   * this field existed, which reads as "no stated purpose" rather than as a
   * missing feature.
   */
  readonly purpose?: string;
  readonly themes?: readonly string[];
  readonly keyMoments?: readonly ModelGameKeyMoment[];
  readonly openingFileId?: string;
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
  /**
   * The variations actually calculated, as a tree the player built on a board.
   *
   * `DecisionCandidate.line` is one line per candidate, which is what a review
   * of a played game needs. Calculation mode needs branches — "after 1...Rd8 I
   * looked at both 2.Qe2 and 2.g4" — so the tree is stored separately rather
   * than flattened into the candidate list and losing its shape.
   */
  readonly calculation?: readonly CalculationBranch[];
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

/**
 * One branch of what the player calculated, as entered on the board.
 *
 * Recursive on purpose: calculation is a tree, and flattening it to a list of
 * lines loses the thing the player most wants to see afterwards — where their
 * analysis actually forked, and which fork they failed to look at.
 */
export interface CalculationBranch {
  readonly id: string;
  /** The move that starts this branch, from its parent's position. */
  readonly uci: Uci;
  readonly san: San;
  readonly note?: string;
  readonly estimate?: EvaluationEstimate;
  readonly children: readonly CalculationBranch[];
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
  /**
   * When to think about this position again.
   *
   * Reuses `ScheduleState` — the same deterministic scheduler training already
   * runs on (ADR 0011) — rather than inventing a second algorithm that would
   * drift from it. Review and training ask different questions of the same
   * position, so they keep separate schedules, but only one implementation of
   * "when". Absent means the position is not scheduled, which is a legitimate
   * choice and the default.
   */
  readonly schedule?: ScheduleState;
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
  /**
   * Players kept one keystroke away.
   *
   * On the profile for the same reason custom themes are: a favourite has no
   * identity beyond a name, nothing worth a revision, and there are never more
   * of them than a person can read in a list.
   */
  readonly favoritePlayers?: readonly FavoritePlayer[];
  readonly updatedAt: number;
}

export interface FavoritePlayer {
  readonly key: string;
  readonly name: string;
  readonly note?: string;
  readonly addedAt: number;
}

export const EMPTY_PROFILE: UserProfileRecord = {
  id: 'me',
  aliases: [],
  customThemes: [],
  favoritePlayers: [],
  updatedAt: 0,
};

// --- Tournament preparation ------------------------------------------------

/**
 * One opponent, one game, one body of preparation.
 *
 * A professional does not prepare "an opening" — they prepare a specific
 * player, with a specific colour, in a specific round. That framing is the
 * whole value of this record, and it is why the session owns almost no chess
 * data of its own: the opponent's games are already in the collection, the
 * lines are already in a repertoire, the model games are already linked. A
 * session that copied any of that would go stale the moment the underlying
 * work was edited.
 *
 * What it *does* own is the curated part — the sheet the player actually reads
 * on the morning of the game, which by definition cannot be derived.
 */
export interface PreparationSessionRecord {
  readonly id: string;
  readonly title: string;
  /** The opponent's name as typed, and its normalized index key. */
  readonly opponent?: string;
  readonly opponentKey?: string;
  /** The colour the *user* has in the game being prepared for. */
  readonly myColor: Color;
  readonly event?: string;
  readonly round?: string;
  /** ISO `YYYY-MM-DD`, not a timestamp: a round has a date, not a moment. */
  readonly gameDate?: string;
  readonly notes?: string;
  /** References, never copies. */
  readonly repertoireIds: readonly RepertoireId[];
  readonly studyIds: readonly string[];
  readonly openingFileIds: readonly string[];
  readonly modelGameLinkIds: readonly ModelGameLinkId[];
  readonly reviewItemIds: readonly string[];
  /** The curated game-day sheet. Owned, because curation cannot be derived. */
  readonly sheet: readonly PreparationSheetCard[];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly revision: number;
}

/**
 * One position on the game-day sheet.
 *
 * Deliberately not a pointer to a position elsewhere: a sheet card carries the
 * FEN and the line that reaches it so the sheet still reads correctly when it
 * is printed, exported, or opened on a phone in a playing hall with the rest
 * of the database unavailable. Everything else on it is the player's own note.
 */
export interface PreparationSheetCard {
  readonly id: string;
  readonly positionKey: PositionKey;
  readonly fen: Fen;
  /** The move sequence that reaches it, in SAN, for the printed line. */
  readonly line: readonly San[];
  /** Why this card is on the sheet, in the player's words. */
  readonly why?: string;
  /** The move the player intends to play here. */
  readonly intendedSan?: San;
  readonly note?: string;
  /** Where the card came from, so the sheet can say what it is quoting. */
  readonly source?: PreparationCardSource;
  readonly createdAt: number;
}

export type PreparationCardSource =
  'repertoire' | 'explorer' | 'model-game' | 'analysis' | 'review' | 'theory-radar';

export class StalePreparationSessionWriteError extends Error {
  override readonly name = 'StalePreparationSessionWriteError';
  constructor(
    readonly current: PreparationSessionRecord,
    readonly attemptedRevision: number,
  ) {
    super('This preparation session changed in another Kingfisher tab.');
  }
}

// --- Opening files ---------------------------------------------------------

/**
 * A focused body of opening research.
 *
 * Not a study (which is chapters of analysis) and not a repertoire (which is
 * decisions at positions). An opening file is the thing a player actually has
 * in their head — "Black vs 1.e4, Najdorf" — and its job is to gather the
 * repertoire positions, chapters, model games, critical positions and training
 * that already exist for that subject into one place to work from.
 *
 * It stores references and notes. It stores no lines, because every line it
 * would store already lives somewhere with a revision on it.
 */
export interface OpeningFileRecord {
  readonly id: string;
  readonly name: string;
  readonly color: Color;
  /** The opening's root position, when the file has one. */
  readonly positionKey?: PositionKey;
  readonly fen?: Fen;
  readonly eco?: string;
  readonly summary?: string;
  readonly notes?: string;
  readonly repertoireIds: readonly RepertoireId[];
  readonly chapterIds: readonly string[];
  readonly modelGameLinkIds: readonly ModelGameLinkId[];
  readonly trainingItemIds: readonly TrainingItemId[];
  readonly reviewItemIds: readonly string[];
  /** Positions the file is about, with the player's reason for each. */
  readonly positions: readonly OpeningFilePosition[];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly revision: number;
}

export interface OpeningFilePosition {
  readonly positionKey: PositionKey;
  readonly fen: Fen;
  readonly line: readonly San[];
  readonly note?: string;
  readonly addedAt: number;
}

export class StaleOpeningFileWriteError extends Error {
  override readonly name = 'StaleOpeningFileWriteError';
  constructor(
    readonly current: OpeningFileRecord,
    readonly attemptedRevision: number,
  ) {
    super('This opening file changed in another Kingfisher tab.');
  }
}

// --- Endgame library -------------------------------------------------------

/**
 * A saved endgame position, categorised by the player.
 *
 * The category is chosen, never inferred: "fortress" and "technical
 * conversion" are judgements about what a position is *for*, and counting
 * pieces cannot produce them.
 */
export interface EndgamePositionRecord {
  readonly id: string;
  readonly positionKey: PositionKey;
  readonly fen: Fen;
  readonly sideToMove: Color;
  readonly title: string;
  readonly category: EndgameCategory;
  readonly goal: EndgameGoal;
  readonly note?: string;
  readonly tags: readonly string[];
  /** How many pieces are on the board, so tablebase eligibility is a lookup. */
  readonly pieceCount: number;
  readonly source?: string;
  readonly gameId?: string;
  readonly trainingItemId?: TrainingItemId;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly revision: number;
}

export const ENDGAME_CATEGORIES = [
  'rook',
  'queen',
  'minor-piece',
  'pawn',
  'fortress',
  'technical-conversion',
  'defensive-study',
] as const;

export type EndgameCategory = (typeof ENDGAME_CATEGORIES)[number];

export const ENDGAME_CATEGORY_LABEL: Record<EndgameCategory, string> = {
  rook: 'Rook ending',
  queen: 'Queen ending',
  'minor-piece': 'Minor-piece ending',
  pawn: 'Pawn ending',
  fortress: 'Fortress',
  'technical-conversion': 'Technical conversion',
  'defensive-study': 'Defensive study',
};

/** What the player is practising here. Determines how a session is judged. */
export type EndgameGoal = 'convert-win' | 'hold-draw' | 'find-best-move' | 'study';

export const ENDGAME_GOAL_LABEL: Record<EndgameGoal, string> = {
  'convert-win': 'Convert the win',
  'hold-draw': 'Hold the draw',
  'find-best-move': 'Find the tablebase move',
  study: 'Study',
};

export class StaleEndgamePositionWriteError extends Error {
  override readonly name = 'StaleEndgamePositionWriteError';
  constructor(
    readonly current: EndgamePositionRecord,
    readonly attemptedRevision: number,
  ) {
    super('This endgame position changed in another Kingfisher tab.');
  }
}

// --- Pinned engine lines ---------------------------------------------------

/**
 * An engine line promoted from a running search into stored evidence.
 *
 * A search that is still running is a moving number; the moment a player
 * decides a line matters, it has to stop moving. Pinning records the whole
 * provenance — which engine, which build, what settings, how deep, and when —
 * because a PV without those is an assertion rather than evidence.
 */
export interface PinnedLineRecord {
  readonly id: string;
  readonly positionKey: PositionKey;
  readonly fen: Fen;
  readonly chapterId?: string;
  readonly nodeId?: NodeId;
  readonly engineId: string;
  readonly engineName: string;
  readonly engineVersion?: string;
  readonly multiPv: number;
  readonly threads?: number;
  readonly hashMb?: number;
  /** The moves this line was restricted to, when it came from a comparison. */
  readonly searchMoves?: readonly Uci[];
  readonly score: Score;
  readonly depth: number;
  readonly seldepth?: number;
  readonly nodes: number;
  readonly timeMs: number;
  readonly pvUci: readonly Uci[];
  readonly pvSan: readonly San[];
  readonly note?: string;
  readonly createdAt: number;
}

// --- Model game teaching material ------------------------------------------

/**
 * A moment in a model game the player wants to notice again.
 *
 * User-authored, always. Kingfisher can tell you the evaluation changed; it
 * cannot tell you that a move is a typical manoeuvre, and inventing that label
 * would be fabricating instruction.
 */
export interface ModelGameKeyMoment {
  readonly id: string;
  /** The move this moment is about, so guess-the-move can ask about exactly it. */
  readonly nodeId?: NodeId;
  readonly ply: number;
  readonly positionKey: PositionKey;
  readonly fen: Fen;
  readonly kind: KeyMomentKind;
  readonly note?: string;
  /** Ask the player to find the game move here, in guess-the-move mode. */
  readonly guess?: boolean;
  readonly createdAt: number;
}

export const KEY_MOMENT_KINDS = [
  'key-idea',
  'critical-decision',
  'typical-manoeuvre',
  'pawn-break',
  'endgame-transition',
] as const;

export type KeyMomentKind = (typeof KEY_MOMENT_KINDS)[number];

export const KEY_MOMENT_LABEL: Record<KeyMomentKind, string> = {
  'key-idea': 'Key idea',
  'critical-decision': 'Critical decision',
  'typical-manoeuvre': 'Typical manoeuvre',
  'pawn-break': 'Pawn break',
  'endgame-transition': 'Endgame transition',
};

// --- Linked online accounts -------------------------------------------------

export type SyncProvider = 'lichess' | 'chess.com';

export type LinkedAccountId = string;

/**
 * A local link to a Lichess or Chess.com username, for pulling that
 * account's games into the local collection.
 *
 * This is not authentication: the username is public, nothing is verified
 * beyond "this account exists", and no Kingfisher cloud account is
 * involved. Deliberately not merged with any other identity — a database
 * player named the same is not necessarily this account, and this record
 * exists only to remember *what to fetch and from where*, never to imply
 * "these games are definitely the same person" beyond what the user linked.
 */
export interface LinkedAccountRecord {
  readonly id: LinkedAccountId;
  readonly provider: SyncProvider;
  /** As entered; providers are case-insensitive but this is what is shown. */
  readonly username: string;
  readonly createdAt: number;
  readonly lastSyncStartedAt?: number;
  readonly lastSyncCompletedAt?: number;
  readonly lastSyncStatus?: 'success' | 'error';
  readonly lastError?: string;
  /**
   * Lichess: epoch ms of the most recent imported game — the API's own
   * `since` cursor. Chess.com has no equivalent timestamp cursor; its
   * incremental unit is the calendar month, tracked by `lastSyncedMonth`.
   */
  readonly lastGameTimestamp?: number;
  /** Chess.com only: the last `YYYY-MM` archive fully fetched. */
  readonly lastSyncedMonth?: string;
  /** Cumulative across every sync, so "up to date" has a history behind it. */
  readonly importedCount: number;
  readonly duplicatesSkipped: number;
}
