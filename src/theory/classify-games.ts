/**
 * Applying opening classification to stored games.
 *
 * Two callers, one definition. Import classifies as it prepares each game;
 * backfill classifies collections that were imported before this existed. Both
 * go through `classifyRecord`, so a game's stored opening does not depend on
 * which door it came in through.
 *
 * Backfill is deliberately not a schema migration. Classifying half a million
 * games inside a version-change transaction would hold the whole application
 * shut for minutes with no progress and no way out; as a job it can report what
 * it is doing, be stopped, and be resumed from where it stopped, because every
 * page it commits records the digest it used.
 */

import { positionKey } from '@/chess/fen';
import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';
import type { GameSummary, StoredClassification } from '@/persistence/types';

import { classifyGameTree, loadOpeningIndex, type OpeningIndex } from './openings';

/** The two fields a classified game carries, ready to spread onto a record. */
export interface ClassificationFields {
  readonly classification?: StoredClassification;
  readonly classifiedWith: string;
}

export function classifyTree(index: OpeningIndex, tree: GameTree): ClassificationFields {
  const hit = classifyGameTree(index, tree);
  if (!hit) return { classifiedWith: index.digest };
  return {
    classification: {
      eco: hit.eco,
      name: hit.name,
      ...(hit.variation ? { variation: hit.variation } : {}),
      ply: hit.ply,
    },
    classifiedWith: index.digest,
  };
}

/**
 * Classify from a bare sequence of position keys, deepest hit wins.
 *
 * This is the path a backfill takes over a SQLite collection, where the
 * position index already holds every main-line position and re-parsing the
 * movetext of half a million games to learn what is already stored would be
 * work for nothing. `keys[i]` is the position after ply `i + 1`.
 */
export function classifyKeys(index: OpeningIndex, keys: readonly string[]): ClassificationFields {
  let best: StoredClassification | null = null;
  const limit = Math.min(keys.length, index.deepestPly);
  for (let i = 0; i < limit; i += 1) {
    const hit = index.lookup(keys[i] as string);
    if (!hit) continue;
    best = {
      eco: hit.eco,
      name: hit.name,
      ...(hit.variation ? { variation: hit.variation } : {}),
      ply: i + 1,
    };
  }
  return best
    ? { classification: best, classifiedWith: index.digest }
    : { classifiedWith: index.digest };
}

/** The main-line positions of a tree, after each ply, capped at the useful depth. */
export function openingPositionKeys(index: OpeningIndex, tree: GameTree): string[] {
  const keys: string[] = [];
  for (const id of mainlinePath(tree)) {
    const node = tree.nodes[id];
    if (!node || node.ply < 1) continue;
    if (node.ply > index.deepestPly) break;
    keys.push(positionKey(node.fen));
  }
  return keys;
}

export interface ClassificationBackfillProgress {
  readonly stage: 'scanning' | 'classifying' | 'complete' | 'cancelled';
  readonly processed: number;
  readonly named: number;
  readonly remaining: number;
}

export interface ClassificationBackfillOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ClassificationBackfillProgress) => void;
  /** Games per read/write page. */
  readonly pageSize?: number;
}

/**
 * What a backfill needs from a collection, whichever store it lives in.
 *
 * Written as a port rather than against `GameRepository` so the IndexedDB and
 * companion-SQLite backfills are literally the same loop. The alternative was
 * two loops with the same cancellation, progress and resume semantics written
 * twice, which is exactly the shape of code where the second copy quietly
 * stops matching the first.
 */
export interface ClassificationTarget {
  /**
   * One page of games not yet classified with `digest`, in id order.
   *
   * `after` is the last id of the previous page, never an offset. Both stores
   * can resume from an id with an index seek; an offset would make each page
   * re-walk everything before it, which turns a linear job into a quadratic
   * one somewhere around the hundred-thousandth game.
   */
  page(digest: string, limit: number, after: string | null): Promise<ClassificationPage>;
  /** How many remain, so progress is a fraction rather than a running total. */
  remaining(digest: string): Promise<number>;
  /** Commit one page. The unit of atomicity, and therefore of resumability. */
  apply(entries: readonly ClassifiedGame[]): Promise<void>;
}

export interface ClassificationPage {
  readonly games: readonly UnclassifiedGame[];
  /** Where the next page starts, or null when the walk reached the end. */
  readonly nextAfter: string | null;
}

export interface UnclassifiedGame {
  readonly id: string;
  /** Main-line positions after each ply, in order. */
  readonly positionKeys: readonly string[];
}

export interface ClassifiedGame extends ClassificationFields {
  readonly id: string;
}

const DEFAULT_PAGE = 500;

/**
 * Classify every game a target has not classified with this index.
 *
 * Cancellation keeps everything already committed, exactly as the structure
 * backfill does: a user who starts this on a large collection and changes their
 * mind should keep the work already done, and starting again should resume
 * rather than repeat.
 */
export async function backfillClassification(
  target: ClassificationTarget,
  options: ClassificationBackfillOptions = {},
): Promise<ClassificationBackfillProgress> {
  const index = await loadOpeningIndex();
  const pageSize = Math.max(1, options.pageSize ?? DEFAULT_PAGE);
  let processed = 0;
  let named = 0;

  options.onProgress?.({ stage: 'scanning', processed: 0, named: 0, remaining: 0 });
  let remaining = await target.remaining(index.digest);
  const report = (stage: ClassificationBackfillProgress['stage']) =>
    options.onProgress?.({ stage, processed, named, remaining });
  report('classifying');

  let after: string | null = null;
  for (;;) {
    if (options.signal?.aborted) return finish('cancelled');
    const page: ClassificationPage = await target.page(index.digest, pageSize, after);

    if (page.games.length > 0) {
      const classified = page.games.map((game) => {
        const fields = classifyKeys(index, game.positionKeys);
        if (fields.classification) named += 1;
        return { id: game.id, ...fields };
      });
      await target.apply(classified);
      processed += classified.length;
      remaining = Math.max(0, remaining - classified.length);
      report('classifying');
    }

    /*
      A page can be empty and still have somewhere to go: the walk is over the
      whole collection and skips games that are already classified, so a run of
      already-done games produces empty pages with a cursor that has moved. The
      end is `nextAfter === null`, never an empty page.
    */
    if (page.nextAfter === null) return finish('complete');
    after = page.nextAfter;
  }

  function finish(stage: 'complete' | 'cancelled'): ClassificationBackfillProgress {
    const result = {
      stage,
      processed,
      named,
      remaining: stage === 'complete' ? 0 : remaining,
    } as const;
    options.onProgress?.(result);
    return result;
  }
}

/** How a game's opening should be displayed, and where the answer came from. */
export interface OpeningDisplay {
  readonly eco?: string;
  readonly label?: string;
  readonly source: 'kingfisher' | 'file' | 'none';
  /** True when the file declared an ECO and Kingfisher computed a different one. */
  readonly conflict: boolean;
}

/**
 * What to print for a game, preferring Kingfisher's own answer.
 *
 * The imported tag is the fallback rather than the default: it is the one whose
 * depth and provenance are unknown. Neither value is ever discarded, and a
 * disagreement is surfaced rather than resolved silently.
 */
export function openingDisplay(game: GameSummary): OpeningDisplay {
  const computed = game.classification;
  const declaredEco = game.eco?.trim();
  const declaredName = [game.opening, game.variation].filter(Boolean).join(': ').trim();
  const conflict = Boolean(
    computed && declaredEco && computed.eco.toUpperCase() !== declaredEco.toUpperCase(),
  );
  if (computed) {
    return {
      eco: computed.eco,
      label: computed.variation ? `${computed.name}: ${computed.variation}` : computed.name,
      source: 'kingfisher',
      conflict,
    };
  }
  if (declaredEco || declaredName) {
    return {
      ...(declaredEco ? { eco: declaredEco } : {}),
      ...(declaredName ? { label: declaredName } : {}),
      source: 'file',
      conflict: false,
    };
  }
  return { source: 'none', conflict: false };
}
