/**
 * Turning engine output into something a player can read.
 *
 * A principal variation arrives as UCI moves, which are unreadable at a glance.
 * Replaying them against the analysed position produces SAN, and stops at the
 * first move that does not fit — engines occasionally emit a truncated or stale
 * line, and half a legal variation is better than a broken one.
 */

import { Position } from '@/chess/position';
import type { Fen, San } from '@/chess/types';
import type { EngineAnalysis, PrincipalVariation } from './types';

export function describeVariation(fen: Fen, moves: readonly string[], limit = 12): San[] {
  let position = Position.fromTrustedFen(fen);
  const san: San[] = [];

  for (const uci of moves.slice(0, limit)) {
    const move = position.playUci(uci);
    if (!move.ok) break;
    san.push(move.value.san);
    position = position.after(move.value);
  }
  return san;
}

export interface VariationPosition {
  readonly fen: Fen;
  readonly uci: string | null;
  readonly san: San | null;
}

/** Positions for a non-destructive PV board, including the starting position. */
export function variationPositions(
  fen: Fen,
  moves: readonly string[],
  limit = 24,
): readonly VariationPosition[] {
  let position = Position.fromTrustedFen(fen);
  const positions: VariationPosition[] = [{ fen, uci: null, san: null }];
  for (const uci of moves.slice(0, limit)) {
    const played = position.playUci(uci);
    if (!played.ok) break;
    position = position.after(played.value);
    positions.push({ fen: position.fen, uci, san: played.value.san });
  }
  return positions;
}

export function annotateAnalysis(analysis: EngineAnalysis, limit = 12): EngineAnalysis {
  const lines: PrincipalVariation[] = analysis.lines.map((line) => ({
    ...line,
    san: describeVariation(analysis.fen, line.moves, limit),
  }));
  return { ...analysis, lines };
}

/**
 * Move number labels for a variation, so it can be printed the way it would be
 * written down: `24...Rxe4 25.Qf3 Bd5`.
 */
export function variationTokens(
  startPly: number,
  san: readonly San[],
): { text: string; isMove: boolean }[] {
  const tokens: { text: string; isMove: boolean }[] = [];

  san.forEach((move, index) => {
    const ply = startPly + index + 1;
    const isWhite = ply % 2 === 1;
    if (isWhite) tokens.push({ text: `${Math.ceil(ply / 2)}.`, isMove: false });
    else if (index === 0) tokens.push({ text: `${Math.ceil(ply / 2)}...`, isMove: false });
    tokens.push({ text: move, isMove: true });
  });

  return tokens;
}
