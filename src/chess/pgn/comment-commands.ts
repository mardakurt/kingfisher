/**
 * Structured data hidden inside PGN comments.
 *
 * PGN has no field for arrows, evaluations or clock times, so annotation tools
 * agreed on `[%key value]` commands inside `{}` comments. Reading them turns
 * imported files into real chess data instead of prose; writing them back is
 * what makes a round trip lossless.
 *
 *   { Strong plan [%cal Gd2d4,Re1e8][%csl Yf5] [%eval 0.34] [%clk 0:02:41] }
 */

import { isSquare } from '../board';
import { cp, mate, type Score } from '../evaluation';
import type { Brush, Shape } from '../annotations';
import type { Square } from '../types';

export interface CommentData {
  /** The comment with all commands removed. */
  readonly text: string;
  readonly shapes: readonly Shape[];
  readonly score?: Score;
  readonly clockSeconds?: number;
  readonly elapsedSeconds?: number;
}

const BRUSH_BY_LETTER: Readonly<Record<string, Brush>> = {
  G: 'green',
  R: 'red',
  Y: 'yellow',
  B: 'blue',
};

const LETTER_BY_BRUSH: Readonly<Record<Brush, string>> = {
  green: 'G',
  red: 'R',
  yellow: 'Y',
  blue: 'B',
};

const COMMAND = /\[%(\w+)\s+([^\]]*)\]/g;

export function parseComment(raw: string): CommentData {
  const shapes: Shape[] = [];
  let score: Score | undefined;
  let clockSeconds: number | undefined;
  let elapsedSeconds: number | undefined;

  const text = raw
    .replace(COMMAND, (_match, key: string, value: string) => {
      switch (key.toLowerCase()) {
        case 'cal':
          shapes.push(...parseArrows(value));
          return '';
        case 'csl':
          shapes.push(...parseSquares(value));
          return '';
        case 'eval': {
          const parsed = parseEval(value);
          if (parsed) score = parsed;
          return '';
        }
        case 'clk': {
          const parsed = parseClock(value);
          if (parsed !== null) clockSeconds = parsed;
          return '';
        }
        case 'emt': {
          const parsed = parseClock(value);
          if (parsed !== null) elapsedSeconds = parsed;
          return '';
        }
        default:
          // Unknown commands are dropped from display but not treated as errors.
          return '';
      }
    })
    .replace(/\s+/g, ' ')
    .trim();

  return {
    text,
    shapes,
    ...(score ? { score } : {}),
    ...(clockSeconds !== undefined ? { clockSeconds } : {}),
    ...(elapsedSeconds !== undefined ? { elapsedSeconds } : {}),
  };
}

function parseArrows(value: string): Shape[] {
  const out: Shape[] = [];
  for (const token of value.split(',')) {
    const item = token.trim();
    if (item.length < 5) continue;
    const brush = BRUSH_BY_LETTER[item[0] as string];
    const from = item.slice(1, 3);
    const to = item.slice(3, 5);
    if (!brush || !isSquare(from) || !isSquare(to)) continue;
    out.push({ kind: 'arrow', from, to, brush });
  }
  return out;
}

function parseSquares(value: string): Shape[] {
  const out: Shape[] = [];
  for (const token of value.split(',')) {
    const item = token.trim();
    if (item.length < 3) continue;
    const brush = BRUSH_BY_LETTER[item[0] as string];
    const square = item.slice(1, 3);
    if (!brush || !isSquare(square)) continue;
    out.push({ kind: 'square', square: square as Square, brush });
  }
  return out;
}

export function parseEval(value: string): Score | null {
  const text = value.trim();
  const mateMatch = /^#\s*([+-]?\d+)$/.exec(text);
  if (mateMatch) return mate(Number(mateMatch[1]));
  const pawns = Number(text);
  if (!Number.isFinite(pawns)) return null;
  return cp(Math.round(pawns * 100));
}

export function formatEval(score: Score): string {
  return score.kind === 'mate' ? `#${score.moves}` : (score.cp / 100).toFixed(2);
}

/** `0:02:41`, `1:02:03.5` or plain seconds. */
export function parseClock(value: string): number | null {
  const text = value.trim();
  if (text === '') return null;
  const parts = text.split(':').map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 3) {
    const [h = 0, m = 0, s = 0] = parts;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const [m = 0, s = 0] = parts;
    return m * 60 + s;
  }
  return parts[0] ?? null;
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Rebuild a comment string from text plus structured data. */
export function formatComment(data: CommentData): string {
  const parts: string[] = [];
  if (data.text) parts.push(data.text);

  const arrows = data.shapes.filter(
    (shape): shape is Extract<Shape, { kind: 'arrow' }> => shape.kind === 'arrow',
  );
  const squares = data.shapes.filter(
    (shape): shape is Extract<Shape, { kind: 'square' }> => shape.kind === 'square',
  );

  if (squares.length > 0) {
    parts.push(`[%csl ${squares.map((s) => `${LETTER_BY_BRUSH[s.brush]}${s.square}`).join(',')}]`);
  }
  if (arrows.length > 0) {
    parts.push(
      `[%cal ${arrows.map((a) => `${LETTER_BY_BRUSH[a.brush]}${a.from}${a.to}`).join(',')}]`,
    );
  }
  if (data.score) parts.push(`[%eval ${formatEval(data.score)}]`);
  if (data.clockSeconds !== undefined) parts.push(`[%clk ${formatClock(data.clockSeconds)}]`);
  if (data.elapsedSeconds !== undefined) parts.push(`[%emt ${formatClock(data.elapsedSeconds)}]`);

  return parts.join(' ');
}
