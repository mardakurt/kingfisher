/**
 * Annotations attached to a move or a position: NAG symbols, arrows and
 * highlighted squares. These are chess data, not styling, and they survive a
 * PGN round trip.
 */

import type { Square } from './types';

export type Brush = 'green' | 'red' | 'blue' | 'yellow';

export interface ArrowShape {
  readonly kind: 'arrow';
  readonly from: Square;
  readonly to: Square;
  readonly brush: Brush;
}

export interface SquareShape {
  readonly kind: 'square';
  readonly square: Square;
  readonly brush: Brush;
}

export type Shape = ArrowShape | SquareShape;

export const shapeKey = (shape: Shape): string =>
  shape.kind === 'arrow'
    ? `a:${shape.from}${shape.to}:${shape.brush}`
    : `s:${shape.square}:${shape.brush}`;

/** Numeric Annotation Glyphs, restricted to the set annotators actually use. */
export const NAG = {
  GOOD_MOVE: 1,
  MISTAKE: 2,
  BRILLIANT_MOVE: 3,
  BLUNDER: 4,
  INTERESTING_MOVE: 5,
  DUBIOUS_MOVE: 6,
  FORCED_MOVE: 7,
  EQUAL: 10,
  UNCLEAR: 13,
  WHITE_SLIGHT_ADVANTAGE: 14,
  BLACK_SLIGHT_ADVANTAGE: 15,
  WHITE_MODERATE_ADVANTAGE: 16,
  BLACK_MODERATE_ADVANTAGE: 17,
  WHITE_DECISIVE_ADVANTAGE: 18,
  BLACK_DECISIVE_ADVANTAGE: 19,
  DEVELOPMENT_ADVANTAGE: 32,
  INITIATIVE: 36,
  ATTACK: 40,
  COMPENSATION: 44,
  COUNTERPLAY: 132,
  ZUGZWANG: 136,
  TIME_PRESSURE: 138,
  NOVELTY: 146,
} as const;

export interface NagInfo {
  readonly code: number;
  readonly symbol: string;
  readonly label: string;
  /** Move-quality glyphs render next to the move; positional ones after it. */
  readonly group: 'quality' | 'position' | 'observation';
}

const NAG_TABLE: readonly NagInfo[] = [
  { code: 1, symbol: '!', label: 'Good move', group: 'quality' },
  { code: 2, symbol: '?', label: 'Mistake', group: 'quality' },
  { code: 3, symbol: '!!', label: 'Brilliant move', group: 'quality' },
  { code: 4, symbol: '??', label: 'Blunder', group: 'quality' },
  { code: 5, symbol: '!?', label: 'Interesting move', group: 'quality' },
  { code: 6, symbol: '?!', label: 'Dubious move', group: 'quality' },
  { code: 7, symbol: '□', label: 'Only move', group: 'quality' },
  { code: 10, symbol: '=', label: 'Equal position', group: 'position' },
  { code: 13, symbol: '∞', label: 'Unclear position', group: 'position' },
  { code: 14, symbol: '⩲', label: 'White is slightly better', group: 'position' },
  { code: 15, symbol: '⩱', label: 'Black is slightly better', group: 'position' },
  { code: 16, symbol: '±', label: 'White is clearly better', group: 'position' },
  { code: 17, symbol: '∓', label: 'Black is clearly better', group: 'position' },
  { code: 18, symbol: '+−', label: 'White is winning', group: 'position' },
  { code: 19, symbol: '−+', label: 'Black is winning', group: 'position' },
  { code: 22, symbol: '⨀', label: 'White is in zugzwang', group: 'observation' },
  { code: 23, symbol: '⨀', label: 'Black is in zugzwang', group: 'observation' },
  { code: 32, symbol: '⟳', label: 'Development advantage', group: 'observation' },
  { code: 36, symbol: '↑', label: 'Initiative', group: 'observation' },
  { code: 40, symbol: '→', label: 'Attack', group: 'observation' },
  { code: 44, symbol: '=∞', label: 'Compensation for material', group: 'observation' },
  { code: 132, symbol: '⇆', label: 'Counterplay', group: 'observation' },
  { code: 136, symbol: '⨀', label: 'Zugzwang', group: 'observation' },
  { code: 138, symbol: '⊕', label: 'Time pressure', group: 'observation' },
  { code: 146, symbol: 'N', label: 'Novelty', group: 'observation' },
];

const NAG_BY_CODE = new Map(NAG_TABLE.map((entry) => [entry.code, entry]));

export const nagInfo = (code: number): NagInfo | undefined => NAG_BY_CODE.get(code);

export const nagSymbol = (code: number): string => NAG_BY_CODE.get(code)?.symbol ?? `$${code}`;

export const qualityNags: readonly NagInfo[] = NAG_TABLE.filter(
  (entry) => entry.group === 'quality',
);

export const positionNags: readonly NagInfo[] = NAG_TABLE.filter(
  (entry) => entry.group === 'position',
);

export const observationNags: readonly NagInfo[] = NAG_TABLE.filter(
  (entry) => entry.group === 'observation',
);

/** Symbolic suffixes PGN allows in place of `$1`–`$6`. */
export const SYMBOLIC_NAGS: Readonly<Record<string, number>> = {
  '!': 1,
  '?': 2,
  '!!': 3,
  '??': 4,
  '!?': 5,
  '?!': 6,
};

/** Move-quality glyphs are mutually exclusive; positional judgements are not. */
export function toggleNag(current: readonly number[], code: number): number[] {
  if (current.includes(code)) return current.filter((value) => value !== code);
  const info = nagInfo(code);
  const exclusiveGroup = info?.group === 'quality' || info?.group === 'position';
  const kept = exclusiveGroup
    ? current.filter((value) => nagInfo(value)?.group !== info?.group)
    : [...current];
  return [...kept, code].sort((a, b) => a - b);
}
