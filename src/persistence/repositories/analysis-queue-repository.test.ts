import { describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { cp } from '@/chess/evaluation';
import { asUci } from '@/chess/types';
import { createMemoryRepositories } from '@/persistence/repositories';

describe('analysis queue repository', () => {
  it('persists lifecycle state and recovers an abandoned running owner', async () => {
    const repositories = createMemoryRepositories();
    const queued = await repositories.analysisQueue.enqueue({
      gameId: 'game-1',
      gameLabel: 'White – Black',
      engineId: 'stockfish-wasm',
      preset: 'quick',
      multiPv: 1,
      limit: { kind: 'movetime', ms: 250 },
      strategy: 'every-move',
      startPly: 1,
      totalPositions: 10,
    });

    const claimed = await repositories.analysisQueue.claimNext('tab-a', 1_000);
    expect(claimed).toMatchObject({ id: queued.id, status: 'running', ownerId: 'tab-a' });
    expect(await repositories.analysisQueue.claimNext('tab-b', 1_001)).toBeNull();

    expect(await repositories.analysisQueue.recoverInterrupted(40_001, 30_000)).toBe(1);
    expect(await repositories.analysisQueue.list()).toMatchObject([
      { id: queued.id, status: 'paused', nextIndex: 0 },
    ]);
  });

  it('stores only durable final evidence and can count it per job', async () => {
    const repositories = createMemoryRepositories();
    await repositories.analysisQueue.saveEvidence({
      id: 'job-1|node-1',
      jobId: 'job-1',
      gameId: 'game-1',
      nodeId: 'node-1',
      positionKey: 'start',
      fen: START_FEN,
      engineId: 'stockfish-wasm',
      engineName: 'Stockfish',
      score: cp(34),
      depth: 16,
      nodes: 12_345,
      timeMs: 250,
      pv: [asUci('e2e4')],
      analysedAt: 2_000,
    });

    expect(await repositories.analysisQueue.countEvidence('job-1')).toBe(1);
    expect(await repositories.analysisQueue.evidenceForGame('game-1')).toMatchObject([
      { depth: 16, nodes: 12_345, score: { kind: 'cp', cp: 34 } },
    ]);
  });
});
