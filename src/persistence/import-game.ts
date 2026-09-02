import { parsePgn, type ParsedGame } from '@/chess/pgn';

import { indexGame, normalizeGame } from './prepare-game';
import type { PreparedLocalGame } from './pgn-import-protocol';
import { runPgnWorker } from './pgn-worker-client';
import type {
  GameRecord,
  GameRepository,
  ImportProgress,
  PersistentImportSummary,
  PositionRecord,
} from './types';

export interface ImportGamesOptions {
  readonly onProgress?: (progress: ImportProgress) => void;
  readonly signal?: AbortSignal;
  /**
   * Games per transaction. Larger batches import faster and make cancellation
   * coarser, since a batch is the unit that either lands whole or not at all.
   */
  readonly batchSize?: number;
  /** Test/embedder seam; production uses the module Worker. */
  readonly createWorker?: () => Worker | null;
}

/**
 * Games per transaction.
 *
 * Chosen for the cancellation contract, not for speed. Import throughput was
 * measured at batch sizes 1 and 100 over a thousand-game file and the
 * difference was inside the run-to-run noise of a dev build (7–17 ms per game
 * across repeated runs either way), so no speed claim is made here: the cost is
 * dominated by parsing and position extraction rather than by transaction
 * commits, which measured well under a millisecond each.
 *
 * What batching does buy is a defined unit of atomicity. A cancelled or failed
 * import leaves whole batches committed and nothing half-written, and at this
 * size at most a hundred games of work is discarded.
 */
const DEFAULT_BATCH_SIZE = 100;

/** Nothing was read, so nothing can be reported except that it stopped. */
const CANCELLED_BEFORE_START: PersistentImportSummary = {
  games: 0,
  imported: 0,
  duplicates: 0,
  indexedPositions: 0,
  issues: 0,
  cancelled: true,
};

export async function importGames(
  source: string | Blob,
  repository: GameRepository,
  options: ImportGamesOptions = {},
): Promise<PersistentImportSummary> {
  options.onProgress?.({ stage: 'parsing', completed: 0, total: 0 });
  await yieldToBrowser();
  /*
    Cancellation is a result, not an exception — at every point, including
    before parsing. One contract means a caller writes one accounting path
    instead of guessing which cancellations threw and which returned.
  */
  if (options.signal?.aborted) return CANCELLED_BEFORE_START;
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
  let imported = 0;
  let duplicates = 0;
  let indexedPositions = 0;
  let firstGame: GameRecord | undefined;

  const worker = runPgnWorker<PreparedLocalGame>(source, {
    target: 'local',
    batchSize,
    signal: options.signal,
    createWorker: options.createWorker,
    onParsed: (completed) => options.onProgress?.({ stage: 'parsing', completed, total: 0 }),
    onBatch: async (batch, completed) => {
      firstGame ??= batch[0]?.game;
      options.onProgress?.({ stage: 'indexing', completed, total: 0 });
      options.onProgress?.({ stage: 'importing', completed, total: 0 });
      const results = await repository.persistMany(batch);
      for (const [index, result] of results.entries()) {
        if (result.duplicate) duplicates += 1;
        else {
          imported += 1;
          indexedPositions += batch[index]?.positions.length ?? 0;
        }
      }
    },
  });

  if (worker) {
    const run = await worker;
    if (run.total === 0 && !run.cancelled) throw new Error('No games were found in that PGN.');
    options.onProgress?.({ stage: 'complete', completed: run.parsed, total: run.total });
    return {
      games: run.total,
      imported,
      duplicates,
      indexedPositions,
      issues: run.issues,
      cancelled: run.cancelled,
      ...(firstGame ? { firstGame } : {}),
    };
  }

  const text = typeof source === 'string' ? source : await source.text();
  return importGamesOnMainThread(text, repository, options, batchSize);
}

/** Compatibility path for runtimes that refuse module Workers. */
async function importGamesOnMainThread(
  source: string,
  repository: GameRepository,
  options: ImportGamesOptions,
  batchSize: number,
): Promise<PersistentImportSummary> {
  const parsed = parsePgn(source);
  const total = parsed.games.length;
  if (total === 0) throw new Error('No games were found in that PGN.');

  let imported = 0;
  let duplicates = 0;
  let indexedPositions = 0;
  let firstGame: GameRecord | undefined;
  let batch: { game: GameRecord; positions: PositionRecord[] }[] = [];

  const flush = async (completed: number): Promise<void> => {
    if (batch.length === 0) return;
    options.onProgress?.({ stage: 'importing', completed, total });
    const results = await repository.persistMany(batch);
    for (const [index, result] of results.entries()) {
      if (result.duplicate) duplicates += 1;
      else {
        imported += 1;
        indexedPositions += batch[index]?.positions.length ?? 0;
      }
    }
    batch = [];
    // Between batches, not between games: the yield is worth a round trip only
    // when there is real work either side of it.
    await yieldToBrowser();
  };

  let cancelled = false;
  for (const [index, parsedGame] of parsed.games.entries()) {
    if (options.signal?.aborted) {
      cancelled = true;
      break;
    }

    const game = normalizeGame(parsedGame.tree);
    firstGame ??= game;
    // Position extraction is the "indexing" the progress line refers to; it
    // happens per game, before anything is written.
    options.onProgress?.({ stage: 'indexing', completed: index, total });
    batch.push({ game, positions: indexGame(game) });

    if (batch.length >= batchSize) await flush(index + 1);
  }

  /*
    The final flush runs even for a cancelled import. The games in it were
    already parsed and indexed; discarding them would throw away work the user
    has waited for, and the batch is atomic either way.
  */
  await flush(total);

  options.onProgress?.({ stage: 'complete', completed: total, total });
  return {
    games: total,
    imported,
    duplicates,
    indexedPositions,
    issues: parsed.games.reduce((sum, game) => sum + game.issues.length, 0) + parsed.issues.length,
    cancelled,
    ...(firstGame ? { firstGame } : {}),
  };
}

export { indexGame, normalizeGame } from './prepare-game';

export function importSummaryIssues(games: readonly ParsedGame[]): number {
  return games.reduce((total, game) => total + game.issues.length, 0);
}

interface SchedulerWithYield {
  yield?: () => Promise<void>;
}

/**
 * Hand the main thread back between games.
 *
 * Deliberately *not* `requestAnimationFrame`. A user who starts a large import
 * and switches tabs is doing the most reasonable thing in the world, and a
 * hidden tab stops painting — so an animation-frame yield stops resolving and
 * the import hangs until they come back. Yielding as a task keeps the work
 * running whether or not anyone is watching.
 *
 * `scheduler.yield()` is preferred where it exists because it resumes ahead of
 * newly-queued work; the message channel is the portable equivalent, and beats
 * `setTimeout`, which browsers clamp hard in background tabs.
 */
const yieldToBrowser = (): Promise<void> => {
  const scheduler = (globalThis as { scheduler?: SchedulerWithYield }).scheduler;
  if (typeof scheduler?.yield === 'function') return scheduler.yield();

  if (typeof MessageChannel === 'function') {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(undefined);
    });
  }

  return new Promise((resolve) => setTimeout(resolve, 0));
};
