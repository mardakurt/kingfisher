/**
 * The branch ranking has one job that a test can actually hold it to: every
 * position it takes is traceable to a fact with a denominator, and the order
 * follows from those facts rather than from a number nobody can see.
 *
 * So these tests assert on `reasons` — the thing a reader gets — and only
 * assert on order where the order is the claim.
 */

import { describe, expect, it } from 'vitest';

import type { DatabaseMove, ExplorerResult } from '../database/types';

import {
  type BranchPopulation,
  type BranchReason,
  criticalBranches,
  describeReason,
} from './critical-branches';

const move = (san: string, uci: string, games: number): DatabaseMove => ({
  uci: uci as DatabaseMove['uci'],
  san: san as DatabaseMove['san'],
  games,
  white: Math.round(games * 0.36),
  draws: Math.round(games * 0.4),
  black: games - Math.round(games * 0.36) - Math.round(games * 0.4),
});

const population = (
  id: string,
  name: string,
  role: BranchPopulation['role'],
  moves: readonly DatabaseMove[],
): BranchPopulation => {
  const totalGames = moves.reduce((sum, entry) => sum + entry.games, 0);
  const result: ExplorerResult = {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' as ExplorerResult['fen'],
    source: { id, name },
    totalGames,
    white: Math.round(totalGames * 0.36),
    draws: Math.round(totalGames * 0.4),
    black: totalGames - Math.round(totalGames * 0.36) - Math.round(totalGames * 0.4),
    moves,
  };
  return { id, name, role, result };
};

const ELITE = population('elite', 'Elite OTB', 'reference', [
  move('Be7', 'f8e7', 3000),
  move('Nf6', 'g8f6', 5000),
  move('a6', 'a7a6', 1500),
  move('h6', 'h7h6', 400),
  move('Rb8', 'a8b8', 20),
]);

const reasonKinds = (reasons: readonly BranchReason[]) => reasons.map((reason) => reason.kind);

/** The reason of one kind, or a failure naming the kinds that were there. */
function reasonOf<K extends BranchReason['kind']>(
  reasons: readonly BranchReason[],
  kind: K,
): Extract<BranchReason, { kind: K }> {
  const found = reasons.find((reason) => reason.kind === kind);
  if (!found) throw new Error(`no ${kind} reason; found ${reasonKinds(reasons).join(', ')}`);
  return found as Extract<BranchReason, { kind: K }>;
}
const branch = <T extends { san: string }>(rows: readonly T[], san: string): T | undefined =>
  rows.find((row) => row.san === san);

describe('choosing which branches are worth listing', () => {
  it('names the population behind every frequency, with its denominator', () => {
    const rows = criticalBranches({ populations: [ELITE] });
    const nf6 = branch(rows, 'Nf6')!;
    expect(nf6.reasons).toContainEqual({
      kind: 'frequency',
      source: 'Elite OTB',
      games: 5000,
      total: 9920,
      share: 5000 / 9920,
    });
  });

  it('leaves out a move too rare to be a branch of the opening', () => {
    // Rb8 is 20 games in 9,920 — 0.2%, under the 3% floor. A report that
    // listed it would bury the theory under one-offs.
    const rows = criticalBranches({ populations: [ELITE] });
    expect(branch(rows, 'Rb8')).toBeUndefined();
    expect(branch(rows, 'a6')).toBeDefined();
  });

  it('returns nothing when there is no reference population to count against', () => {
    expect(criticalBranches({ populations: [] })).toEqual([]);
    expect(
      criticalBranches({
        populations: [{ id: 'elite', name: 'Elite OTB', role: 'reference', result: null }],
      }),
    ).toEqual([]);
    // A source that failed is not a source that says nothing is played.
    expect(
      criticalBranches({
        populations: [{ id: 'elite', name: 'Elite OTB', role: 'reference', result: undefined }],
      }),
    ).toEqual([]);
  });
});

describe('the reasons a branch carries', () => {
  it('reports a line that is played more recently than in the reference', () => {
    const recent = population('recent', 'Recent Theory', 'recent', [
      move('Be7', 'f8e7', 900),
      move('Nf6', 'g8f6', 1000),
      move('a6', 'a7a6', 100),
    ]);
    const rows = criticalBranches({ populations: [ELITE, recent] });
    const growth = reasonOf(branch(rows, 'Be7')!.reasons, 'growth');
    // 900 of 2,000 recently — 45% — against 3,000 of 9,920 over the board, 30.2%.
    expect(growth).toMatchObject({ source: 'Recent Theory', baseline: 'Elite OTB' });
    expect(growth.share).toBeCloseTo(0.45, 3);
    expect(growth.baselineShare).toBeCloseTo(3000 / 9920, 3);
  });

  it('does not call a share that barely moved growth', () => {
    const recent = population('recent', 'Recent Theory', 'recent', [
      move('Be7', 'f8e7', 305),
      move('Nf6', 'g8f6', 500),
      move('a6', 'a7a6', 195),
    ]);
    const rows = criticalBranches({ populations: [ELITE, recent] });
    expect(reasonKinds(branch(rows, 'Be7')!.reasons)).not.toContain('growth');
  });

  it('reports where two populations disagree, without averaging them', () => {
    const online = population('online', '2400+ Online', 'contrast', [
      move('Be7', 'f8e7', 200),
      move('Nf6', 'g8f6', 200),
      move('a6', 'a7a6', 1600),
    ]);
    const rows = criticalBranches({ populations: [ELITE, online] });
    const a6 = branch(rows, 'a6')!;
    const divergence = reasonOf(a6.reasons, 'divergence');
    // 80% online against 15.1% over the board. Both numbers survive; there is
    // no third number that is the average of them.
    expect(divergence).toMatchObject({ source: '2400+ Online', otherSource: 'Elite OTB' });
    expect(divergence.share).toBeCloseTo(0.8, 3);
    expect(divergence.otherShare).toBeCloseTo(1500 / 9920, 3);
    const shares = a6.reasons.map((reason) => ('share' in reason ? reason.share : null));
    expect(shares).not.toContain(0.475);
  });

  it('reports a repertoire gap only when a repertoire was consulted', () => {
    const withoutRepertoire = criticalBranches({ populations: [ELITE] });
    expect(reasonKinds(branch(withoutRepertoire, 'Nf6')!.reasons)).not.toContain('repertoire-gap');

    const withRepertoire = criticalBranches({
      populations: [ELITE],
      repertoireMoves: ['g8f6'],
      repertoireName: 'Black vs 1.e4',
    });
    // Nf6 is answered; Be7 is not.
    expect(reasonKinds(branch(withRepertoire, 'Nf6')!.reasons)).not.toContain('repertoire-gap');
    expect(branch(withRepertoire, 'Be7')!.reasons).toContainEqual({
      kind: 'repertoire-gap',
      repertoire: 'Black vs 1.e4',
    });
  });

  it('treats an empty repertoire as covering nothing, not as no repertoire', () => {
    const rows = criticalBranches({
      populations: [ELITE],
      repertoireMoves: [],
      repertoireName: 'Black vs 1.e4',
    });
    expect(reasonKinds(branch(rows, 'Nf6')!.reasons)).toContain('repertoire-gap');
  });

  it('reports what one opponent played here, with their own denominator', () => {
    const rows = criticalBranches({
      populations: [ELITE],
      opponent: {
        name: 'Nepomniachtchi',
        moves: [
          { uci: 'a7a6', games: 9 },
          { uci: 'g8f6', games: 3 },
        ],
      },
    });
    expect(branch(rows, 'a6')!.reasons).toContainEqual({
      kind: 'opponent',
      player: 'Nepomniachtchi',
      games: 9,
      total: 12,
      share: 0.75,
    });
  });
});

describe('the order, and what drives it', () => {
  it('puts an unanswered branch above an answered one of the same frequency', () => {
    const even = population('elite', 'Elite OTB', 'reference', [
      move('Be7', 'f8e7', 1000),
      move('Nf6', 'g8f6', 1000),
    ]);
    const rows = criticalBranches({
      populations: [even],
      repertoireMoves: ['g8f6'],
      repertoireName: 'Black vs 1.e4',
    });
    expect(rows.map((row) => row.san)).toEqual(['Be7', 'Nf6']);
  });

  it('puts a repertoire gap in a common line above one in a rare line', () => {
    const rows = criticalBranches({
      populations: [ELITE],
      repertoireMoves: [],
      repertoireName: 'Black vs 1.e4',
    });
    // Every listed move is a gap, so what separates them is how often they are
    // actually played — a gap against 50% of games matters more than one
    // against 4%.
    expect(rows.map((row) => row.san)).toEqual(['Nf6', 'Be7', 'a6', 'h6']);
  });

  it('does not let a gap in a sideline outrank the main line', () => {
    /*
      A repertoire gap raises a branch, and it must raise it in proportion to
      how often the branch is actually played. Otherwise every obscure move
      the repertoire happens not to cover sorts above the move half the
      population plays, and the list stops being a list of the position's
      branches.
    */
    const skewed = population('elite', 'Elite OTB', 'reference', [
      move('Nf6', 'g8f6', 6000),
      move('h6', 'h7h6', 400),
    ]);
    const rows = criticalBranches({
      populations: [skewed],
      repertoireMoves: ['g8f6'],
      repertoireName: 'Black vs 1.e4',
    });
    // Nf6 is 93.8% and answered; h6 is 6.3% and unanswered.
    expect(rows.map((row) => row.san)).toEqual(['Nf6', 'h6']);
    expect(reasonKinds(branch(rows, 'h6')!.reasons)).toContain('repertoire-gap');
  });

  it('never puts an ordering number in what the reader is given', () => {
    const rows = criticalBranches({
      populations: [ELITE],
      repertoireMoves: [],
      repertoireName: 'r',
    });
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['reasons', 'san', 'uci']);
    }
  });

  it('lists at most the number of branches asked for', () => {
    const rows = criticalBranches({ populations: [ELITE] }, { limit: 2 });
    expect(rows).toHaveLength(2);
  });
});

describe('putting a reason into words', () => {
  it('keeps the denominator in the sentence', () => {
    expect(
      describeReason({
        kind: 'frequency',
        source: 'Elite OTB',
        games: 2914,
        total: 15832,
        share: 2914 / 15832,
      }),
    ).toBe('18.4% of Elite OTB (2,914 of 15,832)');
  });

  it('says what a share grew from, not just that it grew', () => {
    expect(
      describeReason({
        kind: 'growth',
        source: 'Recent Theory',
        baseline: 'Elite OTB',
        share: 0.241,
        baselineShare: 0.184,
      }),
    ).toBe('24.1% in Recent Theory — up from 18.4% in Elite OTB');
  });

  it('names both populations in a divergence rather than combining them', () => {
    expect(
      describeReason({
        kind: 'divergence',
        source: '2400+ Online',
        otherSource: 'Elite OTB',
        share: 0.8,
        otherShare: 0.151,
      }),
    ).toBe('80.0% in 2400+ Online against 15.1% in Elite OTB');
  });

  it('names the repertoire that is missing the move', () => {
    expect(describeReason({ kind: 'repertoire-gap', repertoire: 'Black vs 1.e4' })).toBe(
      'no response in Black vs 1.e4',
    );
  });

  it('names the opponent and how many of their games it was', () => {
    expect(
      describeReason({
        kind: 'opponent',
        player: 'Nepomniachtchi',
        games: 9,
        total: 12,
        share: 0.75,
      }),
    ).toBe('Nepomniachtchi played it 9 of 12 times here');
  });
});
