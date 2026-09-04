/**
 * The Kingfisher reference-pack format.
 *
 * A pack is a manifest plus a set of gzip-compressed chunks. It is the one
 * shape every reference data source takes — the starter reference that ships
 * with the application, an elite archive installed later, and a fixture used
 * by a test all read through this file. That is deliberate: a bundled source
 * that took a private path would be the one source no test ever exercised.
 *
 * The encoders live here rather than in the build script so that the program
 * that writes a pack and the program that reads it cannot drift. Every line
 * format is plain text because gzip removes the difference in size that a
 * binary encoding would buy, and because a corrupt pack should be readable by
 * a human deciding what went wrong.
 *
 * Chunks are sharded by a hash of their key, so answering "what is played in
 * this position" reads one chunk of a few hundred kilobytes rather than the
 * whole source. That is what lets a million-game reference answer from
 * IndexedDB without ever holding a million games in memory.
 */

export const PACK_FORMAT = 'kingfisher-pack/1';

export type PackChunkKind = 'explorer' | 'game' | 'players' | 'playergames';

export interface PackLicense {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  /** The credit line the licence requires Kingfisher to display. */
  readonly attribution?: string;
}

export interface PackProvenance {
  readonly source: string;
  readonly url: string;
  /** ISO date the upstream files were retrieved. */
  readonly retrieved: string;
  /** What the build did to the upstream data, in one sentence. */
  readonly transformation: string;
  /** Upstream files this pack was built from, with their published digests. */
  readonly upstream: readonly { readonly file: string; readonly sha256: string }[];
}

export interface PackChunk {
  readonly id: string;
  readonly kind: PackChunkKind;
  /** Shard number within its kind, or 0 when the kind has a single chunk. */
  readonly shard: number;
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly entries: number;
}

export interface PackCounts {
  /** Games the pack's statistics were computed from. */
  readonly games: number;
  /** Of those, the games whose full score the pack carries. */
  readonly openable: number;
  readonly positions: number;
  readonly players: number;
}

export interface PackManifest {
  readonly format: typeof PACK_FORMAT;
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly builtAt: string;
  readonly license: PackLicense;
  readonly provenance: PackProvenance;
  readonly counts: PackCounts;
  /** Games from this calendar year onwards are counted in the `recent` totals. */
  readonly recentSince: number;
  /** How many shards each kind was split into. */
  readonly shards: Readonly<Record<PackChunkKind, number>>;
  readonly chunks: readonly PackChunk[];
  /** Total decompressed bytes, so an installer can show a real size. */
  readonly rawBytes: number;
  readonly compressedBytes: number;
}

/**
 * FNV-1a over the UTF-16 code units of a key.
 *
 * Chosen because it is four lines, has no dependencies, and is identical in
 * the build script and the browser. It decides only which shard a key lives
 * in, so its distribution matters and its cryptographic strength does not.
 */
export function shardHash(key: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export const shardOf = (key: string, shards: number): number => shardHash(key) % shards;

export const chunkId = (kind: PackChunkKind, shard: number): string =>
  `${kind}-${String(shard).padStart(3, '0')}`;

export const chunkFile = (kind: PackChunkKind, shard: number): string =>
  `${chunkId(kind, shard)}.kfp.gz`;

/* ------------------------------------------------------------------ explorer */

/** One candidate move at a position, as a pack stores it. */
export interface PackMove {
  readonly san: string;
  readonly uci: string;
  readonly games: number;
  readonly white: number;
  readonly draws: number;
  readonly black: number;
  /** Mean rating of the side that played it, or 0 when the source has none. */
  readonly averageRating: number;
  /** Latest year the move appears, or 0 when unknown. */
  readonly lastYear: number;
  /**
   * The same counts restricted to the manifest's `recentSince` year.
   *
   * Stored rather than derived from a second filtered query, because a
   * position aggregate cannot answer a date filter — see ADR 0023. Two numbers
   * per move buys the one comparison an opening explorer is actually asked
   * for, "is this still played", without pretending the aggregate can be
   * sliced arbitrarily.
   */
  readonly recentGames: number;
  readonly recentWhite: number;
  readonly recentDraws: number;
  readonly recentBlack: number;
}

export interface PackPosition {
  readonly key: string;
  readonly moves: readonly PackMove[];
  /** Ids of games reaching this position, most recent first, bounded. */
  readonly games: readonly string[];
}

const YEAR_EPOCH = 1900;

export function encodeExplorerLine(entry: PackPosition): string {
  const moves = entry.moves
    .map(
      (move) =>
        `${move.san},${move.uci},${move.games},${move.white},${move.draws},${move.black},` +
        `${move.averageRating},${move.lastYear ? move.lastYear - YEAR_EPOCH : 0},` +
        `${move.recentGames},${move.recentWhite},${move.recentDraws},${move.recentBlack}`,
    )
    .join(';');
  return `${entry.key}|${moves}|${entry.games.join(',')}`;
}

export function decodeExplorerLine(line: string): PackPosition | null {
  const first = line.indexOf('|');
  if (first < 1) return null;
  const second = line.indexOf('|', first + 1);
  if (second < 0) return null;
  const key = line.slice(0, first);
  const movesText = line.slice(first + 1, second);
  const gamesText = line.slice(second + 1);

  const moves: PackMove[] = [];
  if (movesText.length > 0) {
    for (const encoded of movesText.split(';')) {
      const parts = encoded.split(',');
      if (parts.length < 12) continue;
      const year = Number(parts[7]);
      moves.push({
        san: parts[0] as string,
        uci: parts[1] as string,
        games: Number(parts[2]),
        white: Number(parts[3]),
        draws: Number(parts[4]),
        black: Number(parts[5]),
        averageRating: Number(parts[6]),
        lastYear: year > 0 ? year + YEAR_EPOCH : 0,
        recentGames: Number(parts[8]),
        recentWhite: Number(parts[9]),
        recentDraws: Number(parts[10]),
        recentBlack: Number(parts[11]),
      });
    }
  }
  return { key, moves, games: gamesText.length > 0 ? gamesText.split(',') : [] };
}

/* ---------------------------------------------------------------------- game */

export interface PackGame {
  readonly id: string;
  readonly white: string;
  readonly black: string;
  readonly result: string;
  readonly year: number;
  /** The date the source recorded, `YYYY.MM.DD`, or '' when it recorded none. */
  readonly date: string;
  readonly event: string;
  readonly eco: string;
  readonly opening: string;
  readonly whiteElo: number;
  readonly blackElo: number;
  readonly url: string;
  /** Space-separated SAN, exactly as the source recorded the game. */
  readonly moves: string;
}

/** Fields are tab-separated because event names contain almost everything else. */
const clean = (value: string): string => value.replace(/[\t\n\r]/g, ' ').trim();

/**
 * `YYYY.MM.DD`, whichever of the shapes in the wild a source recorded.
 *
 * Applied on read as well as on write: packs built before this normalisation
 * existed carry both `2024.12.30` and `20241230`, and a game list that shows
 * one row each way looks broken whoever's fault it was.
 */
export function packDate(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 8) return value.includes('.') ? value : '';
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
}

export function encodeGameLine(game: PackGame): string {
  return [
    game.id,
    clean(game.white),
    clean(game.black),
    game.result,
    game.year || '',
    game.date,
    clean(game.event),
    game.eco,
    clean(game.opening),
    game.whiteElo || '',
    game.blackElo || '',
    game.url,
    game.moves,
  ].join('\t');
}

export function decodeGameLine(line: string): PackGame | null {
  const parts = line.split('\t');
  if (parts.length < 13) return null;
  return {
    id: parts[0] as string,
    white: parts[1] as string,
    black: parts[2] as string,
    result: parts[3] as string,
    year: Number(parts[4]) || 0,
    date: packDate(parts[5] as string),
    event: parts[6] as string,
    eco: parts[7] as string,
    opening: parts[8] as string,
    whiteElo: Number(parts[9]) || 0,
    blackElo: Number(parts[10]) || 0,
    url: parts[11] as string,
    moves: parts.slice(12).join('\t'),
  };
}

/* ------------------------------------------------------------------- players */

export interface PackPlayer {
  /** The lookup key this row answers to: one spelling of the name. */
  readonly key: string;
  /**
   * The identity this row belongs to.
   *
   * Different from `key` only when the source itself recorded two spellings
   * under one FIDE identifier — "Carlsen, Magnus" and "Magnus Carlsen" are one
   * player because the archive says so, not because the names look alike. A
   * search deduplicates on this; a lookup by any spelling finds the same facts.
   */
  readonly id: string;
  readonly name: string;
  /** FIDE identifier exactly as the source recorded it, or '' when it did not. */
  readonly fideId: string;
  readonly title: string;
  readonly games: number;
  readonly firstYear: number;
  readonly lastYear: number;
  readonly peakRating: number;
  readonly lastRating: number;
}

export function encodePlayerLine(player: PackPlayer): string {
  return [
    player.key,
    player.id === player.key ? '' : player.id,
    clean(player.name),
    player.fideId,
    player.title,
    player.games,
    player.firstYear || '',
    player.lastYear || '',
    player.peakRating || '',
    player.lastRating || '',
  ].join('\t');
}

export function decodePlayerLine(line: string): PackPlayer | null {
  const parts = line.split('\t');
  if (parts.length < 10) return null;
  const key = parts[0] as string;
  return {
    key,
    id: (parts[1] as string) || key,
    name: parts[2] as string,
    fideId: parts[3] as string,
    title: parts[4] as string,
    games: Number(parts[5]) || 0,
    firstYear: Number(parts[6]) || 0,
    lastYear: Number(parts[7]) || 0,
    peakRating: Number(parts[8]) || 0,
    lastRating: Number(parts[9]) || 0,
  };
}

/* --------------------------------------------------------------- playergames */

export interface PackPlayerGames {
  readonly key: string;
  /** Game ids, most recent first, bounded by the build. */
  readonly games: readonly string[];
}

export const encodePlayerGamesLine = (entry: PackPlayerGames): string =>
  `${entry.key}|${entry.games.join(',')}`;

export function decodePlayerGamesLine(line: string): PackPlayerGames | null {
  const split = line.indexOf('|');
  if (split < 1) return null;
  const games = line.slice(split + 1);
  return { key: line.slice(0, split), games: games.length > 0 ? games.split(',') : [] };
}
