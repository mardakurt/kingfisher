/**
 * Giving an older SQLite collection its structural identity, without
 * re-importing a single game.
 *
 * Phase 8 shipped structure search and left collections imported before it
 * matching nothing. The games are already stored and unchanged; what is
 * missing is derived data, and re-importing an archive to recompute something
 * derivable is the kind of chore that makes a feature not get used.
 *
 * Three properties make this safe to run against a large collection:
 *
 * **It works from the position key.** Structural identity is a function of the
 * placement, side to move, castling rights and en-passant square — exactly the
 * four fields a canonical position key holds (ADR 0009). Halfmove and fullmove
 * counters cannot affect a pawn skeleton, so a key plus `0 1` is a complete
 * input. That matters because pre-Phase-8 rows have no stored FEN either.
 *
 * **It works per distinct position, not per row.** A popular opening position
 * appears in tens of thousands of rows with identical structure, so the chess
 * work happens once and the write fans out.
 *
 * **It is resumable and idempotent.** Each page is a transaction, the update
 * only touches rows that still have nothing, and progress is the collection's
 * own remaining count rather than a cursor that could go stale. Cancelling
 * keeps every page already committed.
 */

import { parseFen } from '@/chess/fen';
import { isOk } from '@/chess/result';
import {
  pawnSkeletonKeyFromParts,
  structureClaims,
  structureFactsFromFeatures,
  structureSignature,
} from '@/chess/structure';
import { positionFeatures } from '@/chess/features';
import { themeClaimIds } from '@/chess/themes';

export interface BackfillProgress {
  readonly stage: 'scanning' | 'indexing' | 'complete' | 'cancelled';
  /** Distinct positions written so far. */
  readonly processed: number;
  /** Distinct positions still without an identity, as the collection reports. */
  readonly remaining: number;
  /** Positions the rules could not read; counted, never silently skipped. */
  readonly unreadable: number;
}

export interface BackfillOptions {
  readonly batchSize?: number;
  readonly onProgress?: (progress: BackfillProgress) => void;
  readonly signal?: AbortSignal;
}

/** The companion surface this needs, so the loop can be tested without HTTP. */
export interface BackfillTarget {
  unindexedPositions(
    key: string,
    limit?: number,
  ): Promise<{ positions: readonly { positionKey: string }[]; remaining: number }>;
  indexStructures(
    key: string,
    entries: readonly {
      positionKey: string;
      pawnSkeleton: string;
      structureSignature?: string;
      structureClaims?: readonly string[];
      fen?: string;
    }[],
  ): Promise<{ updated: number; remaining: number }>;
}

export const DEFAULT_BACKFILL_BATCH = 400;

export async function backfillStructures(
  target: BackfillTarget,
  key: string,
  options: BackfillOptions = {},
): Promise<BackfillProgress> {
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BACKFILL_BATCH);
  let processed = 0;
  let remaining = 0;
  /*
    Remembered, not just counted. A position the rules cannot read is never
    written, so it comes back in every subsequent page — which would count it
    once per page and, if a page filled up with them, stall the loop behind
    positions it can never make progress on.
  */
  const unreadable = new Set<string>();

  const report = (stage: BackfillProgress['stage']) => {
    const progress: BackfillProgress = {
      stage,
      processed,
      remaining,
      unreadable: unreadable.size,
    };
    options.onProgress?.(progress);
    return progress;
  };

  report('scanning');

  for (;;) {
    if (options.signal?.aborted) return report('cancelled');
    const page = await target.unindexedPositions(key, batchSize);
    remaining = page.remaining;
    if (page.positions.length === 0) return report('complete');

    const entries = [];
    for (const position of page.positions) {
      if (unreadable.has(position.positionKey)) continue;
      const identity = identityOf(position.positionKey);
      if (!identity) {
        unreadable.add(position.positionKey);
        continue;
      }
      entries.push(identity);
    }

    /*
      Nothing writable left in reach. Either every position this page offered is
      one the rules cannot read, or the page held only positions already known
      to be unreadable — in both cases another request returns the same rows, so
      stopping is the only outcome that terminates. The count is reported rather
      than swallowed.
    */
    if (entries.length === 0) return report('complete');

    if (options.signal?.aborted) return report('cancelled');
    const result = await target.indexStructures(key, entries);
    processed += entries.length;
    remaining = result.remaining;
    report('indexing');

    // Let the browser paint between pages. A backfill is a background chore
    // and must never be the reason the board stops responding.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * The structural identity of a canonical position key.
 *
 * Exported because it is the whole chess content of this module, and it is
 * worth being able to assert that it agrees with what the importer writes for
 * the same position.
 */
export function identityOf(positionKey: string): {
  positionKey: string;
  pawnSkeleton: string;
  structureSignature: string;
  structureClaims: readonly string[];
  fen: string;
} | null {
  // Counters cannot affect any structural fact, so any legal pair completes it.
  const fen = `${positionKey} 0 1`;
  const parsed = parseFen(fen);
  if (!isOk(parsed)) return null;
  const facts = structureFactsFromFeatures(positionFeatures(parsed.value), parsed.value);
  return {
    positionKey,
    pawnSkeleton: pawnSkeletonKeyFromParts(parsed.value),
    structureSignature: structureSignature(facts),
    structureClaims: [
      ...structureClaims(facts).map((claim) => claim.id),
      ...themeClaimIds(parsed.value),
    ],
    fen,
  };
}
