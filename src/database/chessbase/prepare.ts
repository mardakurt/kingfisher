/**
 * From a ChessBase game's PGN to a game any collection can store.
 *
 * The same three steps the PGN importer takes — parse and validate, normalise
 * (fingerprint, player keys, headers), index positions and classify — so a
 * game that came from a .cbh is indistinguishable in the store from one that
 * came from a .pgn, except for the tags that say where it came from.
 */

import { parsePgn } from '@/chess/pgn';
import type { TransferGame } from '@/database/collections/types';
import { indexGame, normalizeGame } from '@/persistence/prepare-game';
import { classifyTree } from '@/theory/classify-games';
import type { OpeningIndex } from '@/theory/openings';

export function prepareChessBaseGame(
  pgn: string,
  openings: OpeningIndex | null,
  importedAt = Date.now(),
): TransferGame {
  const parsed = parsePgn(pgn);
  const first = parsed.games[0];
  const errors = [
    ...parsed.issues.filter((issue) => issue.severity === 'error'),
    ...(first?.issues.filter((issue) => issue.severity === 'error') ?? []),
  ];
  if (!first || errors.length)
    throw new Error(errors[0]?.message ?? 'the converted game failed PGN validation');
  const base = normalizeGame(first.tree, importedAt);
  const record = openings ? { ...base, ...classifyTree(openings, base.tree) } : base;
  const positions = indexGame(record);
  const { tree, normalizedPgn, id: _id, ...summary } = record;
  void _id;
  return {
    summary,
    pgn: normalizedPgn,
    positions: positions.map(({ id: _pid, gameId: _gid, ...position }) => {
      void _pid;
      void _gid;
      return position;
    }),
    tree,
  };
}
