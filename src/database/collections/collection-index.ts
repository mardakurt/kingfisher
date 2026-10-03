/**
 * A collection's index: its players and its tournaments, counted.
 *
 * ChessBase opens a database on an overview — games, players, tournaments,
 * annotators, sources — and each count is a list you can browse. Kingfisher's
 * collections answered "how many games" and nothing else about what was in
 * them. This reads the one cheap walk both stores already serve
 * (`GameCollection.duplicateKeys`: players, event, date and result per game,
 * no moves) and counts.
 *
 * Names are grouped as written, after trimming and folding case and spacing,
 * the same rule the Library's player filter uses; "Carlsen, M" and "Carlsen,
 * Magnus" stay two players, because deciding they are one person is a claim
 * the headers do not make. An event is grouped by its name and year, so the
 * same tournament held every year is one row per edition.
 *
 * Pure: pages in, index out. `src/database/collections/collection-index.test.ts`.
 */

import type { DuplicateKey } from './types';

const UNKNOWN = new Set(['', '?', '-', 'unknown', 'nn', 'n.n.', 'casual game']);

const fold = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

const yearOf = (date: string | undefined): number | null => {
  const match = /^(\d{4})/.exec(date ?? '');
  const year = match ? Number(match[1]) : NaN;
  return Number.isFinite(year) && year > 0 ? year : null;
};

export interface IndexPlayer {
  readonly name: string;
  readonly games: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  /** Points per decided-or-drawn game, 0–100 to one decimal; null with no result. */
  readonly score: number | null;
  readonly firstYear: number | null;
  readonly lastYear: number | null;
}

export interface IndexTournament {
  readonly name: string;
  readonly year: number | null;
  readonly games: number;
  readonly players: number;
  /** The latest date a game of it carries, `YYYY.MM.DD` with `??` as written. */
  readonly lastDate: string | null;
}

export interface CollectionIndex {
  readonly games: number;
  readonly players: readonly IndexPlayer[];
  readonly tournaments: readonly IndexTournament[];
  readonly firstYear: number | null;
  readonly lastYear: number | null;
  /** Games whose event is missing or a placeholder, and so are in no tournament. */
  readonly withoutEvent: number;
  readonly undated: number;
}

interface PlayerTally {
  name: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  firstYear: number | null;
  lastYear: number | null;
}

interface TournamentTally {
  name: string;
  year: number | null;
  games: number;
  players: Set<string>;
  lastDate: string | null;
}

/** An index being built page by page, so a large collection can show progress. */
export class CollectionIndexBuilder {
  private games = 0;
  private withoutEvent = 0;
  private undated = 0;
  private firstYear: number | null = null;
  private lastYear: number | null = null;
  private readonly players = new Map<string, PlayerTally>();
  private readonly tournaments = new Map<string, TournamentTally>();

  add(keys: readonly DuplicateKey[]): void {
    for (const game of keys) {
      this.games += 1;
      const year = yearOf(game.date);
      if (year === null) this.undated += 1;
      else {
        this.firstYear = this.firstYear === null ? year : Math.min(this.firstYear, year);
        this.lastYear = this.lastYear === null ? year : Math.max(this.lastYear, year);
      }
      const sides: readonly [string, 'w' | 'b'][] = [
        [game.white, 'w'],
        [game.black, 'b'],
      ];
      for (const [name, side] of sides) {
        const key = fold(name);
        if (UNKNOWN.has(key)) continue;
        const tally = this.players.get(key) ?? {
          name: name.trim(),
          games: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          firstYear: null,
          lastYear: null,
        };
        tally.games += 1;
        const won =
          (game.result === '1-0' && side === 'w') || (game.result === '0-1' && side === 'b');
        const lost =
          (game.result === '1-0' && side === 'b') || (game.result === '0-1' && side === 'w');
        if (game.result === '1/2-1/2') tally.draws += 1;
        else if (won) tally.wins += 1;
        else if (lost) tally.losses += 1;
        if (year !== null) {
          tally.firstYear = tally.firstYear === null ? year : Math.min(tally.firstYear, year);
          tally.lastYear = tally.lastYear === null ? year : Math.max(tally.lastYear, year);
        }
        this.players.set(key, tally);
      }
      const event = (game.event ?? '').trim();
      if (UNKNOWN.has(fold(event))) {
        this.withoutEvent += 1;
        continue;
      }
      const key = `${fold(event)}|${year ?? ''}`;
      const tally = this.tournaments.get(key) ?? {
        name: event,
        year,
        games: 0,
        players: new Set<string>(),
        lastDate: null,
      };
      tally.games += 1;
      for (const [name] of sides) if (!UNKNOWN.has(fold(name))) tally.players.add(fold(name));
      if (game.date && (tally.lastDate === null || game.date > tally.lastDate)) {
        tally.lastDate = game.date;
      }
      this.tournaments.set(key, tally);
    }
  }

  build(): CollectionIndex {
    const players = [...this.players.values()]
      .map((tally) => {
        const counted = tally.wins + tally.draws + tally.losses;
        return {
          ...tally,
          score: counted
            ? Math.round(((tally.wins + tally.draws / 2) / counted) * 1000) / 10
            : null,
        };
      })
      .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
    const tournaments = [...this.tournaments.values()]
      .map((tally) => ({
        name: tally.name,
        year: tally.year,
        games: tally.games,
        players: tally.players.size,
        lastDate: tally.lastDate,
      }))
      // Newest first, as ChessBase's "Newest tournaments": by the last game's date.
      .sort(
        (a, b) =>
          (b.lastDate ?? '').localeCompare(a.lastDate ?? '') ||
          b.games - a.games ||
          a.name.localeCompare(b.name),
      );
    return {
      games: this.games,
      players,
      tournaments,
      firstYear: this.firstYear,
      lastYear: this.lastYear,
      withoutEvent: this.withoutEvent,
      undated: this.undated,
    };
  }
}

/** The whole walk. `onPage` reports games read, for progress on a large collection. */
export async function readCollectionIndex(
  collection: {
    duplicateKeys(
      after: string | null,
      limit: number,
    ): Promise<{ games: readonly DuplicateKey[]; nextAfter: string | null }>;
  },
  options: { readonly signal?: AbortSignal; readonly onPage?: (read: number) => void } = {},
): Promise<CollectionIndex> {
  const builder = new CollectionIndexBuilder();
  let after: string | null = null;
  let read = 0;
  do {
    if (options.signal?.aborted) throw new DOMException('Stopped', 'AbortError');
    const page = await collection.duplicateKeys(after, 2_000);
    builder.add(page.games);
    read += page.games.length;
    options.onPage?.(read);
    after = page.games.length > 0 ? page.nextAfter : null;
  } while (after !== null);
  return builder.build();
}
