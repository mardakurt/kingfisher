import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/chess/fen';
import { importGames, indexGame, normalizeGame } from '@/persistence/import-game';
import { parseSingleGame } from '@/chess/pgn';
import { aggregateLocalExplorer } from './local-aggregate';
import { createMemoryRepositories } from '@/persistence/repositories';

const PGN = `[Event "Repeated position"]
[White "Alpha"]
[Black "Beta"]
[Date "2025.01.01"]
[WhiteElo "2300"]
[BlackElo "2400"]
1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 *

[Event "Second Alpha"]
[White "Alpha"]
[Black "Gamma"]
[Date "2024.01.01"]
[WhiteElo "2300"]
1. Nf3 d5 *

[Event "Another mover"]
[White "Beta"]
[Black "Delta"]
[Date "2025.02.01"]
[WhiteElo "1600"]
[BlackElo "2800"]
1. Nf3 c5 *

[Event "Outside the mean"]
[White "Epsilon"]
[Black "Zeta"]
[Date "2025.03.01"]
[WhiteElo "2700"]
[BlackElo "1400"]
1. Nf3 e5 *

[Event "No rating recorded"]
[White "Eta"]
[Black "Theta"]
[Date "2025.04.01"]
1. e4 e5 *`;

describe('local Explorer player frequency and rating bands', () => {
  it('deduplicates repeated postings of the same game at the aggregation boundary', () => {
    const parsed = parseSingleGame('[White "Alpha"]\n[Black "Beta"]\n1. Nf3 *');
    if (!parsed.ok) throw new Error('fixture');
    const game = normalizeGame(parsed.value.tree, 1);
    const records = indexGame(game);
    const result = aggregateLocalExplorer(START_FEN, [...records, ...records], [game]);
    expect(result.moves[0]).toMatchObject({
      games: 1,
      frequentPlayers: [{ name: 'Alpha', games: 1 }],
    });
  });
  it('counts a player once per game and ranks the actual mover in the filtered population', async () => {
    const repositories = createMemoryRepositories();
    await importGames(PGN, repositories.games);
    const all = await repositories.games.explore(START_FEN);
    expect(all.moves[0]).toMatchObject({
      games: 4,
      frequentPlayers: [
        { name: 'Alpha', games: 2 },
        { name: 'Beta', games: 1 },
        { name: 'Epsilon', games: 1 },
      ],
      years: [
        { year: 2024, games: 1 },
        { year: 2025, games: 3 },
      ],
    });
    expect(all.yearTotals).toEqual([
      { year: 2024, games: 1 },
      { year: 2025, games: 4 },
    ]);
    expect(all.undatedGames).toBe(0);
    const recent = await repositories.games.explore(START_FEN, { sinceYear: 2025 });
    expect(recent.moves[0]?.frequentPlayers).toEqual([
      { name: 'Alpha', games: 1 },
      { name: 'Beta', games: 1 },
      { name: 'Epsilon', games: 1 },
    ]);
    expect(recent.yearTotals).toEqual([{ year: 2025, games: 4 }]);
    expect(recent.moves[0]?.years).toEqual([{ year: 2025, games: 3 }]);
    // The band is the mean of the ratings the game records. 2300/2400 and the
    // single recorded 2300 are inside 2200–2400. 1600/2800 averages 2200, so
    // it is inside. 2700/1400 averages 2050, and a game with no recorded
    // rating is outside. 2600+ holds none of these means.
    const band = await repositories.games.explore(START_FEN, { minRating: 2200, maxRating: 2400 });
    expect(band.totalGames).toBe(3);
    expect(band.moves[0]?.frequentPlayers).toEqual([
      { name: 'Alpha', games: 2 },
      { name: 'Beta', games: 1 },
    ]);
    const elite = await repositories.games.explore(START_FEN, { minRating: 2600 });
    expect(elite.totalGames).toBe(0);
  });

  it('excludes a rapid game from a classical query by the stored TimeControl tag', async () => {
    // The explorer worker aggregates through the same function, so this is the
    // filter My games applies when the provider offers a speed facet.
    const repositories = createMemoryRepositories();
    await importGames(
      `[White "Slow"]
[Black "One"]
[Result "1-0"]
[TimeControl "5400+0"]

1. e4 e5 *

[White "Fast"]
[Black "Two"]
[Result "1-0"]
[TimeControl "600+0"]

1. e4 e5 *`,
      repositories.games,
    );
    const classical = await repositories.games.explore(START_FEN, { speeds: ['classical'] });
    expect(classical.totalGames).toBe(1);
    expect(classical.topGames?.map((game) => game.white)).toEqual(['Slow']);
  });
});
