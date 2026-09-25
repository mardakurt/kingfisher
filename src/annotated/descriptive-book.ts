/**
 * An annotated book of games, as a public-domain e-text prints it, turned into
 * PGN with the author's notes kept word for word (Phase 85: the first
 * public-domain annotated set).
 *
 * The layout this reads is the one Project Gutenberg's transcription of
 * Capablanca's *Chess Fundamentals* (1921) uses, and the parser is strict
 * about it rather than clever: a game opens with `GAME n. HEADING`, then the
 * event line in brackets and `White: … Black: …`; move rows are indented,
 * numbered, with Black's move in a second column (`7. ........  Kt x Kt` when
 * a note split the move); prose between rows is a note on the last move
 * played; a row of asterisks ends the game. `{160}` page numbers and
 * `[Illustration]` markers are the e-text's, not the author's, and are dropped.
 *
 * Every move is resolved by `transcribeDescriptive`, which accepts a move only
 * when exactly one legal move fits the printed text. A game in which any move
 * does not resolve is refused whole, with the move and the reason — never
 * repaired by guessing. The result is what the book states: `Resigns.` in a
 * column or on its own line, or the author's own sentence that a side
 * resigned after the printed moves; otherwise `*`.
 */

import { transcribeDescriptive } from '@/chess/descriptive';

export interface BookSource {
  /** Title as the book's title page prints it. */
  readonly title: string;
  readonly author: string;
  readonly year: number;
  /** Where the e-text came from, for the `Source` tag. */
  readonly edition: string;
}

export interface BookGame {
  readonly number: number;
  readonly heading: string;
  readonly white: string;
  readonly black: string;
  readonly event: string;
  readonly year: number | null;
  readonly result: '1-0' | '0-1' | '1/2-1/2' | '*';
  readonly moves: readonly string[];
  readonly pgn: string;
}

export interface RefusedGame {
  readonly number: number;
  readonly heading: string;
  readonly reason: string;
}

export interface BookTranscription {
  readonly games: readonly BookGame[];
  readonly refused: readonly RefusedGame[];
}

const MOVE_ROW = /^ {3,}(\d+)\.?\s+(.*)$/;
const GAME_HEAD = /^GAME (\d+)\.\s+(.+?)\s*$/;
const SEPARATOR = /^\s*\*(\s+\*){2,}\s*$/;
const SPLIT_MOVE = /^\.{3,}$/;

/** `F. J. Marshall` → `Marshall, F. J.`; `Dr. E. Lasker` → `Lasker, E.` */
export function pgnName(printed: string): string {
  const words = printed
    .replace(/^Dr\.\s+/, '')
    .replace(/\.$/, '')
    .trim()
    .split(/\s+/);
  if (words.length < 2) return words.join(' ');
  const surname = words[words.length - 1]!;
  const given = words.slice(0, -1).join(' ');
  return `${surname}, ${given.endsWith('.') ? given : `${given}.`}`.replace(/\.\.$/, '.');
}

const MOVER = /^(P|Kt|B|R|Q|K|O)$/;
const SEPARATOR_TOKEN = /^[-x]$/i;

/**
 * A move row's columns. They are normally apart by two spaces or more; where
 * the e-text closed that gap (`K - Kt 1 P - Kt 5`), the row is split at the
 * one place that leaves a whole move on each side, or not at all.
 */
function twoColumns(text: string): string[] {
  const columns = text.split(/\s{2,}/);
  if (columns.length > 1) return columns;
  const tokens = text.split(/\s+/);
  if (tokens.every((token) => /^[O0-]$/.test(token))) return columns;
  const splits: string[][] = [];
  for (let at = 2; at < tokens.length - 1; at += 1) {
    const left = tokens.slice(0, at);
    const right = tokens.slice(at);
    // A whole move: one separator; a move to a square ends on its rank, a
    // capture on what it takes.
    const whole = (words: string[]) => {
      const at = words.findIndex((word) => SEPARATOR_TOKEN.test(word));
      if (at < 1 || words.filter((word) => SEPARATOR_TOKEN.test(word)).length !== 1) return false;
      const last = words.filter((word) => !/^(ch|!|\?)$/.test(word)).at(-1)!;
      return words[at] === '-' ? /^\d$/.test(last) : /^(P|Kt|B|R|Q|K|\d)$/.test(last);
    };
    if (MOVER.test(left[0]!) && MOVER.test(right[0]!) && whole(left) && whole(right)) {
      splits.push([left.join(' '), right.join(' ')]);
    }
  }
  return splits.length === 1 ? splits[0]! : columns;
}

/** The e-text's own apparatus, not the author's words. */
const cleanProse = (text: string): string =>
  text
    .replace(/\{\d+\}/g, ' ')
    .replace(/\[Illustration\]/g, ' ')
    .replace(/\[\d+\]/g, '')
    // `_McCutcheon Variation_`: the e-text's italics.
    .replace(/_([^_]+)_/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const titleCase = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase())
    .replace(/'S\b/g, "'s");

const escapeTag = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

interface Ply {
  readonly text: string;
  note: string[];
}

function parseGame(
  number: number,
  heading: string,
  lines: readonly string[],
): {
  game?: Omit<BookGame, 'pgn' | 'moves'> & { plies: Ply[]; intro: string[]; closing: string[] };
  reason?: string;
} {
  let event = '';
  let year: number | null = null;
  let white = '';
  let black = '';
  const plies: Ply[] = [];
  const intro: string[] = [];
  let result: BookGame['result'] = '*';
  let paragraph: string[] = [];
  let paragraphs: string[] = [];
  /** Prose after the last row: kept, and read for a stated resignation. */
  let closing: string[] = [];

  const flush = () => {
    if (paragraph.length) paragraphs.push(cleanProse(paragraph.join(' ')));
    paragraph = [];
  };
  const attach = () => {
    flush();
    const text = paragraphs.filter(Boolean);
    if (text.length) {
      if (plies.length) plies[plies.length - 1]!.note.push(...text);
      else intro.push(...text);
    }
    paragraphs = [];
  };

  for (const printed of lines) {
    // `{207} /*    35. K - Kt 1 P - Kt 5 */`: a page number and a stray
    // preformatting marker around a move row, in the e-text only.
    const line = printed
      .replace(/^\{\d+\}\s*(?=\/\*)/, '')
      .replace(/^\/\*/, '  ')
      .replace(/\s*\*\/\s*$/, '');
    const eventLine = /^\((.+?),?\s+(\d{4})\)\s*$/.exec(line.trim());
    if (!event && eventLine) {
      event = eventLine[1]!.replace(/,$/, '').trim();
      year = Number(eventLine[2]);
      continue;
    }
    const players = /^White:\s*(.+?)\.?\s+Black:\s*(.+?)\.?\s*$/.exec(line.trim());
    if (!white && players) {
      white = players[1]!;
      black = players[2]!;
      continue;
    }
    const row = MOVE_ROW.exec(line);
    if (row) {
      attach();
      const columns = twoColumns(row[2]!.trim());
      const [first = '', second] = columns;
      if (/^Resigns\.?$/i.test(first)) {
        result = plies.length % 2 === 0 ? '0-1' : '1-0';
        continue;
      }
      if (!SPLIT_MOVE.test(first)) plies.push({ text: first, note: [] });
      if (second !== undefined) {
        if (/^Resigns\.?$/i.test(second.trim())) result = '1-0';
        else plies.push({ text: second.trim(), note: [] });
      }
      closing = [];
      continue;
    }
    if (/^\s+Resigns\.?\s*$/i.test(line)) {
      attach();
      // On its own line under a full row: the side to move resigned.
      result = plies.length % 2 === 0 ? '0-1' : '1-0';
      continue;
    }
    if (line.trim() === '') {
      flush();
      continue;
    }
    if (/^\s*\{\d+\}\s*$/.test(line) || /^\s*\[Illustration\]\s*$/.test(line)) continue;
    paragraph.push(line.trim());
    if (plies.length) closing.push(line.trim());
  }
  attach();

  if (!white || !black) return { reason: 'the players line was not found' };
  if (plies.length === 0) return { reason: 'no moves were found' };
  if (result === '*') {
    // The author's own sentence, when the printed moves stop before the end.
    const said = cleanProse(closing.join(' '));
    if (/\bBlack resigned\b/.test(said)) result = '1-0';
    else if (/\bWhite resigned\b/.test(said)) result = '0-1';
  }
  return {
    game: { number, heading, white, black, event, year, result, plies, intro, closing },
  };
}

/** Read every game of the book; each either transcribes whole or is refused with its reason. */
export function transcribeBook(text: string, source: BookSource): BookTranscription {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const games: BookGame[] = [];
  const refused: RefusedGame[] = [];

  let index = 0;
  while (index < lines.length) {
    const head = GAME_HEAD.exec(lines[index]!);
    if (!head) {
      index += 1;
      continue;
    }
    const number = Number(head[1]);
    const heading = titleCase(head[2]!);
    const body: string[] = [];
    index += 1;
    while (
      index < lines.length &&
      !SEPARATOR.test(lines[index]!) &&
      !GAME_HEAD.test(lines[index]!)
    ) {
      body.push(lines[index]!);
      index += 1;
    }
    const parsed = parseGame(number, heading, body);
    if (!parsed.game) {
      refused.push({ number, heading, reason: parsed.reason ?? 'unreadable' });
      continue;
    }
    const game = parsed.game;
    const transcribed = transcribeDescriptive(game.plies.map((ply) => ply.text));
    if (!transcribed.ok) {
      const { index: at, text: move, message } = transcribed.error;
      const moveNumber = Math.floor(at / 2) + 1;
      refused.push({
        number,
        heading,
        reason: `move ${moveNumber}${at % 2 ? '…' : '.'} "${move}": ${message}`,
      });
      continue;
    }

    const tags: [string, string][] = [
      ['Event', game.event || '?'],
      ['Site', '?'],
      ['Date', game.year ? `${game.year}.??.??` : '????.??.??'],
      ['Round', '?'],
      ['White', pgnName(game.white)],
      ['Black', pgnName(game.black)],
      ['Result', game.result],
      ['Annotator', source.author],
      ['Source', `${source.title} (${source.year}), Game ${number}; ${source.edition}`],
      ['SourceTitle', source.title],
      ['SourceDate', `${source.year}.??.??`],
      ['SourceHeading', game.heading],
      [
        'Transcription',
        'Descriptive notation resolved move by move; the notes are the author’s words',
      ],
    ];
    const out: string[] = tags.map(([name, value]) => `[${name} "${escapeTag(value)}"]`);
    out.push('');
    const movetext: string[] = [];
    if (game.intro.length) movetext.push(`{${game.intro.join(' ')}}`);
    transcribed.value.forEach((entry, ply) => {
      if (ply % 2 === 0) movetext.push(`${ply / 2 + 1}.`);
      else if (ply === 0 || game.plies[ply - 1]!.note.length)
        movetext.push(`${Math.floor(ply / 2) + 1}...`);
      movetext.push(entry.move.san);
      const note = game.plies[ply]!.note;
      if (note.length) movetext.push(`{${note.join(' ')}}`);
    });
    movetext.push(game.result);
    out.push(wrap(movetext.join(' ')));
    games.push({
      number,
      heading: game.heading,
      white: game.white,
      black: game.black,
      event: game.event,
      year: game.year,
      result: game.result,
      moves: transcribed.value.map((entry) => entry.move.san),
      pgn: `${out.join('\n')}\n`,
    });
  }
  return { games, refused };
}

/** PGN's 80-column movetext lines. */
function wrap(text: string): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + 1 + word.length > 79) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.join('\n');
}
