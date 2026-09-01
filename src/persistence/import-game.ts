import { positionKey } from '@/chess/fen';
import { parsePgn, serializePgn, type ParsedGame } from '@/chess/pgn';
import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import type { GameResult } from '@/database/types';

import { gameFingerprint } from './ids';
import { playerKey } from './schema/migrations';
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

export async function importGames(
  source: string,
  repository: GameRepository,
  options: ImportGamesOptions = {},
): Promise<PersistentImportSummary> {
  options.onProgress?.({ stage: 'parsing', completed: 0, total: 0 });
  await yieldToBrowser();
  throwIfAborted(options.signal);
  const parsed = parsePgn(source);
  const total = parsed.games.length;
  if (total === 0) throw new Error('No games were found in that PGN.');

  let imported = 0;
  let duplicates = 0;
  let indexedPositions = 0;
  let firstGame: GameRecord | undefined;
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);

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

  for (const [index, parsedGame] of parsed.games.entries()) {
    throwIfAborted(options.signal);

    const game = normalizeGame(parsedGame.tree);
    firstGame ??= game;
    // Position extraction is the "indexing" the progress line refers to; it
    // happens per game, before anything is written.
    options.onProgress?.({ stage: 'indexing', completed: index, total });
    batch.push({ game, positions: indexGame(game) });

    if (batch.length >= batchSize) await flush(index + 1);
  }

  await flush(total);

  options.onProgress?.({ stage: 'complete', completed: total, total });
  return {
    games: total,
    imported,
    duplicates,
    indexedPositions,
    issues: parsed.games.reduce((sum, game) => sum + game.issues.length, 0) + parsed.issues.length,
    ...(firstGame ? { firstGame } : {}),
  };
}

export function normalizeGame(tree: GameTree, importedAt = Date.now()): GameRecord {
  const normalizedPgn = serializePgn(tree, { lineWidth: 80 });
  const fingerprint = gameFingerprint(tree, normalizedPgn);
  const headers = tree.headers;
  const whiteRating = positiveNumber(headers.WhiteElo);
  const blackRating = positiveNumber(headers.BlackElo);
  const year = positiveNumber(headers.Date?.slice(0, 4));
  const whiteName = headers.White || 'Unknown';
  const blackName = headers.Black || 'Unknown';
  const whiteKey = playerKey(whiteName);
  const blackKey = playerKey(blackName);

  return {
    id: `game-${fingerprint}`,
    fingerprint,
    whiteKey,
    blackKey,
    playerKeys: whiteKey === blackKey ? [whiteKey] : [whiteKey, blackKey],
    tree,
    normalizedPgn,
    importedAt,
    white: whiteName,
    black: blackName,
    result: gameResult(headers.Result),
    ...(headers.Date ? { date: headers.Date } : {}),
    ...(year && year > 1000 ? { year } : {}),
    ...(headers.Event ? { event: headers.Event } : {}),
    ...(headers.Site ? { site: headers.Site } : {}),
    ...(headers.Round ? { round: headers.Round } : {}),
    ...(whiteRating ? { whiteRating } : {}),
    ...(blackRating ? { blackRating } : {}),
    ...(headers.ECO ? { eco: headers.ECO } : {}),
    ...(headers.Opening ? { opening: headers.Opening } : {}),
    ...(headers.Variation ? { variation: headers.Variation } : {}),
    ...(headers.TimeControl ? { timeControl: headers.TimeControl } : {}),
  };
}

/**
 * Position identity is placement + side + castling + legal en-passant state.
 * Move counters are intentionally omitted by `positionKey`, so transpositions
 * reached through different move orders converge.
 */
export function indexGame(game: GameRecord): PositionRecord[] {
  const path = mainlinePath(game.tree);
  const records: PositionRecord[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < path.length - 1; index += 1) {
    const node = game.tree.nodes[path[index] as NodeId];
    const child = game.tree.nodes[path[index + 1] as NodeId];
    if (!node || !child?.move) continue;
    const key = positionKey(node.fen);
    const dedupe = `${key}|${child.move.uci}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    records.push({
      id: `${key}|${game.id}|${child.ply}|${child.move.uci}`,
      positionKey: key,
      gameId: game.id,
      ply: child.ply,
      moveUci: child.move.uci,
      moveSan: child.move.san,
      mover: child.move.color,
    });
  }
  return records;
}

export function importSummaryIssues(games: readonly ParsedGame[]): number {
  return games.reduce((total, game) => total + game.issues.length, 0);
}

const gameResult = (value: string | undefined): GameResult =>
  value === '1-0' || value === '0-1' || value === '1/2-1/2' || value === '*' ? value : '*';

const positiveNumber = (value: string | undefined): number | undefined => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
};

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new DOMException('The import was cancelled.', 'AbortError');
};

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
