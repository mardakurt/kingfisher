/**
 * A reference pack, as a database provider.
 *
 * The explorer, the position report and preparation all talk to
 * `ChessDatabaseProvider`. Making a pack one of those — rather than a fourth
 * kind of thing with its own panel — is what makes the bundled reference
 * usable everywhere a database is, without a single surface learning about
 * packs.
 *
 * The capabilities this declares are deliberately narrow. A pack stores
 * per-position aggregates, so it *cannot* answer "rated 2600+ only" or
 * "since 2024" without a second population it does not have. Claiming those
 * filters and then ignoring them would make Kingfisher print a number that is
 * not the number it says it is; the panel disables what a source cannot do.
 */

import { positionKey } from '@/chess/fen';
import type { San, Uci } from '@/chess/types';
import {
  performanceRating,
  moveScore,
  type ChessDatabaseProvider,
  type DatabaseCapabilities,
  type DatabaseGameRef,
  type DatabaseMove,
  type ExplorerQuery,
  type ExplorerResult,
  type GameResult,
  type ProviderHealth,
} from '@/database/types';

import type { PackGame, PackManifest } from './pack';
import type { PackReader } from './reader';

const CAPABILITIES: DatabaseCapabilities = {
  ratingFilter: false,
  dateFilter: false,
  playerFilter: false,
  speedFilter: false,
  topGames: true,
  offline: true,
};

export class ReferencePackProvider implements ChessDatabaseProvider {
  readonly capabilities = CAPABILITIES;

  constructor(
    private readonly reader: PackReader,
    readonly id: string,
    readonly name: string,
    readonly description: string,
  ) {}

  get manifest(): PackManifest {
    return this.reader.manifest;
  }

  /** A pack is immutable once installed, so its version is its cache key. */
  get cacheVersion(): string {
    return `${this.manifest.id}@${this.manifest.version}`;
  }

  async explore(query: ExplorerQuery): Promise<ExplorerResult> {
    const key = positionKey(query.fen);
    const entry = await this.reader.position(key);
    const source = { id: this.id, name: this.name };

    if (!entry) {
      return {
        fen: query.fen,
        source,
        totalGames: 0,
        white: 0,
        draws: 0,
        black: 0,
        moves: [],
      };
    }

    const sinceYear = this.manifest.recentSince;
    const moves: DatabaseMove[] = entry.moves.slice(0, query.limit ?? 20).map((move) => {
      const base: DatabaseMove = {
        uci: move.uci as Uci,
        san: move.san as San,
        games: move.games,
        white: move.white,
        draws: move.draws,
        black: move.black,
        ...(move.averageRating > 0 ? { averageRating: move.averageRating } : {}),
        ...(move.lastYear > 0 ? { lastPlayedYear: move.lastYear } : {}),
        ...(move.recentGames > 0
          ? {
              recent: {
                sinceYear,
                games: move.recentGames,
                white: move.recentWhite,
                draws: move.recentDraws,
                black: move.recentBlack,
              },
            }
          : {}),
      };
      if (!base.averageRating) return base;
      const turn = key.split(' ')[1] === 'b' ? 'b' : 'w';
      const performance = performanceRating(moveScore(base, turn), base.averageRating);
      return performance === undefined ? base : { ...base, performance };
    });

    const games = await this.reader.games(entry.games);
    return {
      fen: query.fen,
      source,
      totalGames: entry.moves.reduce((sum, move) => sum + move.games, 0),
      white: entry.moves.reduce((sum, move) => sum + move.white, 0),
      draws: entry.moves.reduce((sum, move) => sum + move.draws, 0),
      black: entry.moves.reduce((sum, move) => sum + move.black, 0),
      moves,
      ...(games.length > 0 ? { topGames: games.map(gameRef) } : {}),
      truncated: entry.moves.length > moves.length,
    };
  }

  async game(id: string): Promise<string> {
    const game = await this.reader.game(id);
    if (!game) throw new Error('That game is not in this reference source.');
    return packGamePgn(game, this.manifest);
  }

  async health(): Promise<ProviderHealth> {
    return {
      state: 'ready',
      checkedAt: Date.now(),
      message: `${this.manifest.counts.games.toLocaleString()} games, on this machine.`,
      version: this.manifest.version,
      count: this.manifest.counts.games,
    };
  }
}

export const gameRef = (game: PackGame): DatabaseGameRef => ({
  id: game.id,
  white: game.white,
  black: game.black,
  ...(game.whiteElo > 0 ? { whiteRating: game.whiteElo } : {}),
  ...(game.blackElo > 0 ? { blackRating: game.blackElo } : {}),
  result: (game.result as GameResult) ?? '*',
  ...(game.year > 0 ? { year: game.year } : {}),
  ...(game.event ? { event: game.event } : {}),
  ...(game.url ? { url: game.url } : {}),
});

/**
 * A pack game as PGN, so it enters Kingfisher through the same import path as
 * any other game rather than through a second, less-tested one.
 *
 * The `[Source]` tag is not standard, and is there on purpose: a game that
 * came out of a licensed reference should carry that fact into whatever study
 * or repertoire it is saved into.
 */
export function packGamePgn(game: PackGame, manifest: Pick<PackManifest, 'name'>): string {
  const tag = (name: string, value: string | number) =>
    `[${name} "${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
  const header = [
    tag('Event', game.event || 'Kingfisher reference'),
    tag('Site', game.url || manifest.name),
    tag('Date', game.date || (game.year > 0 ? `${game.year}.??.??` : '????.??.??')),
    tag('White', game.white),
    tag('Black', game.black),
    tag('Result', game.result),
    ...(game.whiteElo > 0 ? [tag('WhiteElo', game.whiteElo)] : []),
    ...(game.blackElo > 0 ? [tag('BlackElo', game.blackElo)] : []),
    ...(game.eco && game.eco !== '?' ? [tag('ECO', game.eco)] : []),
    ...(game.opening && game.opening !== '?' ? [tag('Opening', game.opening)] : []),
    tag('Source', manifest.name),
  ].join('\n');

  const tokens = game.moves.split(' ').filter(Boolean);
  const movetext: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (index % 2 === 0) movetext.push(`${index / 2 + 1}.`);
    movetext.push(tokens[index] as string);
  }
  movetext.push(game.result);
  return `${header}\n\n${wrap(movetext.join(' '))}\n`;
}

/** Export-format PGN wraps at 80 columns, and readers in the wild expect it. */
function wrap(text: string): string {
  const lines: string[] = [];
  let line = '';
  for (const token of text.split(' ')) {
    if (line.length + token.length + 1 > 80) {
      lines.push(line);
      line = token;
    } else {
      line = line.length === 0 ? token : `${line} ${token}`;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.join('\n');
}
