/**
 * The engine abstraction.
 *
 * Nothing above this layer knows whether analysis comes from WebAssembly in a
 * worker, a native binary behind a local bridge, or a remote analysis server.
 * A provider creates sessions; a session answers analysis requests; a request
 * yields a stream of `EngineAnalysis` snapshots.
 *
 * Two conventions are enforced at this boundary and never revisited:
 *   - scores are stored from White's point of view;
 *   - moves are UCI, with SAN attached separately once a position is known.
 */

import type { Score } from '@/chess/evaluation';
import type { Fen, San, Uci } from '@/chess/types';

export type EngineKind = 'wasm' | 'native' | 'remote';

export interface EngineIdentity {
  readonly id?: string;
  readonly name: string;
  readonly version?: string;
  readonly author?: string;
}

export interface EngineCapabilities {
  readonly multiPv: boolean;
  /**
   * Whether the engine honours UCI `searchmoves`.
   *
   * Checked rather than assumed, because the feature that needs it —
   * "compare exactly these three candidates" — is worthless if the engine
   * quietly searches everything and returns its own favourite. An engine that
   * does not support it gets the comparison offered as an unconstrained
   * MultiPV search instead, with the difference stated.
   */
  readonly searchMoves: boolean;
  readonly threads: boolean;
  readonly hash: boolean;
  readonly syzygy: boolean;
  readonly nnue: boolean;
  readonly maxThreads: number;
  readonly maxHashMb: number;
}

export type EngineOptionType = 'spin' | 'check' | 'combo' | 'string' | 'button';

export interface EngineOptionSpec {
  readonly name: string;
  readonly type: EngineOptionType;
  readonly defaultValue?: string;
  readonly min?: number;
  readonly max?: number;
  readonly choices?: readonly string[];
}

export interface EngineConfiguration {
  readonly multiPv: number;
  readonly threads: number;
  readonly hashMb: number;
  readonly syzygyPath?: string;
  readonly useNnue?: boolean;
  /** Escape hatch for engine-specific options this interface has no opinion on. */
  readonly options?: Readonly<Record<string, string | number | boolean>>;
}

export const DEFAULT_ENGINE_CONFIGURATION: EngineConfiguration = {
  multiPv: 3,
  threads: 1,
  hashMb: 64,
};

/** When to stop searching. Infinite analysis is the default for a study board. */
export type AnalysisLimit =
  | { readonly kind: 'infinite' }
  | { readonly kind: 'depth'; readonly depth: number }
  | { readonly kind: 'nodes'; readonly nodes: number }
  | { readonly kind: 'movetime'; readonly ms: number };

export interface AnalysisRequest {
  readonly fen: Fen;
  /** Continuation from `fen`, for engines that benefit from move history. */
  readonly moves?: readonly Uci[];
  readonly limit: AnalysisLimit;
  /** Restrict the search to these root moves. */
  readonly searchMoves?: readonly Uci[];
}

export interface PrincipalVariation {
  /** 1-based, matching UCI `multipv`. */
  readonly rank: number;
  /** From White's point of view. */
  readonly score: Score;
  readonly depth: number;
  readonly seldepth?: number;
  readonly moves: readonly Uci[];
  /** Filled in once the line has been replayed against the position. */
  readonly san?: readonly San[];
  /** The engine only proved a bound, not an exact value. */
  readonly bound?: 'lower' | 'upper';
}

export interface EngineAnalysis {
  readonly fen: Fen;
  readonly depth: number;
  readonly seldepth: number;
  readonly nodes: number;
  readonly nps: number;
  readonly timeMs: number;
  readonly hashFull?: number;
  readonly tbHits?: number;
  /** Ordered by rank; index 0 is the engine's preferred line. */
  readonly lines: readonly PrincipalVariation[];
  readonly bestMove?: Uci;
  readonly ponder?: Uci;
  /** True once the engine has reported `bestmove`. */
  readonly complete: boolean;
  /**
   * Whether a requested `searchmoves` restriction was actually obeyed.
   *
   * `undefined` when none was asked for. `false` means the engine searched
   * outside the moves it was given — which several strong engines do, because
   * `searchmoves` is an optional part of UCI that an engine is free to ignore
   * silently. The distinction matters because the numbers are then evidence
   * about a different question than the one that was asked, and presenting
   * them as a comparison of the chosen moves would be inventing a result.
   */
  readonly restrictionHonoured?: boolean;
}

export type AnalysisListener = (analysis: EngineAnalysis) => void;

export interface AnalysisHandle {
  /** Ask the engine to stop; the listener still receives a final snapshot. */
  stop(): void;
  /** Resolves with the last snapshot once the search has ended. */
  readonly finished: Promise<EngineAnalysis>;
}

export interface EngineSession {
  readonly identity: EngineIdentity;
  readonly capabilities: EngineCapabilities;
  readonly options: readonly EngineOptionSpec[];
  configure(configuration: Partial<EngineConfiguration>): Promise<void>;
  analyse(request: AnalysisRequest, listener: AnalysisListener): AnalysisHandle;
  stop(): void;
  dispose(): void;
}

export interface EngineAvailability {
  readonly available: boolean;
  /** Shown to the user when the engine cannot run, with what to do about it. */
  readonly reason?: string;
  readonly remedy?: string;
}

export interface EngineProvider {
  readonly id: string;
  readonly name: string;
  readonly kind: EngineKind;
  checkAvailability(): Promise<EngineAvailability>;
  create(configuration?: Partial<EngineConfiguration>): Promise<EngineSession>;
}

export class EngineError extends Error {
  constructor(
    message: string,
    readonly remedy?: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export const EMPTY_ANALYSIS = (fen: Fen): EngineAnalysis => ({
  fen,
  depth: 0,
  seldepth: 0,
  nodes: 0,
  nps: 0,
  timeMs: 0,
  lines: [],
  complete: false,
});
