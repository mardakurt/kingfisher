/**
 * Enrolling a repertoire into the training queue.
 *
 * One claim carries this and it is asserted several ways: **one card per
 * position**. Running it twice must not double the queue, a position reached
 * by two move orders must not become two cards, and a card that already exists
 * for a position — made by hand, or from a study — must be left alone rather
 * than shadowed.
 *
 * The second claim is that nothing new is invented to hold any of it: the card
 * is an ordinary training item in `repertoire-recall` mode.
 */

import { describe, expect, it } from 'vitest';

import type { TrainingItemRecord } from '@/persistence/domain';
import { DAY_MS, newSchedule } from '@/training/schedule';

import { cardFor, planEnrolment } from './enrol';
import type { RepertoirePrompt } from './review';

const NOW = 1_700_000_000_000;

const prompt = (positionKey: string, over: Partial<RepertoirePrompt> = {}): RepertoirePrompt => ({
  positionKey,
  fen: `${positionKey} 0 1`,
  sideToMove: 'w',
  depth: 4,
  solutionUci: ['d2d4'],
  solutionSan: ['d4'],
  schedule: newSchedule(NOW),
  unseen: true,
  reasons: [{ kind: 'new' }],
  ...over,
});

const card = (positionKey: string, over: Partial<TrainingItemRecord> = {}): TrainingItemRecord =>
  ({
    id: `item-${positionKey}-${over.createdAt ?? NOW}`,
    mode: 'repertoire-recall',
    positionKey,
    fen: `${positionKey} 0 1`,
    sideToMove: 'w',
    prompt: 'Play your move',
    solutionUci: ['d2d4'],
    solutionSan: ['d4'],
    candidatesUci: [],
    plans: [],
    tags: [],
    schedule: over.schedule ?? newSchedule(NOW),
    createdAt: over.createdAt ?? NOW,
    updatedAt: NOW,
    revision: 1,
    ...over,
  }) as unknown as TrainingItemRecord;

describe('deciding which prompts need a card', () => {
  it('creates one for every position with none', () => {
    const plan = planEnrolment([prompt('a'), prompt('b')], []);
    expect(plan.toCreate.map((entry) => entry.positionKey)).toEqual(['a', 'b']);
    expect(plan.alreadyCovered).toEqual([]);
  });

  it('adds nothing the second time', () => {
    // Running it twice must not double the queue. This is the whole feature
    // failing if it does.
    const prompts = [prompt('a'), prompt('b')];
    const first = planEnrolment(prompts, []);
    const created = first.toCreate.map((entry) => card(entry.positionKey));
    const second = planEnrolment(prompts, created);
    expect(second.toCreate).toEqual([]);
    expect(second.alreadyCovered).toHaveLength(2);
  });

  it('leaves alone a card that already covers a position, whatever made it', () => {
    /*
      A card made by hand from the board, or from a study, is still a card for
      that position. Enrolling must not shadow it with a second one that asks
      the same question and schedules separately.
    */
    const existing = card('a', { schedule: { ...newSchedule(NOW), reviewCount: 9, streak: 6 } });
    const plan = planEnrolment([prompt('a'), prompt('b')], [existing]);
    expect(plan.toCreate.map((entry) => entry.positionKey)).toEqual(['b']);
    expect(plan.alreadyCovered[0]?.item).toBe(existing);
  });

  it('reports what was already covered rather than dropping it', () => {
    // "Forty of these are already in your queue" is the answer to "why did
    // enrolling add so few". A player who cannot see it assumes it failed.
    const plan = planEnrolment([prompt('a')], [card('a')]);
    expect(plan.alreadyCovered).toHaveLength(1);
    expect(plan.alreadyCovered[0]?.prompt.positionKey).toBe('a');
  });

  it('creates one card for a position that appears twice in the session', () => {
    // `review.ts` collapses transpositions, but enrolment is what writes, so
    // it checks rather than trusts.
    const plan = planEnrolment([prompt('a'), prompt('a')], []);
    expect(plan.toCreate).toHaveLength(1);
  });

  it('picks the same existing card every time when a position has several', () => {
    /*
      Two cards for one position is a state the queue allows. Which one
      "covers" the position must not depend on the order they came back in, or
      two enrolments a minute apart would report different things.
    */
    const older = card('a', { createdAt: NOW - 10 * DAY_MS });
    const newer = card('a', { createdAt: NOW });
    expect(planEnrolment([prompt('a')], [older, newer]).alreadyCovered[0]?.item).toBe(older);
    expect(planEnrolment([prompt('a')], [newer, older]).alreadyCovered[0]?.item).toBe(older);
  });
});

describe('the card a prompt becomes', () => {
  it('does not treat another exercise at the same position as repertoire recall', () => {
    expect(planEnrolment([prompt('a')], [card('a', { mode: 'plan' })]).toCreate).toHaveLength(1);
  });
  it('does not reuse a card whose accepted repertoire answers changed', () => {
    expect(
      planEnrolment([prompt('a', { solutionUci: ['e2e4'] })], [card('a')]).toCreate,
    ).toHaveLength(1);
  });
  const repertoire = { id: 'rep-1', name: 'Black vs 1.e4' };

  it('is an ordinary training item, not a new kind of thing', () => {
    const made = cardFor(prompt('a'), repertoire);
    expect(made.mode).toBe('repertoire-recall');
    expect(made.source).toEqual({ kind: 'repertoire', id: 'rep-1', label: 'Black vs 1.e4' });
  });

  it('accepts every move the repertoire records here', () => {
    const made = cardFor(
      prompt('a', { solutionUci: ['d2d4', 'g1f3'], solutionSan: ['d4', 'Nf3'] }),
      repertoire,
    );
    expect(made.solutionUci).toEqual(['d2d4', 'g1f3']);
    expect(made.solutionSan).toEqual(['d4', 'Nf3']);
  });

  it('names the repertoire in the question, so the card is answerable alone', () => {
    // Three weeks later the card is all the player sees. "What do you play
    // here" has no answer without knowing which repertoire is being asked about.
    expect(cardFor(prompt('a'), repertoire).prompt).toBe(
      'White to play. What does Black vs 1.e4 play here?',
    );
    expect(cardFor(prompt('a', { sideToMove: 'b' }), repertoire).prompt).toContain('Black to play');
  });

  it('carries the reasons it was selected, in the words a reader would see', () => {
    const made = cardFor(
      prompt('a', {
        reasons: [
          { kind: 'due', overdueDays: 4 },
          { kind: 'population', source: 'Elite OTB', games: 120, total: 960, share: 0.125 },
        ],
      }),
      repertoire,
    );
    expect(made.explanation).toBe('4 days overdue · reached in 12.5% of Elite OTB (120 of 960)');
  });
});
