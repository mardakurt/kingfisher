import { positionKey } from '@/chess/fen';
import { parsePgn, serializePgn, type ParsedGame } from '@/chess/pgn';
import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import type { GameResult } from '@/database/types';

import { gameFingerprint } from './ids';
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
  readonly yieldEvery?: number;
}

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
  const yieldEvery = Math.max(1, options.yieldEvery ?? 8);

  for (const [index, parsedGame] of parsed.games.entries()) {
    throwIfAborted(options.signal);
    options.onProgress?.({ stage: 'importing', completed: index, total });
    const game = normalizeGame(parsedGame.tree);
    firstGame ??= game;
    const positions = indexGame(game);
    options.onProgress?.({ stage: 'indexing', completed: index, total });
    const persisted = await repository.persist(game, positions);
    if (persisted.duplicate) duplicates += 1;
    else {
      imported += 1;
      indexedPositions += positions.length;
    }
    if ((index + 1) % yieldEvery === 0) await yieldToBrowser();
  }

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
  return {
    id: `game-${fingerprint}`,
    fingerprint,
    tree,
    normalizedPgn,
    importedAt,
    white: headers.White || 'Unknown',
    black: headers.Black || 'Unknown',
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
