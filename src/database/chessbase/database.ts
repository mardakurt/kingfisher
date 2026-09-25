/**
 * A ChessBase database as one object: the files it is made of, what it says
 * about itself, and each game rendered as PGN for Kingfisher's own parser.
 *
 * PGN is the bridge, as it is for En Croissant, because everything past this
 * point — validation, fingerprinting, position indexing, classification — is
 * built on the tree the PGN parser produces, and a second path into the store
 * would be a second place for a game to go wrong. The bridge is in memory
 * and bounded to one game; nothing is written to disk.
 *
 * Provenance travels with every game: the database's own source record
 * (.cbs) becomes the `Source` tag, its annotator (.cbc) the `Annotator` tag,
 * and `ChessBaseFile` names the file the game was read from, so a game found
 * later in a search still says where it came from.
 */

import { decodeAnnotations, type NodeAnnotations } from './annotations';
import { u24be, u32be, u32le } from './bytes';
import {
  playerName,
  readAnnotators,
  readPlayers,
  readSources,
  readTeams,
  readTournaments,
} from './entities';
import { HEADER_RECORD_BYTES, parseHeaderRecord } from './headers';
import { decodeMoves, type MoveNode } from './moves';
import {
  sourceOf,
  type ByteSource,
  type ChessBaseFiles,
  type ChessBaseHeader,
  type ChessBaseInspection,
} from './types';

export const REQUIRED_FILES = ['cbh', 'cbg'] as const;
export const KNOWN_FILES = ['cbh', 'cbg', 'cba', 'cbp', 'cbt', 'cbc', 'cbs', 'cbe', 'cbj'] as const;

export interface ChessBaseGame {
  readonly id: number;
  readonly header: ChessBaseHeader;
  readonly pgn: string;
  /** Things the file held that the PGN does not: counted, never silently dropped. */
  readonly issues: readonly string[];
}

export interface ChessBaseGameFailure {
  readonly id: number;
  readonly header: ChessBaseHeader | null;
  readonly reason: string;
}

export type ChessBaseGameResult = ChessBaseGame | ChessBaseGameFailure;

export const isGame = (result: ChessBaseGameResult): result is ChessBaseGame => 'pgn' in result;

/** The base name shared by a set of ChessBase files, or null when they disagree. */
export function databaseName(fileNames: readonly string[]): string | null {
  const bases = new Set(
    fileNames
      .map((name) => name.replace(/^.*[\\/]/, ''))
      .filter((name) => /\.(cbh|cbg|cba|cbp|cbt|cbc|cbs|cbe|cbj)$/i.test(name))
      .map((name) => name.replace(/\.[^.]+$/, '')),
  );
  return bases.size === 1 ? [...bases][0]! : null;
}

export class ChessBaseDatabase {
  private readonly cbh: ByteSource;
  private readonly cbg: ByteSource;
  private readonly cba: ByteSource | undefined;
  private readonly cbj: ByteSource | undefined;
  private readonly players;
  private readonly tournaments;
  private readonly annotators;
  private readonly sources;
  private readonly teams;

  constructor(
    readonly name: string,
    private readonly files: ChessBaseFiles,
  ) {
    const cbh = files.get('cbh');
    const cbg = files.get('cbg');
    if (!cbh || !cbg)
      throw new Error('A ChessBase database needs at least its .cbh and .cbg files.');
    this.cbh = sourceOf(cbh);
    this.cbg = sourceOf(cbg);
    const optional = (extension: string) => {
      const file = files.get(extension);
      return file ? sourceOf(file) : undefined;
    };
    this.cba = optional('cba');
    this.cbj = optional('cbj');
    // The entity files are small beside the games (Mega's players are tens of megabytes): read whole.
    const whole = (extension: string) => {
      const file = optional(extension);
      return file ? file.read(0, file.size) : undefined;
    };
    this.players = readPlayers(whole('cbp'));
    this.tournaments = readTournaments(whole('cbt'));
    this.annotators = readAnnotators(whole('cbc'));
    this.sources = readSources(whole('cbs'));
    this.teams = readTeams(whole('cbe'));
  }

  get count(): number {
    return Math.max(0, Math.floor(this.cbh.size / HEADER_RECORD_BYTES) - 1);
  }

  header(id: number): ChessBaseHeader | null {
    if (id < 1 || id > this.count) return null;
    return parseHeaderRecord(this.cbh.read(id * HEADER_RECORD_BYTES, HEADER_RECORD_BYTES), id);
  }

  /** Headers `from`…`to`, read in one piece. */
  headers(from: number, to: number): (ChessBaseHeader | null)[] {
    const first = Math.max(1, from);
    const last = Math.min(this.count, to);
    if (last < first) return [];
    const block = this.cbh.read(
      first * HEADER_RECORD_BYTES,
      (last - first + 1) * HEADER_RECORD_BYTES,
    );
    const out: (ChessBaseHeader | null)[] = [];
    for (let id = first; id <= last; id += 1) {
      const at = (id - first) * HEADER_RECORD_BYTES;
      out.push(parseHeaderRecord(block.subarray(at, at + HEADER_RECORD_BYTES), id));
    }
    return out;
  }

  inspect(): ChessBaseInspection {
    let games = 0;
    let texts = 0;
    let deleted = 0;
    let firstDate: string | null = null;
    let lastDate: string | null = null;
    const headers: (ChessBaseHeader | null)[] = [];
    for (let from = 1; from <= this.count; from += 20_000) {
      headers.push(...this.headers(from, from + 19_999));
    }
    for (const header of headers) {
      if (!header) continue;
      if (header.text) texts += 1;
      else if (header.deleted) deleted += 1;
      else {
        games += 1;
        if (header.date && !header.date.startsWith('????')) {
          if (!firstDate || header.date < firstDate) firstDate = header.date;
          if (!lastDate || header.date > lastDate) lastDate = header.date;
        }
      }
    }
    let sizeBytes = 0;
    for (const bytes of this.files.values()) sizeBytes += sourceOf(bytes).size;
    return {
      supported: true,
      name: this.name,
      games,
      texts,
      deleted,
      players: this.players.count,
      tournaments: this.tournaments.count,
      firstDate,
      lastDate,
      sources: this.sources.records.flatMap((source) => (source?.name ? [source.name] : [])),
      sizeBytes,
      files: [...this.files.keys()].sort(),
    };
  }

  /** Team ids for a game, from the extended header when the database has one. */
  private teamsOf(id: number): { white: string; black: string } {
    const none = { white: '', black: '' };
    if (!this.cbj || this.cbj.size < 32) return none;
    const recordSize = u32le(this.cbj.read(0, 8), 4);
    if (recordSize < 8) return none;
    const at = 32 + (id - 1) * recordSize;
    if (at + 8 > this.cbj.size) return none;
    const record = this.cbj.read(at, 8);
    const whiteId = u32le(record, 0) | 0;
    const blackId = u32le(record, 4) | 0;
    return {
      white: whiteId >= 0 ? (this.teams.records[whiteId]?.name ?? '') : '',
      black: blackId >= 0 ? (this.teams.records[blackId]?.name ?? '') : '',
    };
  }

  game(id: number): ChessBaseGameResult {
    const header = this.header(id);
    if (!header) return { id, header: null, reason: 'no such game' };
    if (header.text) return { id, header, reason: 'a guiding text, not a game' };
    if (header.chess960)
      return { id, header, reason: 'a Chess960 game, which Kingfisher does not play' };
    // The game's record alone: its four-byte head says how long it is.
    const head = this.cbg.read(header.movesOffset, 4);
    const moves =
      head.length < 4
        ? ({ ok: false, reason: 'movetext offset is outside the file' } as const)
        : decodeMoves(this.cbg.read(header.movesOffset, u24be(head, 1)), 0);
    if (!moves.ok) return { id, header, reason: moves.reason };
    const issues = [...moves.issues];
    const annotations = this.cba
      ? this.annotationsOf(header.annotationsOffset)
      : {
          byNode: new Map<number, NodeAnnotations>(),
          skipped: new Map<number, number>(),
          issues: [],
        };
    issues.push(...annotations.issues);
    for (const [type, n] of annotations.skipped)
      issues.push(`${n} annotation(s) of type 0x${type.toString(16)} have no place in a PGN`);

    const tournament = this.tournaments.records[header.tournamentId];
    const source = this.sources.records[header.sourceId];
    const annotator = this.annotators.records[header.annotatorId];
    const teams = this.teamsOf(id);
    const tags: [string, string][] = [
      ['Event', tournament?.title ?? ''],
      ['Site', tournament?.place ?? ''],
      ['Date', header.date ?? '????.??.??'],
      [
        'Round',
        header.round
          ? header.subround
            ? `${header.round}.${header.subround}`
            : String(header.round)
          : '?',
      ],
      ['White', playerName(this.players.records[header.whiteId]) || '?'],
      ['Black', playerName(this.players.records[header.blackId]) || '?'],
      ['Result', header.result],
    ];
    if (header.whiteElo) tags.push(['WhiteElo', String(header.whiteElo)]);
    if (header.blackElo) tags.push(['BlackElo', String(header.blackElo)]);
    if (header.eco) tags.push(['ECO', header.eco]);
    if (tournament?.date) tags.push(['EventDate', tournament.date]);
    if (annotator?.name) tags.push(['Annotator', annotator.name]);
    if (source?.name) tags.push(['Source', source.name]);
    if (teams.white) tags.push(['WhiteTeam', teams.white]);
    if (teams.black) tags.push(['BlackTeam', teams.black]);
    tags.push(['ChessBaseFile', `${this.name}.cbh`]);
    if (moves.setup) {
      tags.push(['SetUp', '1'], ['FEN', moves.setup]);
    }
    const braces = { count: 0 };
    const movetext = renderLine(moves.root, annotations.byNode, braces, true);
    if (braces.count) issues.push(`${braces.count} closing brace(s) in comments were replaced`);
    const truncated = { count: 0 };
    countNullLines(moves.root, truncated);
    if (truncated.count)
      issues.push(`${truncated.count} line(s) end at a null move the PGN cannot hold`);
    const gameComment = annotations.byNode.get(0);
    const opening = gameComment
      ? renderComments([...gameComment.textBefore, ...gameComment.textAfter], braces)
      : '';
    const pgn =
      tags.map(([key, value]) => `[${key} "${escapeTag(value)}"]`).join('\n') +
      '\n\n' +
      [opening, movetext, header.result].filter(Boolean).join(' ') +
      '\n';
    return { id, header, pgn, issues };
  }

  /** One game's annotation block, read at its offset (0 means none). */
  private annotationsOf(offset: number) {
    if (!this.cba || offset <= 0) return decodeAnnotations(new Uint8Array(0), 0);
    const head = this.cba.read(offset, 14);
    if (head.length < 14) return decodeAnnotations(new Uint8Array(0), 1);
    const size = u32be(head, 10);
    // The decoder takes a file and an offset; the block is placed at offset 1.
    const block = this.cba.read(offset, Math.max(14, Math.min(size, 16_000_000)));
    const padded = new Uint8Array(block.length + 1);
    padded.set(block, 1);
    return decodeAnnotations(padded, 1);
  }

  *games(from = 1, to = this.count): IterableIterator<ChessBaseGameResult> {
    for (let id = Math.max(1, from); id <= Math.min(to, this.count); id += 1) yield this.game(id);
  }
}

const escapeTag = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, ' ');

function renderComments(texts: readonly string[], braces: { count: number }): string {
  return texts
    .filter((text) => text.length > 0)
    .map((text) => {
      // PGN has no escape for the closing delimiter; the text is kept, the brace is not.
      const replaced = text.replace(/\}/g, ')');
      if (replaced !== text) braces.count += 1;
      return `{${replaced}}`;
    })
    .join(' ');
}

function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function afterMoveComment(note: NodeAnnotations | undefined, braces: { count: number }): string {
  if (!note) return '';
  const commands: string[] = [];
  if (note.squares.length) commands.push(`[%csl ${note.squares.join(',')}]`);
  if (note.arrows.length) commands.push(`[%cal ${note.arrows.join(',')}]`);
  if (note.clockSeconds !== undefined) commands.push(`[%clk ${formatClock(note.clockSeconds)}]`);
  if (note.elapsedSeconds !== undefined)
    commands.push(`[%emt ${formatClock(note.elapsedSeconds)}]`);
  const text = note.textAfter.map((t) => t.replace(/\}/g, ')')).join(' ');
  if (note.textAfter.some((t) => t.includes('}'))) braces.count += 1;
  const body = [commands.join(''), text].filter(Boolean).join(' ');
  return body ? `{${body}}` : '';
}

/**
 * One line of moves, with each alternative rendered in parentheses after the
 * move it replaces — the PGN convention, and the inverse of how the file
 * stores it (the alternatives follow the whole main continuation).
 */
function renderLine(
  start: MoveNode,
  notes: ReadonlyMap<number, NodeAnnotations>,
  braces: { count: number },
  lineStart: boolean,
): string {
  const parts: string[] = [];
  let node = start;
  let first = lineStart;
  while (node.children.length > 0) {
    const [main, ...alternatives] = node.children;
    if (!main || main.nullMove) break;
    parts.push(renderMove(main, notes, braces, first));
    for (const alternative of alternatives) {
      if (alternative.nullMove) continue;
      parts.push(
        `(${renderMove(alternative, notes, braces, true)} ${renderLine(alternative, notes, braces, false)})`.replace(
          / \)$/,
          ')',
        ),
      );
    }
    node = main;
    // After a variation or a comment the number is repeated, which every
    // reader accepts and some require.
    first = alternatives.length > 0 || notes.has(main.index);
  }
  return parts.join(' ');
}

function renderMove(
  node: MoveNode,
  notes: ReadonlyMap<number, NodeAnnotations>,
  braces: { count: number },
  numbered: boolean,
): string {
  const move = node.move!;
  const note = notes.get(node.index);
  const fields = node.before.split(' ');
  const white = fields[1] === 'w';
  const number = white ? `${fields[5]}.` : numbered ? `${fields[5]}...` : '';
  const before = note?.textBefore.length ? renderComments(note.textBefore, braces) + ' ' : '';
  const nags = note?.nags.map((nag) => ` $${nag}`).join('') ?? '';
  const after = afterMoveComment(note, braces);
  return `${before}${number}${number ? ' ' : ''}${move.san}${nags}${after ? ' ' + after : ''}`;
}

function countNullLines(node: MoveNode, out: { count: number }): void {
  for (const child of node.children) {
    if (child.nullMove) out.count += 1;
    else countNullLines(child, out);
  }
}
