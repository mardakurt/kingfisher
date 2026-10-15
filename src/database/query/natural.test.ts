import { describe, expect, it } from 'vitest';

import { filtersFromQuery, parseQuery, type QueryPredicate } from './ast';
import { parseNaturalQuery } from './natural';

const NOW = new Date('2026-10-15T12:00:00Z');

function conditions(input: string): QueryPredicate[] {
  const parsed = parseNaturalQuery(input, NOW);
  expect(parsed.refusals).toEqual([]);
  expect(parsed.unparsed).toEqual([]);
  expect(parsed.query).not.toBeNull();
  // Whatever it builds must be a query the rest of Kingfisher accepts and the
  // Library's form can show.
  expect(parseQuery(parsed.query).ok).toBe(true);
  expect(filtersFromQuery(parsed.query!)).not.toBeNull();
  const where = parsed.query!.where;
  return where.type === 'and' ? (where.of as QueryPredicate[]) : [where as QueryPredicate];
}

describe('parseNaturalQuery', () => {
  it('reads a player, a colour, an opening, a year range, a rating and a time control', () => {
    const parsed = parseNaturalQuery(
      'Carlsen as Black in the Najdorf since 2018, rated over 2700, blitz',
      NOW,
    );
    expect(parsed.unparsed).toEqual([]);
    expect(
      conditions('Carlsen as Black in the Najdorf since 2018, rated over 2700, blitz'),
    ).toEqual(
      expect.arrayContaining([
        { type: 'player', name: 'Carlsen', color: 'b' },
        { type: 'opening', contains: 'Najdorf' },
        { type: 'year', from: 2018 },
        { type: 'rating', min: 2700 },
        { type: 'timeClass', value: 'blitz' },
      ]),
    );
    expect(parsed.parts.map((part) => `${part.label}: ${part.value}`)).toContain(
      'Player: Carlsen (Black)',
    );
  });

  it('reads a head-to-head with both names whole', () => {
    expect(conditions('Magnus Carlsen vs Hikaru Nakamura')).toEqual([
      { type: 'player', name: 'Magnus Carlsen', opponent: 'Hikaru Nakamura' },
    ]);
  });

  it('treats a surname after "by" as a person even when an opening shares it', () => {
    const where = conditions('games by Alekhine in the French');
    expect(where).toContainEqual({ type: 'player', name: 'Alekhine' });
    expect(where).toContainEqual({ type: 'opening', contains: 'French' });
  });

  it('turns a player’s wins into the result for their colour', () => {
    expect(conditions('Kasparov as white wins')).toContainEqual({ type: 'result', value: '1-0' });
    expect(conditions('Kasparov with the black pieces won')).toContainEqual({
      type: 'result',
      value: '0-1',
    });
    expect(conditions('Kasparov as black lost')).toContainEqual({ type: 'result', value: '1-0' });
    expect(conditions('white wins in the Berlin')).toContainEqual({ type: 'result', value: '1-0' });
    expect(conditions('draws in the Petroff')).toContainEqual({ type: 'result', value: '1/2-1/2' });
  });

  it('refuses a player’s wins without a colour rather than widening the search', () => {
    const parsed = parseNaturalQuery('Carlsen wins', NOW);
    expect(parsed.query).toBeNull();
    expect(parsed.refusals[0]).toMatch(/say which colour/);
  });

  it('reads the ways people write years', () => {
    expect(conditions('Najdorf in 2019')).toContainEqual({ type: 'year', from: 2019, to: 2019 });
    expect(conditions('Najdorf between 2010 and 2015')).toContainEqual({
      type: 'year',
      from: 2010,
      to: 2015,
    });
    expect(conditions('Najdorf 2010-2015')).toContainEqual({ type: 'year', from: 2010, to: 2015 });
    expect(conditions('Najdorf after 2018')).toContainEqual({ type: 'year', from: 2019 });
    expect(conditions('Najdorf before 2000')).toContainEqual({ type: 'year', to: 1999 });
    expect(conditions('Najdorf in the 1990s')).toContainEqual({
      type: 'year',
      from: 1990,
      to: 1999,
    });
    expect(conditions('Najdorf last year')).toContainEqual({ type: 'year', from: 2025, to: 2025 });
    expect(conditions('Najdorf last 5 years')).toContainEqual({ type: 'year', from: 2022 });
  });

  it('tells a rating from a year by the words around it', () => {
    expect(conditions('Grunfeld over 2000')).toContainEqual({ type: 'rating', min: 2000 });
    expect(conditions('Grunfeld 2600+')).toContainEqual({ type: 'rating', min: 2600 });
    expect(conditions('Grunfeld both players over 2700')).toContainEqual({
      type: 'rating',
      min: 2700,
      scope: 'both',
    });
    expect(conditions('Grunfeld rated under 1800')).toContainEqual({ type: 'rating', max: 1800 });
  });

  it('reads ECO codes and decade ranges', () => {
    expect(conditions('B90')).toEqual([{ type: 'eco', prefix: 'B90' }]);
    expect(conditions('B90-B99 classical')).toContainEqual({ type: 'eco', prefix: 'B9' });
  });

  it('reads structures by name and by the abbreviations players use', () => {
    expect(conditions('IQP positions in the Tarrasch')).toContainEqual({
      type: 'theme',
      id: 'isolated-queen-pawn',
    });
    expect(conditions('rook endgames by Rubinstein')).toContainEqual({
      type: 'theme',
      id: 'rook-ending',
    });
    expect(conditions('opposite castling Dragon')).toContainEqual({
      type: 'theme',
      id: 'opposite-side-castling',
    });
  });

  it('reads multi-word opening names from the classification', () => {
    expect(conditions("Queen's Gambit Declined")).toContainEqual({
      type: 'opening',
      contains: "Queen's Gambit Declined",
    });
    expect(conditions("king's indian defence")).toContainEqual({
      type: 'opening',
      contains: "King's Indian Defense",
    });
    expect(conditions('Caro-Kann advance')).toContainEqual({
      type: 'opening',
      contains: 'Caro-Kann Defense: Advance Variation',
    });
  });

  it('reads annotation filters', () => {
    expect(conditions('annotated Najdorf games')).toContainEqual({
      type: 'annotations',
      value: 'annotated',
    });
  });

  it('reports the words it did not understand instead of dropping them', () => {
    const parsed = parseNaturalQuery('Najdorf with spectacular sacrifices', NOW);
    expect(parsed.unparsed).toEqual(['spectacular', 'sacrifices']);
    expect(parsed.query).not.toBeNull();
  });

  it('builds nothing from nothing', () => {
    expect(parseNaturalQuery('', NOW).query).toBeNull();
    expect(parseNaturalQuery('show me games', NOW).query).toBeNull();
  });
});
