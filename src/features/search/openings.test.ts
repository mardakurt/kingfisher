import { describe, expect, it } from 'vitest';

import { medianUnits } from '@/performance/calibration';

import { expandOpeningQuery, openingIndex, searchOpenings, searchOpeningsIn } from './openings';

const first = async (query: string) => (await searchOpenings(query, 1))[0]?.label;

describe('searchOpenings', () => {
  it('finds the Najdorf family by name', async () => {
    const hits = await searchOpenings('Najdorf');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((hit) => hit.name === 'Sicilian Defense')).toBe(true);
    expect(hits[0]?.label).toBe('Sicilian Defense: Najdorf Variation');
  });

  it('matches by ECO code', async () => {
    const hits = await searchOpenings('B90');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.eco).toBe('B90');
  });

  it('returns an empty list for too-short queries', async () => {
    expect(await searchOpenings('a')).toEqual([]);
  });

  it('returns an empty list when nothing matches', async () => {
    expect(await searchOpenings('zzzzzzzz')).toEqual([]);
  });

  it('respects the limit argument', async () => {
    const hits = await searchOpenings('Sicilian', 3);
    expect(hits.length).toBeLessThanOrEqual(3);
  });

  /*
    The names a serious player types. Each expectation is the entry the
    dataset itself names for that query, and the test is the record of what
    the ranking must keep doing: the family before its sub-lines, the thing
    before the thing named for avoiding it, the whole word before the word
    that merely starts the same way.
  */
  it.each([
    ['Sicilian', 'Sicilian Defense'],
    ['Dragon', 'Sicilian Defense: Dragon Variation'],
    ['Sveshnikov', 'Sicilian Defense: Lasker-Pelikan Variation, Sveshnikov Variation'],
    ['Poisoned Pawn', 'French Defense: Winawer Variation, Poisoned Pawn Variation'],
    ['Caro-Kann', 'Caro-Kann Defense'],
    ['Ruy Lopez', 'Ruy Lopez'],
    ['Berlin', 'Ruy Lopez: Berlin Defense'],
    ['Marshall', 'Ruy Lopez: Marshall Attack'],
    ['Italian', 'Italian Game'],
    ['Scotch', 'Scotch Game'],
    ['Catalan', 'Catalan Opening'],
    ["Queen's Gambit", "Queen's Gambit"],
    ['Slav', 'Slav Defense'],
    ['Semi-Slav', 'Semi-Slav Defense'],
    ['Nimzo-Indian', 'Nimzo-Indian Defense'],
    ["Queen's Indian", "Queen's Indian Defense"],
    ["King's Indian", "King's Indian Defense"],
    ['Grünfeld', 'Grünfeld Defense'],
    ['Benoni', 'Benoni Defense'],
    ['English', 'English Opening'],
    ['Réti', 'Réti Opening'],
    ['Taimanov', 'Sicilian Defense: Taimanov Variation'],
    ['Two Knights', 'Italian Game: Two Knights Defense'],
    ['Closed Sicilian', 'Sicilian Defense: Closed'],
    ['Kan', 'Sicilian Defense: Kan Variation'],
    ['Meran', 'Semi-Slav Defense: Meran Variation'],
    ['Breyer', 'Ruy Lopez: Closed, Breyer Defense'],
    ['Panov', 'Caro-Kann Defense: Panov Attack'],
    ['Scheveningen', 'Sicilian Defense: Scheveningen Variation'],
    ['Winawer Poisoned Pawn', 'French Defense: Winawer Variation, Poisoned Pawn Variation'],
    ['Sicilian Najdorf English Attack', 'Sicilian Defense: Najdorf Variation, English Attack'],
  ])('%s → %s', async (query, label) => {
    expect(await first(query)).toBe(label);
  });

  it('accepts the abbreviations players actually use, and only those', async () => {
    expect(await first('QGD')).toBe("Queen's Gambit Declined");
    expect(await first('QGA')).toBe("Queen's Gambit Accepted");
    expect(await first('KID')).toBe("King's Indian Defense");
    expect(await first('KIA')).toBe("King's Indian Attack");
    expect(await first('QID')).toBe("Queen's Indian Defense");
    expect(await first('Nimzo')).toBe('Nimzo-Indian Defense');
    expect(await first('Spanish')).toBe('Ruy Lopez');
    expect(expandOpeningQuery('KG')).toBe('kg'); // ambiguous, so not expanded
  });

  it('accepts British spellings and a missing apostrophe', async () => {
    expect(await first('Sicilian Defence')).toBe('Sicilian Defense');
    expect(await first('Kings Indian Defence')).toBe("King's Indian Defense");
    expect(expandOpeningQuery('Centre Game')).toBe('center game');
  });

  it('accepts the plain and the German spellings of an umlaut', async () => {
    expect(await first('Grunfeld')).toBe('Grünfeld Defense');
    expect(await first('Gruenfeld')).toBe('Grünfeld Defense');
  });

  it('accepts a prefix while a name is still being typed', async () => {
    expect(await first('Sicil')).toBe('Sicilian Defense');
    expect(await first('Naj')).toBe('Sicilian Defense: Najdorf Variation');
  });

  it('survives a typo without inventing a name', async () => {
    const hits = await searchOpenings('Najdrof', 3);
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) expect(hit.label).toMatch(/Najdorf/);
  });

  it('keeps a real ambiguity visible rather than guessing', async () => {
    // "Tarrasch" is both a defence and a French line; both are offered.
    const labels = (await searchOpenings('Tarrasch', 8)).map((hit) => hit.label);
    expect(labels[0]).toBe('Tarrasch Defense');
    expect(labels).toContain('French Defense: Tarrasch Variation');
  });

  it('does not let a misspelling outrank an exact name, however long the query', async () => {
    // Fuzzy was 50 per matched character and once put a London System line
    // above "Queen's Gambit Accepted" for that exact query.
    expect(await first("Queen's Gambit Accepted")).toBe("Queen's Gambit Accepted");
  });

  /*
    60 ms a query is what a keystroke allows before the list visibly lags, and
    no query may take longer on any machine. The regression budget is in units
    of this machine's speed (`src/performance/calibration.ts`), because a
    shared runner's speed varies by about two times from run to run. Measured
    in Phase 85, the five queries' units summed:

      this code, M-series Mac               7.0
      this code, GitHub runner, 2 runs      8.1–8.5
      the ranking run three times, 2 runs   20.7–22.6

    and the budget, 13, sits between.
  */
  it('answers in the time a keystroke allows', async () => {
    await searchOpenings('warm');
    const entries = await openingIndex();
    let total = 0;
    for (const query of ['Sicilian', 'Berlin', "King's Indian", 'Sveshnikov', 'QGD']) {
      const samples: number[] = [];
      for (let run = 0; run < 7; run += 1) {
        const started = performance.now();
        await searchOpenings(query);
        samples.push(performance.now() - started);
      }
      samples.sort((a, b) => a - b);
      const median = samples[3]!;
      const units = medianUnits(7, () => void searchOpeningsIn(entries, query));
      total += units;
      // eslint-disable-next-line no-console -- the measurement is what a reader of the log wants
      console.info(`${query}: ${median.toFixed(1)} ms (median of 7); ${units.toFixed(2)} units`);
      expect(median, query).toBeLessThan(60);
    }
    // eslint-disable-next-line no-console -- the measurement is what a reader of the log wants
    console.info(`five queries: ${total.toFixed(2)} units`);
    expect(total).toBeLessThan(13);
  });
});
