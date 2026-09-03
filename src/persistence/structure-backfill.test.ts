import { describe, expect, it, vi } from 'vitest';

import { START_FEN, positionKey } from '@/chess/fen';
import { indexGame, normalizeGame } from '@/persistence/import-game';
import { parsePgn } from '@/chess/pgn';
import {
  backfillStructures,
  identityOf,
  type BackfillProgress,
  type BackfillTarget,
} from './structure-backfill';

/**
 * A collection that has forgotten its structural identities.
 *
 * Models the two properties the real one has and that the loop depends on:
 * `remaining` counts distinct positions, and an update only touches rows that
 * still have nothing.
 */
function collection(keys: readonly string[]): BackfillTarget & { indexed: Map<string, unknown> } {
  const pending = new Set(keys);
  const indexed = new Map<string, unknown>();
  return {
    indexed,
    async unindexedPositions(_key, limit = 500) {
      return {
        positions: [...pending].slice(0, limit).map((positionKey) => ({ positionKey })),
        remaining: pending.size,
      };
    },
    async indexStructures(_key, entries) {
      for (const entry of entries) {
        if (!pending.has(entry.positionKey)) continue;
        pending.delete(entry.positionKey);
        indexed.set(entry.positionKey, entry);
      }
      return { updated: entries.length, remaining: pending.size };
    },
  };
}

const gameKeys = (): readonly string[] => {
  const pgn = `[Event "T"]\n[White "A"]\n[Black "B"]\n[Result "*"]\n\n1. d4 Nf6 2. c4 e6 3. Nf3 d5 4. g3 Be7 *`;
  const parsed = parsePgn(pgn).games[0]!;
  return indexGame(normalizeGame(parsed.tree)).map((position) => position.positionKey);
};

describe('structural identity from a position key', () => {
  it('agrees with what the importer stores for the same position', () => {
    const record = indexGame(
      normalizeGame(parsePgn(`[Result "*"]\n\n1. d4 d5 2. c4 e6 *`).games[0]!.tree),
    )[0]!;
    const derived = identityOf(record.positionKey)!;

    /*
      The whole premise: a canonical key carries placement, side to move,
      castling and en passant, and nothing structural depends on the move
      counters. If these ever disagreed, a backfilled collection would answer
      differently from a re-imported one.
    */
    expect(derived.pawnSkeleton).toBe(record.pawnSkeleton);
    expect(derived.structureSignature).toBe(record.structureSignature);
    expect(derived.structureClaims).toEqual(record.structureClaims);
  });

  it('reports an unreadable key rather than inventing an identity', () => {
    expect(identityOf('not a position')).toBeNull();
    expect(identityOf(positionKey(START_FEN))).not.toBeNull();
  });
});

describe('backfilling a collection', () => {
  it('indexes every distinct position and finishes', async () => {
    const keys = gameKeys();
    const target = collection(keys);
    const progress: BackfillProgress[] = [];

    const final = await backfillStructures(target, 'db', {
      batchSize: 2,
      onProgress: (entry) => progress.push(entry),
    });

    expect(final.stage).toBe('complete');
    expect(final.processed).toBe(keys.length);
    expect(final.remaining).toBe(0);
    expect(target.indexed.size).toBe(keys.length);
    // It reported as it went, so a long backfill is not a frozen dialog.
    expect(progress.filter((entry) => entry.stage === 'indexing').length).toBeGreaterThan(1);
  });

  it('keeps every committed page when cancelled', async () => {
    const keys = gameKeys();
    const target = collection(keys);
    const controller = new AbortController();

    const final = await backfillStructures(target, 'db', {
      batchSize: 1,
      signal: controller.signal,
      onProgress: (entry) => {
        if (entry.processed >= 2) controller.abort();
      },
    });

    expect(final.stage).toBe('cancelled');
    // Cancelling stops the loop; it does not undo what already landed.
    expect(target.indexed.size).toBeGreaterThanOrEqual(2);
    expect(target.indexed.size).toBeLessThan(keys.length);
  });

  it('is idempotent: a second run finds nothing to do', async () => {
    const target = collection(gameKeys());
    await backfillStructures(target, 'db', { batchSize: 3 });
    const again = await backfillStructures(target, 'db', { batchSize: 3 });

    expect(again.stage).toBe('complete');
    expect(again.processed).toBe(0);
  });

  it('stops rather than looping when a page is entirely unreadable', async () => {
    const target = collection(['not a position', 'also not one']);
    const final = await backfillStructures(target, 'db', { batchSize: 5 });

    expect(final.stage).toBe('complete');
    expect(final.unreadable).toBe(2);
    expect(target.indexed.size).toBe(0);
  });

  it('counts an unreadable position instead of skipping it silently', async () => {
    const keys = [...gameKeys(), 'not a position'];
    const target = collection(keys);
    const final = await backfillStructures(target, 'db', { batchSize: 50 });

    expect(final.unreadable).toBe(1);
    expect(final.processed).toBe(keys.length - 1);
  });

  it('yields between pages so the board keeps responding', async () => {
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    const target = collection(gameKeys());
    await backfillStructures(target, 'db', { batchSize: 2 });
    expect(timeout).toHaveBeenCalled();
    timeout.mockRestore();
  });
});
