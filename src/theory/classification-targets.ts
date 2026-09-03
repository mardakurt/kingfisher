/**
 * Where a classification backfill reads and writes.
 *
 * Two implementations of one port: the browser's own IndexedDB collection, and
 * a SQLite collection behind the companion. Both walk games in primary-key
 * order, hand back the main-line position keys already stored in their position
 * index, and take the answers back in pages.
 *
 * Neither of them classifies anything. The chess knowledge stays on the client,
 * in one module, which is the same rule the structure backfill follows and the
 * reason a SQLite collection and an IndexedDB collection can never disagree
 * about what opening a game is.
 */

import { positionKey } from '@/chess/fen';
import { Position } from '@/chess/position';
import { asFen } from '@/chess/types';
import type { CompanionClient } from '@/companion/client';
import type { PersistenceDatabase } from '@/persistence/indexeddb/database';
import { onlyKey, type KeyRange } from '@/persistence/indexeddb/key-range';
import { STORE_NAMES } from '@/persistence/schema/migrations';
import type { GameSummary, PositionRecord } from '@/persistence/types';

import type {
  ClassificationPage,
  ClassificationTarget,
  ClassifiedGame,
  UnclassifiedGame,
} from './classify-games';

/**
 * Main-line position keys in ply order, from stored position records.
 *
 * The stored key is the position *before* the move at that ply, so the position
 * after ply `n` is the key of the row at ply `n + 1`. Reading them in order
 * therefore recovers every main-line position except one: the position after
 * the game's final move, which no row is "before".
 *
 * That last one matters more than its arity suggests. A game that ends inside
 * the opening — a short draw, a repertoire fragment, a miniature — has its
 * defining position as its last one, and dropping it classifies the game one
 * ply shallower than it should be. So it is reconstructed, by playing the final
 * stored move from the final stored position: one move per game, using the same
 * rules code that produced every other key here.
 *
 * A collection imported before the position index stored FENs has nothing to
 * play the move from. It gets the positions it does have rather than nothing —
 * the same "as deep as the evidence goes" rule the classifier follows anyway.
 */
export function positionKeysByPly(records: readonly PositionRecord[]): string[] {
  const byPly = new Map<number, PositionRecord>();
  for (const record of records) {
    if (!byPly.has(record.ply)) byPly.set(record.ply, record);
  }
  const plies = [...byPly.keys()].sort((a, b) => a - b);
  const keys: string[] = [];
  for (const ply of plies) {
    // Ply 1's row holds the starting position, which no opening entry names.
    if (ply < 2) continue;
    keys.push((byPly.get(ply) as PositionRecord).positionKey);
  }

  const last = plies.length > 0 ? byPly.get(plies[plies.length - 1] as number) : undefined;
  const terminal = last && last.fen ? finalPositionKey(last) : null;
  if (terminal) keys.push(terminal);
  return keys;
}

/** The position after `record.moveUci`, or null if the move will not replay. */
function finalPositionKey(record: PositionRecord): string | null {
  if (!record.fen) return null;
  const played = Position.fromTrustedFen(record.fen).playUci(record.moveUci);
  return played.ok ? positionKey(played.value.after) : null;
}

/** The SQLite half of the same reconstruction, from a page's tail fields. */
export function withTerminalPosition(
  keys: readonly string[],
  fen: string | undefined,
  moveUci: string | undefined,
): string[] {
  if (!fen || !moveUci) return [...keys];
  const played = Position.fromTrustedFen(asFen(fen)).playUci(moveUci);
  return played.ok ? [...keys, positionKey(played.value.after)] : [...keys];
}

/** Everything strictly after `id`, so a page resumes without repeating one. */
const afterKey = (id: string): KeyRange => ({ kind: 'lowerBound', lower: id, lowerOpen: true });

/** The browser's own collection. */
export class LocalClassificationTarget implements ClassificationTarget {
  constructor(private readonly database: PersistenceDatabase) {}

  /**
   * How many games this index has not seen.
   *
   * Derived by subtraction rather than by counting the complement: an
   * IndexedDB index simply has no entry for a record whose key path is absent,
   * so "games with no `classifiedWith`" is not a range that can be counted, but
   * "games classified with exactly this digest" is — and it costs an index
   * count rather than a walk over every stored summary.
   */
  async remaining(digest: string): Promise<number> {
    const [total, done] = await Promise.all([
      this.database.count(STORE_NAMES.games),
      this.database.countRange(STORE_NAMES.games, 'classifiedWith', onlyKey(digest)),
    ]);
    return Math.max(0, total - done);
  }

  async page(digest: string, limit: number, after: string | null): Promise<ClassificationPage> {
    const scan = await this.database.scan<GameSummary>(STORE_NAMES.games, {
      ...(after === null ? {} : { range: afterKey(after) }),
      limit,
    });
    const cursor = scan.items.at(-1)?.id ?? null;
    const pending = scan.items.filter((game) => game.classifiedWith !== digest);
    if (pending.length === 0) {
      return { games: [], nextAfter: scan.complete ? null : cursor };
    }

    const games: UnclassifiedGame[] = [];
    await this.database.transaction([STORE_NAMES.positions], 'readonly', async (transaction) => {
      for (const game of pending) {
        const records = await transaction.getAllFromIndex<PositionRecord>(
          STORE_NAMES.positions,
          'gameId',
          game.id,
        );
        games.push({ id: game.id, positionKeys: positionKeysByPly(records) });
      }
    });
    return { games, nextAfter: scan.complete ? null : cursor };
  }

  /**
   * Write one page back.
   *
   * Read-modify-write inside one transaction, because a summary is stored whole
   * and the two classification fields are the only ones being changed. A game
   * deleted while the backfill was running is skipped rather than resurrected.
   */
  async apply(entries: readonly ClassifiedGame[]): Promise<void> {
    if (entries.length === 0) return;
    await this.database.transaction([STORE_NAMES.games], 'readwrite', async (transaction) => {
      for (const entry of entries) {
        const stored = await transaction.get<GameSummary>(STORE_NAMES.games, entry.id);
        if (!stored) continue;
        const { classification: _dropped, ...rest } = stored;
        await transaction.put(STORE_NAMES.games, {
          ...rest,
          ...(entry.classification ? { classification: entry.classification } : {}),
          classifiedWith: entry.classifiedWith,
        });
      }
    });
  }
}

/** A SQLite collection behind the companion. */
export class SqliteClassificationTarget implements ClassificationTarget {
  constructor(
    private readonly client: CompanionClient,
    private readonly key: string,
  ) {}

  async remaining(digest: string): Promise<number> {
    return (await this.client.classificationRemaining(this.key, digest)).remaining;
  }

  async page(digest: string, limit: number, after: string | null): Promise<ClassificationPage> {
    const page = await this.client.unclassifiedGames(this.key, digest, limit, after);
    return {
      games: page.games.map((game) => ({
        id: game.id,
        positionKeys: withTerminalPosition(game.positionKeys, game.finalFen, game.finalMoveUci),
      })),
      nextAfter: page.nextAfter,
    };
  }

  async apply(entries: readonly ClassifiedGame[]): Promise<void> {
    if (entries.length === 0) return;
    await this.client.applyClassification(this.key, entries);
  }
}
