import { positionKey } from '@/chess/fen';
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

const gameResult = (value: string | undefined): GameResult =>
  value === '1-0' || value === '0-1' || value === '1/2-1/2' || value === '*' ? value : '*';

const positiveNumber = (value: string | undefined): number | undefined => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
};
