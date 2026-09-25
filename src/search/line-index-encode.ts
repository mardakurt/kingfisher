/**
 * Building a game's compact line index (`line-index.ts`) in the browser, at
 * import, from the same main line `scanLine` reads: a game's tree, or the
 * rows a store indexed (`lineFromRows`). The theme first-plies are computed
 * here with the real theme definitions, which is why the index is built in
 * the browser and only read by the companion.
 */

import { readPlacement } from '@/chess/fen';
import { Position } from '@/chess/position';
import { isOk } from '@/chess/result';
import { boardView, STRATEGIC_THEMES, THEME_VERSION } from '@/chess/themes';
import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';
import type { Fen } from '@/chess/types';

import { encodeLineIndex, squareIndex, type IndexedMove, type MaterialRun } from './line-index';
import type { LinePosition } from './game-scan';
import { materialOf } from './material-query';
import { pieceOn } from './route';

/** `t1` → 1: the theme definitions' version, as the index stores it. */
export const THEMES_VERSION_NUMBER = Number(THEME_VERSION.replace(/\D/g, '')) || 0;

const sameCounts = (a: MaterialRun['w'], b: MaterialRun['w']) =>
  a.q === b.q && a.r === b.r && a.b === b.b && a.n === b.n && a.p === b.p;

/** The index of a main line, or null for a line too long for it (65,535 positions). */
export function lineIndexOf(line: readonly LinePosition[]): Uint8Array | null {
  if (line.length === 0 || line.length > 65_535) return null;
  const firstPly = line[0]!.ply;

  const runs: MaterialRun[] = [];
  line.forEach((position, index) => {
    const material = materialOf(position.fen);
    const last = runs[runs.length - 1];
    if (last && sameCounts(last.w, material.w) && sameCounts(last.b, material.b)) return;
    runs.push({ start: index, w: material.w, b: material.b });
  });

  const moves: IndexedMove[] = [];
  for (let index = 1; index < line.length; index += 1) {
    const uci = line[index]!.move?.uci;
    if (!uci) return null;
    const before = line[index - 1]!.fen;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    moves.push({
      from: squareIndex(from),
      to: squareIndex(to),
      promotion: uci.length > 4,
      mover: pieceOn(before, from),
      targetOccupied: pieceOn(before, to) !== null,
    });
  }

  // For each theme, the first ply it holds for two positions, or at the end —
  // `firstHeld` in game-scan.ts, over every theme at once.
  const themes = new Map<string, number>();
  const previous = new Set<string>();
  line.forEach((position, index) => {
    const board = readPlacement(position.fen);
    const now = new Set<string>();
    if (isOk(board)) {
      const view = boardView({ board: board.value });
      for (const theme of STRATEGIC_THEMES) if (theme.matches(view)) now.add(theme.id);
    }
    for (const id of now) {
      if (previous.has(id) && !themes.has(id)) themes.set(id, line[index - 1]!.ply);
    }
    if (index === line.length - 1) {
      for (const id of now) if (!themes.has(id)) themes.set(id, position.ply);
    }
    previous.clear();
    for (const id of now) previous.add(id);
  });

  return encodeLineIndex({
    firstPly,
    positions: line.length,
    runs,
    moves,
    themesVersion: THEMES_VERSION_NUMBER,
    themes,
  });
}

/** The main line of a tree, as `scanGame` reads it. */
export function lineOfTree(tree: GameTree): LinePosition[] {
  return mainlinePath(tree).map((id) => tree.nodes[id]!);
}

export interface IndexedRow {
  readonly ply?: unknown;
  readonly fen?: unknown;
  readonly moveUci?: unknown;
}

/**
 * A game's main line from the rows its store indexed, or null when the rows
 * are not the whole line.
 *
 * The index keeps one row per position and move, so a repetition is stored
 * once and the rows then skip plies; a skipped ply would make a two-position
 * material test or a route read the wrong sequence. Only consecutive plies are
 * trusted, and anything else falls back to replaying the PGN. The position
 * after the last move is played here, once, by the rules code.
 */
export function lineFromRows(rows: readonly IndexedRow[] | undefined): LinePosition[] | null {
  if (!rows || rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => Number(a.ply) - Number(b.ply));
  const first = Number(sorted[0]!.ply);
  const line: LinePosition[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const row = sorted[index]!;
    if (Number(row.ply) !== first + index) return null;
    if (typeof row.fen !== 'string' || typeof row.moveUci !== 'string') return null;
    if (index === 0) line.push({ id: 'p0', fen: row.fen, ply: first - 1 });
    const next = sorted[index + 1];
    let after: string | null = typeof next?.fen === 'string' ? next.fen : null;
    if (!next) {
      const played = Position.fromTrustedFen(row.fen as Fen).playUci(row.moveUci);
      after = played.ok ? played.value.after : null;
    }
    if (!after) return null;
    line.push({ id: `p${index + 1}`, fen: after, ply: first + index, move: { uci: row.moveUci } });
  }
  return line;
}

/** A line index as it crosses the HTTP boundary to the companion. */
export function lineIndexBase64(bytes: Uint8Array | null): string | undefined {
  if (!bytes) return undefined;
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1)
    binary += String.fromCharCode(bytes[index]!);
  return btoa(binary);
}

/** The base64 line index of a game's tree, for an import payload. */
export const lineIndexForTree = (tree: GameTree): string | undefined =>
  lineIndexBase64(lineIndexOf(lineOfTree(tree)));

/** The base64 line index from a store's indexed rows, or undefined when they are not the whole line. */
export function lineIndexForRows(rows: readonly IndexedRow[] | undefined): string | undefined {
  const line = lineFromRows(rows);
  return line ? lineIndexBase64(lineIndexOf(line)) : undefined;
}
