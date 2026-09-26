import { describe, expect, it } from 'vitest';

import type { AnalysisQueueJobRecord, DeepAnalysisJobRecord } from '@/persistence/domain';

import { fromDeepJob, fromQueueJob, jobsView } from './jobs';

const queue = (overrides: Partial<AnalysisQueueJobRecord>): AnalysisQueueJobRecord => ({
  id: 'q',
  gameId: 'g',
  gameLabel: 'Carlsen – Nakamura',
  engineId: 'stockfish-browser',
  preset: 'standard',
  multiPv: 3,
  limit: { kind: 'depth', depth: 20 },
  strategy: 'every-move',
  startPly: 0,
  status: 'queued',
  nextIndex: 0,
  totalPositions: 80,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const deep = (overrides: Partial<DeepAnalysisJobRecord>): DeepAnalysisJobRecord => ({
  id: 'd',
  startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  engineId: 'stockfish-native',
  engineName: 'Stockfish 18',
  options: { breadth: 3, marginCp: 30, maxPlies: 30, budget: 1000, msPerPosition: 30_000 },
  status: 'running',
  searched: 412,
  root: {},
  resumed: 2,
  startedAt: 1,
  createdAt: 1,
  updatedAt: 5,
  revision: 0,
  ...overrides,
});

describe('one view of every analysis job', () => {
  it('keeps each job’s input, engine, budget and checkpoint', () => {
    const view = fromQueueJob(queue({ status: 'paused', nextIndex: 31 }), { now: 10 });
    expect(view).toMatchObject({
      kind: 'queue',
      state: 'paused',
      input: { gameId: 'g' },
      budget: 'depth 20 a position · MultiPV 3',
      checkpoint: { done: 31, total: 80, unit: 'positions' },
    });
    expect(fromDeepJob(deep({}), { activeHere: false })).toMatchObject({
      state: 'paused',
      engine: { name: 'Stockfish 18' },
      title: 'Deep analysis · resumed 2×',
      checkpoint: { done: 412, total: 1000 },
    });
  });

  it('calls a running queue job whose owner stopped beating interrupted, not running', () => {
    expect(
      fromQueueJob(queue({ status: 'running', heartbeatAt: 1_000 }), { now: 5_000 }).state,
    ).toBe('running');
    expect(
      fromQueueJob(queue({ status: 'running', heartbeatAt: 1_000 }), { now: 60_000 }).state,
    ).toBe('interrupted');
  });

  it('maps a deep analysis’s own words onto the shared ones, and lists what needs attention first', () => {
    const views = [
      fromDeepJob(deep({ id: 'done', status: 'done', updatedAt: 9 }), { activeHere: false }),
      fromDeepJob(deep({ id: 'stopped', status: 'stopped' }), { activeHere: false }),
      fromQueueJob(queue({ id: 'failed', status: 'failed', error: 'engine crashed' }), { now: 1 }),
      fromDeepJob(deep({ id: 'live' }), { activeHere: true }),
    ];
    expect(jobsView(views).map((view) => [view.id, view.state])).toEqual([
      ['live', 'running'],
      ['failed', 'failed'],
      ['done', 'completed'],
      ['stopped', 'cancelled'],
    ]);
    expect(views[2]!.failure).toBe('engine crashed');
  });
});
