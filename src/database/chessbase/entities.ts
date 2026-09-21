/**
 * The entity files: players (.cbp), tournaments (.cbt), annotators (.cbc),
 * sources (.cbs) and teams (.cbe).
 *
 * Each is one header and then fixed-size records, every record prefixed by
 * nine bytes of AVL-tree bookkeeping (left child, right child, balance) that
 * ChessBase uses to search by name. Kingfisher reads the records by id — a
 * game refers to entity *ids* — and ignores the tree. A record whose left
 * child is -999 has been deleted and is kept only so ids stay stable.
 *
 * Layouts from the format description that ships with `morphy`; checked
 * against a database ChessBase itself wrote (see `database.test.ts`).
 */

import { fixedString, formatChessBaseDate, i32le, u16le, u32le, u8 } from './bytes';
import type {
  ChessBaseNamed,
  ChessBasePlayer,
  ChessBaseSource,
  ChessBaseTeam,
  ChessBaseTournament,
} from './types';

const TREE_BYTES = 9;
const DELETED_LEFT = -999;

interface EntityTable<T> {
  readonly records: readonly (T | null)[];
  readonly count: number;
}

function readTable<T>(
  bytes: Uint8Array | undefined,
  expectedRecordSize: number,
  read: (record: Uint8Array) => T,
): EntityTable<T> {
  if (!bytes || bytes.length < 28) return { records: [], count: 0 };
  const capacity = i32le(bytes, 0);
  const recordSize = i32le(bytes, 12);
  const count = i32le(bytes, 20);
  const extra = i32le(bytes, 24);
  const headerSize = 28 + Math.max(0, extra);
  if (recordSize !== expectedRecordSize || capacity < 0) return { records: [], count: 0 };
  const stride = TREE_BYTES + recordSize;
  const records: (T | null)[] = [];
  for (let id = 0; id < capacity; id += 1) {
    const start = headerSize + id * stride;
    if (start + stride > bytes.length) break;
    const deleted = i32le(bytes, start) === DELETED_LEFT;
    records.push(deleted ? null : read(bytes.subarray(start + TREE_BYTES, start + stride)));
  }
  return { records, count: Math.max(0, count) };
}

export const readPlayers = (bytes: Uint8Array | undefined): EntityTable<ChessBasePlayer> =>
  readTable(bytes, 58, (record) => ({
    lastName: fixedString(record, 0, 30),
    firstName: fixedString(record, 30, 20),
    games: u32le(record, 50),
  }));

export const readTournaments = (bytes: Uint8Array | undefined): EntityTable<ChessBaseTournament> =>
  readTable(bytes, 90, (record) => ({
    title: fixedString(record, 0, 40),
    place: fixedString(record, 40, 30),
    date: formatChessBaseDate(u32le(record, 70)),
    nation: u8(record, 76),
    rounds: u8(record, 80),
    games: u32le(record, 82),
  }));

export const readAnnotators = (bytes: Uint8Array | undefined): EntityTable<ChessBaseNamed> =>
  readTable(bytes, 53, (record) => ({
    name: fixedString(record, 0, 45),
    games: u32le(record, 45),
  }));

export const readSources = (bytes: Uint8Array | undefined): EntityTable<ChessBaseSource> =>
  readTable(bytes, 59, (record) => ({
    name: fixedString(record, 0, 25),
    publisher: fixedString(record, 25, 16),
    date: formatChessBaseDate(u32le(record, 41)),
    games: u32le(record, 51),
  }));

export const readTeams = (bytes: Uint8Array | undefined): EntityTable<ChessBaseTeam> =>
  readTable(bytes, 63, (record) => ({
    name: fixedString(record, 0, 45),
    year: u16le(record, 48),
    nation: u8(record, 50),
    games: u32le(record, 51),
  }));

/** `Carlsen, Magnus` — the PGN convention, which is also how ChessBase shows a player. */
export function playerName(player: ChessBasePlayer | null | undefined): string {
  if (!player) return '';
  if (!player.firstName) return player.lastName;
  if (!player.lastName) return player.firstName;
  return `${player.lastName}, ${player.firstName}`;
}
