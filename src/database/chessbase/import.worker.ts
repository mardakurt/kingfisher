/// <reference lib="webworker" />
/**
 * The ChessBase import worker: holds one database's files, answers what it
 * is, and prepares its games a page at a time so the page owner can write
 * them and report progress between pages.
 */
import { loadOpeningIndex, type OpeningIndex } from '@/theory/openings';
import type { TransferGame } from '@/database/collections/types';

import { unpackArchive } from './archive';
import { ChessBaseDatabase, isGame } from './database';
import { prepareChessBaseGame } from './prepare';
import type { ChessBaseInspection } from './types';

export type ImportWorkerRequest =
  | { readonly type: 'open'; readonly name: string; readonly files: Record<string, ArrayBuffer> }
  | { readonly type: 'open-archive'; readonly archive: ArrayBuffer }
  | { readonly type: 'page'; readonly from: number; readonly to: number };

export interface PreparedPage {
  readonly type: 'page';
  readonly games: readonly TransferGame[];
  readonly failures: readonly { readonly id: number; readonly reason: string }[];
  /** Counted per message, e.g. "3 annotation(s) of type 0x22 have no place in a PGN". */
  readonly issues: readonly string[];
  readonly last: number;
}

export type ImportWorkerMessage =
  | { readonly type: 'opened'; readonly inspection: ChessBaseInspection }
  | PreparedPage
  | { readonly type: 'error'; readonly error: string };

let database: ChessBaseDatabase | null = null;
let openings: Promise<OpeningIndex | null> | null = null;

const post = (message: ImportWorkerMessage): void => self.postMessage(message);

function openFiles(name: string, files: Record<string, ArrayBuffer>): void {
  const map = new Map<string, Uint8Array>();
  for (const [extension, buffer] of Object.entries(files))
    map.set(extension, new Uint8Array(buffer));
  database = new ChessBaseDatabase(name, map);
  post({ type: 'opened', inspection: database.inspect() });
}

self.onmessage = (event: MessageEvent<ImportWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'open') {
      openFiles(request.name, request.files);
      return;
    }
    if (request.type === 'open-archive') {
      const unpacked = unpackArchive(new Uint8Array(request.archive));
      if (!unpacked.ok) {
        post({ type: 'error', error: unpacked.reason });
        return;
      }
      database = new ChessBaseDatabase(unpacked.name, unpacked.files);
      post({ type: 'opened', inspection: database.inspect() });
      return;
    }
    if (!database) {
      post({ type: 'error', error: 'No database is open.' });
      return;
    }
    const db = database;
    openings ??= loadOpeningIndex().catch(() => null);
    void openings.then((index) => {
      const games: TransferGame[] = [];
      const failures: { id: number; reason: string }[] = [];
      const issues: string[] = [];
      const importedAt = Date.now();
      for (const result of db.games(request.from, request.to)) {
        if (!isGame(result)) {
          failures.push({ id: result.id, reason: result.reason });
          continue;
        }
        issues.push(...result.issues);
        try {
          games.push(prepareChessBaseGame(result.pgn, index, importedAt));
        } catch (error) {
          failures.push({
            id: result.id,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
      post({ type: 'page', games, failures, issues, last: Math.min(request.to, db.count) });
    });
  } catch (error) {
    post({ type: 'error', error: error instanceof Error ? error.message : String(error) });
  }
};
