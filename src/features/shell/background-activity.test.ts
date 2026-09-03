import { describe, expect, it } from 'vitest';

import {
  describeProgress,
  fromQueueJobs,
  hasFailure,
  summarise,
  type BackgroundActivity,
} from './background-activity';

const activity = (
  id: string,
  state: BackgroundActivity['state'],
  detail: string | null = null,
): BackgroundActivity => ({ id, label: id, state, progress: null, detail });

describe('summarise', () => {
  it('says nothing when nothing is happening', () => {
    expect(summarise([])).toBeNull();
    expect(summarise([activity('Import', 'completed')])).toBeNull();
  });

  it('names a single running task and what it is doing', () => {
    expect(summarise([activity('PGN import', 'running', '2 of 40 games')])).toBe(
      'PGN import · 2 of 40 games',
    );
  });

  it('counts several rather than listing them in a status bar', () => {
    expect(summarise([activity('a', 'running'), activity('b', 'running')])).toBe(
      '2 background tasks running',
    );
  });

  /* A failed job is the only one that needs a decision, so it goes first. */
  it('prefers a failure over work that is merely in progress', () => {
    expect(summarise([activity('Import', 'running'), activity('Repair', 'failed')])).toBe(
      'Repair failed',
    );
  });

  it('counts multiple failures', () => {
    expect(summarise([activity('a', 'failed'), activity('b', 'failed')])).toBe(
      '2 background tasks failed',
    );
  });

  it('does not let paused work claim the strip', () => {
    // Reachable from the menu; not something to announce.
    expect(summarise([activity('Queue', 'paused')])).toBeNull();
  });
});

describe('hasFailure', () => {
  it('distinguishes needing attention from needing patience', () => {
    expect(hasFailure([activity('a', 'running')])).toBe(false);
    expect(hasFailure([activity('a', 'failed')])).toBe(true);
  });
});

describe('describeProgress', () => {
  it('pluralises once, rather than at four call sites', () => {
    expect(describeProgress(1, 1, 'game')).toBe('1 of 1 game');
    expect(describeProgress(2, 40, 'game')).toBe('2 of 40 games');
  });

  it('says nothing when the total is unknown', () => {
    expect(describeProgress(0, 0, 'game')).toBeNull();
  });
});

describe('fromQueueJobs', () => {
  const job = (status: string, nextIndex = 0, totalPositions = 10) => ({
    status,
    nextIndex,
    totalPositions,
  });

  it('reports nothing for a queue that is empty or finished', () => {
    expect(fromQueueJobs([], true)).toBeNull();
    expect(fromQueueJobs([job('completed')], true)).toBeNull();
  });

  it('collapses many rows into one activity, because that is the work', () => {
    const entry = fromQueueJobs([job('pending'), job('running', 5)], true);
    expect(entry?.label).toBe('Analysis queue');
    expect(entry?.detail).toBe('2 of 2 games');
    expect(entry?.progress).toBeCloseTo(0.25);
  });

  /* A queue reporting itself as running while the engine is idle is a lie. */
  it('reports a stopped queue as paused rather than running', () => {
    expect(fromQueueJobs([job('pending')], false)?.state).toBe('paused');
    expect(fromQueueJobs([job('pending')], true)?.state).toBe('running');
  });

  it('surfaces failures even when nothing is left to run', () => {
    expect(fromQueueJobs([job('failed')], false)?.state).toBe('failed');
  });
});
