/**
 * Turning a review session into cards the training queue already understands.
 *
 * `review.ts` decides *what* to ask about. This is the other half: putting
 * those prompts somewhere a player can actually answer them.
 *
 * The whole design is that there is nowhere new. Phase 18's brief is explicit
 * that repertoire review must not create another isolated data model or a
 * second scheduler, so a repertoire prompt becomes an ordinary
 * `TrainingItemRecord` in `repertoire-recall` mode. It then appears in the
 * training queue beside every other card, is graded by the same buttons,
 * schedules on the same SM-2 derivative, and is counted by the same
 * `countQueue`. Nothing here re-implements any of that; the only thing this
 * file knows how to do is decide which prompts do not have a card yet.
 *
 * ## The rule that makes it correct
 *
 * **One card per position.** Not one per repertoire, not one per move order,
 * not one per enrolment. A player who runs this twice must get the same queue
 * the second time, and a position reached by two move orders must not become
 * two cards that ask the same question and count as two memories.
 *
 * `positionKey` is the identity, as everywhere else in Kingfisher. Existing
 * cards are checked by it whatever created them — a card made by hand from the
 * board, or from a study, is still a card for that position, and enrolling
 * must not shadow it with a second one.
 */

import type { TrainingItemRecord } from '@/persistence/domain';

import { describePromptReason, type RepertoirePrompt } from './review';
import { reviewCardKey } from './review-card';

/** What `enrolPrompts` decided, before anything is written. */
export interface EnrolmentPlan {
  /** Prompts that need a card creating. */
  readonly toCreate: readonly RepertoirePrompt[];
  /**
   * Prompts a card already covers, and the card covering each.
   *
   * Reported rather than dropped: "forty of these are already in your queue"
   * is the answer to "why did enrolling add so few", and a player who cannot
   * see it will assume it failed.
   */
  readonly alreadyCovered: readonly {
    readonly prompt: RepertoirePrompt;
    readonly item: TrainingItemRecord;
  }[];
}

/**
 * Decide which prompts need cards. Writes nothing.
 *
 * Separated from the writing so the rule can be tested without a database,
 * and so a caller can show the plan before committing to it.
 */
export function planEnrolment(
  prompts: readonly RepertoirePrompt[],
  existing: readonly TrainingItemRecord[],
): EnrolmentPlan {
  const byPosition = new Map<string, TrainingItemRecord>();
  for (const item of existing) {
    if (item.mode !== 'repertoire-recall') continue;
    const key = reviewCardKey(item.positionKey, item.solutionUci);
    const held = byPosition.get(key);
    // The oldest card wins when there are several, so the answer to "which
    // card covers this position" does not change between two enrolments.
    if (
      !held ||
      item.schedule.dueAt < held.schedule.dueAt ||
      (item.schedule.dueAt === held.schedule.dueAt && item.createdAt < held.createdAt)
    )
      byPosition.set(key, item);
  }

  const toCreate: RepertoirePrompt[] = [];
  const alreadyCovered: { prompt: RepertoirePrompt; item: TrainingItemRecord }[] = [];
  const claimed = new Set<string>();

  for (const prompt of prompts) {
    const item = byPosition.get(reviewCardKey(prompt.positionKey, prompt.solutionUci));
    if (item) {
      alreadyCovered.push({ prompt, item });
      continue;
    }
    // A session should not contain the same position twice — `review.ts`
    // collapses them — but enrolment is what writes, so it checks rather than
    // trusts.
    if (claimed.has(prompt.positionKey)) continue;
    claimed.add(prompt.positionKey);
    toCreate.push(prompt);
  }

  return { toCreate, alreadyCovered };
}

/** What a card made from a repertoire prompt looks like. */
export interface RepertoireCardInput {
  readonly mode: 'repertoire-recall';
  readonly positionKey: string;
  readonly fen: string;
  readonly sideToMove: 'w' | 'b';
  readonly prompt: string;
  readonly solutionUci: readonly string[];
  readonly solutionSan: readonly string[];
  readonly candidatesUci: readonly string[];
  readonly plans: readonly never[];
  readonly explanation: string;
  readonly tags: readonly string[];
  readonly source: { readonly kind: 'repertoire'; readonly id: string; readonly label: string };
}

/**
 * One card, from one prompt.
 *
 * The explanation carries the reasons the prompt was selected, in the same
 * words the review panel would show — so a card answered three weeks later
 * still says why it was worth asking, and the player can disagree with it.
 * A card that arrived with no explanation of itself is a card that reads as
 * arbitrary.
 */
export function cardFor(
  prompt: RepertoirePrompt,
  repertoire: { readonly id: string; readonly name: string },
): RepertoireCardInput {
  const side = prompt.sideToMove === 'w' ? 'White' : 'Black';
  return {
    mode: 'repertoire-recall',
    positionKey: prompt.positionKey,
    fen: prompt.fen,
    sideToMove: prompt.sideToMove,
    prompt: `${side} to play. What does ${repertoire.name} play here?`,
    solutionUci: prompt.solutionUci,
    solutionSan: prompt.solutionSan,
    // Every recorded answer is accepted, so there is no separate candidate
    // list to keep: a repertoire that records two moves accepts either.
    candidatesUci: [],
    plans: [],
    explanation: prompt.reasons.map(describePromptReason).join(' · '),
    tags: ['repertoire'],
    source: { kind: 'repertoire', id: repertoire.id, label: repertoire.name },
  };
}
