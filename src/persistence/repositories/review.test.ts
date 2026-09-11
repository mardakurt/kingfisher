import { describe, expect, it } from 'vitest';

import { START_FEN, positionKey } from '@/chess/fen';
import { asSan, asUci } from '@/chess/types';
import { StaleDecisionWriteError, StaleReviewItemWriteError } from '@/persistence/domain';
import { scanIntegrity } from '@/persistence/integrity';
import { createMemoryRepositories } from '@/persistence/repositories';
import { normalizeThemes } from './review-repository';

const KEY = positionKey(START_FEN);

const aDecision = {
  positionKey: KEY,
  fen: START_FEN,
  sideToMove: 'w' as const,
  chosenUci: asUci('e2e4'),
  chosenSan: asSan('e4'),
  candidates: [
    { uci: asUci('e2e4'), san: asSan('e4'), note: 'main try' },
    { uci: asUci('d2d4'), san: asSan('d4'), line: [asSan('d4'), asSan('d5')] },
  ],
  estimate: { band: 'slightly-white' as const, pawns: 0.3 },
  plan: 'Take the centre and castle short.',
  confidence: 'medium' as const,
};

describe('decision journal', () => {
  it('stores what the player thought, before anything was revealed', async () => {
    const repositories = createMemoryRepositories();
    const decision = await repositories.review.createDecision(aDecision);

    expect(decision.revealedAt).toBeUndefined();
    expect(decision.candidates).toHaveLength(2);
    expect(decision.estimate).toEqual({ band: 'slightly-white', pawns: 0.3 });
    expect(decision.themes).toEqual([]);
    expect(await repositories.review.decisionsForPosition(KEY)).toHaveLength(1);
  });

  it('refuses to rewrite the answers once the evidence has been revealed', async () => {
    const repositories = createMemoryRepositories();
    const decision = await repositories.review.createDecision(aDecision);
    const revealed = await repositories.review.revealDecision(decision.id, decision.revision);
    expect(revealed.revealedAt).toBeGreaterThan(0);

    await expect(
      repositories.review.updateDecision(revealed.id, revealed.revision, {
        ...aDecision,
        plan: 'Actually I always meant to play d4.',
      }),
    ).rejects.toThrow(/already revealed/);

    const stored = await repositories.review.getDecision(decision.id);
    expect(stored?.plan).toBe('Take the centre and castle short.');
  });

  it('keeps the first reveal timestamp when reveal is repeated', async () => {
    const repositories = createMemoryRepositories();
    const decision = await repositories.review.createDecision(aDecision);
    const first = await repositories.review.revealDecision(decision.id, decision.revision, 1_000);
    const second = await repositories.review.revealDecision(first.id, first.revision, 9_999);
    expect(second.revealedAt).toBe(1_000);
  });

  it('still accepts themes and notes after reveal, and nothing else', async () => {
    const repositories = createMemoryRepositories();
    const decision = await repositories.review.createDecision(aDecision);
    const revealed = await repositories.review.revealDecision(decision.id, decision.revision);
    const annotated = await repositories.review.annotateDecision(revealed.id, revealed.revision, {
      themes: ['Trade decision', 'calculation', 'trade-decision'],
      calculationNotes: 'Missed that the rook lift is slow.',
    });

    expect(annotated.themes).toEqual(['trade-decision', 'calculation']);
    expect(annotated.calculationNotes).toBe('Missed that the rook lift is slow.');
    expect(annotated.plan).toBe('Take the centre and castle short.');
    expect(annotated.chosenSan).toBe('e4');
  });

  it('refuses a write from a tab holding an older revision', async () => {
    const repositories = createMemoryRepositories();
    const decision = await repositories.review.createDecision(aDecision);
    await repositories.review.updateDecision(decision.id, decision.revision, {
      ...aDecision,
      plan: 'Changed my mind.',
    });

    await expect(
      repositories.review.updateDecision(decision.id, decision.revision, aDecision),
    ).rejects.toBeInstanceOf(StaleDecisionWriteError);
  });
});

describe('review queue', () => {
  it('does not stack duplicates when the suggester runs again', async () => {
    const repositories = createMemoryRepositories();
    const input = {
      positionKey: KEY,
      fen: START_FEN,
      sideToMove: 'w' as const,
      source: 'suggested' as const,
      gameId: 'game-1',
      nodeId: 'n5',
      reason: 'Engine evaluation changed from +0.4 to -1.1.',
      signals: [{ kind: 'evaluation-swing' as const, detail: '+0.4 → -1.1' }],
    };
    const first = await repositories.review.upsertReviewItem(input);
    const second = await repositories.review.upsertReviewItem({
      ...input,
      reason: 'Engine evaluation changed from +0.4 to -1.6.',
    });

    expect(second.id).toBe(first.id);
    expect(second.reason).toBe('Engine evaluation changed from +0.4 to -1.6.');
    expect(await repositories.review.listReviewItems()).toHaveLength(1);
  });

  it('leaves an entry the player has already dealt with alone', async () => {
    const repositories = createMemoryRepositories();
    const input = {
      positionKey: KEY,
      fen: START_FEN,
      sideToMove: 'w' as const,
      source: 'suggested' as const,
      gameId: 'game-1',
      nodeId: 'n5',
      reason: 'first reason',
    };
    const item = await repositories.review.upsertReviewItem(input);
    const ignored = await repositories.review.updateReviewItem(item.id, item.revision, {
      status: 'ignored',
    });

    const again = await repositories.review.upsertReviewItem({ ...input, reason: 'new reason' });
    expect(again.status).toBe('ignored');
    expect(again.reason).toBe('first reason');
    expect(again.revision).toBe(ignored.revision);
  });

  it('separates entries for the same position in different games when source is suggested', async () => {
    const repositories = createMemoryRepositories();
    const base = {
      positionKey: KEY,
      fen: START_FEN,
      sideToMove: 'w' as const,
      source: 'suggested' as const,
    };
    await repositories.review.upsertReviewItem({ ...base, gameId: 'a', nodeId: 'n1' });
    await repositories.review.upsertReviewItem({ ...base, gameId: 'b', nodeId: 'n1' });
    expect(await repositories.review.listReviewItems()).toHaveLength(2);
  });

  it('merges "marked" entries for the same position across games into one item with multiple occurrences', async () => {
    /* Phase 41: a marked review is one work item per
       canonical position. The same position reached through
       different move orders maps to the same record, with
       each occurrence kept on the record. */
    const repositories = createMemoryRepositories();
    const base = {
      positionKey: KEY,
      fen: START_FEN,
      sideToMove: 'w' as const,
      source: 'marked' as const,
    };
    const first = await repositories.review.upsertReviewItem({
      ...base,
      gameId: 'a',
      nodeId: 'n1',
      ply: 1,
    });
    const second = await repositories.review.upsertReviewItem({
      ...base,
      gameId: 'b',
      nodeId: 'm3',
      ply: 5,
      gameLabel: 'Game B',
    });
    expect(second.id).toBe(first.id);
    const stored = await repositories.review.getReviewItem(first.id);
    expect(stored).not.toBeNull();
    expect(stored?.markedFromGames).toHaveLength(2);
    const games = (stored?.markedFromGames ?? []).map((occ) => occ.gameId).sort();
    expect(games).toEqual(['a', 'b']);
    expect(await repositories.review.listReviewItems()).toHaveLength(1);
  });

  it('does not duplicate the same game occurrence on re-mark', async () => {
    const repositories = createMemoryRepositories();
    const base = {
      positionKey: KEY,
      fen: START_FEN,
      sideToMove: 'w' as const,
      source: 'marked' as const,
      gameId: 'a',
      nodeId: 'n1',
    };
    await repositories.review.upsertReviewItem(base);
    await repositories.review.upsertReviewItem({ ...base, reason: 'now with a note' });
    const stored = (await repositories.review.listReviewItems())[0];
    expect(stored?.markedFromGames).toHaveLength(1);
    expect(stored?.reason).toBe('now with a note');
  });

  it('stamps the review time once, on the first status that is not unreviewed', async () => {
    const repositories = createMemoryRepositories();
    const item = await repositories.review.upsertReviewItem({
      positionKey: KEY,
      fen: START_FEN,
      sideToMove: 'w',
      source: 'marked',
      category: 'calculation',
    });
    expect(item.reviewedAt).toBeUndefined();

    const reviewed = await repositories.review.updateReviewItem(item.id, item.revision, {
      status: 'reviewed',
      themes: ['calculation'],
    });
    expect(reviewed.reviewedAt).toBeGreaterThan(0);

    const converted = await repositories.review.updateReviewItem(reviewed.id, reviewed.revision, {
      status: 'converted',
    });
    expect(converted.reviewedAt).toBe(reviewed.reviewedAt);
  });

  it('persists strategic context when the suggester provides it', async () => {
    const repositories = createMemoryRepositories();
    const transitions = [
      {
        id: 'passed-pawn:w:d',
        kind: 'passed-pawn' as const,
        color: 'w' as const,
        statement: 'White creates a passed pawn on the d-file.',
      },
      {
        id: 'bishop-pair:b',
        kind: 'bishop-pair' as const,
        color: 'b' as const,
        statement: 'Black gives up the bishop pair.',
      },
    ];
    const item = await repositories.review.upsertReviewItem({
      positionKey: KEY,
      fen: START_FEN,
      sideToMove: 'w',
      source: 'suggested',
      strategicContext: transitions,
    });
    expect(item.strategicContext).toEqual(transitions);

    /*
      A re-suggest that does not supply transitions must not wipe the
      previously stored ones — they belong to the position, not to the
      call that last wrote them.
    */
    const refreshed = await repositories.review.upsertReviewItem({
      positionKey: KEY,
      fen: START_FEN,
      sideToMove: 'w',
      source: 'suggested',
    });
    expect(refreshed.strategicContext).toEqual(transitions);
  });

  it('omits strategic context when the input list is empty', async () => {
    const repositories = createMemoryRepositories();
    const item = await repositories.review.upsertReviewItem({
      positionKey: KEY,
      fen: START_FEN,
      sideToMove: 'w',
      source: 'suggested',
      strategicContext: [],
    });
    expect(item.strategicContext).toBeUndefined();
  });

  it('filters by status through the index', async () => {
    const repositories = createMemoryRepositories();
    const one = await repositories.review.upsertReviewItem({
      positionKey: KEY,
      fen: START_FEN,
      sideToMove: 'w',
      source: 'suggested',
      gameId: 'a',
      nodeId: 'n1',
    });
    await repositories.review.upsertReviewItem({
      positionKey: KEY,
      fen: START_FEN,
      sideToMove: 'w',
      source: 'suggested',
      gameId: 'b',
      nodeId: 'n2',
    });
    await repositories.review.updateReviewItem(one.id, one.revision, { status: 'reviewed' });

    expect(await repositories.review.listReviewItems('unreviewed')).toHaveLength(1);
    expect(await repositories.review.listReviewItems('reviewed')).toHaveLength(1);
  });

  it('refuses a stale write', async () => {
    const repositories = createMemoryRepositories();
    const item = await repositories.review.upsertReviewItem({
      positionKey: KEY,
      fen: START_FEN,
      sideToMove: 'w',
      source: 'marked',
    });
    await repositories.review.updateReviewItem(item.id, item.revision, { status: 'reviewed' });
    await expect(
      repositories.review.updateReviewItem(item.id, item.revision, { status: 'ignored' }),
    ).rejects.toBeInstanceOf(StaleReviewItemWriteError);
  });
});

describe('theme normalisation', () => {
  it('slugs, trims, de-duplicates and keeps the order the player chose', () => {
    expect(normalizeThemes(['  Trade decision ', 'Calculation', 'trade-decision', ''])).toEqual([
      'trade-decision',
      'calculation',
    ]);
  });
});

describe('integrity of the review stores', () => {
  it('reports a queue entry whose game is gone, and keeps the decision', async () => {
    const repositories = createMemoryRepositories();
    await repositories.review.upsertReviewItem({
      positionKey: KEY,
      fen: START_FEN,
      sideToMove: 'w',
      source: 'suggested',
      gameId: 'game-that-never-existed',
      nodeId: 'n3',
    });
    await repositories.review.createDecision({ ...aDecision, gameId: 'game-that-never-existed' });

    const report = await scanIntegrity(repositories.raw);
    const titles = report.issues.map((issue) => issue.title);
    expect(titles).toContain('Review queue entries with a missing source');
    expect(titles).toContain('Decision records pointing at deleted games');

    const decisionIssue = report.issues.find(
      (issue) => issue.title === 'Decision records pointing at deleted games',
    );
    // The thinking is not the pointer, so nothing about it is repairable.
    expect(decisionIssue?.repairable).toBe(false);
    expect(report.counts.decisions).toBe(1);
    expect(report.counts.reviewItems).toBe(1);
  });
});
