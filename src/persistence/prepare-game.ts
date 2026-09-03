import { isOk } from '@/chess/result';
import { parseFen, positionKey, type FenParts } from '@/chess/fen';
import { pawnFeatures, positionFeatures, type PawnFeatures } from '@/chess/features';
import {
  pawnSkeletonKeyFromParts,
  structureClaims,
  structureFactsFromFeatures,
  structureSignature,
} from '@/chess/structure';
import { serializePgn } from '@/chess/pgn';
import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import type { GameResult } from '@/database/types';

import { gameFingerprint } from './ids';
import { playerKey } from './schema/migrations';
import type { GameRecord, PositionRecord } from './types';

/** Normalize one parsed tree into the durable game identity used by every store. */
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
 * Pawn analysis, memoized by pawn skeleton.
 *
 * `pawnFeatures` is a pure function of where the pawns stand, so two positions
 * sharing a skeleton share its result exactly — which makes a shared memo safe
 * rather than merely convenient. Openings repeat heavily across an archive, so
 * a cache spanning an import gets far more hits than a per-game one: measured
 * on 210,319 positions, per-game memoization took the walk from 2,345 ms to
 * 2,169 ms, and sharing it across the import took it to the figure recorded in
 * the performance notes.
 *
 * Bounded, and cleared wholesale when it fills. An LRU's bookkeeping would
 * cost more than the misses it saves for a workload that arrives in opening
 * order, where the entries about to be evicted are the ones least likely to
 * recur.
 */
const PAWN_CACHE_LIMIT = 8192;
const pawnCache = new Map<string, PawnFeatures>();

function cachedPawnFeatures(skeleton: string, parts: FenParts): PawnFeatures {
  const hit = pawnCache.get(skeleton);
  if (hit) return hit;
  const computed = pawnFeatures(parts);
  if (pawnCache.size >= PAWN_CACHE_LIMIT) pawnCache.clear();
  pawnCache.set(skeleton, computed);
  return computed;
}

/** Exported for the benchmark, which needs a cold cache to measure honestly. */
export function clearPawnFeatureCache(): void {
  pawnCache.clear();
}

/** Canonical, deduplicated main-line positions for one durable game. */
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
    /*
      One FEN parse per indexed position, and one pawn analysis per skeleton.

      Structure indexing is the most expensive thing this loop does. Two things
      make it cheaper without changing a single stored value: it runs after the
      dedupe check rather than before it, and it shares one parse across the
      position key, the skeleton and the facts.

      The third is the memo. Pawn structure and file state depend only on where
      the pawns are, and roughly half the moves in a game do not move a pawn —
      so within one game the same skeleton recurs constantly and its analysis
      is computed once.
    */
    const parsed = parseFen(node.fen);
    const parts = isOk(parsed) ? parsed.value : null;
    const skeleton = parts ? pawnSkeletonKeyFromParts(parts) : null;

    const pawns = parts && skeleton !== null ? cachedPawnFeatures(skeleton, parts) : undefined;
    const facts = parts ? structureFactsFromFeatures(positionFeatures(parts, pawns), parts) : null;
    records.push({
      id: `${key}|${game.id}|${child.ply}|${child.move.uci}`,
      positionKey: key,
      gameId: game.id,
      ply: child.ply,
      moveUci: child.move.uci,
      moveSan: child.move.san,
      mover: child.move.color,
      fen: node.fen,
      nodeId: node.id,
      ...(skeleton !== null ? { pawnSkeleton: skeleton } : {}),
      ...(facts
        ? {
            structureSignature: structureSignature(facts),
            structureClaims: structureClaims(facts).map((claim) => claim.id),
          }
        : {}),
    });
  }
  return records;
}

const gameResult = (value: string | undefined): GameResult =>
  value === '1-0' || value === '0-1' || value === '1/2-1/2' || value === '*' ? value : '*';

const positiveNumber = (value: string | undefined): number | undefined => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
};
