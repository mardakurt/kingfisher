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
import { indexGame, normalizeGame } from '@/persistence/import-game';

import type { CompanionClient } from './client';

export interface SqliteImportProgress {
  readonly parsed: number;
  readonly imported: number;
  readonly duplicates: number;
  readonly total: number;
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
  const parsed = parsePgn(pgn);
  const total = parsed.games.length;
  let imported = 0;
  let duplicates = 0;
  let done = 0;

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
    const record = normalizeGame(game.tree);
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
      })),
    });
    done += 1;
    if (batch.length >= BATCH) await flush();
  }

  await flush();
  return { parsed: done, imported, duplicates, total };
}
