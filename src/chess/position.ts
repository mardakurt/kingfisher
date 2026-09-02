/**
 * An immutable chess position.
 *
 * This module is the single place in the codebase allowed to import `chess.js`.
 * Everything above it works with `Position`, `ChessMove` and the branded
 * notation types, so the rules implementation can be replaced (a WASM rules
 * engine, a server, a different library) without touching feature code.
 */

import { Chess, type Move as LibMove, type Square as LibSquare } from 'chess.js';

import { isSquare, squareIndex } from './board';
import { formatUci } from './moves';
import { START_FEN, parseFen, type FenParts } from './fen';
import { fail, ok, type Result } from './result';
import {
  asFen,
  asSan,
  type ChessMove,
  type Color,
  type Fen,
  type GameOutcome,
  type MoveFlags,
  type MoveIntent,
  type Piece,
  type PieceType,
  type PromotionPiece,
  type Square,
} from './types';

export class Position {
  /** Parsed FEN fields, computed on first use. */
  private parsedParts: FenParts | null = null;
  private cachedMoves: readonly ChessMove[] | null = null;
  private engine: Chess | null = null;

  private constructor(readonly fen: Fen) {}

  static initial(): Position {
    return new Position(START_FEN);
  }

  /** Validate and build. Use this for anything that came from outside. */
  static fromFen(input: string): Result<Position> {
    const parsed = parseFen(input);
    if (!parsed.ok) return parsed;

    const normalized = input.trim().replace(/\s+/g, ' ');
    const position = new Position(asFen(normalized));
    position.parsedParts = parsed.value;

    // The structural parser accepts positions the rules engine rejects
    // (a side to move already giving check, impossible castling rights…).
    try {
      position.chess();
    } catch (error) {
      return fail('invalid-position', describeError(error), { input });
    }
    return ok(position);
  }

  /**
   * Build without validating. Only for FENs this application produced itself,
   * such as the result of playing a legal move.
   */
  static fromTrustedFen(fen: Fen): Position {
    return new Position(fen);
  }

  get parts(): FenParts {
    if (!this.parsedParts) {
      const parsed = parseFen(this.fen);
      if (!parsed.ok) throw new Error(`Corrupt internal FEN: ${parsed.error.message}`);
      this.parsedParts = parsed.value;
    }
    return this.parsedParts;
  }

  get turn(): Color {
    return this.parts.turn;
  }

  get fullmoveNumber(): number {
    return this.parts.fullmoveNumber;
  }

  get halfmoveClock(): number {
    return this.parts.halfmoveClock;
  }

  /** Board indexed by `squareIndex` (a1 = 0 … h8 = 63). */
  board(): readonly (Piece | null)[] {
    return this.parts.board;
  }

  pieceAt(square: Square): Piece | null {
    return this.parts.board[squareIndex(square)] ?? null;
  }

  legalMoves(): readonly ChessMove[] {
    if (!this.cachedMoves) {
      const verbose = this.chess().moves({ verbose: true });
      this.cachedMoves = verbose.map((move) => toChessMove(move));
    }
    return this.cachedMoves;
  }

  legalMovesFrom(square: Square): readonly ChessMove[] {
    return this.legalMoves().filter((move) => move.from === square);
  }

  legalDestinations(square: Square): readonly Square[] {
    const seen = new Set<Square>();
    for (const move of this.legalMovesFrom(square)) seen.add(move.to);
    return [...seen];
  }

  /** True when a move from → to exists but cannot be completed without a piece choice. */
  requiresPromotion(from: Square, to: Square): boolean {
    return this.legalMoves().some(
      (move) => move.from === from && move.to === to && move.flags.promotion,
    );
  }

  play(intent: MoveIntent): Result<ChessMove> {
    const found = this.legalMoves().find(
      (move) =>
        move.from === intent.from &&
        move.to === intent.to &&
        (intent.promotion === undefined || move.promotion === intent.promotion),
    );
    if (!found) {
      return fail('illegal-move', `${formatUci(intent)} is not legal in this position.`, {
        input: formatUci(intent),
      });
    }
    if (found.flags.promotion && intent.promotion === undefined) {
      return fail('illegal-move', `${formatUci(intent)} needs a promotion piece.`, {
        input: formatUci(intent),
      });
    }
    return ok(found);
  }

  playSan(san: string): Result<ChessMove> {
    const trimmed = san.trim();
    const chess = this.chess(true);
    try {
      const move = chess.move(trimmed);
      return ok(toChessMove(move));
    } catch {
      return fail('invalid-san', `"${trimmed}" is not a legal move here.`, { input: trimmed });
    }
  }

  /**
   * Play a SAN move and hand the advanced rules engine to the position reached.
   *
   * Sequential play — parsing a PGN, replaying a line — is the hot path in the
   * whole application, and `playSan` cannot serve it: it must not mutate the
   * position it is called on, so it builds a throwaway `new Chess(fen)` per
   * move. Parsing a hundred thousand games therefore constructed and re-parsed
   * a FEN about four million times, which measured as 98% of import cost.
   *
   * This transfers ownership instead. The caller keeps its FEN and every cache
   * derived from it, and gives up only the private rules instance, which it
   * will rebuild on demand if it is asked another question. The value is
   * unchanged; only where the scratch engine lives moves. On an illegal move
   * the engine has not advanced, so it is handed straight back.
   */
  advanceSan(san: string): Result<{ readonly move: ChessMove; readonly next: Position }> {
    const trimmed = san.trim();
    const chess = this.engine ?? new Chess(this.fen);
    this.engine = null;
    try {
      const move = chess.move(trimmed);
      const next = new Position(asFen(move.after));
      next.engine = chess;
      return ok({ move: toChessMove(move), next });
    } catch {
      this.engine = chess;
      return fail('invalid-san', `"${trimmed}" is not a legal move here.`, { input: trimmed });
    }
  }

  playUci(uci: string): Result<ChessMove> {
    const text = uci.trim().toLowerCase();
    if (text.length < 4) return fail('invalid-uci', `"${uci}" is not a UCI move.`, { input: uci });
    const from = text.slice(0, 2);
    const to = text.slice(2, 4);
    const promotion = text.length > 4 ? (text[4] as PromotionPiece) : undefined;
    if (!isSquare(from) || !isSquare(to)) {
      return fail('invalid-uci', `"${uci}" does not name two squares.`, { input: uci });
    }
    return this.play(promotion ? { from, to, promotion } : { from, to });
  }

  /** The position reached by a move that was produced from this position. */
  after(move: ChessMove): Position {
    return Position.fromTrustedFen(move.after);
  }

  isCheck(): boolean {
    return this.chess().isCheck();
  }

  isCheckmate(): boolean {
    return this.chess().isCheckmate();
  }

  isStalemate(): boolean {
    return this.chess().isStalemate();
  }

  isInsufficientMaterial(): boolean {
    return this.chess().isInsufficientMaterial();
  }

  isFiftyMoveDraw(): boolean {
    return this.chess().isDrawByFiftyMoves();
  }

  /**
   * Terminal state reachable from the position alone. Threefold repetition is
   * deliberately absent: it is a property of a game's history, not a position,
   * and lives in `game.ts`.
   */
  outcome(): GameOutcome | null {
    if (this.isCheckmate()) return { kind: 'checkmate', winner: this.turn === 'w' ? 'b' : 'w' };
    if (this.isStalemate()) return { kind: 'stalemate' };
    if (this.isInsufficientMaterial()) return { kind: 'insufficient-material' };
    if (this.isFiftyMoveDraw()) return { kind: 'fifty-move' };
    return null;
  }

  kingSquare(color: Color): Square | null {
    const board = this.parts.board;
    for (let index = 0; index < 64; index += 1) {
      const piece = board[index];
      if (piece && piece.type === 'k' && piece.color === color) {
        const square = `${'abcdefgh'[index % 8]}${(index >> 3) + 1}`;
        return square as Square;
      }
    }
    return null;
  }

  /** Zobrist-style hash of the position, suitable as a map key. */
  hash(): string {
    return this.chess().hash();
  }

  /** Material count by piece type, White minus Black. */
  materialBalance(): number {
    const values: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    let total = 0;
    for (const piece of this.parts.board) {
      if (!piece) continue;
      total += piece.color === 'w' ? values[piece.type] : -values[piece.type];
    }
    return total;
  }

  private chess(fresh = false): Chess {
    if (fresh) return new Chess(this.fen);
    if (!this.engine) this.engine = new Chess(this.fen);
    return this.engine;
  }
}

function toChessMove(move: LibMove): ChessMove {
  const flags: MoveFlags = {
    capture: move.isCapture(),
    enPassant: move.isEnPassant(),
    promotion: move.isPromotion(),
    kingsideCastle: move.isKingsideCastle(),
    queensideCastle: move.isQueensideCastle(),
    doublePawnPush: move.isBigPawn(),
  };

  const from = move.from as Square;
  const to = move.to as Square;
  const promotion = move.promotion as PromotionPiece | undefined;

  return {
    from,
    to,
    ...(promotion ? { promotion } : {}),
    piece: move.piece,
    color: move.color,
    ...(move.captured ? { captured: move.captured } : {}),
    san: asSan(move.san),
    uci: formatUci(promotion ? { from, to, promotion } : { from, to }),
    flags,
    before: asFen(move.before),
    after: asFen(move.after),
  };
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : 'The position is not legal.';

/** Narrow a raw string to the rules engine's square type. */
export const toLibSquare = (square: Square): LibSquare => square as LibSquare;
