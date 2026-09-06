/**
 * Reviewing a repertoire, one position at a time.
 *
 * Kingfisher could already drill a position: you stood on one, opened the
 * dialog, and made a card. What it could not do is the thing a prepared player
 * actually wants, which is to take a repertoire with four hundred positions in
 * it and ask "what have I forgotten?" — because building four hundred cards by
 * hand is not a workflow, it is a reason not to.
 *
 * This turns a repertoire into that queue. It is deliberately not a second
 * spaced-repetition system: the scheduling is `src/training/schedule.ts`, the
 * same SM-2 derivative ADR 0011 chose for being explainable, and every prompt
 * reports the interval, the last review and the next due date it came with.
 * A repertoire review and a tactics card compete in the same queue on the same
 * terms.
 *
 * ## Transpositions
 *
 * **A position is one prompt, however many move orders reach it.** A
 * repertoire that answers 1.d4 Nf6 2.c4 e6 3.Nf3 and 1.Nf3 Nf6 2.c4 e6 3.d4
 * has arrived at the same position twice and must not ask about it twice: the
 * player would answer the same question in the same session, and the scheduler
 * would count one memory as two.
 *
 * Most of that is inherited rather than established here. ADR 0010 made a
 * repertoire a map from positions to moves rather than a tree of move
 * sequences, so two move orders are already one record. What this module has
 * to get right is the two places the guarantee could still be lost: collapsing
 * records if it is ever handed positions from more than one repertoire, and
 * *training cards*, where nothing stops two cards existing for the same
 * position — one made from a game, one from a study. A position with two cards
 * reviews on the sooner of them, so a due card cannot hide behind a distant
 * one. The tests assert the end-to-end property rather than trusting the
 * storage layer to keep holding it.
 *
 * ## Choosing what to ask
 *
 * Every prompt carries the reasons it was chosen, each with a number and a
 * denominator, in the same style as `src/theory/critical-branches.ts` and for
 * the same reason: a queue ordered by an invisible score is a queue a player
 * cannot argue with. There is no "importance 92" here and there is not going
 * to be one.
 */

import type {
  RepertoireMove,
  RepertoirePositionRecord,
  ScheduleState,
  TrainingItemRecord,
} from '@/persistence/domain';
import { DAY_MS, isDue, newSchedule, stageOf } from '@/training/schedule';

/**
 * Which positions a session asks about.
 *
 * `my-move` and `opponent-reply` are the two halves of a repertoire and are
 * genuinely different exercises: one is "what do I play here", the other is
 * "what is he going to play, and am I ready for it". `critical` is the
 * positions where the repertoire itself records more than one answer, which is
 * where a player is most likely to have forgotten which one they settled on.
 */
export type DrillMode = 'my-move' | 'opponent-reply' | 'full-branch' | 'critical';

/** Why a position is in this session. Each is a fact with its denominator. */
export type PromptReason =
  | { readonly kind: 'new' }
  | { readonly kind: 'due'; readonly overdueDays: number }
  | { readonly kind: 'lapsed'; readonly lapses: number; readonly reviews: number }
  | {
      readonly kind: 'population';
      readonly source: string;
      readonly games: number;
      readonly total: number;
      readonly share: number;
    }
  | { readonly kind: 'opponent'; readonly player: string; readonly games: number }
  | { readonly kind: 'branching'; readonly answers: number };

export interface RepertoirePrompt {
  /** The card's identity. One per position, whatever reached it. */
  readonly positionKey: string;
  readonly fen: string;
  readonly sideToMove: 'w' | 'b';
  /** Plies from the repertoire's start, by the shortest route that reaches it. */
  readonly depth: number;
  /** The moves the repertoire records here. Any of them is a correct answer. */
  readonly solutionUci: readonly string[];
  readonly solutionSan: readonly string[];
  /** The existing card's schedule, or a fresh one for a position never drilled. */
  readonly schedule: ScheduleState;
  /** True when this position has never been drilled before. */
  readonly unseen: boolean;
  readonly reasons: readonly PromptReason[];
}

export interface SessionInput {
  readonly positions: readonly RepertoirePositionRecord[];
  /** Whose repertoire this is. `my-move` asks about positions this side moves in. */
  readonly colour: 'w' | 'b';
  /** Existing training cards, so a drilled position keeps its schedule. */
  readonly existingItems?: readonly TrainingItemRecord[];
  /**
   * How often each position is reached in a named population, for ordering.
   * Keyed by position key.
   */
  readonly population?: {
    readonly source: string;
    readonly games: ReadonlyMap<string, { readonly games: number; readonly total: number }>;
  };
  /** What one opponent has actually played, keyed by position key. */
  readonly opponent?: {
    readonly name: string;
    readonly games: ReadonlyMap<string, number>;
  };
}

export interface SessionOptions {
  readonly mode?: DrillMode;
  /** Only positions whose card is due. A session's default is everything. */
  readonly dueOnly?: boolean;
  readonly limit?: number;
  readonly now?: number;
}

/**
 * How much each kind of reason counts towards the order.
 *
 * Internal, never rendered, and coarse on purpose — exactly as in
 * `critical-branches.ts`. It exists because ordering a list requires something
 * comparable, not because a prompt has a score, and `reasons` is complete
 * without it.
 */
const WEIGHT: Record<PromptReason['kind'], number> = {
  lapsed: 4,
  due: 3,
  opponent: 3,
  population: 2,
  branching: 1,
  new: 1,
};

/** The moves the player intends to play, as opposed to replies they expect. */
const ownMoves = (moves: readonly RepertoireMove[]): readonly RepertoireMove[] =>
  moves.filter((move) => move.expected !== true);

const answersFor = (
  position: RepertoirePositionRecord,
  mode: DrillMode,
  colour: 'w' | 'b',
): readonly RepertoireMove[] => {
  const mine = position.sideToMove === colour;
  switch (mode) {
    case 'my-move':
      return mine ? ownMoves(position.moves) : [];
    case 'opponent-reply':
      return mine ? [] : position.moves;
    case 'critical':
      // More than one recorded answer: the positions where the player has to
      // remember which of their own options they settled on.
      return position.moves.length > 1 ? position.moves : [];
    case 'full-branch':
      return position.moves;
  }
};

/**
 * Build a review session from a repertoire.
 *
 * Positions are collapsed by `positionKey` before anything else happens, so a
 * repertoire that reaches the same position by two move orders produces one
 * prompt. The surviving record is the shallowest — the shortest route to the
 * position is the one a player thinks of it by — and its answers are the union
 * of every route's, because a move recorded on one path is still a move the
 * repertoire plays in that position.
 */
export function buildReviewSession(
  input: SessionInput,
  options: SessionOptions = {},
): readonly RepertoirePrompt[] {
  const mode = options.mode ?? 'my-move';
  const now = options.now ?? Date.now();
  const limit = options.limit ?? 40;

  const byKey = new Map<string, RepertoirePositionRecord>();
  const answers = new Map<string, Map<string, RepertoireMove>>();

  for (const position of input.positions) {
    const selected = answersFor(position, mode, input.colour);
    if (selected.length === 0) continue;

    const held = byKey.get(position.positionKey);
    // The shallowest route wins the record; every route contributes answers.
    if (!held || position.depth < held.depth) byKey.set(position.positionKey, position);
    const moves = answers.get(position.positionKey) ?? new Map<string, RepertoireMove>();
    for (const move of selected) moves.set(move.uci, move);
    answers.set(position.positionKey, moves);
  }

  const schedules = new Map<string, TrainingItemRecord>();
  for (const item of input.existingItems ?? []) {
    const held = schedules.get(item.positionKey);
    // A position drilled by more than one card reviews on the soonest of them:
    // the queue must not be able to hide a due card behind a distant one.
    if (!held || item.schedule.dueAt < held.schedule.dueAt) {
      schedules.set(item.positionKey, item);
    }
  }

  const prompts: { prompt: RepertoirePrompt; order: number }[] = [];

  for (const [key, position] of byKey) {
    const moves = [...(answers.get(key)?.values() ?? [])];
    if (moves.length === 0) continue;

    const existing = schedules.get(key);
    const schedule = existing?.schedule ?? newSchedule(now);
    const unseen = !existing || schedule.reviewCount === 0;
    if (options.dueOnly && !isDue(schedule, now)) continue;

    const reasons: PromptReason[] = [];
    if (unseen) {
      reasons.push({ kind: 'new' });
    } else if (isDue(schedule, now)) {
      reasons.push({
        kind: 'due',
        overdueDays: Math.max(0, Math.floor((now - schedule.dueAt) / DAY_MS)),
      });
    }
    if (schedule.lapses > 0) {
      reasons.push({
        kind: 'lapsed',
        lapses: schedule.lapses,
        reviews: schedule.reviewCount,
      });
    }

    const reached = input.population?.games.get(key);
    if (input.population && reached && reached.total > 0) {
      reasons.push({
        kind: 'population',
        source: input.population.source,
        games: reached.games,
        total: reached.total,
        share: reached.games / reached.total,
      });
    }

    const played = input.opponent?.games.get(key);
    if (input.opponent && played !== undefined && played > 0) {
      reasons.push({ kind: 'opponent', player: input.opponent.name, games: played });
    }

    if (moves.length > 1) reasons.push({ kind: 'branching', answers: moves.length });

    const order = reasons.reduce((sum, reason) => {
      const magnitude =
        reason.kind === 'population'
          ? reason.share
          : reason.kind === 'due'
            ? Math.min(1, reason.overdueDays / 30)
            : reason.kind === 'lapsed'
              ? Math.min(1, reason.lapses / 3)
              : reason.kind === 'opponent'
                ? 1
                : 0.25;
      return sum + WEIGHT[reason.kind] * magnitude;
    }, 0);

    prompts.push({
      prompt: {
        positionKey: key,
        fen: position.fen,
        sideToMove: position.sideToMove,
        depth: position.depth,
        solutionUci: moves.map((move) => move.uci),
        solutionSan: moves.map((move) => move.san),
        schedule,
        unseen,
        reasons,
      },
      order,
    });
  }

  return prompts
    .sort(
      (a, b) =>
        b.order - a.order ||
        a.prompt.depth - b.prompt.depth ||
        a.prompt.positionKey.localeCompare(b.prompt.positionKey),
    )
    .slice(0, limit)
    .map((entry) => entry.prompt);
}

const count = (value: number): string => value.toLocaleString('en-GB');
const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

/** One reason, as a reader should see it. Denominators survive. */
export function describePromptReason(reason: PromptReason): string {
  switch (reason.kind) {
    case 'new':
      return 'never drilled';
    case 'due':
      return reason.overdueDays === 0
        ? 'due today'
        : `${count(reason.overdueDays)} ${reason.overdueDays === 1 ? 'day' : 'days'} overdue`;
    case 'lapsed':
      return `answered wrongly ${count(reason.lapses)} of ${count(reason.reviews)} times`;
    case 'population':
      return `reached in ${percent(reason.share)} of ${reason.source} (${count(
        reason.games,
      )} of ${count(reason.total)})`;
    case 'opponent':
      return `${reason.player} reached it ${count(reason.games)} times`;
    case 'branching':
      return `${count(reason.answers)} answers recorded here`;
  }
}

export interface SessionSummary {
  readonly prompts: number;
  readonly unseen: number;
  readonly due: number;
  /** Positions the repertoire holds that this mode does not ask about. */
  readonly outsideMode: number;
  /** Distinct positions, against records — the transpositions collapsed. */
  readonly transpositions: number;
}

/**
 * What a session covers, and what it leaves out.
 *
 * `transpositions` is the number of repertoire records that turned out to be
 * the same position as another. It is reported rather than hidden because it
 * is the number that tells a player their repertoire is a graph and not a
 * tree, and because a sudden change in it means something moved.
 */
export function summariseSession(
  input: SessionInput,
  prompts: readonly RepertoirePrompt[],
  options: SessionOptions = {},
): SessionSummary {
  const now = options.now ?? Date.now();
  const mode = options.mode ?? 'my-move';
  const inMode = input.positions.filter(
    (position) => answersFor(position, mode, input.colour).length > 0,
  );
  const distinct = new Set(inMode.map((position) => position.positionKey));
  return {
    prompts: prompts.length,
    unseen: prompts.filter((prompt) => prompt.unseen).length,
    due: prompts.filter((prompt) => isDue(prompt.schedule, now)).length,
    outsideMode: input.positions.length - inMode.length,
    transpositions: inMode.length - distinct.size,
  };
}

/** The scheduling facts a prompt should show, in the vocabulary the queue uses. */
export function promptStatus(
  prompt: RepertoirePrompt,
  now: number,
): {
  readonly stage: ReturnType<typeof stageOf>;
  readonly lastReviewedAt: number | null;
  readonly nextDueAt: number;
  readonly intervalDays: number;
  readonly due: boolean;
} {
  return {
    stage: stageOf(prompt.schedule),
    lastReviewedAt: prompt.schedule.lastReviewedAt,
    nextDueAt: prompt.schedule.dueAt,
    intervalDays: prompt.schedule.intervalDays,
    due: isDue(prompt.schedule, now),
  };
}
