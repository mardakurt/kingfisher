import { describe, expect, it } from 'vitest';

import { cp, mate } from '@/chess/evaluation';
import { START_FEN } from '@/chess/fen';

import { analysisHistoryId } from './analysis-history-repository';
import { createMemoryRepositories } from './index';

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

describe('analysis history', () => {
  it('keeps one row per position: a second search replaces the first', async () => {
    const repositories = await createMemoryRepositories();
    const history = repositories.analysisHistory;
    const base = { engine: 'Stockfish 18', line: ['e4', 'e5'], title: 'Untitled analysis' };
    await history.record({ ...base, fen: START_FEN, score: cp(20), depth: 18 }, 10);
    await history.record({ ...base, fen: AFTER_E4, score: cp(31), depth: 22 }, 20);
    // The same position, reached by a different move number: still one row.
    const again = await history.record(
      { ...base, fen: START_FEN.replace(' 0 1', ' 4 3'), score: cp(25), depth: 30 },
      30,
    );

    const rows = await history.list();
    expect(rows.map((row) => row.fen)).toEqual([START_FEN.replace(' 0 1', ' 4 3'), AFTER_E4]);
    expect(again.id).toBe(analysisHistoryId(START_FEN));
    expect(again).toMatchObject({ depth: 30, revision: 1, createdAt: 10, analysedAt: 30 });
  });

  it('keeps at most ten moves of the line, and mate scores as mate', async () => {
    const repositories = await createMemoryRepositories();
    const row = await repositories.analysisHistory.record({
      fen: START_FEN,
      score: mate(3),
      depth: 12,
      engine: 'Stockfish 18',
      line: Array.from({ length: 14 }, (_, index) => `m${index}`),
      title: 'A study',
    });
    expect(row.line).toHaveLength(10);
    expect(row.score).toEqual({ kind: 'mate', moves: 3 });
  });

  it('forgets a position on request', async () => {
    const repositories = await createMemoryRepositories();
    const row = await repositories.analysisHistory.record({
      fen: START_FEN,
      score: cp(0),
      depth: 12,
      engine: 'Stockfish 18',
      line: [],
      title: 'x',
    });
    await repositories.analysisHistory.delete(row.id);
    expect(await repositories.analysisHistory.list()).toEqual([]);
  });
});
