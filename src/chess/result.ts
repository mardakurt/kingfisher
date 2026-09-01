/**
 * Explicit success/failure at parse boundaries.
 *
 * Chess input arrives from users and files: FEN pasted from a forum, PGN
 * exported by unknown software, UCI text from a third-party engine. Those paths
 * must fail with a readable reason instead of throwing somewhere in a render.
 */

export type ChessErrorCode =
  | 'invalid-fen'
  | 'invalid-san'
  | 'invalid-uci'
  | 'illegal-move'
  | 'invalid-pgn'
  | 'unknown-node'
  | 'invalid-position';

export interface ChessError {
  readonly code: ChessErrorCode;
  readonly message: string;
  /** Offending input, truncated by the caller when it may be large. */
  readonly input?: string;
  /** 1-based line number, when the source is a text file. */
  readonly line?: number;
}

export type Result<T, E = ChessError> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const chessError = (
  code: ChessErrorCode,
  message: string,
  extra: { input?: string; line?: number } = {},
): ChessError => ({ code, message, ...extra });

export const fail = (
  code: ChessErrorCode,
  message: string,
  extra: { input?: string; line?: number } = {},
): Result<never> => err(chessError(code, message, extra));

/** Unwrap, throwing on failure. Only for trusted internal data and tests. */
export function expect<T>(result: Result<T>, context?: string): T {
  if (result.ok) return result.value;
  throw new Error(`${context ? `${context}: ` : ''}${result.error.message}`);
}

export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok;
