/**
 * What this suite is actually holding the report to.
 *
 * The report arranges evidence rather than producing it, so the interesting
 * failures are not arithmetic — they are a section that quotes a number
 * without saying where it came from, a section that goes blank without saying
 * why, and the two rules AGENTS.md is most emphatic about: populations are
 * never merged, and authored prose stays distinguishable from counts.
 *
 * There is a structural test for each of those, over every section, so a
 * section added later cannot quietly skip them.
 */

import { describe, expect, it } from 'vitest';

import type { DatabaseMove, ExplorerResult } from '@/database/types';
import type { BranchPopulation } from '@/theory/critical-branches';
import type { TheoryBookNode } from '@/theory/theory-book';
import type { ResolvedBrief } from '@/theory/variation-briefs';

import { buildOpeningReport, type OpeningReportInput } from './opening-report';

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

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
    fen: FEN as ExplorerResult['fen'],
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
  move('Nf6', 'g8f6', 5000),
  move('Be7', 'f8e7', 3000),
  move('a6', 'a7a6', 1500),
]);

const ONLINE = population('online', '2400+ Online', 'contrast', [
  move('Nf6', 'g8f6', 400),
  move('a6', 'a7a6', 1600),
]);

const node = (label: string, eco: string): TheoryBookNode =>
  ({
    key: 'k',
    eco,
    name: label,
    label,
    lineage: [label],
    moves: [],
  }) as unknown as TheoryBookNode;

const BRIEF: ResolvedBrief = {
  brief: {
    lineage: ['Sicilian Defense'],
    defining: 'Black answers 1.e4 with 1...c5.',
    white: 'White opens the position with an early d4.',
    black: 'Black trades a wing pawn for a centre pawn.',
    source: 'kingfisher',
  },
  matched: ['Sicilian Defense'],
  inherited: true,
};

const RUY = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'];

const full: OpeningReportInput = {
  fen: FEN,
  placement: { node: node('Sicilian Defense: Najdorf', 'B90'), ply: 10, beyond: 6 },
  crumbs: [node('Sicilian Defense', 'B20'), node('Sicilian Defense: Najdorf', 'B90')],
  children: [node('Sicilian Defense: Najdorf, English Attack', 'B90')],
  brief: BRIEF,
  populations: [ELITE, ONLINE],
  continuations: [RUY, RUY, RUY],
  repertoireMoves: ['g8f6'],
  repertoireName: 'Black vs 1.e4',
  modelGames: [{ label: 'Kasparov – Topalov, Wijk aan Zee 1999', source: 'Elite OTB' }],
  now: 1_700_000_000_000,
};

const section = (input: OpeningReportInput, id: string) =>
  buildOpeningReport(input).sections.find((entry) => entry.id === id);

describe('every section accounts for itself', () => {
  it('either cites a source or says why it has nothing', () => {
    for (const entry of buildOpeningReport(full).sections) {
      const cited = entry.provenance !== null;
      const explained = entry.emptyReason !== null;
      // Never both silent: a section with entries must say where they came
      // from, and a section without them must say why not.
      expect(cited || explained).toBe(true);
      if (entry.entries.length > 0) expect(cited).toBe(true);
      if (entry.entries.length === 0) expect(explained).toBe(true);
    }
  });

  it('says why it is empty rather than going blank, for a bare position', () => {
    const bare = buildOpeningReport({ fen: FEN });
    for (const entry of bare.sections) {
      expect(entry.entries).toEqual([]);
      expect(entry.emptyReason).toBeTruthy();
    }
  });

  it('never calls a move best, anywhere in the report', () => {
    const text = JSON.stringify(buildOpeningReport(full)).toLowerCase();
    expect(text).not.toContain('best move');
    expect(text).not.toContain('strongest');
    expect(text).not.toContain('recommended');
  });
});

describe('sections a report is not entitled to', () => {
  it('drops the repertoire heading when no repertoire was consulted', () => {
    const { repertoireMoves, repertoireName, ...withoutRepertoire } = full;
    void repertoireMoves;
    void repertoireName;
    expect(section(withoutRepertoire, 'repertoire')).toBeUndefined();
    // Supplying an empty repertoire is a different thing, and keeps the
    // section: "nothing here is covered" is a finding.
    expect(section({ ...withoutRepertoire, repertoireMoves: [] }, 'repertoire')).toBeDefined();
  });

  it('drops the plan sections when no continuations were fetched', () => {
    const { continuations, ...withoutGames } = full;
    void continuations;
    expect(section(withoutGames, 'destinations')).toBeUndefined();
    expect(section(withoutGames, 'advances')).toBeUndefined();
    // Fetched and empty is not the same as never fetched.
    const emptied = section({ ...withoutGames, continuations: [] }, 'destinations');
    expect(emptied?.emptyReason).toBeTruthy();
  });

  it('drops the model-games heading when none were looked for', () => {
    const { modelGames, ...withoutGames } = full;
    void modelGames;
    expect(section(withoutGames, 'model-games')).toBeUndefined();
    expect(section({ ...withoutGames, modelGames: [] }, 'model-games')?.emptyReason).toBeTruthy();
  });
});

describe('naming the opening without overstating it', () => {
  it('says how far past the last named position the board is', () => {
    const identity = section(full, 'identity')!;
    expect(identity.entries[0]?.primary).toBe('B90 · Sicilian Defense: Najdorf');
    expect(identity.entries[0]?.criterion).toBe('6 plies past the last named position');
    expect(identity.provenance).toContain('lichess-org/chess-openings');
  });

  it('says so plainly when the position itself is the named one', () => {
    const exact = {
      ...full,
      placement: { node: node('Sicilian Defense: Najdorf', 'B90'), ply: 10, beyond: 0 },
    };
    expect(section(exact, 'identity')!.entries[0]?.criterion).toBe('this exact position is named');
  });

  it('invents no name for a position the dataset does not cover', () => {
    const unnamed = section({ ...full, placement: null }, 'identity')!;
    expect(unnamed.entries).toEqual([]);
    expect(unnamed.emptyReason).toContain('none is invented');
  });

  it('shows the named variations below without counts or scores', () => {
    const children = section(full, 'named-branches')!;
    expect(children.entries[0]?.primary).toBe('Sicilian Defense: Najdorf, English Attack');
    // The theory book shows no counts, no percentages and no evaluations.
    const text = JSON.stringify(children);
    expect(text).not.toMatch(/\d+%/);
    expect(text).not.toContain('games');
  });
});

describe('keeping curated prose apart from counts', () => {
  it('attributes the brief to Kingfisher and says it was inherited', () => {
    const brief = section(full, 'brief')!;
    expect(brief.provenance).toBe('Kingfisher, written for Sicilian Defense and inherited here');
    expect(brief.entries.map((entry) => entry.criterion)).toEqual([undefined, 'White', 'Black']);
  });

  it('attributes a brief written for this variation without claiming inheritance', () => {
    const own = section({ ...full, brief: { ...BRIEF, inherited: false } }, 'brief')!;
    expect(own.provenance).toBe('Kingfisher, written for this variation');
  });

  it('puts authored prose and counted facts in different sections', () => {
    const report = buildOpeningReport(full);
    const brief = report.sections.find((entry) => entry.id === 'brief')!;
    const destinations = report.sections.find((entry) => entry.id === 'destinations')!;
    expect(brief.provenance).toContain('Kingfisher');
    expect(destinations.provenance).toContain('replayed 30 plies');
    // The counted section must not borrow the authored section's authority,
    // and vice versa.
    expect(destinations.provenance).not.toContain('Kingfisher');
    expect(brief.provenance).not.toContain('games');
  });
});

describe('populations are reported separately', () => {
  it('gives each source its own row with its own total', () => {
    const populations = section(full, 'populations')!;
    expect(populations.entries.map((entry) => entry.primary)).toEqual([
      'Elite OTB — 9,500 games',
      '2400+ Online — 2,000 games',
    ]);
  });

  it('produces no combined figure across sources', () => {
    const populations = section(full, 'populations')!;
    // 9,500 + 2,000. A total that appears nowhere is the point.
    expect(JSON.stringify(populations)).not.toContain('11,500');
  });

  it('distinguishes a source that failed from one with no games', () => {
    const failed: BranchPopulation = {
      id: 'x',
      name: 'Recent Theory',
      role: 'recent',
      result: null,
    };
    const rows = section({ ...full, populations: [ELITE, failed] }, 'populations')!;
    expect(rows.entries[1]).toMatchObject({
      primary: 'Recent Theory',
      criterion: 'unavailable',
    });
  });

  it('cites every answering population in the branch section', () => {
    const branches = section(full, 'branches')!;
    expect(branches.provenance).toBe('Elite OTB · 9,500 games · 2400+ Online · 2,000 games');
  });
});

describe('the branches, and what the repertoire does about them', () => {
  it('gives each branch the facts that put it there', () => {
    const branches = section(full, 'branches')!;
    const a6 = branches.entries.find((entry) => entry.primary === 'a6')!;
    // Over the board 15.8%, online 80%. Both, side by side, in one line.
    expect(a6.secondary).toContain('of Elite OTB');
    expect(a6.secondary).toContain('2400+ Online');
    expect(a6.secondary).toContain('no response in Black vs 1.e4');
  });

  it('counts the gaps in the repertoire heading', () => {
    const repertoire = section(full, 'repertoire')!;
    // Nf6 is answered; Be7 and a6 are not.
    expect(repertoire.provenance).toBe('Black vs 1.e4 · 2 of 3 listed branches unanswered');
    /*
      In the branch ranking's order, not in frequency order: ...a6 is 15.8%
      over the board and 80% online, and that disagreement carries it above
      the more frequently played ...Be7. The repertoire section inherits that
      order because it is a view of the same list.
    */
    expect(
      repertoire.entries.filter((entry) => entry.criterion === 'no response').map((e) => e.primary),
    ).toEqual(['a6', 'Be7']);
  });

  it('reports nothing to rank when no reference population answered', () => {
    const branches = section({ ...full, populations: [ONLINE] }, 'branches')!;
    expect(branches.entries).toEqual([]);
    expect(branches.emptyReason).toContain('No reference population');
  });
});

describe('the plans, with their denominators', () => {
  it('says where a piece went, out of how many games', () => {
    const destinations = section(full, 'destinations')!;
    const knight = destinations.entries.find((entry) => entry.primary.includes('knight on g1'))!;
    expect(knight.primary).toBe("White's knight on g1 reached f3");
    expect(knight.secondary).toBe('3 of 3 games (100.0%), typically by ply 3');
    expect(destinations.provenance).toBe('3 games, replayed 30 plies past this position');
  });

  /*
    A machine can hold several collections and only one of them supplied these
    games. A count whose source cannot be named is the one thing nothing in
    this report is allowed to be, so when the panel knows which collection
    answered, the section says so.
  */
  it('names the collection the games were replayed from', () => {
    const named = buildOpeningReport({ ...full, continuationSource: 'Najdorf 2400+' });
    for (const id of ['destinations', 'advances']) {
      const found = named.sections.find((entry) => entry.id === id)!;
      expect(found.provenance).toBe(
        '3 games from Najdorf 2400+, replayed 30 plies past this position',
      );
    }
  });

  it('still says how many it replayed when the collection has no name', () => {
    const anonymous = section(full, 'advances')!;
    expect(anonymous.provenance).toBe('3 games, replayed 30 plies past this position');
  });

  it('reports a pawn advance without calling it a break', () => {
    const advances = section(full, 'advances')!;
    expect(advances.entries.some((entry) => entry.primary === "White's e2 pawn reaches e4")).toBe(
      true,
    );
    expect(JSON.stringify(advances).toLowerCase()).not.toContain('break');
  });

  it('does not write a destination as though it were one move', () => {
    /*
      A pawn's destination is where it got to, which is not always a move it
      could make. Measured on a real collection, the b7 pawn reaches b4 in
      21.7% of Najdorfs — by way of b5. `b7-b4` reads as a move nobody can
      play, and a report that prints an illegal move loses the reader's trust
      in every number beside it.
    */
    const journey = section(
      {
        ...full,
        continuations: [
          ['b7b5', 'e2e4', 'b5b4'],
          ['b7b5', 'd2d4', 'b5b4'],
        ],
      },
      'advances',
    )!;
    const reached = journey.entries.find((entry) => entry.primary.includes('b4'));
    expect(reached?.primary).toBe("Black's b7 pawn reaches b4");
    expect(JSON.stringify(journey)).not.toContain('b7-b4');
  });

  it('says nothing rather than something, when nothing recurred', () => {
    const scattered = section(
      { ...full, continuations: [['e2e4'], ['d2d4'], ['c2c4'], ['g1f3']] },
      'destinations',
    )!;
    expect(scattered.entries).toEqual([]);
    expect(scattered.emptyReason).toBeTruthy();
  });
});
