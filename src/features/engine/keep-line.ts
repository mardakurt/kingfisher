'use client';

/**
 * Promoting a running search into stored evidence.
 *
 * The existing pin holds a line still *on screen* while the engine keeps
 * thinking — useful, and gone when the tab closes. This is the other thing a
 * professional needs: a reading they can quote in a month, with enough
 * provenance that reading it back is evidence rather than an assertion.
 *
 * So it records the engine, its build, the settings it ran under, the depth
 * and node count it reached, and when. A PV without those is a claim nobody
 * can check, and "Stockfish says +0.4" from an unknown depth at unknown
 * MultiPV has caused more bad repertoire decisions than any missing feature.
 */

import type { Score } from '@/chess/evaluation';
import { positionKey } from '@/chess/fen';
import { asSan, asUci, type Fen, type San, type Uci } from '@/chess/types';
import type { NodeId } from '@/chess/tree/types';
import { getRepositories } from '@/persistence/repositories';

export interface KeepLineInput {
  readonly fen: Fen;
  readonly chapterId?: string;
  readonly nodeId?: NodeId;
  readonly engineId: string;
  readonly engineName: string;
  readonly engineVersion?: string;
  readonly multiPv: number;
  readonly threads?: number;
  readonly hashMb?: number;
  /** Present when the line came from a constrained candidate comparison. */
  readonly searchMoves?: readonly string[];
  readonly score: Score;
  readonly depth: number;
  readonly seldepth?: number;
  readonly nodes: number;
  readonly timeMs: number;
  readonly pvUci: readonly string[];
  readonly pvSan: readonly string[];
}

export async function keepLine(input: KeepLineInput) {
  const repositories = await getRepositories();
  return repositories.pinnedLines.pin({
    positionKey: positionKey(input.fen),
    fen: input.fen,
    ...(input.chapterId ? { chapterId: input.chapterId } : {}),
    ...(input.nodeId ? { nodeId: input.nodeId } : {}),
    engineId: input.engineId,
    engineName: input.engineName,
    ...(input.engineVersion ? { engineVersion: input.engineVersion } : {}),
    multiPv: input.multiPv,
    ...(input.threads !== undefined ? { threads: input.threads } : {}),
    ...(input.hashMb !== undefined ? { hashMb: input.hashMb } : {}),
    ...(input.searchMoves?.length
      ? { searchMoves: input.searchMoves.map((move) => asUci(move)) as readonly Uci[] }
      : {}),
    score: input.score,
    depth: input.depth,
    ...(input.seldepth !== undefined ? { seldepth: input.seldepth } : {}),
    nodes: input.nodes,
    timeMs: input.timeMs,
    pvUci: input.pvUci.map((move) => asUci(move)) as readonly Uci[],
    pvSan: input.pvSan.map((move) => asSan(move)) as readonly San[],
  });
}

/**
 * A one-line description of what a stored reading actually is.
 *
 * Every part of it is a fact the reader would otherwise have to take on trust:
 * which engine, how deep, how many lines it was splitting its attention
 * across, and whether it was restricted to particular moves.
 */
export function describeKeptLine(line: {
  engineName: string;
  engineVersion?: string;
  depth: number;
  multiPv: number;
  nodes: number;
  searchMoves?: readonly string[];
}): string {
  const parts = [
    `${line.engineName}${line.engineVersion ? ` ${line.engineVersion}` : ''}`,
    `depth ${line.depth}`,
    `MultiPV ${line.multiPv}`,
    `${formatNodes(line.nodes)} nodes`,
  ];
  if (line.searchMoves?.length) {
    // Not a general assessment of the position, and the label says so.
    parts.push(`restricted to ${line.searchMoves.length} moves`);
  }
  return parts.join(' · ');
}

const formatNodes = (nodes: number): string => {
  if (nodes >= 1e9) return `${(nodes / 1e9).toFixed(2)}B`;
  if (nodes >= 1e6) return `${(nodes / 1e6).toFixed(1)}M`;
  if (nodes >= 1e3) return `${Math.round(nodes / 1e3)}k`;
  return String(nodes);
};
