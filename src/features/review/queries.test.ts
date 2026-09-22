import { describe, expect, it } from 'vitest';

import { cp } from '@/chess/evaluation';
import { mainlinePath } from '@/chess/tree/tree';
import { importGames } from '@/persistence/import-game';
import { createMemoryRepositories } from '@/persistence/repositories';

import { loadRecurringFacts } from './queries';

const pgn = (white: string, black: string, date: string, round: string) => `[Event "Query test"]
[Site "Club"]
[Date "${date}"]
[Round "${round}"]
[White "${white}"]
[Black "${black}"]
[Result "0-1"]

1. e4 e5 2. Nf3 Nc6 0-1`;

describe('recurring facts query', () => {
  it('loads only exact-alias games in the period and includes their evidence', async () => {
    const repositories = createMemoryRepositories();
    await importGames(
      [
        pgn('Player', 'Included', '2026.09.20', '1'),
        pgn('Someone else', 'Excluded alias', '2026.09.20', '2'),
        pgn('Player', 'Excluded date', '2026.08.20', '3'),
      ].join('\n\n'),
      repositories.games,
    );
    const found = await repositories.games.search({ player: 'Player', limit: 10 });
    const includedSummary = found.games.find((game) => game.black === 'Included')!;
    const included = await repositories.games.get(includedSummary.id);
    if (!included) throw new Error('fixture game was not stored');
    const rootId = mainlinePath(included.tree)[0]!;
    const root = included.tree.nodes[rootId]!;
    await repositories.analysisQueue.saveEvidence({
      id: 'job|root',
      jobId: 'job',
      gameId: included.id,
      nodeId: rootId,
      positionKey: 'root',
      fen: root.fen,
      engineId: 'stockfish-wasm',
      engineName: 'Stockfish',
      score: cp(20),
      depth: 12,
      nodes: 100,
      timeMs: 10,
      pv: [],
      analysedAt: 1,
    });

    const loaded = await loadRecurringFacts(repositories, {
      aliases: [' player '],
      from: Date.parse('2026-09-01T00:00:00Z'),
      to: Date.parse('2026-10-01T00:00:00Z'),
    });

    expect(loaded.games.map((game) => game.black)).toEqual(['Included']);
    expect(loaded.positions.length).toBeGreaterThan(0);
    expect(loaded.evidence).toHaveLength(1);
    expect(loaded.evidence[0]).toMatchObject({ gameId: included.id, nodeId: rootId });
    repositories.close();
  });
});
