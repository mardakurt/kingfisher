import { describe, expect, it } from 'vitest';

import type { Fen, San, Uci } from '@/chess/types';
import type { RepertoirePositionRecord } from '@/persistence/domain';

import type { OpeningTree, PreparationEdge, PreparationNode } from './index';
import { describeSurprise, findSurprises, type SourceCount } from './surprises';

const fen = (key: string) => `${key} w - -` as Fen;

function position(
  key: string,
  overrides: Partial<RepertoirePositionRecord> = {},
): RepertoirePositionRecord {
  return {
    id: `rp-${key}` as RepertoirePositionRecord['id'],
    repertoireId: 'r1' as RepertoirePositionRecord['repertoireId'],
    positionKey: key,
    fen: fen(key),
    sideToMove: 'w',
    moves: [{ uci: 'e2e4' as Uci, san: 'e4' as San, role: 'main', updatedAt: 1 }],
    depth: 4,
    createdAt: 1,
    updatedAt: 1,
    revision: 1,
    ...overrides,
  };
}

function edge(san: string, uci: string, games: number, resultingKey: string): PreparationEdge {
  return {
    uci: uci as Uci,
    san: san as San,
    games,
    frequency: 0,
    recentGames: 0,
    recentFrequency: 0,
    playerScore: 0,
    resultingKey,
    resultingFen: fen(resultingKey),
  };
}

function tree(nodes: readonly PreparationNode[]): OpeningTree {
  return {
    rootKey: nodes[0]?.positionKey ?? '',
    nodes: new Map(nodes.map((n) => [n.positionKey, n])),
  };
}

const node = (key: string, games: number, edges: readonly PreparationEdge[]): PreparationNode => ({
  positionKey: key,
  fen: fen(key),
  games,
  recentGames: 0,
  edges,
});

describe('findSurprises', () => {
  const rare = (games: number, moveGames: number): SourceCount => ({ games, moveGames });

  it('lists a move they play, you have no answer to, and the source plays rarely', () => {
    const surprises = findSurprises({
      repertoire: [position('p1')],
      opponent: tree([node('p1', 20, [edge('Nh6', 'g8h6', 6, 'after-nh6')])]),
      source: () => rare(4000, 40),
      sourceName: 'Elite OTB',
    });
    expect(surprises).toHaveLength(1);
    expect(surprises[0]).toMatchObject({
      san: 'Nh6',
      theirGames: 6,
      theirTotal: 20,
      sourceGames: 4000,
      sourceName: 'Elite OTB',
    });
    expect(surprises[0]!.sourceShare).toBeCloseTo(0.01);
  });

  it('is silent about a move the repertoire answers — that is preparation, not a surprise', () => {
    const surprises = findSurprises({
      repertoire: [position('p1'), position('after-nh6')],
      opponent: tree([node('p1', 20, [edge('Nh6', 'g8h6', 6, 'after-nh6')])]),
      source: () => rare(4000, 40),
      sourceName: 'Elite OTB',
    });
    expect(surprises).toEqual([]);
  });

  it('is silent about a move everybody plays — that is a gap, and has its own panel', () => {
    const surprises = findSurprises({
      repertoire: [position('p1')],
      opponent: tree([node('p1', 20, [edge('Nf6', 'g8f6', 12, 'after-nf6')])]),
      source: () => rare(4000, 2400),
      sourceName: 'Elite OTB',
    });
    expect(surprises).toEqual([]);
  });

  it('does not treat a position the source has never seen as evidence of rarity', () => {
    const surprises = findSurprises({
      repertoire: [position('p1')],
      opponent: tree([node('p1', 20, [edge('Nh6', 'g8h6', 6, 'after-nh6')])]),
      source: () => null,
      sourceName: 'Elite OTB',
    });
    // Listed, because the repertoire has no answer and they played it — but
    // the share is absent, not zero, and the row says so.
    expect(surprises).toHaveLength(1);
    expect(surprises[0]!.sourceShare).toBeNull();
    expect(surprises[0]!.sourceGames).toBeNull();
    expect(describeSurprise(surprises[0]!)).toContain('Elite OTB has nothing at this position');
  });

  it('treats a position the repertoire only notes as unprepared', () => {
    // A position whose only recorded move is the opponent's expected one: a
    // note about what they do, not an answer to it.
    const noted = position('after-nh6', {
      moves: [
        { uci: 'g8h6' as Uci, san: 'Nh6' as San, role: 'candidate', expected: true, updatedAt: 1 },
      ],
    });
    const surprises = findSurprises({
      repertoire: [position('p1'), noted],
      opponent: tree([node('p1', 20, [edge('Nh6', 'g8h6', 6, 'after-nh6')])]),
      source: () => rare(4000, 40),
      sourceName: 'Elite OTB',
    });
    expect(surprises).toHaveLength(1);
  });

  it('orders by how much of their own play it is, then by rarity, then by depth', () => {
    const surprises = findSurprises({
      repertoire: [position('p1'), position('p2', { depth: 8 })],
      opponent: tree([
        node('p1', 20, [edge('Nh6', 'g8h6', 3, 'x1'), edge('a6', 'a7a6', 9, 'x2')]),
        node('p2', 10, [edge('h5', 'h7h5', 3, 'x3')]),
      ]),
      source: (key: string) => (key === 'p1' ? rare(1000, 10) : rare(1000, 5)),
      sourceName: 'Elite OTB',
    });
    expect(surprises.map((s) => s.san)).toEqual(['a6', 'h5', 'Nh6']);
  });

  it('distinguishes "the source has nothing" from "none of its games played it"', async () => {
    const { describeSource } = await import('./surprises');
    const base = findSurprises({
      repertoire: [position('p1')],
      opponent: tree([node('p1', 20, [edge('Nh6', 'g8h6', 6, 'after-nh6')])]),
      source: () => rare(35_220, 0),
      sourceName: 'Kingfisher Starter Reference',
    })[0]!;
    expect(base.sourceShare).toBe(0);
    expect(describeSource(base)).toBe('none of 35,220 in Kingfisher Starter Reference');
    // Not "0.0%", which reads as "the source was silent".
    expect(describeSource(base)).not.toContain('%');
    expect(describeSource({ ...base, sourceGames: null, sourceShare: null })).toContain(
      'has nothing at this position',
    );
  });

  it('names every denominator in the line it prints', () => {
    const surprises = findSurprises({
      repertoire: [position('p1')],
      opponent: tree([node('p1', 20, [edge('Nh6', 'g8h6', 6, 'after-nh6')])]),
      source: () => rare(4000, 40),
      sourceName: 'Elite OTB',
    });
    expect(describeSurprise(surprises[0]!)).toBe(
      'Nh6: 6 of their 20 games here; 1.0% of 4,000 in Elite OTB.',
    );
  });
});
