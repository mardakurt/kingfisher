/**
 * The season reader.
 *
 * Pure module: takes a list of games already filtered to the player's
 * games (the picker does the filtering) and returns the five sections of
 * `season.md`. No React, no IndexedDB, no globals; tests fail when a
 * game is double-counted, when denominators disagree, when a threshold
 * change does not move games between phases, when a transposition is
 * split into two rows, and when an OTB+Lichess mixed set is computed
 * without `allowMixed`.
 *
 * The reader never invents a score and never says "you've improved" —
 * §5 of the research is explicit on that, and `team-hub.md` is the
 * precedent. The reader counts and reads; the player reads the counts.
 */
import { clockSummary } from '@/round/clock';
import { nameKey } from '@/round/identity';
import { positionKey } from '@/chess/fen';
import { formatScore } from '@/chess/evaluation';
import { mainlinePath } from '@/chess/tree/tree';
import type { MoveNode } from '@/chess/tree/types';
import { parseTimeControlTag, type TimeControlMetadata } from '@/chess/clock';
import type { GameRecord } from '@/persistence/types';
import { applyNamedSet, type SeasonNamedSet, type SeasonSourceBucket } from './named-set';

export interface SeasonDefaults {
  /** Opening ends at this move number (inclusive). Default 12. */
  readonly openingMoveNumber: number;
  /** Endgame starts at this move number (inclusive). Default 30. */
  readonly endgameMoveNumber: number;
  /** Under this many seconds on the move's clock, the move is "in time trouble". Default 30. */
  readonly timeTroubleSeconds: number;
  /**
   * Slowest openings are ranked by the average clock remaining after this
   * move number. Default 15.
   */
  readonly slowOpeningMoveNumber: number;
  /** Top N positions by total think time. Default 5. */
  readonly longestPositionsTopN: number;
}

export const DEFAULT_SEASON_DEFAULTS: SeasonDefaults = {
  openingMoveNumber: 12,
  endgameMoveNumber: 30,
  timeTroubleSeconds: 30,
  slowOpeningMoveNumber: 15,
  longestPositionsTopN: 5,
};

export type Phase = 'opening' | 'middlegame' | 'endgame';

export interface PhaseRow {
  readonly phase: Phase;
  readonly moves: number;
  readonly totalSeconds: number;
  /** Seconds spent per move, weighted across the named set. */
  readonly averageSeconds: number;
}

export interface PerMoveNumberRow {
  readonly moveNumber: number;
  readonly averageSeconds: number;
  readonly gamesCounted: number;
  /** At least one game was under the time-trouble threshold on this move. */
  readonly anyInTimeTrouble: boolean;
}

export interface LongestPositionRow {
  readonly positionKey: string;
  readonly fen: string;
  readonly games: readonly LongestPositionGame[];
  readonly totalSeconds: number;
  readonly firstSeenMoveNumber: number;
  readonly lastSeenMoveNumber: number;
}

export interface LongestPositionGame {
  readonly gameId: string;
  readonly moveNumber: number;
  readonly seconds: number;
  readonly followUpSan: string;
  /** Stored evaluation before and after the move, when the game carries both. */
  readonly evaluationChange: string | null;
  readonly result: string | null;
}

export interface TimeTroubleRow {
  readonly moveNumber: number;
  readonly gamesInTrouble: number;
  readonly totalGames: number;
}

export interface SlowOpeningRow {
  readonly opening: string;
  readonly fen: string;
  readonly player: string;
  readonly color: 'w' | 'b';
  readonly averageRemainingSeconds: number;
  readonly games: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
}

export interface SeasonSection {
  readonly source: SeasonSourceBucket;
  readonly totalGames: number;
  readonly gamesWithClock: number;
  readonly phases: readonly PhaseRow[];
  readonly perMoveNumber: readonly PerMoveNumberRow[];
  readonly longestPositions: readonly LongestPositionRow[];
  readonly timeTrouble: readonly TimeTroubleRow[];
  readonly slowestOpenings: readonly SlowOpeningRow[];
}

export interface SeasonReport {
  readonly predicate: SeasonNamedSet;
  readonly sections: readonly SeasonSection[];
}

interface MoveWithSeconds {
  readonly gameId: string;
  readonly moveNumber: number;
  readonly seconds: number;
  readonly remainingAfter: number | null;
  readonly fen: string;
  readonly positionKey: string;
  readonly san: string;
  readonly evaluationChange: string | null;
  readonly result: string | null;
}

const phaseOf = (moveNumber: number, defaults: SeasonDefaults): Phase => {
  if (moveNumber <= defaults.openingMoveNumber) return 'opening';
  if (moveNumber < defaults.endgameMoveNumber) return 'middlegame';
  return 'endgame';
};

const playerColor = (game: GameRecord, aliases: readonly string[]): 'w' | 'b' | null => {
  if (aliases.length === 0) return null;
  const keys = new Set(aliases.map(nameKey).filter(Boolean));
  if (keys.has(nameKey(game.white))) return 'w';
  if (keys.has(nameKey(game.black))) return 'b';
  return null;
};

const movesForGame = (game: GameRecord, color: 'w' | 'b'): readonly MoveWithSeconds[] => {
  const tree = game.tree;
  const summary = clockSummary(tree);
  if (!summary.available) return [];
  const control: TimeControlMetadata | null = parseTimeControlTag(tree.headers.TimeControl);
  const path = mainlinePath(tree).slice(1);
  const priorRemaining: Record<'w' | 'b', number | null> = {
    w: control?.initialSeconds ?? null,
    b: control?.initialSeconds ?? null,
  };
  const out: MoveWithSeconds[] = [];
  for (const id of path) {
    const node = tree.nodes[id];
    if (!node?.move) continue;
    // The side to move on ply N: White if N is odd, Black if N is even.
    const isWhite = node.ply % 2 === 1;
    const side: 'w' | 'b' = isWhite ? 'w' : 'b';
    if (side !== color) continue;
    const moveNumber = (node.ply + 1) >> 1;
    const seconds = thinkOf(node, priorRemaining[side], control);
    const remainingAfter =
      typeof node.meta.clockSeconds === 'number' ? node.meta.clockSeconds : null;
    if (remainingAfter !== null) priorRemaining[side] = remainingAfter;
    if (seconds === null) continue;
    const before = node.parentId ? tree.nodes[node.parentId] : undefined;
    if (!before) continue;
    out.push({
      gameId: game.id,
      moveNumber,
      seconds,
      remainingAfter,
      fen: before.fen,
      positionKey: positionKey(before.fen),
      san: node.move.san,
      evaluationChange:
        before.evaluation && node.evaluation
          ? `${formatScore(before.evaluation.score)} → ${formatScore(node.evaluation.score)}`
          : null,
      result: game.result ?? null,
    });
  }
  return out;
};

/**
 * Seconds spent on `node`, computed exactly the way `clockSummary` does
 * for `SideClockSummary.longest`: `[%emt]` first, otherwise the prior
 * reading plus the increment minus the new reading. Returns null when
 * neither path yields a number.
 */
const thinkOf = (
  node: MoveNode,
  priorRemaining: number | null,
  control: TimeControlMetadata | null,
): number | null => {
  if (typeof node.meta.elapsedSeconds === 'number' && node.meta.elapsedSeconds >= 0) {
    return node.meta.elapsedSeconds;
  }
  const remaining = node.meta.clockSeconds;
  if (typeof remaining !== 'number' || priorRemaining === null) return null;
  const increment = control?.incrementSeconds ?? 0;
  const seconds = priorRemaining + increment - remaining;
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 10) / 10;
};

const phaseRows = (
  moves: readonly MoveWithSeconds[],
  defaults: SeasonDefaults,
): readonly PhaseRow[] => {
  const buckets: Record<Phase, { moves: number; seconds: number }> = {
    opening: { moves: 0, seconds: 0 },
    middlegame: { moves: 0, seconds: 0 },
    endgame: { moves: 0, seconds: 0 },
  };
  for (const move of moves) {
    const phase = phaseOf(move.moveNumber, defaults);
    buckets[phase].moves += 1;
    buckets[phase].seconds += move.seconds;
  }
  return (['opening', 'middlegame', 'endgame'] as const).map((phase) => {
    const { moves, seconds } = buckets[phase];
    return {
      phase,
      moves,
      totalSeconds: Math.round(seconds),
      averageSeconds: moves === 0 ? 0 : Math.round((seconds / moves) * 10) / 10,
    };
  });
};

const perMoveNumber = (
  moves: readonly MoveWithSeconds[],
  defaults: SeasonDefaults,
): readonly PerMoveNumberRow[] => {
  const byMove = new Map<number, { seconds: number; games: Set<string>; trouble: boolean }>();
  for (const move of moves) {
    const bucket = byMove.get(move.moveNumber) ?? {
      seconds: 0,
      games: new Set(),
      trouble: false,
    };
    bucket.seconds += move.seconds;
    bucket.games.add(move.gameId);
    if (move.remainingAfter !== null && move.remainingAfter < defaults.timeTroubleSeconds) {
      bucket.trouble = true;
    }
    byMove.set(move.moveNumber, bucket);
  }
  return [...byMove.entries()]
    .sort(([a], [b]) => a - b)
    .map(([moveNumber, bucket]) => ({
      moveNumber,
      averageSeconds: Math.round((bucket.seconds / bucket.games.size) * 10) / 10,
      gamesCounted: bucket.games.size,
      anyInTimeTrouble: bucket.trouble,
    }));
};

const longestPositions = (
  moves: readonly MoveWithSeconds[],
  topN: number,
): readonly LongestPositionRow[] => {
  const byKey = new Map<string, LongestPositionRow>();
  for (const move of moves) {
    if (!move.positionKey) continue;
    const existing = byKey.get(move.positionKey);
    const gameRow: LongestPositionGame = {
      gameId: move.gameId,
      moveNumber: move.moveNumber,
      seconds: move.seconds,
      followUpSan: move.san,
      evaluationChange: move.evaluationChange,
      result: move.result,
    };
    if (existing) {
      byKey.set(move.positionKey, {
        positionKey: move.positionKey,
        fen: move.fen,
        games: [...existing.games, gameRow],
        totalSeconds: existing.totalSeconds + move.seconds,
        firstSeenMoveNumber: Math.min(existing.firstSeenMoveNumber, move.moveNumber),
        lastSeenMoveNumber: Math.max(existing.lastSeenMoveNumber, move.moveNumber),
      });
    } else {
      byKey.set(move.positionKey, {
        positionKey: move.positionKey,
        fen: move.fen,
        games: [gameRow],
        totalSeconds: move.seconds,
        firstSeenMoveNumber: move.moveNumber,
        lastSeenMoveNumber: move.moveNumber,
      });
    }
  }
  return [...byKey.values()]
    .sort(
      (a, b) => b.totalSeconds - a.totalSeconds || a.firstSeenMoveNumber - b.firstSeenMoveNumber,
    )
    .slice(0, topN)
    .map((row) => ({ ...row, totalSeconds: Math.round(row.totalSeconds) }));
};

const timeTrouble = (
  moves: readonly MoveWithSeconds[],
  gamesWithClock: number,
  defaults: SeasonDefaults,
): readonly TimeTroubleRow[] => {
  const targets = [30, 35, 40] as const;
  const gamesInTroubleAtMove = new Map<number, Set<string>>();
  for (const move of moves) {
    if (move.remainingAfter !== null && move.remainingAfter < defaults.timeTroubleSeconds) {
      const troubleSet = gamesInTroubleAtMove.get(move.moveNumber) ?? new Set();
      troubleSet.add(move.gameId);
      gamesInTroubleAtMove.set(move.moveNumber, troubleSet);
    }
  }
  return targets.map((moveNumber) => {
    const inTrouble = gamesInTroubleAtMove.get(moveNumber)?.size ?? 0;
    return { moveNumber, gamesInTrouble: inTrouble, totalGames: gamesWithClock };
  });
};

const slowestOpenings = (
  games: readonly GameRecord[],
  moves: readonly MoveWithSeconds[],
  playerColorFor: (game: GameRecord) => 'w' | 'b' | null,
  defaults: SeasonDefaults,
): readonly SlowOpeningRow[] => {
  type Bucket = {
    remaining: number;
    games: Set<string>;
    fen: string;
    player: string;
    color: 'w' | 'b';
  };
  const buckets = new Map<string, Bucket>();
  for (const move of moves) {
    if (move.moveNumber !== defaults.slowOpeningMoveNumber) continue;
    if (move.remainingAfter === null) continue;
    const game = games.find((g) => g.id === move.gameId);
    if (!game) continue;
    const color = playerColorFor(game);
    if (!color) continue;
    const opening = (game.eco ?? '').trim() || '?';
    const key = `${opening}|${color}`;
    const bucket = buckets.get(key) ?? {
      remaining: 0,
      games: new Set(),
      fen: move.fen,
      player: color === 'w' ? game.white : game.black,
      color,
    };
    bucket.remaining += move.remainingAfter;
    bucket.games.add(move.gameId);
    buckets.set(key, bucket);
  }
  const result: SlowOpeningRow[] = [];
  for (const [key, bucket] of buckets) {
    if (bucket.games.size === 0) continue;
    let wins = 0;
    let losses = 0;
    let draws = 0;
    for (const game of games) {
      if (!bucket.games.has(game.id)) continue;
      const color = playerColorFor(game);
      if (!color) continue;
      const r = (game.result ?? '').trim();
      if (r === '1/2-1/2') draws += 1;
      else if (r === '1-0') {
        if (color === 'w') wins += 1;
        else losses += 1;
      } else if (r === '0-1') {
        if (color === 'b') wins += 1;
        else losses += 1;
      }
    }
    result.push({
      opening: key.split('|')[0] ?? '?',
      fen: bucket.fen,
      player: bucket.player,
      color: bucket.color,
      averageRemainingSeconds: Math.round(bucket.remaining / bucket.games.size),
      games: bucket.games.size,
      wins,
      losses,
      draws,
    });
  }
  return result.sort((a, b) => a.averageRemainingSeconds - b.averageRemainingSeconds);
};

/**
 * Build the five sections for a named-set predicate.
 *
 * Returns either the sections, or an error explaining why the set cannot
 * be computed (zero games, mixed sources without `allowMixed`, etc.).
 */
export function buildSeason(input: {
  readonly games: readonly GameRecord[];
  readonly aliases: readonly string[];
  readonly predicate: SeasonNamedSet;
  readonly now: number;
  readonly defaults?: Partial<SeasonDefaults>;
}): { readonly report: SeasonReport } | { readonly error: string } {
  const playerGames = input.games.filter((game) => playerColor(game, input.aliases) !== null);
  const bucketed = applyNamedSet(playerGames, input.predicate, input.now);
  if ('error' in bucketed) return bucketed;
  const defaults: SeasonDefaults = { ...DEFAULT_SEASON_DEFAULTS, ...input.defaults };
  const sections: SeasonSection[] = bucketed.sets.map((bucket) => {
    const allMoves: MoveWithSeconds[] = [];
    for (const game of bucket.games) {
      const color = playerColor(game, input.aliases);
      if (!color) continue;
      allMoves.push(...movesForGame(game, color));
    }
    const gamesWithClock = bucket.games.filter((game) => clockSummary(game.tree).available).length;
    return {
      source: bucket,
      totalGames: bucket.games.length,
      gamesWithClock,
      phases: phaseRows(allMoves, defaults),
      perMoveNumber: perMoveNumber(allMoves, defaults),
      longestPositions: longestPositions(allMoves, defaults.longestPositionsTopN),
      timeTrouble: timeTrouble(allMoves, gamesWithClock, defaults),
      slowestOpenings: slowestOpenings(
        bucket.games,
        allMoves,
        (game) => playerColor(game, input.aliases),
        defaults,
      ),
    };
  });
  return { report: { predicate: input.predicate, sections } };
}
