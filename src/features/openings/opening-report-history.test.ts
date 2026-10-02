import { describe, expect, it } from 'vitest';

import type { PackPositionHistory } from '@/reference/pack';

import { buildOpeningReport } from './opening-report';

const FEN = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const tally = (games: number, white: number, draws: number, black: number) => ({
  games,
  white,
  draws,
  black,
});

const starter: PackPositionHistory = {
  key: 'k',
  byYear: new Map([
    [2021, tally(10, 4, 3, 3)],
    [2020, tally(30, 12, 9, 9)],
  ]),
  byBand: new Map([
    [2400, tally(25, 10, 8, 7)],
    [2600, tally(15, 6, 4, 5)],
  ]),
  first: [
    { year: 2020, id: 'a1' },
    { year: 2020, id: 'a2' },
  ],
};
const elite: PackPositionHistory = {
  key: 'k',
  byYear: new Map([[2021, tally(7, 3, 3, 1)]]),
  byBand: new Map([[2600, tally(7, 3, 3, 1)]]),
  first: [{ year: 2021, id: 'b1' }],
};

const report = buildOpeningReport({
  fen: FEN,
  histories: [
    {
      id: 'kingfisher-starter',
      name: 'Kingfisher Starter Reference',
      history: starter,
      bands: [0, 2000, 2200, 2400, 2600],
      pioneers: [
        {
          year: 2020,
          id: 'a1',
          white: 'Anand, V',
          black: 'Carlsen, M',
          event: 'Norway Chess',
          result: '1/2-1/2',
        },
      ],
    },
    { id: 'elite-otb', name: 'Elite OTB', history: elite, bands: [0, 2000, 2200, 2400, 2600] },
    { id: 'empty', name: 'Empty pack', history: null, bands: [0] },
  ],
});
const section = (id: string) => report.sections.find((entry) => entry.id === id)!;

describe('the Opening Report’s history, per population', () => {
  it('shows popularity by year, Elo classes and first games, each naming its population', () => {
    const popularity = section('popularity:kingfisher-starter');
    expect(popularity.title).toBe('Popularity by year — Kingfisher Starter Reference');
    expect(popularity.provenance).toContain('the 40 dated games');
    expect(popularity.entries.map((entry) => entry.primary)).toEqual(['2020', '2021']);
    expect(popularity.entries[0]!.secondary).toBe(
      '30 games · White won 40.0%, drawn 30.0%, Black won 30.0%',
    );
    expect(section('elo:kingfisher-starter').entries.map((entry) => entry.primary)).toEqual([
      '2400–2599',
      '2600 and above',
    ]);
    const pioneers = section('pioneers:kingfisher-starter');
    expect(pioneers.entries[0]!.secondary).toBe('Anand, V – Carlsen, M 1/2-1/2, Norway Chess');
    expect(pioneers.entries[1]!.secondary).toContain('not carried');
    expect(pioneers.provenance).toContain('not in chess');
  });

  it('never mixes populations: every figure is one population’s own', () => {
    for (const [id, history] of [
      ['kingfisher-starter', starter],
      ['elite-otb', elite],
    ] as const) {
      const years = section(`popularity:${id}`).entries.map((entry) =>
        Number(/^(\d+) games?/.exec(entry.secondary ?? '')?.[1]),
      );
      expect(years).toEqual(
        [...history.byYear.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t.games),
      );
      const bands = section(`elo:${id}`).entries.map((entry) =>
        Number(/^(\d+) games?/.exec(entry.secondary ?? '')?.[1]),
      );
      expect(bands).toEqual(
        [...history.byBand.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t.games),
      );
    }
    // No section is about more than one population.
    const titled = report.sections.filter((entry) => /— /.test(entry.title));
    for (const entry of titled) {
      const named = ['Kingfisher Starter Reference', 'Elite OTB', 'Empty pack'].filter((name) =>
        entry.title.includes(name),
      );
      expect(named, entry.title).toHaveLength(1);
    }
  });

  it('says why a population has no history here, instead of leaving a blank', () => {
    expect(section('popularity:empty').emptyReason).toContain('carries no history');
    expect(section('pioneers:empty').entries).toEqual([]);
  });

  it('labels a capped collection as a sample and does not call its first game a pioneer', () => {
    const sampled = buildOpeningReport({
      fen: FEN,
      histories: [
        {
          id: 'sqlite:mine',
          name: 'My archive',
          history: starter,
          bands: [0, 2000, 2200, 2400, 2600],
          sample: { games: 2_000, hasMore: true, undated: 7, unrated: 19 },
          pioneers: [{ year: 2020, id: 'a1', white: 'Anand, V', black: 'Carlsen, M' }],
        },
      ],
    });
    const find = (id: string) => sampled.sections.find((entry) => entry.id === id)!;
    expect(find('popularity:sqlite:mine').provenance).toContain('bounded sample of 2,000');
    expect(find('popularity:sqlite:mine').entries[0]!.criterion).toContain(
      'dated games in this sample',
    );
    expect(find('popularity:sqlite:mine').provenance).toContain('7 sampled games had no date');
    expect(find('elo:sqlite:mine').provenance).toContain('19 sampled games state no rating');

    /*
      A game that ended in no recorded result is in none of the three outcome
      columns, so the columns need not add up to the game count. Saying so is
      the difference between a reader who can reconcile the line and one
      hunting for the missing quarter.
    */
    const withUndecided = buildOpeningReport({
      fen: FEN,
      histories: [
        {
          id: 'sqlite:mine',
          name: 'My archive',
          history: starter,
          bands: [0, 2000, 2200, 2400, 2600],
          sample: { games: 40, hasMore: false, undated: 0, unrated: 0, undecided: 11 },
        },
      ],
    });
    const elo = withUndecided.sections.find((entry) => entry.id === 'elo:sqlite:mine')!;
    expect(elo.provenance).toContain('11 sampled games state no result');
    // And it is not mentioned when every game ended.
    expect(find('elo:sqlite:mine').provenance).not.toContain('no result');
    expect(find('pioneers:sqlite:mine').provenance).toContain('not necessarily the first');
    expect(find('pioneers:sqlite:mine').entries[0]!.criterion).toBe('earliest in this sample');
  });
});

describe('undated collection games', () => {
  it('distinguishes missing dates from a collection with no games', () => {
    const result = buildOpeningReport({
      fen: FEN,
      histories: [
        {
          id: 'sqlite:undated',
          name: 'Undated archive',
          bands: [0],
          history: { key: 'k', byYear: new Map(), byBand: new Map(), first: [] },
          sample: { games: 3, hasMore: false, undated: 3, unrated: 3 },
        },
      ],
    });
    expect(result.sections.find((s) => s.id === 'pioneers:sqlite:undated')?.emptyReason).toBe(
      'Undated archive has no dated game at this position.',
    );
  });
});
