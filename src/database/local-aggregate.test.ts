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
1. Nf3 c5 *`;

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
      games: 3,
      frequentPlayers: [
        { name: 'Alpha', games: 2 },
        { name: 'Beta', games: 1 },
      ],
    });
    const recent = await repositories.games.explore(START_FEN, { sinceYear: 2025 });
    expect(recent.moves[0]?.frequentPlayers).toEqual([
      { name: 'Alpha', games: 1 },
      { name: 'Beta', games: 1 },
    ]);
    const band = await repositories.games.explore(START_FEN, { minRating: 2200, maxRating: 2400 });
    expect(band.totalGames).toBe(2);
    expect(band.moves[0]?.frequentPlayers).toEqual([{ name: 'Alpha', games: 2 }]);
  });
});
