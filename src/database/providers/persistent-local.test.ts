/**
 * The explorer's worker lifecycle.
 *
 * These are the failures that would show up as an explorer answering about a
 * position the user has already left, or as an empty table that reads like
 * "no games reach this position" when the truth is "the worker never started".
 * Neither is visible in a screenshot, so they are pinned here.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { createMemoryRepositories } from '@/persistence/repositories';
import type { AppRepositories } from '@/persistence/types';
import { parsePgn } from '@/chess/pgn';
import { indexGame, normalizeGame } from '@/persistence/import-game';

import { PersistentLocalCollectionProvider } from './persistent-local';
import type { ExplorerResult } from '../types';

/** A worker double that answers only when the test says so. */
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  posted: unknown[] = [];

  postMessage(value: unknown) {
    this.posted.push(value);
  }
  terminate() {
    this.terminated = true;
  }
  answer(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
  fail(message: string) {
    this.onerror?.({ message } as ErrorEvent);
  }
}

let repositories: AppRepositories;

beforeEach(async () => {
  repositories = createMemoryRepositories();
  const parsed = parsePgn('[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 *').games[0];
  if (!parsed) throw new Error('fixture did not parse');
  const game = normalizeGame(parsed.tree, 1);
  await repositories.games.persist(game, indexGame(game));
});

/** `explore` awaits the repositories before it wires the worker up. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const provider = (createWorker: () => Worker | null) =>
  new PersistentLocalCollectionProvider({
    repositories: async () => repositories,
    createWorker,
  });

describe('exploring through a worker', () => {
  it('answers with what the worker sends back', async () => {
    const worker = new FakeWorker();
    const result = provider(() => worker as unknown as Worker).explore({ fen: START_FEN });
    await flush();
    const answer = { fen: START_FEN, moves: [], totalGames: 7 } as unknown as ExplorerResult;
    worker.answer({ ok: true, result: answer });

    expect(await result).toEqual(answer);
    expect(worker.terminated).toBe(true);
    expect(worker.posted).toHaveLength(1);
  });

  it('rejects and tears the worker down when the lookup is cancelled', async () => {
    const worker = new FakeWorker();
    const controller = new AbortController();
    const result = provider(() => worker as unknown as Worker).explore(
      { fen: START_FEN },
      controller.signal,
    );
    await flush();
    controller.abort();

    await expect(result).rejects.toThrow(/cancelled/i);
    expect(worker.terminated).toBe(true);
  });

  /**
   * The race the whole design exists to prevent: the user moves on, the old
   * lookup is cancelled, and its answer arrives afterwards. It must not become
   * the answer for the position now on the board.
   */
  it('ignores an answer that arrives after cancellation', async () => {
    const worker = new FakeWorker();
    const controller = new AbortController();
    const result = provider(() => worker as unknown as Worker).explore(
      { fen: START_FEN },
      controller.signal,
    );
    await flush();
    controller.abort();
    worker.answer({ ok: true, result: { totalGames: 999 } });

    await expect(result).rejects.toThrow(/cancelled/i);
  });

  it('refuses before starting a worker at all when already cancelled', async () => {
    const created = vi.fn(() => new FakeWorker() as unknown as Worker);
    const controller = new AbortController();
    controller.abort();

    await expect(provider(created).explore({ fen: START_FEN }, controller.signal)).rejects.toThrow(
      /cancelled/i,
    );
    expect(created).not.toHaveBeenCalled();
  });

  it('surfaces an error the worker reports rather than an empty result', async () => {
    const worker = new FakeWorker();
    const result = provider(() => worker as unknown as Worker).explore({ fen: START_FEN });
    await flush();
    worker.answer({ ok: false, error: 'Local exploration failed.' });

    await expect(result).rejects.toThrow('Local exploration failed.');
  });
});

describe('when there is no worker to run in', () => {
  it('answers from the repository instead of showing nothing', async () => {
    const result = await provider(() => null).explore({ fen: START_FEN });
    expect(result.totalGames).toBe(1);
    expect(result.moves.map((move) => move.san)).toEqual(['e4']);
  });

  it('falls back when the worker fails to load', async () => {
    const worker = new FakeWorker();
    const result = provider(() => worker as unknown as Worker).explore({ fen: START_FEN });
    await flush();
    worker.fail('Failed to construct Worker');

    expect((await result).totalGames).toBe(1);
    expect(worker.terminated).toBe(true);
  });
});
