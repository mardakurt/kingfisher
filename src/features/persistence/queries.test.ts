import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import {
  invalidateGames,
  invalidateModelGames,
  invalidateRepertoires,
  invalidateTraining,
} from './queries';

/**
 * Cache invalidation, checked against what the cached answer is made of.
 *
 * `usePositionContext` answers "have I been here before?" from five different
 * repositories and caches it under the position key alone. The key cannot
 * express any of the five, so the only thing standing between a user and a
 * stale count is these functions remembering to say so — and nothing was
 * saying so, which is the bug this file exists to keep fixed.
 */

/** A client holding a settled `position-context` answer for one position. */
function clientWithContext() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['position-context', 'najdorf-key'], {
    localGames: 0,
    personalGames: 0,
    studies: 0,
    repertoires: 0,
    trainingItems: 0,
    modelGames: 0,
    routes: [],
  });
  return client;
}

const stale = (client: QueryClient) =>
  client.getQueryState(['position-context', 'najdorf-key'])?.isInvalidated === true;

describe('workspace cache invalidation', () => {
  it('starts from a cached answer that is not yet stale', () => {
    expect(stale(clientWithContext())).toBe(false);
  });

  /*
    One case per input. Written separately rather than as a loop so that a
    failure names the mutation whose invalidation went missing, which is the
    only thing a reader of the failure needs to know.
  */
  it('refreshes the position context when games are imported or removed', () => {
    const client = clientWithContext();
    invalidateGames(client);
    expect(stale(client), 'local and personal game counts come from the games store').toBe(true);
  });

  it('refreshes the position context when a repertoire changes', () => {
    const client = clientWithContext();
    invalidateRepertoires(client);
    expect(stale(client), 'the repertoire count is one of its six fields').toBe(true);
  });

  it('refreshes the position context when training items change', () => {
    const client = clientWithContext();
    invalidateTraining(client);
    expect(stale(client), 'the training count is one of its six fields').toBe(true);
  });

  it('refreshes the position context when model games change', () => {
    const client = clientWithContext();
    invalidateModelGames(client);
    expect(stale(client), 'the model-game count is one of its six fields').toBe(true);
  });

  it('still refreshes everything an import already refreshed', () => {
    // The fix must not have replaced any of the existing invalidations.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    for (const key of [
      ['persistence', 'games', {}],
      ['persistence', 'game-count'],
      ['explorer', 'kingfisher-starter', 'v1', 'fen', {}],
      ['transpositions', 'najdorf-key'],
    ]) {
      client.setQueryData(key, 'settled');
    }
    invalidateGames(client);
    for (const key of [
      ['persistence', 'games', {}],
      ['persistence', 'game-count'],
      ['explorer', 'kingfisher-starter', 'v1', 'fen', {}],
      ['transpositions', 'najdorf-key'],
    ]) {
      expect(client.getQueryState(key)?.isInvalidated, key.join('/')).toBe(true);
    }
  });
});
