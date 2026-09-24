/**
 * Writing a new ChessBase database from Kingfisher games.
 *
 * AGENTS.md forbids writing to another program's database, and nothing here
 * does: this makes a *new* set of files — `.cbh`, `.cbg`, `.cba`, `.cbp`,
 * `.cbt`, `.cbc`, `.cbs` — for a person who hands their work to a ChessBase
 * user. Every layout is the one the reader in this directory reads, checked
 * against databases ChessBase itself wrote (`write.test.ts` reproduces the
 * movetext of the `world-ch` and `mate2` fixtures byte for byte, and reads
 * every file written here back through the reader).
 *
 * What ChessBase keeps that Kingfisher cannot fill is left at zero and said
 * so: the header's annotation-summary flags, a tournament's type and nation,
 * the text language. What Kingfisher holds that ChessBase cannot is counted in
 * the report rather than dropped silently: blue squares and arrows, a fourth
 * symbol on one move, a name longer than its field.
 */

import type { GameTree } from '@/chess/tree/types';

import { encodeAnnotations, encodeMoves, toWindows1252, type AnnotationLosses } from './encode';
import { HEADER_RECORD_BYTES } from './headers';

export type ChessBaseExtension = 'cbh' | 'cbg' | 'cba' | 'cbp' | 'cbt' | 'cbc' | 'cbs';

export interface ChessBaseWriteReport {
  readonly written: number;
  readonly refused: readonly { readonly index: number; readonly reason: string }[];
  readonly blueShapes: number;
  readonly extraSymbols: number;
  /** Names and titles cut to the width of their ChessBase field. */
  readonly truncated: number;
  /** Characters Windows-1252 cannot hold, written as "?" in names. */
  readonly replacedCharacters: number;
}

export interface ChessBaseWrite {
  readonly files: ReadonlyMap<ChessBaseExtension, Uint8Array>;
  readonly report: ChessBaseWriteReport;
}

// --- Bytes --------------------------------------------------------------------

class Bytes {
  private buffer = new Uint8Array(1024);
  length = 0;

  private reserve(extra: number): void {
    if (this.length + extra <= this.buffer.length) return;
    let size = this.buffer.length * 2;
    while (size < this.length + extra) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.buffer.subarray(0, this.length));
    this.buffer = grown;
  }

  append(bytes: Uint8Array | readonly number[]): void {
    this.reserve(bytes.length);
    this.buffer.set(bytes, this.length);
    this.length += bytes.length;
  }

  done(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }
}

const putU16be = (out: Uint8Array, at: number, value: number) => {
  out[at] = (value >> 8) & 255;
  out[at + 1] = value & 255;
};
const putU24be = (out: Uint8Array, at: number, value: number) => {
  out[at] = (value >> 16) & 255;
  out[at + 1] = (value >> 8) & 255;
  out[at + 2] = value & 255;
};
const putU32be = (out: Uint8Array, at: number, value: number) => {
  out[at] = (value >>> 24) & 255;
  out[at + 1] = (value >> 16) & 255;
  out[at + 2] = (value >> 8) & 255;
  out[at + 3] = value & 255;
};
const putI32le = (out: Uint8Array, at: number, value: number) => {
  out[at] = value & 255;
  out[at + 1] = (value >> 8) & 255;
  out[at + 2] = (value >> 16) & 255;
  out[at + 3] = (value >>> 24) & 255;
};

/** A ChessBase date: day in bits 0–4, month in 5–8, year in 9–20; 0 where unknown. */
export function chessBaseDate(pgnDate: string | undefined): number {
  const [year, month, day] = (pgnDate ?? '').split('.');
  const number = (value: string | undefined, max: number) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= max ? parsed : 0;
  };
  return (number(year, 4095) << 9) | (number(month, 12) << 5) | number(day, 31);
}

/** `0` is unset, `1` is A00 … `500` is E99, in the top nine bits of a u16. */
export function chessBaseEco(eco: string | undefined): number {
  const match = /^([A-E])(\d\d)$/.exec((eco ?? '').trim().toUpperCase());
  if (!match) return 0;
  const index = (match[1]!.charCodeAt(0) - 65) * 100 + Number(match[2]);
  return (index + 1) << 7;
}

const RESULT_CODES: Readonly<Record<string, number>> = { '1-0': 2, '0-1': 0, '1/2-1/2': 1 };

// --- Entities -----------------------------------------------------------------

interface Counters {
  truncated: number;
  replacedCharacters: number;
}

/** A fixed-width Windows-1252 field, zero-padded, cut to `width` and counted when it is. */
function field(value: string, width: number, counters: Counters): Uint8Array {
  const out = new Uint8Array(width);
  let bytes = toWindows1252(value);
  if (!bytes) {
    const cleaned = [...value]
      .map((char) => {
        if (toWindows1252(char)) return char;
        counters.replacedCharacters += 1;
        return '?';
      })
      .join('');
    bytes = toWindows1252(cleaned)!;
  }
  // One byte is kept for the terminator the reader stops at.
  if (bytes.length > width - 1) counters.truncated += 1;
  out.set(bytes.subarray(0, width - 1));
  return out;
}

const TREE_BYTES = 9;
const MAGIC = [0xd2, 0x02, 0x96, 0x49];

interface Entity {
  /** The record's bytes, without the nine bytes of tree bookkeeping. */
  readonly record: Uint8Array;
  /** Compared bytewise to order the search tree, as ChessBase orders it. */
  readonly key: Uint8Array;
  /** For tournaments: newer first, before the key. */
  readonly year?: number;
  games: number;
  readonly gamesAt: number;
}

class EntityTable {
  readonly entities: Entity[] = [];
  private readonly byKey = new Map<string, number>();

  constructor(readonly recordSize: number) {}

  /** The id of the entity with this key, adding it on first sight. */
  id(key: string, build: () => Omit<Entity, 'games'>): number {
    const known = this.byKey.get(key);
    if (known !== undefined) {
      this.entities[known]!.games += 1;
      return known;
    }
    const id = this.entities.length;
    this.entities.push({ ...build(), games: 1 });
    this.byKey.set(key, id);
    return id;
  }

  /**
   * The file: a header, then every record behind its AVL bookkeeping — left
   * child, right child, balance (right height less left, as ChessBase writes
   * it). The tree is built balanced over the sorted records; ids stay in the
   * order the entities were first met.
   */
  bytes(): Uint8Array {
    const count = this.entities.length;
    const order = this.entities
      .map((_, id) => id)
      .sort((a, b) => compareEntities(this.entities[a]!, this.entities[b]!));
    const left = new Int32Array(count).fill(-1);
    const right = new Int32Array(count).fill(-1);
    const balance = new Int8Array(count);
    const build = (lo: number, hi: number): { id: number; height: number } => {
      if (lo > hi) return { id: -1, height: 0 };
      const mid = (lo + hi) >> 1;
      const id = order[mid]!;
      const l = build(lo, mid - 1);
      const r = build(mid + 1, hi);
      left[id] = l.id;
      right[id] = r.id;
      balance[id] = r.height - l.height;
      return { id, height: 1 + Math.max(l.height, r.height) };
    };
    const root = build(0, count - 1).id;
    const EXTRA = 4;
    const header = 28 + EXTRA;
    const stride = TREE_BYTES + this.recordSize;
    const out = new Uint8Array(header + count * stride);
    putI32le(out, 0, count);
    putI32le(out, 4, root);
    out.set(MAGIC, 8);
    putI32le(out, 12, this.recordSize);
    putI32le(out, 16, -1);
    putI32le(out, 20, count);
    putI32le(out, 24, EXTRA);
    for (let id = 0; id < count; id += 1) {
      const at = header + id * stride;
      const entity = this.entities[id]!;
      putI32le(out, at, left[id]!);
      putI32le(out, at + 4, right[id]!);
      out[at + 8] = balance[id]! & 255;
      const record = entity.record.slice();
      putI32le(record, entity.gamesAt, entity.games);
      out.set(record, at + TREE_BYTES);
    }
    return out;
  }
}

function compareEntities(a: Entity, b: Entity): number {
  if (a.year !== undefined && b.year !== undefined && a.year !== b.year) return b.year - a.year;
  const length = Math.min(a.key.length, b.key.length);
  for (let i = 0; i < length; i += 1) if (a.key[i] !== b.key[i]) return a.key[i]! - b.key[i]!;
  return a.key.length - b.key.length;
}

// --- The database -----------------------------------------------------------

function splitName(name: string): { last: string; first: string } {
  const trimmed = name.trim();
  if (!trimmed || trimmed === '?') return { last: '', first: '' };
  const comma = trimmed.indexOf(',');
  if (comma === -1) return { last: trimmed, first: '' };
  return { last: trimmed.slice(0, comma).trim(), first: trimmed.slice(comma + 1).trim() };
}

function roundOf(value: string | undefined): { round: number; subround: number } {
  const match = /^(\d+)(?:\.(\d+))?$/.exec((value ?? '').trim());
  if (!match) return { round: 0, subround: 0 };
  return {
    round: Math.min(255, Number(match[1])),
    subround: Math.min(255, Number(match[2] ?? 0)),
  };
}

const elo = (value: string | undefined): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : 0;
};

/** Write `games` as a new ChessBase database. Nothing existing is read or changed. */
export function writeChessBase(games: readonly GameTree[]): ChessBaseWrite {
  const counters: Counters = { truncated: 0, replacedCharacters: 0 };
  const losses: AnnotationLosses = { blueShapes: 0, extraSymbols: 0 };
  const players = new EntityTable(58);
  const tournaments = new EntityTable(90);
  const annotators = new EntityTable(53);
  const sources = new EntityTable(59);

  const player = (name: string | undefined): number => {
    const { last, first } = splitName(name ?? '');
    const lastBytes = field(last, 30, counters);
    const firstBytes = field(first, 20, counters);
    const key = new Uint8Array(50);
    key.set(lastBytes, 0);
    key.set(firstBytes, 30);
    return players.id(`${last}\u0000${first}`, () => {
      const record = new Uint8Array(58);
      record.set(key, 0);
      return { record, key, gamesAt: 50 };
    });
  };
  const tournament = (headers: Readonly<Record<string, string>>): number => {
    const title = headers.Event && headers.Event !== '?' ? headers.Event : '';
    const place = headers.Site && headers.Site !== '?' ? headers.Site : '';
    const dated = chessBaseDate(headers.EventDate ?? headers.Date);
    const year = (dated >> 9) & 4095;
    return tournaments.id(`${title}\u0000${place}\u0000${year}`, () => {
      const record = new Uint8Array(90);
      const titleBytes = field(title, 40, counters);
      record.set(titleBytes, 0);
      record.set(field(place, 30, counters), 40);
      putI32le(record, 70, dated);
      return { record, key: titleBytes, year, gamesAt: 82 };
    });
  };
  const annotator = (name: string | undefined): number => {
    const value = name && name !== '?' ? name : '';
    return annotators.id(value, () => {
      const record = new Uint8Array(53);
      const key = field(value, 45, counters);
      record.set(key, 0);
      return { record, key, gamesAt: 45 };
    });
  };
  const source = (name: string | undefined): number => {
    const value = name && name !== '?' ? name : '';
    return sources.id(value, () => {
      const record = new Uint8Array(59);
      const key = field(value, 25, counters);
      record.set(key, 0);
      return { record, key, gamesAt: 51 };
    });
  };

  const HEADER_26 = 26;
  const cbg = new Bytes();
  const cba = new Bytes();
  cbg.append(new Uint8Array(HEADER_26));
  cba.append(new Uint8Array(HEADER_26));
  const records: Uint8Array[] = [];
  const refused: { index: number; reason: string }[] = [];

  games.forEach((tree, index) => {
    let moves;
    try {
      moves = encodeMoves(tree);
    } catch (error) {
      refused.push({ index, reason: error instanceof Error ? error.message : String(error) });
      return;
    }
    const gameId = records.length + 1;
    const annotations = encodeAnnotations(tree, moves.index, gameId, losses);
    const headers = tree.headers;
    const record = new Uint8Array(HEADER_RECORD_BYTES);
    record[0] = 0x01;
    putU32be(record, 1, cbg.length);
    putU32be(record, 5, annotations ? cba.length : 0);
    putU24be(record, 9, player(headers.White));
    putU24be(record, 12, player(headers.Black));
    putU24be(record, 15, tournament(headers));
    putU24be(record, 18, annotator(headers.Annotator));
    putU24be(record, 21, source(headers.Source));
    putU24be(record, 24, chessBaseDate(headers.Date));
    record[27] = RESULT_CODES[headers.Result ?? '*'] ?? 3;
    const { round, subround } = roundOf(headers.Round);
    record[29] = round;
    record[30] = subround;
    putU16be(record, 31, elo(headers.WhiteElo));
    putU16be(record, 33, elo(headers.BlackElo));
    putU16be(record, 35, chessBaseEco(headers.ECO));
    record[45] = moves.mainLineMoves;
    cbg.append(moves.bytes);
    if (annotations) cba.append(annotations);
    records.push(record);
  });

  const count = records.length;
  const cbh = new Uint8Array(HEADER_RECORD_BYTES * (count + 1));
  // The file header of the `world-ch` fixture: version, record size, and the
  // record count (games + 1) in both places ChessBase keeps it.
  cbh.set([0x00, 0x00, 0x2c, 0x00, 0x2e, 0x01], 0);
  putU32be(cbh, 6, count + 1);
  putU32be(cbh, 42, count + 1);
  records.forEach((record, index) => cbh.set(record, HEADER_RECORD_BYTES * (index + 1)));

  const finish = (bytes: Bytes): Uint8Array => {
    const out = bytes.done();
    out[1] = HEADER_26;
    putU32be(out, 2, out.length);
    putU32be(out, 14, out.length);
    return out;
  };

  const files = new Map<ChessBaseExtension, Uint8Array>([
    ['cbh', cbh],
    ['cbg', finish(cbg)],
    ['cba', finish(cba)],
    ['cbp', players.bytes()],
    ['cbt', tournaments.bytes()],
    ['cbc', annotators.bytes()],
    ['cbs', sources.bytes()],
  ]);
  return {
    files,
    report: {
      written: count,
      refused,
      blueShapes: losses.blueShapes,
      extraSymbols: losses.extraSymbols,
      truncated: counters.truncated,
      replacedCharacters: counters.replacedCharacters,
    },
  };
}
