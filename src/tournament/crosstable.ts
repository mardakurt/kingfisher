/**
 * A tournament table from the games a database holds.
 *
 * ChessBase draws a cross-table for any tournament in a database; this is
 * the same table, computed from nothing but the headers of the games the
 * caller hands in. Three rules decide what it may say:
 *
 * **Only games it was given.** A table built from a database that holds
 * eleven of a tournament's forty-five games is a table of eleven games, and
 * says so: `complete` is true only for a round robin in which every pairing
 * that the format implies is present. A partial table never claims a winner.
 *
 * **A result is a result.** `*` (no recorded result) scores for nobody and
 * is listed as unfinished, never filed as a loss. A second copy of the same
 * game (same players, colours and round) is counted once and reported.
 *
 * **Performance is FIDE's, and says how much of it there is.** The rating
 * performance uses the FIDE table 8.1.1 (`p` rounded to two decimals, `dp`
 * looked up, `Rp = Ra + dp`) over the games whose opponent has a recorded
 * rating, and carries the count of those games, so a "performance" over one
 * rated game is visibly that.
 */

import type { GameResult } from '@/database/types';
import { nameKey } from '@/round/identity';

export interface CrosstableGame {
  readonly id: string;
  readonly white: string;
  readonly black: string;
  readonly result: GameResult;
  readonly round?: string;
  readonly date?: string;
  readonly whiteRating?: number;
  readonly blackRating?: number;
}

export type CrosstableFormat = 'round-robin' | 'swiss';

export interface CrosstableEncounter {
  readonly gameId: string;
  readonly opponent: number;
  readonly color: 'w' | 'b';
  /** 1, 0.5, 0, or null for a game with no recorded result. */
  readonly score: number | null;
  readonly round: string | null;
}

export interface CrosstablePlayer {
  readonly index: number;
  readonly name: string;
  readonly rating: number | null;
  readonly score: number;
  /** Games with a result; unfinished games are not counted here. */
  readonly played: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  readonly whiteGames: number;
  readonly sonnebornBerger: number;
  readonly buchholz: number;
  readonly performance: { readonly rating: number; readonly ratedGames: number } | null;
  readonly encounters: readonly CrosstableEncounter[];
  /** 1-based place; players tied on every criterion share it. */
  readonly rank: number;
}

export interface Crosstable {
  readonly format: CrosstableFormat;
  /** Games per pairing in a round robin (1 single, 2 double); null for swiss. */
  readonly cycles: number | null;
  /** True only for a round robin with every implied game present and finished. */
  readonly complete: boolean;
  readonly players: readonly CrosstablePlayer[];
  readonly games: number;
  readonly unfinished: number;
  readonly duplicates: number;
  /** Names of the tie-breaks in the order they were applied. */
  readonly tieBreaks: readonly string[];
  readonly averageRating: number | null;
  /** Rounds named by the games, in order, when every game names a numeric round. */
  readonly rounds: readonly string[] | null;
}

/** FIDE Rating Regulations, table 8.1.1: dp for p = 0.50 … 1.00. */
const DP_UPPER = [
  0, 7, 14, 21, 29, 36, 43, 50, 57, 65, 72, 80, 87, 95, 102, 110, 117, 125, 133, 141, 149, 158, 166,
  175, 184, 193, 202, 211, 220, 230, 240, 251, 262, 273, 284, 296, 309, 322, 336, 351, 366, 383,
  401, 422, 444, 470, 501, 538, 589, 677, 800,
] as const;

/** `dp` for a fractional score, from FIDE table 8.1.1 (`p` rounded to 2 decimals). */
export function fideDp(p: number): number {
  const hundredths = Math.round(Math.min(1, Math.max(0, p)) * 100);
  return hundredths >= 50 ? DP_UPPER[hundredths - 50]! : -DP_UPPER[50 - hundredths]!;
}

/** FIDE performance: average opponent rating plus `dp`, rounded to a whole number. */
export function fidePerformance(score: number, games: number, averageOpponent: number): number {
  return Math.round(averageOpponent + fideDp(score / games));
}

const scoreOf = (result: GameResult, color: 'w' | 'b'): number | null => {
  if (result === '1/2-1/2') return 0.5;
  if (result === '1-0') return color === 'w' ? 1 : 0;
  if (result === '0-1') return color === 'b' ? 1 : 0;
  return null;
};

const roundKey = (round: string | undefined): string | null => {
  const value = round?.trim();
  return value && value !== '?' && value !== '-' ? value : null;
};

/** Numeric ordering for "3", "3.1", "10"; null when a round is not a number. */
const roundNumber = (round: string): number[] | null =>
  /^\d+(\.\d+)*$/.test(round) ? round.split('.').map(Number) : null;

const compareRounds = (a: number[], b: number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};

export function buildCrosstable(input: readonly CrosstableGame[]): Crosstable {
  const index = new Map<string, number>();
  const names: string[] = [];
  const ratings: (number | null)[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  const games: { game: CrosstableGame; w: number; b: number }[] = [];

  const playerIndex = (name: string): number => {
    const key = nameKey(name);
    let at = index.get(key);
    if (at === undefined) {
      at = names.length;
      index.set(key, at);
      names.push(name.trim());
      ratings.push(null);
    }
    return at;
  };

  for (const game of input) {
    if (!nameKey(game.white) || !nameKey(game.black)) continue;
    if (nameKey(game.white) === nameKey(game.black)) continue;
    const identity = [
      nameKey(game.white),
      nameKey(game.black),
      roundKey(game.round) ?? `#${game.id}`,
    ].join('\u001f');
    if (seen.has(identity)) {
      duplicates += 1;
      continue;
    }
    seen.add(identity);
    const w = playerIndex(game.white);
    const b = playerIndex(game.black);
    // The highest rating a player is recorded with in this event: ratings are
    // published per period, so two values in one event are the same player
    // under two lists, and the table shows one number.
    if (game.whiteRating) ratings[w] = Math.max(ratings[w] ?? 0, game.whiteRating);
    if (game.blackRating) ratings[b] = Math.max(ratings[b] ?? 0, game.blackRating);
    games.push({ game, w, b });
  }

  const n = names.length;
  const encounters: CrosstableEncounter[][] = names.map(() => []);
  const scores = new Array<number>(n).fill(0);
  const pairCounts = new Map<string, number>();
  let unfinished = 0;
  for (const { game, w, b } of games) {
    const round = roundKey(game.round);
    const ws = scoreOf(game.result, 'w');
    const bs = scoreOf(game.result, 'b');
    if (ws === null) unfinished += 1;
    encounters[w]!.push({ gameId: game.id, opponent: b, color: 'w', score: ws, round });
    encounters[b]!.push({ gameId: game.id, opponent: w, color: 'b', score: bs, round });
    if (ws !== null) scores[w]! += ws;
    if (bs !== null) scores[b]! += bs;
    const pair = w < b ? `${w}-${b}` : `${b}-${w}`;
    pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
  }

  // A round robin is every pair meeting the same number of times.
  const pairs = (n * (n - 1)) / 2;
  const counts = [...pairCounts.values()];
  const cycles = counts.length > 0 ? Math.max(...counts) : 0;
  const roundRobin =
    n >= 3 && pairCounts.size === pairs && counts.every((count) => count === cycles) && cycles <= 4;
  // A partial round robin (some pairings absent, none repeated more often
  // than the cycle count) is still drawn as a grid, but never called complete.
  // In a swiss most players meet a small fraction of the field, so fewer than
  // three in five pairings present reads as a swiss.
  const looksRoundRobin =
    roundRobin || (n >= 3 && n <= 30 && cycles <= 4 && pairCounts.size >= pairs * 0.6);
  const format: CrosstableFormat = looksRoundRobin ? 'round-robin' : 'swiss';

  const players = names.map((name, i) => {
    const list = encounters[i]!;
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let whiteGames = 0;
    let sb = 0;
    let buchholz = 0;
    let ratedScore = 0;
    let ratedGames = 0;
    let opponentSum = 0;
    for (const entry of list) {
      if (entry.color === 'w') whiteGames += 1;
      if (entry.score === null) continue;
      if (entry.score === 1) wins += 1;
      else if (entry.score === 0.5) draws += 1;
      else losses += 1;
      sb += entry.score * scores[entry.opponent]!;
      buchholz += scores[entry.opponent]!;
      const opponentRating = ratings[entry.opponent];
      if (opponentRating) {
        ratedGames += 1;
        ratedScore += entry.score;
        opponentSum += opponentRating;
      }
    }
    return {
      index: i,
      name,
      rating: ratings[i] ?? null,
      score: scores[i]!,
      played: wins + draws + losses,
      wins,
      draws,
      losses,
      whiteGames,
      sonnebornBerger: sb,
      buchholz,
      performance:
        ratedGames > 0
          ? {
              rating: fidePerformance(ratedScore, ratedGames, opponentSum / ratedGames),
              ratedGames,
            }
          : null,
      encounters: [...list].sort((a, b) => {
        const ra = a.round ? roundNumber(a.round) : null;
        const rb = b.round ? roundNumber(b.round) : null;
        return ra && rb ? compareRounds(ra, rb) : 0;
      }),
      rank: 0,
    };
  });

  const tieBreaks =
    format === 'round-robin'
      ? ['Sonneborn-Berger', 'wins', 'games with Black']
      : ['Buchholz', 'Sonneborn-Berger', 'wins'];
  const keyOf = (p: (typeof players)[number]): number[] =>
    format === 'round-robin'
      ? [p.score, p.sonnebornBerger, p.wins, p.played - p.whiteGames]
      : [p.score, p.buchholz, p.sonnebornBerger, p.wins];
  const order = [...players].sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    for (let i = 0; i < ka.length; i += 1) {
      if (ka[i] !== kb[i]) return kb[i]! - ka[i]!;
    }
    return a.name.localeCompare(b.name);
  });
  const ranked = order.map((player, position) => {
    const previous = order[position - 1];
    const tied = previous && keyOf(previous).every((value, i) => value === keyOf(player)[i]);
    return { ...player, rank: position + 1, tied };
  });
  for (let i = 1; i < ranked.length; i += 1) {
    if (ranked[i]!.tied) ranked[i]!.rank = ranked[i - 1]!.rank;
  }

  const rated = ratings.filter((value): value is number => value !== null && value > 0);
  const roundNames = new Set<string>();
  let allNumeric = games.length > 0;
  for (const { game } of games) {
    const round = roundKey(game.round);
    if (!round || !roundNumber(round)) allNumeric = false;
    else roundNames.add(round.split('.')[0]!);
  }

  return {
    format,
    cycles: format === 'round-robin' ? Math.max(1, cycles) : null,
    complete: roundRobin && unfinished === 0,
    players: ranked.map(({ tied: _tied, ...player }) => player),
    games: games.length,
    unfinished,
    duplicates,
    tieBreaks,
    averageRating:
      rated.length > 0
        ? Math.round(rated.reduce((sum, value) => sum + value, 0) / rated.length)
        : null,
    rounds: allNumeric ? [...roundNames].sort((a, b) => Number(a) - Number(b)) : null,
  };
}

/** "1", "½", "0", or "*" for one encounter. */
export const scoreGlyph = (score: number | null): string =>
  score === null ? '*' : score === 1 ? '1' : score === 0.5 ? '½' : '0';

/** A score as a chess player writes it: 6½, ½, 0. */
export function formatPoints(score: number): string {
  const whole = Math.floor(score);
  const half = score - whole >= 0.5;
  if (!half) return String(whole);
  return whole === 0 ? '½' : `${whole}½`;
}

/** The grid cell for row against column in a round robin: every game, in round order. */
export function gridCell(table: Crosstable, row: number, column: number): string {
  const player = table.players.find((entry) => entry.index === row);
  if (!player) return '';
  return player.encounters
    .filter((entry) => entry.opponent === column)
    .map((entry) => scoreGlyph(entry.score))
    .join('');
}

/** Plain text, for the clipboard: a fixed-width table a person can paste anywhere. */
export function crosstableText(table: Crosstable, title: string): string {
  const lines: string[] = [title];
  const nameWidth = Math.max(4, ...table.players.map((p) => p.name.length));
  const pad = (value: string, width: number) => value.padEnd(width);
  const padLeft = (value: string, width: number) => value.padStart(width);
  if (table.format === 'round-robin') {
    const header = [
      padLeft('#', 3),
      pad('Name', nameWidth),
      padLeft('Elo', 5),
      ...table.players.map((_, i) => padLeft(String(i + 1), 3 * (table.cycles ?? 1))),
      padLeft('Pts', 5),
      padLeft('SB', 6),
      padLeft('Perf', 5),
    ];
    lines.push(header.join(' '));
    table.players.forEach((player) => {
      lines.push(
        [
          padLeft(String(player.rank), 3),
          pad(player.name, nameWidth),
          padLeft(player.rating ? String(player.rating) : '', 5),
          ...table.players.map((other) =>
            padLeft(
              other.index === player.index ? '·' : gridCell(table, player.index, other.index),
              3 * (table.cycles ?? 1),
            ),
          ),
          padLeft(formatPoints(player.score), 5),
          padLeft(player.sonnebornBerger.toFixed(2), 6),
          padLeft(player.performance ? String(player.performance.rating) : '', 5),
        ].join(' '),
      );
    });
  } else {
    lines.push(
      [
        padLeft('#', 3),
        pad('Name', nameWidth),
        padLeft('Elo', 5),
        padLeft('Pts', 5),
        padLeft('Gms', 4),
        padLeft('Buch', 6),
        padLeft('SB', 6),
        padLeft('Perf', 5),
      ].join(' '),
    );
    for (const player of table.players) {
      lines.push(
        [
          padLeft(String(player.rank), 3),
          pad(player.name, nameWidth),
          padLeft(player.rating ? String(player.rating) : '', 5),
          padLeft(formatPoints(player.score), 5),
          padLeft(String(player.played), 4),
          padLeft(player.buchholz.toFixed(1), 6),
          padLeft(player.sonnebornBerger.toFixed(2), 6),
          padLeft(player.performance ? String(player.performance.rating) : '', 5),
        ].join(' '),
      );
    }
  }
  lines.push('');
  lines.push(crosstableCaveat(table));
  return lines.join('\n');
}

/** The sentence every rendering of the table carries: what it was built from. */
export function crosstableCaveat(table: Crosstable): string {
  const parts = [
    `Built from ${table.games} ${table.games === 1 ? 'game' : 'games'} in this database`,
  ];
  if (table.format === 'round-robin') {
    parts.push(
      table.complete
        ? `a complete ${table.cycles === 2 ? 'double ' : ''}round robin`
        : 'not every pairing of a round robin is present, so standings are provisional',
    );
  } else {
    parts.push('ordered as a swiss or open event');
  }
  if (table.unfinished)
    parts.push(`${table.unfinished} without a recorded result (scored for nobody)`);
  if (table.duplicates)
    parts.push(
      `${table.duplicates} duplicate ${table.duplicates === 1 ? 'copy' : 'copies'} ignored`,
    );
  parts.push(`tie-breaks: ${table.tieBreaks.join(', ')}`);
  parts.push('performance by FIDE table 8.1.1 over games against rated opponents');
  return `${parts.join('; ')}.`;
}
