/**
 * The application's own import path, in the form the companion runs it
 * (Phase 85).
 *
 * A million-game file cannot be read into a browser tab, so the companion
 * imports it — but the companion is plain Node, and an import that decided
 * position keys, fingerprints or openings any other way would be a second
 * importer, and the explorer would disagree with the browser. So this module
 * gathers the browser's functions — parsePgn, normalizeGame, classifyTree,
 * indexGame, the line index, the ChessBase reader — and
 * `scripts/build-companion-kit.mjs` bundles it into one file the companion
 * loads. Nothing here is new logic; it is the import the browser does,
 * batched.
 */

import { parsePgn } from '@/chess/pgn';
import { ChessBaseDatabase, isGame } from '@/database/chessbase/database';
import { prepareChessBaseGame } from '@/database/chessbase/prepare';
import type { ByteSource } from '@/database/chessbase/types';
import type { TransferGame } from '@/database/collections/types';
import { indexGame, normalizeGame } from '@/persistence/prepare-game';
import { lineIndexForTree } from '@/search/line-index-encode';
import { classifyTree } from '@/theory/classify-games';
import { loadOpeningIndex, type OpeningIndex } from '@/theory/openings';

export { ChessBaseDatabase, loadOpeningIndex };
export type { ByteSource };

/** A game as the companion's `/db/import` takes it. */
export interface CompanionPayload {
  readonly game: Record<string, unknown>;
  readonly pgn: string;
  readonly positions: readonly Record<string, unknown>[];
  readonly line?: string;
}

function payloadOf(transfer: TransferGame, keepPositions: boolean): CompanionPayload {
  const summary = transfer.summary;
  return {
    game: {
      fingerprint: summary.fingerprint,
      white: summary.white,
      black: summary.black,
      whiteKey: summary.whiteKey,
      blackKey: summary.blackKey,
      result: summary.result,
      date: summary.date,
      year: summary.year,
      event: summary.event,
      site: summary.site,
      round: summary.round,
      whiteRating: summary.whiteRating,
      blackRating: summary.blackRating,
      eco: summary.eco,
      opening: summary.opening,
      classification: summary.classification,
      classifiedWith: summary.classifiedWith,
      plyCount: transfer.positions.length,
      importedAt: summary.importedAt,
    },
    pgn: transfer.pgn,
    positions: keepPositions ? (transfer.positions as unknown as Record<string, unknown>[]) : [],
    ...(transfer.tree ? { line: lineIndexForTree(transfer.tree) } : {}),
  };
}

/**
 * Many games of PGN text, prepared as the browser's importer prepares them.
 * A game with an error, or of a variant, is counted and left out.
 */
export function preparePgnBatch(
  text: string,
  openings: OpeningIndex | null,
  keepPositions = true,
  importedAt = Date.now(),
): { readonly payloads: CompanionPayload[]; readonly rejected: number; readonly read: number } {
  const parsed = parsePgn(text);
  const payloads: CompanionPayload[] = [];
  let rejected = 0;
  for (const game of parsed.games) {
    try {
      if (
        game.issues.some((issue) => issue.severity === 'error') ||
        (game.tree.headers.Variant && game.tree.headers.Variant !== 'Standard')
      ) {
        rejected += 1;
        continue;
      }
      const base = normalizeGame(game.tree, importedAt);
      const record = openings ? { ...base, ...classifyTree(openings, base.tree) } : base;
      const positions = indexGame(record);
      const { tree, normalizedPgn, id: _id, ...summary } = record;
      void _id;
      payloads.push(
        payloadOf(
          {
            summary,
            pgn: normalizedPgn,
            positions: positions.map(({ id: _p, gameId: _g, ...position }) => {
              void _p;
              void _g;
              return position;
            }),
            tree,
          },
          keepPositions,
        ),
      );
    } catch {
      rejected += 1;
    }
  }
  return { payloads, rejected, read: parsed.games.length };
}

/**
 * Games `from`…`to` of a ChessBase database, prepared the same way: each
 * decoded, rendered as PGN (with its comments, variations and symbols —
 * `database.ts`), and imported like any PGN game. Failures are counted with
 * their reasons.
 */
export function prepareChessBaseRange(
  database: ChessBaseDatabase,
  from: number,
  to: number,
  openings: OpeningIndex | null,
  keepPositions = true,
  importedAt = Date.now(),
): {
  readonly payloads: CompanionPayload[];
  readonly failures: readonly { readonly id: number; readonly reason: string }[];
} {
  const payloads: CompanionPayload[] = [];
  const failures: { id: number; reason: string }[] = [];
  for (const result of database.games(from, to)) {
    if (!isGame(result)) {
      // A guiding text and a deleted game are not failures; they are not games.
      if (result.header?.text || result.header?.deleted) continue;
      failures.push({ id: result.id, reason: result.reason });
      continue;
    }
    try {
      payloads.push(
        payloadOf(prepareChessBaseGame(result.pgn, openings, importedAt), keepPositions),
      );
    } catch (error) {
      failures.push({
        id: result.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { payloads, failures };
}
