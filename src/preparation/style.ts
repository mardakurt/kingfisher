/**
 * The Style report: what a player's games show, measured.
 *
 * ChessBase's report grades a player — "positional player", "aggressiveness:
 * very high". Kingfisher does not: a grade needs a population to be graded
 * against and a model of what the word means, and it has neither. What it can
 * say honestly is what happened in the games on screen, each figure with its
 * sample and its definition. The reader draws the adjective.
 *
 * Pure: games in, facts out. `src/preparation/style.test.ts`.
 */

import { mainlinePath } from '@/chess/tree/tree';
import type { GameRecord } from '@/persistence/types';
import { playerKey } from '@/persistence/schema/migrations';

/** A draw in this many full moves or fewer is short. */
export const SHORT_DRAW_MOVES = 25;
/** A game of more than this many full moves is long. */
export const LONG_GAME_MOVES = 60;
/**
 * A final position with at most this many pieces besides kings and pawns
 * counts as an endgame. Stated, because "reached an endgame" means nothing
 * until someone says where the line is.
 */
export const ENDGAME_PIECES = 6;
/** The share of a side's games a set of first moves must cover to count as the repertoire. */
export const BREADTH_COVER = 0.9;

export interface SideRecord {
  readonly games: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  /** Points per game, as a percentage to one decimal. */
  readonly score: number;
}

export interface Measure {
  readonly id: string;
  readonly label: string;
  /** 0–100. */
  readonly value: number;
  /** How many games the percentage is of. */
  readonly of: number;
  readonly definition: string;
}

export interface StyleReport {
  readonly overall: SideRecord;
  readonly white: SideRecord;
  readonly black: SideRecord;
  readonly averageMoves: number | null;
  readonly shortDraws: number;
  readonly measures: readonly Measure[];
  /** Sentences, each built from the figures above and nothing else. */
  readonly observations: readonly { readonly id: string; readonly text: string }[];
}

const percent = (part: number, whole: number): number =>
  whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;

const record = (games: number, wins: number, draws: number, losses: number): SideRecord => ({
  games,
  wins,
  draws,
  losses,
  score: percent(wins + draws / 2, games),
});

/** Pieces other than kings and pawns in a FEN's placement field. */
export function officerCount(fen: string): number {
  const placement = fen.split(' ')[0] ?? '';
  let count = 0;
  for (const char of placement) if ('nbrqNBRQ'.includes(char)) count += 1;
  return count;
}

function firstMovesCovering(counts: ReadonlyMap<string, number>, total: number): number {
  if (total === 0) return 0;
  let covered = 0;
  let used = 0;
  for (const value of [...counts.values()].sort((a, b) => b - a)) {
    covered += value;
    used += 1;
    if (covered / total >= BREADTH_COVER) break;
  }
  return used;
}

export function buildStyleReport(
  games: readonly GameRecord[],
  aliases: readonly string[],
): StyleReport {
  const keys = new Set(aliases.map(playerKey).filter(Boolean));
  const tally = {
    w: { games: 0, wins: 0, draws: 0, losses: 0 },
    b: { games: 0, wins: 0, draws: 0, losses: 0 },
  };
  let moves = 0;
  let measured = 0;
  let shortDraws = 0;
  let longGames = 0;
  let endgames = 0;
  const firstMoves = { w: new Map<string, number>(), b: new Map<string, number>() };

  for (const game of games) {
    const color = keys.has(game.whiteKey) ? 'w' : keys.has(game.blackKey) ? 'b' : null;
    if (!color) continue;
    const side = tally[color];
    side.games += 1;
    const won = game.result === (color === 'w' ? '1-0' : '0-1');
    const lost = game.result === (color === 'w' ? '0-1' : '1-0');
    if (game.result === '1/2-1/2') side.draws += 1;
    else if (won) side.wins += 1;
    else if (lost) side.losses += 1;

    const line = mainlinePath(game.tree);
    const plies = line.length - 1;
    if (plies > 0) {
      const fullMoves = Math.ceil(plies / 2);
      moves += fullMoves;
      measured += 1;
      if (game.result === '1/2-1/2' && fullMoves <= SHORT_DRAW_MOVES) shortDraws += 1;
      if (fullMoves > LONG_GAME_MOVES) longGames += 1;
      const last = game.tree.nodes[line[line.length - 1] as string];
      if (last && officerCount(last.fen) <= ENDGAME_PIECES) endgames += 1;
      const ownFirst = game.tree.nodes[line[color === 'w' ? 1 : 2] as string]?.move?.san;
      if (ownFirst) firstMoves[color].set(ownFirst, (firstMoves[color].get(ownFirst) ?? 0) + 1);
    }
  }

  const white = record(tally.w.games, tally.w.wins, tally.w.draws, tally.w.losses);
  const black = record(tally.b.games, tally.b.wins, tally.b.draws, tally.b.losses);
  const total = white.games + black.games;
  const wins = white.wins + black.wins;
  const draws = white.draws + black.draws;
  const losses = white.losses + black.losses;
  const overall = record(total, wins, draws, losses);

  const measures: Measure[] =
    total === 0
      ? []
      : [
          {
            id: 'score-white',
            label: 'Score as White',
            value: white.score,
            of: white.games,
            definition: 'Points per game with the white pieces; a draw is half a point.',
          },
          {
            id: 'score-black',
            label: 'Score as Black',
            value: black.score,
            of: black.games,
            definition: 'Points per game with the black pieces; a draw is half a point.',
          },
          {
            id: 'decisive',
            label: 'Decided games',
            value: percent(wins + losses, total),
            of: total,
            definition: 'Games that ended in a win or a loss.',
          },
          {
            id: 'short-draws',
            label: 'Short draws',
            value: percent(shortDraws, draws),
            of: draws,
            definition: `Draws of ${SHORT_DRAW_MOVES} moves or fewer, as a share of all draws.`,
          },
          {
            id: 'long-games',
            label: 'Long games',
            value: percent(longGames, measured),
            of: measured,
            definition: `Games of more than ${LONG_GAME_MOVES} moves.`,
          },
          {
            id: 'endgames',
            label: 'Reached an endgame',
            value: percent(endgames, measured),
            of: measured,
            definition: `Games whose final position has at most ${ENDGAME_PIECES} pieces besides kings and pawns.`,
          },
        ];

  const observations: { id: string; text: string }[] = [];
  if (total > 0) {
    observations.push({
      id: 'colours',
      text: `Scores ${white.score}% as White (${white.games} games) and ${black.score}% as Black (${black.games}).`,
    });
    observations.push({
      id: 'results',
      text: `${percent(wins + losses, total)}% of games were decided; ${percent(draws, total)}% were drawn${
        shortDraws > 0 ? `, ${shortDraws} of them in ${SHORT_DRAW_MOVES} moves or fewer` : ''
      }.`,
    });
    for (const color of ['w', 'b'] as const) {
      const counts = firstMoves[color];
      const played = [...counts.values()].reduce((sum, value) => sum + value, 0);
      if (played === 0) continue;
      const [top, topCount] = [...counts].sort((a, b) => b[1] - a[1])[0] as [string, number];
      const needed = firstMovesCovering(counts, played);
      observations.push({
        id: `breadth-${color}`,
        text:
          color === 'w'
            ? `As White, opens 1.${top} in ${percent(topCount, played)}% of games; ${needed} first ${needed === 1 ? 'move covers' : 'moves cover'} ${BREADTH_COVER * 100}% of them.`
            : `As Black, answers most often with 1…${top} (${percent(topCount, played)}%); ${needed} first ${needed === 1 ? 'reply covers' : 'replies cover'} ${BREADTH_COVER * 100}% of games.`,
      });
    }
    if (measured > 0) {
      observations.push({
        id: 'length',
        text: `Games last ${Math.round(moves / measured)} moves on average; ${percent(endgames, measured)}% end in an endgame.`,
      });
    }
  }

  return {
    overall,
    white,
    black,
    averageMoves: measured ? Math.round(moves / measured) : null,
    shortDraws,
    measures,
    observations,
  };
}
