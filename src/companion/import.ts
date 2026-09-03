'use client';

/**
 * Importing a PGN into a companion SQLite database.
 *
 * The browser still does the chess: parsing, normalising and position indexing
 * are the same functions the IndexedDB importer uses, so a game imported into
 * either store is the same game with the same fingerprint and the same
 * canonical position keys. Only the writing differs.
 *
 * That matters for more than tidiness — it is what lets a position looked up in
 * SQLite and a position looked up in IndexedDB be *the same position*, which is
 * the assumption the explorer's transposition handling rests on.
 */

import { parsePgn } from '@/chess/pgn';
import { serializePgn } from '@/chess/pgn';
import { indexGame, normalizeGame, openingIndexOrNull } from '@/persistence/import-game';
import { classifyTree } from '@/theory/classify-games';
import type { PreparedSqliteGame } from '@/persistence/pgn-import-protocol';
import { runPgnWorker } from '@/persistence/pgn-worker-client';

import type { CompanionClient } from './client';

export interface SqliteImportProgress {
  readonly parsed: number;
  readonly imported: number;
  readonly duplicates: number;
  /**
   * Games in the file.
   *
   * Zero while a streaming worker import is still running: the parser knows
   * what it has parsed and never what is still to come. Only the final result
   * carries a real total, so progress must count up rather than divide by this.
   */
  readonly total: number;
  readonly cancelled?: boolean;
}

/** Batches, because one transaction per game would spend its life in fsync. */
const BATCH = 250;

export async function importPgnIntoSqlite(
  client: CompanionClient,
  key: string,
  pgn: string,
  onProgress?: (progress: SqliteImportProgress) => void,
  signal?: AbortSignal,
): Promise<SqliteImportProgress> {
  let imported = 0;
  let duplicates = 0;
  let done = 0;
  const worker = runPgnWorker<PreparedSqliteGame>(pgn, {
    target: 'sqlite',
    batchSize: BATCH,
    signal,
    onParsed: (parsed) => {
      done = parsed;
      onProgress?.({ parsed, imported, duplicates, total: 0 });
    },
    onBatch: async (batch, parsed) => {
      const result = await client.importGames(key, [...batch]);
      imported += result.imported;
      duplicates += result.duplicates;
      done = parsed;
      onProgress?.({ parsed, imported, duplicates, total: 0 });
    },
  });
  if (worker) {
    const result = await worker;
    if (result.total === 0 && !result.cancelled)
      throw new Error('No games were found in that PGN.');
    return {
      parsed: result.parsed,
      imported,
      duplicates,
      total: result.total,
      cancelled: result.cancelled,
    };
  }

  const parsed = parsePgn(pgn);
  const total = parsed.games.length;
  const openings = await openingIndexOrNull();

  let batch: unknown[] = [];
  const flush = async () => {
    if (batch.length === 0) return;
    const result = await client.importGames(key, batch);
    imported += result.imported;
    duplicates += result.duplicates;
    batch = [];
    onProgress?.({ parsed: done, imported, duplicates, total });
  };

  for (const game of parsed.games) {
    if (signal?.aborted) break;
    const prepared = normalizeGame(game.tree);
    const record = openings ? { ...prepared, ...classifyTree(openings, prepared.tree) } : prepared;
    const positions = indexGame(record);
    batch.push({
      game: {
        fingerprint: record.fingerprint,
        white: record.white,
        black: record.black,
        whiteKey: record.whiteKey,
        blackKey: record.blackKey,
        result: record.result,
        date: record.date,
        year: record.year,
        event: record.event,
        site: record.site,
        round: record.round,
        whiteRating: record.whiteRating,
        blackRating: record.blackRating,
        eco: record.eco,
        opening: record.opening,
        classification: record.classification,
        classifiedWith: record.classifiedWith,
        plyCount: positions.length,
        importedAt: record.importedAt,
      },
      // The normalised PGN, so the row can be reopened exactly as imported.
      pgn: serializePgn(record.tree),
      positions: positions.map((position) => ({
        positionKey: position.positionKey,
        ply: position.ply,
        moveUci: position.moveUci,
        moveSan: position.moveSan,
        mover: position.mover,
        fen: position.fen,
        nodeId: position.nodeId,
        pawnSkeleton: position.pawnSkeleton,
        structureSignature: position.structureSignature,
        structureClaims: position.structureClaims,
      })),
    });
    done += 1;
    if (batch.length >= BATCH) await flush();
  }

  await flush();
  return { parsed: done, imported, duplicates, total, cancelled: signal?.aborted ?? false };
}
