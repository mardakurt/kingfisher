/**
 * Copying, moving, merging and de-duplicating games between collections.
 *
 * All four are the same walk — page the source, do something with the page,
 * repeat — and the differences between them are entirely about what "something"
 * is and what is safe to do afterwards. Writing them as one loop is what keeps
 * cancellation, progress and failure reporting identical across them.
 *
 * The invariant this file exists to protect is in `moveGames`: **a move never
 * deletes anything the destination has not confirmed it holds.** Not "the write
 * did not throw" — confirmed, by asking the destination for the fingerprints
 * afterwards. A move implemented as a copy button next to a delete button is a
 * move that loses games when the copy half fails, and a chess archive is
 * precisely the kind of data whose loss is discovered years later.
 */

import type { GameSearchQuery } from '@/persistence/types';

import { metadataKey, type DuplicateKey, type GameCollection, type TransferGame } from './types';

export type TransferStage =
  'reading' | 'writing' | 'verifying' | 'deleting' | 'complete' | 'cancelled';

export interface TransferProgress {
  readonly stage: TransferStage;
  /** Games read from the source so far. */
  readonly read: number;
  /** Games actually written to the destination. */
  readonly written: number;
  /** Games the destination already held. */
  readonly duplicates: number;
  /** Games removed from the source. Always zero for a copy. */
  readonly removed: number;
  /** Games the source could not produce a complete record for. */
  readonly skipped: number;
}

export interface TransferOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: TransferProgress) => void;
  /** Games per page. The unit of atomicity, and of what a cancel discards. */
  readonly pageSize?: number;
  /**
   * Verified games to accumulate before deleting them from the source.
   *
   * A move's deletion cost is dominated by a fixed per-call price — the
   * destination collection rebuilds the explorer aggregates for every position
   * the removed games touched — not by the number of games. Measured on a
   * 50,000-game SQLite collection: 13.0 ms per game deleting 200 at a time,
   * 1.19 ms at 1,000, 0.26 ms at 5,000. Deleting once per read page would make
   * a whole-collection move take an hour where batching makes it a minute.
   *
   * This does not weaken the invariant. Nothing is deleted before the
   * destination has confirmed it, and buffering only widens the window in
   * which a game exists in *both* collections — which is the safe direction.
   * A cancel flushes what is already verified, so the source is never left
   * holding games the destination has confirmed and the run reported as moved.
   */
  readonly deleteBatchSize?: number;
  /** Copy only games matching this, using the source's own filter semantics. */
  readonly query?: GameSearchQuery | null;
  /** Copy only these fingerprints. Combined with `query` as an intersection. */
  readonly fingerprints?: readonly string[];
}

export interface TransferResult extends TransferProgress {
  readonly stage: 'complete' | 'cancelled';
  /**
   * Set when a move stopped without deleting games it had copied.
   *
   * The honest report of a partial move: the games are in both collections, and
   * the user is told so rather than left to discover it.
   */
  readonly undeletedAfterCopy?: number;
}

const DEFAULT_PAGE = 200;
/** Ten pages' worth: past the point where the fixed cost stops dominating. */
const DEFAULT_DELETE_BATCH = 2_000;

/**
 * Copy games from one collection to another.
 *
 * Never removes anything, so the worst outcome of a failure part-way is that
 * the destination holds fewer games than asked for — which the result says.
 */
export function copyGames(
  source: GameCollection,
  destination: GameCollection,
  options: TransferOptions = {},
): Promise<TransferResult> {
  return runTransfer(source, destination, options, false);
}

/**
 * Move games: copy, verify, and only then delete from the source.
 *
 * Deletion is per page and follows that page's verification, so a move
 * interrupted half way leaves the pages it finished moved and the pages it did
 * not still in the source. Nothing is ever in neither place.
 */
export function moveGames(
  source: GameCollection,
  destination: GameCollection,
  options: TransferOptions = {},
): Promise<TransferResult> {
  return runTransfer(source, destination, options, true);
}

async function runTransfer(
  source: GameCollection,
  destination: GameCollection,
  options: TransferOptions,
  remove: boolean,
): Promise<TransferResult> {
  if (source.ref.id === destination.ref.id) {
    throw new Error('The source and destination are the same collection.');
  }
  const pageSize = Math.max(1, options.pageSize ?? DEFAULT_PAGE);
  const deleteBatchSize = Math.max(1, options.deleteBatchSize ?? DEFAULT_DELETE_BATCH);
  const wanted = options.fingerprints ? new Set(options.fingerprints) : null;
  let read = 0;
  let written = 0;
  let duplicates = 0;
  let removed = 0;
  let skipped = 0;
  let undeleted = 0;
  let after: string | null = null;
  /** Fingerprints the destination has confirmed and the source still holds. */
  let confirmedForDeletion: string[] = [];

  const report = (stage: TransferStage) =>
    options.onProgress?.({ stage, read, written, duplicates, removed, skipped });

  const flushDeletions = async () => {
    if (confirmedForDeletion.length === 0) return;
    report('deleting');
    const batch = confirmedForDeletion;
    confirmedForDeletion = [];
    removed += await source.removeByFingerprint(batch);
  };

  for (;;) {
    if (options.signal?.aborted) {
      // Everything already confirmed is removed before stopping, so a cancelled
      // move never leaves the source holding games it has reported as moved.
      await flushDeletions();
      return finish('cancelled');
    }
    report('reading');
    const page = await source.read(options.query ?? null, after, pageSize);
    const batch: TransferGame[] = wanted
      ? page.games.filter((game) => wanted.has(game.summary.fingerprint))
      : [...page.games];
    read += batch.length;

    /*
      Checked again after the read. A page that has been read but not written
      is discarded work and nothing else, so stopping here is both free and the
      most responsive point available — waiting for the next iteration would
      make a cancel take one whole page longer than it needs to.
    */
    if (options.signal?.aborted) {
      await flushDeletions();
      return finish('cancelled');
    }

    if (batch.length > 0) {
      report('writing');
      const outcome = await destination.write(batch);
      written += outcome.written;
      duplicates += outcome.duplicates;
      /*
        Games the destination did not account for at all. `write` reports one
        outcome per game it could store; anything missing was unstorable —
        movetext that would not parse, most realistically — and is counted
        rather than quietly forgotten.
      */
      skipped += Math.max(0, batch.length - (outcome.written + outcome.duplicates));

      if (remove) {
        /*
          The verification. Asking the destination which fingerprints it now
          holds is not the same as trusting the write to have thrown on
          failure: a partially applied batch, a companion that answered 200 to
          a request it did not finish, or a destination that silently rejected
          a row all look like success to the caller and like a missing
          fingerprint here.
        */
        report('verifying');
        const confirmed = await destination.have(batch.map((game) => game.summary.fingerprint));
        const safe = batch
          .map((game) => game.summary.fingerprint)
          .filter((fingerprint) => confirmed.has(fingerprint));
        undeleted += batch.length - safe.length;
        confirmedForDeletion.push(...safe);
        if (confirmedForDeletion.length >= deleteBatchSize) await flushDeletions();
      }
    }

    if (page.nextAfter === null) {
      await flushDeletions();
      return finish('complete');
    }
    after = page.nextAfter;
  }

  function finish(stage: 'complete' | 'cancelled'): TransferResult {
    const result: TransferResult = {
      stage,
      read,
      written,
      duplicates,
      removed,
      skipped,
      ...(undeleted > 0 ? { undeletedAfterCopy: undeleted } : {}),
    };
    options.onProgress?.(result);
    return result;
  }
}

export interface MergePreview {
  readonly sourceGames: number;
  /** Source games the destination already holds, by exact fingerprint. */
  readonly alreadyPresent: number;
  readonly newGames: number;
  /** True when the walk stopped early; the numbers are then lower bounds. */
  readonly partial: boolean;
}

export interface MergePreviewOptions {
  readonly signal?: AbortSignal;
  readonly pageSize?: number;
  readonly onProgress?: (scanned: number) => void;
}

/**
 * What a merge would actually do, before it does it.
 *
 * Exact, not estimated: every source fingerprint is probed against the
 * destination. That costs a pass over the source, which is why it is a job with
 * progress rather than a number that appears in a dialog — but "68,893 new
 * games" is a fact somebody can act on and "roughly 70,000" is not.
 *
 * Deduplication here is by fingerprint only. Games that are the same game with
 * different annotations are deliberately *not* treated as present, because
 * merging them away would silently discard somebody's notes; they surface in
 * the duplicate workflow instead, where a person decides.
 *
 * A merge is whole-collection by definition, so there is no filter here. The
 * filtered version of this operation is "copy these search results", which is
 * `copyGames` with a query.
 */
export async function previewMerge(
  source: GameCollection,
  destination: GameCollection,
  options: MergePreviewOptions = {},
): Promise<MergePreview> {
  const pageSize = Math.max(1, options.pageSize ?? 1000);
  let sourceGames = 0;
  let alreadyPresent = 0;
  let after: string | null = null;

  for (;;) {
    if (options.signal?.aborted) {
      return { sourceGames, alreadyPresent, newGames: sourceGames - alreadyPresent, partial: true };
    }
    const page = await source.duplicateKeys(after, pageSize);
    const fingerprints = page.games.map((game) => game.fingerprint);
    if (fingerprints.length > 0) {
      sourceGames += fingerprints.length;
      const present = await destination.have(fingerprints);
      alreadyPresent += fingerprints.filter((fingerprint) => present.has(fingerprint)).length;
      options.onProgress?.(sourceGames);
    }
    if (page.nextAfter === null) break;
    after = page.nextAfter;
  }

  return {
    sourceGames,
    alreadyPresent,
    newGames: sourceGames - alreadyPresent,
    partial: false,
  };
}

/** One game, and which collection it was found in. */
export interface DuplicateMember extends DuplicateKey {
  readonly collectionId: string;
  readonly collectionName: string;
}

export type DuplicateKind = 'exact' | 'annotations-differ';

/**
 * Games that appear more than once, and how sure we are that they are the same.
 *
 * `exact` means identical fingerprints: identical metadata, identical moves,
 * identical movetext including every comment and variation. Removing all but
 * one loses nothing, and the workflow offers to.
 *
 * `annotations-differ` means the same players, date, event, round and result,
 * but different stored text — which is almost always one game annotated twice.
 * The word "almost" is why nothing is ever removed automatically here.
 */
export interface DuplicateGroup {
  readonly key: string;
  readonly kind: DuplicateKind;
  readonly members: readonly DuplicateMember[];
}

export interface DuplicateSearchOptions {
  readonly signal?: AbortSignal;
  readonly pageSize?: number;
  readonly onProgress?: (scanned: number) => void;
  /** Stop after this many groups, so a pathological archive cannot hang the UI. */
  readonly maxGroups?: number;
}

export interface DuplicateSearchResult {
  readonly groups: readonly DuplicateGroup[];
  readonly scanned: number;
  /** True when `maxGroups` or a cancellation ended the search early. */
  readonly partial: boolean;
}

/**
 * Find duplicates within and across a set of collections.
 *
 * One pass per collection, accumulating two indexes: fingerprint → members, and
 * metadata key → members. A group is reported once, under the stronger of the
 * two kinds it qualifies for, so a pair of byte-identical games is never also
 * reported as an annotation difference.
 */
export async function findDuplicates(
  collections: readonly GameCollection[],
  options: DuplicateSearchOptions = {},
): Promise<DuplicateSearchResult> {
  const pageSize = Math.max(1, options.pageSize ?? 2000);
  const maxGroups = options.maxGroups ?? 500;
  const byFingerprint = new Map<string, DuplicateMember[]>();
  const byMetadata = new Map<string, DuplicateMember[]>();
  let scanned = 0;
  let cancelled = false;

  outer: for (const collection of collections) {
    let after: string | null = null;
    for (;;) {
      if (options.signal?.aborted) {
        cancelled = true;
        break outer;
      }
      const page = await collection.duplicateKeys(after, pageSize);
      for (const game of page.games) {
        const member: DuplicateMember = {
          ...game,
          collectionId: collection.ref.id,
          collectionName: collection.ref.name,
        };
        push(byFingerprint, game.fingerprint, member);
        push(byMetadata, metadataKey(game), member);
      }
      scanned += page.games.length;
      options.onProgress?.(scanned);
      if (page.nextAfter === null) break;
      after = page.nextAfter;
    }
  }

  const groups: DuplicateGroup[] = [];
  const claimed = new Set<string>();
  for (const [key, members] of byFingerprint) {
    if (members.length < 2) continue;
    groups.push({ key, kind: 'exact', members });
    for (const member of members) claimed.add(memberId(member));
    if (groups.length >= maxGroups) return { groups, scanned, partial: true };
  }
  for (const [key, members] of byMetadata) {
    /*
      Only members not already accounted for as exact duplicates, and only when
      at least two survive: a group of three where two are byte-identical is an
      exact group plus a single leftover, not a second finding about the same
      games.
    */
    const remaining = members.filter((member) => !claimed.has(memberId(member)));
    const distinct = new Set(remaining.map((member) => member.fingerprint));
    if (remaining.length < 2 || distinct.size < 2) continue;
    groups.push({ key, kind: 'annotations-differ', members: remaining });
    if (groups.length >= maxGroups) return { groups, scanned, partial: true };
  }

  return { groups, scanned, partial: cancelled };
}

const memberId = (member: DuplicateMember) => `${member.collectionId}:${member.id}`;

function push(index: Map<string, DuplicateMember[]>, key: string, member: DuplicateMember): void {
  const existing = index.get(key);
  if (existing) existing.push(member);
  else index.set(key, [member]);
}

/**
 * Remove every member of an exact group except one, per collection.
 *
 * Refuses anything but an exact group. The caller cannot pass a group whose
 * members differ in their stored text, because there is no correct automatic
 * answer to which annotation survives.
 */
export async function removeExactDuplicates(
  group: DuplicateGroup,
  keep: DuplicateMember,
  collections: ReadonlyMap<string, GameCollection>,
): Promise<number> {
  if (group.kind !== 'exact') {
    throw new Error('Only exact duplicates can be removed automatically.');
  }
  let removed = 0;
  for (const member of group.members) {
    if (memberId(member) === memberId(keep)) continue;
    const collection = collections.get(member.collectionId);
    if (!collection) continue;
    removed += await collection.removeByFingerprint([member.fingerprint]);
  }
  return removed;
}
