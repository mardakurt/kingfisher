/**
 * What a source covers, and — the part that matters — what it does not.
 *
 * Every pack is a filtered population: a rating floor, a set of months, a
 * ply beyond which positions were never aggregated. Those facts are on the
 * manifest, and the application showed the size and the licence but never
 * the shape. The cost was a false sentence: a pack that stopped aggregating
 * at move 20 answered a question at move 25 with "no games reach this
 * position", which reads as a fact about chess and is a fact about the
 * build.
 *
 * So the depth verdict is the point of this module. A position's ply on the
 * board is known; the pack's limit is on its manifest; and a position past
 * that limit is one the pack can hold only if some game reached it sooner by
 * transposition. `beyond-depth` says exactly that, and says it before a
 * player reads an empty explorer as evidence.
 *
 * Pure. A source row and a ply in, sentences out.
 */

import type { ReferenceSource } from './types';

export type DepthVerdict =
  /** The position is inside the depth this source aggregated. A zero means zero. */
  | 'inside'
  /** Past the depth. Present only if a game reached this position sooner. */
  | 'beyond-depth'
  /** The source states no depth: a live service, or the player's own games. */
  | 'unstated';

export interface Coverage {
  readonly sourceId: string;
  readonly name: string;
  readonly depth: DepthVerdict;
  /** The source's own aggregation limit, in plies, when it states one. */
  readonly maxPositionPly?: number;
  /** What the source holds, one clause each. */
  readonly holds: readonly string[];
  /** What it does not hold, one clause each. Never speculative. */
  readonly lacks: readonly string[];
  /**
   * The sentence to print instead of "no games reach this position" when a
   * query comes back empty. Null when an empty answer really is an answer.
   */
  readonly emptyMeaning: string | null;
}

const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** Move number a ply belongs to: ply 0 is "before move 1". */
export const moveNumberOfPly = (ply: number): number => Math.floor(ply / 2) + 1;

/** The ply of a position, from its FEN. Ply 0 is the initial position. */
export function plyOfFen(fen: string): number {
  const fields = fen.split(' ');
  const fullmove = Number(fields[5]);
  if (!Number.isFinite(fullmove) || fullmove < 1) return 0;
  return (fullmove - 1) * 2 + (fields[1] === 'b' ? 1 : 0);
}

function depthVerdict(source: ReferenceSource, ply: number): DepthVerdict {
  if (source.maxPositionPly === undefined) return 'unstated';
  return ply > source.maxPositionPly ? 'beyond-depth' : 'inside';
}

export function describeCoverage(source: ReferenceSource, ply: number): Coverage {
  const holds: string[] = [];
  const lacks: string[] = [];
  const depth = depthVerdict(source, ply);

  if (source.gameCount) holds.push(`${plural(source.gameCount, 'game')} aggregated`);
  if (source.openableCount !== undefined && source.gameCount) {
    holds.push(`${source.openableCount.toLocaleString()} of them openable in full`);
    if (source.openableCount < source.gameCount) {
      lacks.push(
        `the moves of ${(source.gameCount - source.openableCount).toLocaleString()} games — they are counted, not stored`,
      );
    }
  }
  if (source.freshness) holds.push(source.freshness);
  if (source.provenance?.source) holds.push(`built from ${source.provenance.source}`);
  if (source.maxPositionPly !== undefined) {
    holds.push(
      `positions up to move ${moveNumberOfPly(source.maxPositionPly)} (${source.maxPositionPly} plies)`,
    );
    lacks.push(
      `positions first reached after move ${moveNumberOfPly(source.maxPositionPly)} — the build stopped there`,
    );
  }
  if (!source.offline) lacks.push('anything at all without a network');

  const emptyMeaning =
    depth === 'beyond-depth' && source.maxPositionPly !== undefined
      ? `${source.name} aggregated positions only to move ${moveNumberOfPly(source.maxPositionPly)}; this is move ${moveNumberOfPly(ply)}. It holds this position only if a game reached it sooner, so an empty answer here says nothing about how often it has been played.`
      : null;

  return {
    sourceId: source.id,
    name: source.name,
    depth,
    ...(source.maxPositionPly !== undefined ? { maxPositionPly: source.maxPositionPly } : {}),
    holds,
    lacks,
    emptyMeaning,
  };
}

/**
 * The coverage of every source that can answer, for one position.
 *
 * Sources are never merged (AGENTS.md): each keeps its own row, and a reader
 * comparing two of them is comparing two populations, which is the point.
 */
export const describeAll = (
  sources: readonly ReferenceSource[],
  ply: number,
): readonly Coverage[] => sources.map((source) => describeCoverage(source, ply));
