/**
 * UCI protocol parsing.
 *
 * Pure text in, structured data out. Keeping this free of any engine plumbing
 * means the protocol can be tested exhaustively without spawning a process, and
 * that a second engine speaking UCI needs no new parsing code.
 */

import { cp, mate, type Score } from '@/chess/evaluation';
import { asUci, type Uci } from '@/chess/types';
import type { EngineOptionSpec, EngineOptionType } from './types';

export interface UciInfo {
  readonly depth?: number;
  readonly seldepth?: number;
  readonly multipv?: number;
  /** From the side to move, exactly as the engine reports it. */
  readonly score?: Score;
  readonly bound?: 'lower' | 'upper';
  readonly nodes?: number;
  readonly nps?: number;
  readonly timeMs?: number;
  readonly hashFull?: number;
  readonly tbHits?: number;
  readonly pv?: readonly Uci[];
  readonly currMove?: Uci;
  readonly currMoveNumber?: number;
  readonly text?: string;
}

export type UciMessage =
  | { readonly kind: 'id'; readonly name?: string; readonly author?: string }
  | { readonly kind: 'uciok' }
  | { readonly kind: 'readyok' }
  | { readonly kind: 'option'; readonly spec: EngineOptionSpec }
  | { readonly kind: 'info'; readonly info: UciInfo }
  | { readonly kind: 'bestmove'; readonly best: Uci | null; readonly ponder?: Uci }
  | { readonly kind: 'other'; readonly text: string };

export function parseUciLine(line: string): UciMessage {
  const text = line.trim();
  if (text === '') return { kind: 'other', text };
  if (text === 'uciok') return { kind: 'uciok' };
  if (text === 'readyok') return { kind: 'readyok' };
  if (text.startsWith('id ')) return parseId(text);
  if (text.startsWith('option ')) {
    const spec = parseOption(text);
    return spec ? { kind: 'option', spec } : { kind: 'other', text };
  }
  if (text.startsWith('bestmove')) return parseBestMove(text);
  if (text.startsWith('info ')) return { kind: 'info', info: parseInfo(text.slice(5)) };
  return { kind: 'other', text };
}

function parseId(text: string): UciMessage {
  const name = /^id name (.+)$/.exec(text);
  if (name) return { kind: 'id', name: (name[1] as string).trim() };
  const author = /^id author (.+)$/.exec(text);
  if (author) return { kind: 'id', author: (author[1] as string).trim() };
  return { kind: 'other', text };
}

function parseBestMove(text: string): UciMessage {
  const parts = text.split(/\s+/);
  const best = parts[1];
  if (!best || best === '(none)' || best === 'none') return { kind: 'bestmove', best: null };
  const ponderIndex = parts.indexOf('ponder');
  const ponder = ponderIndex >= 0 ? parts[ponderIndex + 1] : undefined;
  return {
    kind: 'bestmove',
    best: asUci(best),
    ...(ponder ? { ponder: asUci(ponder) } : {}),
  };
}

/**
 * `info` is a flat sequence of keyword/value groups whose arity varies, and two
 * of them (`pv`, `string`) swallow the rest of the line. It is parsed as a
 * token stream rather than with a regular expression for that reason.
 */
export function parseInfo(body: string): UciInfo {
  const tokens = body.trim().split(/\s+/);
  const info: {
    -readonly [K in keyof UciInfo]: UciInfo[K];
  } = {};

  for (let i = 0; i < tokens.length; i += 1) {
    const key = tokens[i] as string;
    switch (key) {
      case 'depth':
        info.depth = readNumber(tokens, ++i);
        break;
      case 'seldepth':
        info.seldepth = readNumber(tokens, ++i);
        break;
      case 'multipv':
        info.multipv = readNumber(tokens, ++i);
        break;
      case 'nodes':
        info.nodes = readNumber(tokens, ++i);
        break;
      case 'nps':
        info.nps = readNumber(tokens, ++i);
        break;
      case 'time':
        info.timeMs = readNumber(tokens, ++i);
        break;
      case 'hashfull':
        info.hashFull = readNumber(tokens, ++i);
        break;
      case 'tbhits':
        info.tbHits = readNumber(tokens, ++i);
        break;
      case 'currmove':
        info.currMove = asUci(tokens[++i] ?? '');
        break;
      case 'currmovenumber':
        info.currMoveNumber = readNumber(tokens, ++i);
        break;
      case 'score': {
        const type = tokens[++i];
        const value = readNumber(tokens, ++i);
        if (value !== undefined) {
          if (type === 'cp') info.score = cp(value);
          else if (type === 'mate') info.score = mate(value);
        }
        const next = tokens[i + 1];
        if (next === 'lowerbound' || next === 'upperbound') {
          info.bound = next === 'lowerbound' ? 'lower' : 'upper';
          i += 1;
        }
        break;
      }
      case 'pv': {
        const moves = tokens.slice(i + 1).filter((token) => token.length >= 4);
        info.pv = moves.map((move) => asUci(move));
        i = tokens.length;
        break;
      }
      case 'string': {
        info.text = tokens.slice(i + 1).join(' ');
        i = tokens.length;
        break;
      }
      default:
        break;
    }
  }

  return info;
}

function readNumber(tokens: readonly string[], index: number): number | undefined {
  const value = Number(tokens[index]);
  return Number.isFinite(value) ? value : undefined;
}

const OPTION_TYPES = new Set<EngineOptionType>(['spin', 'check', 'combo', 'string', 'button']);

/** `option name MultiPV type spin default 1 min 1 max 500` */
export function parseOption(line: string): EngineOptionSpec | null {
  const match = /^option name (.+?) type (\w+)(.*)$/.exec(line.trim());
  if (!match) return null;

  const type = match[2] as EngineOptionType;
  if (!OPTION_TYPES.has(type)) return null;

  const rest = match[3] ?? '';
  const defaultValue = /\bdefault\s+(.*?)(?=\s+(?:min|max|var)\s|$)/.exec(rest)?.[1]?.trim();
  const min = Number(/\bmin\s+(-?\d+)/.exec(rest)?.[1]);
  const max = Number(/\bmax\s+(-?\d+)/.exec(rest)?.[1]);
  const choices = [...rest.matchAll(/\bvar\s+([^\s].*?)(?=\s+var\s|$)/g)].map((m) =>
    (m[1] as string).trim(),
  );

  return {
    name: (match[1] as string).trim(),
    type,
    ...(defaultValue !== undefined && defaultValue !== '' ? { defaultValue } : {}),
    ...(Number.isFinite(min) ? { min } : {}),
    ...(Number.isFinite(max) ? { max } : {}),
    ...(choices.length > 0 ? { choices } : {}),
  };
}

/** Build a `go` command from an analysis limit. */
export function formatGoCommand(
  limit: { kind: string; depth?: number; nodes?: number; ms?: number },
  searchMoves?: readonly string[],
): string {
  const parts = ['go'];
  switch (limit.kind) {
    case 'depth':
      parts.push('depth', String(limit.depth ?? 20));
      break;
    case 'nodes':
      parts.push('nodes', String(limit.nodes ?? 1_000_000));
      break;
    case 'movetime':
      parts.push('movetime', String(limit.ms ?? 1000));
      break;
    default:
      parts.push('infinite');
      break;
  }
  if (searchMoves && searchMoves.length > 0) parts.push('searchmoves', ...searchMoves);
  return parts.join(' ');
}

export function formatPositionCommand(fen: string, moves?: readonly string[]): string {
  const base = `position fen ${fen}`;
  return moves && moves.length > 0 ? `${base} moves ${moves.join(' ')}` : base;
}

/** Every `option name …` line from a `uci` handshake, parsed. */
export function parseUciOptions(lines: readonly string[]): EngineOptionSpec[] {
  const options: EngineOptionSpec[] = [];
  for (const line of lines) {
    const option = parseOption(line);
    if (option) options.push(option);
  }
  return options;
}
