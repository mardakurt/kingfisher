/**
 * A UCI analysis session, over any transport.
 *
 * Responsibilities: keep the engine configured, serialise searches so that a
 * new request cleanly supersedes a running one, and turn a stream of `info`
 * lines into successive `EngineAnalysis` snapshots.
 *
 * Nothing here knows whether the engine is WebAssembly in a Worker or a native
 * process behind the local companion. That is the point: the awkward parts of
 * driving an engine are written once, and a new engine is a new transport plus
 * a capability record, not a second copy of this file.
 */

import { parseFen } from '@/chess/fen';
import { toWhitePov } from '@/chess/evaluation';
import type { Color, Fen, Uci } from '@/chess/types';

import { formatGoCommand, formatPositionCommand, parseUciLine, type UciInfo } from './uci';
import {
  EMPTY_ANALYSIS,
  EngineError,
  type AnalysisHandle,
  type AnalysisListener,
  type AnalysisRequest,
  type EngineAnalysis,
  type EngineCapabilities,
  type EngineConfiguration,
  type EngineIdentity,
  type EngineOptionSpec,
  type EngineSession,
  type PrincipalVariation,
} from './types';
import type { UciTransport } from './transport';

/** How often listeners hear about progress while a search is running. */
const UPDATE_INTERVAL_MS = 90;

interface Search {
  readonly id: number;
  readonly request: AnalysisRequest;
  readonly listener: AnalysisListener;
  readonly rootTurn: Color;
  readonly resolve: (analysis: EngineAnalysis) => void;
  readonly reject: (error: unknown) => void;
  lines: Map<number, PrincipalVariation>;
  snapshot: EngineAnalysis;
  cancelled: boolean;
  lastEmit: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export class UciSession implements EngineSession {
  private nextSearchId = 1;
  private active: Search | null = null;
  private queue: Promise<void> = Promise.resolve();
  private applied: Partial<EngineConfiguration> = {};
  private disposed = false;

  constructor(
    private readonly client: UciTransport,
    readonly identity: EngineIdentity,
    readonly options: readonly EngineOptionSpec[],
    readonly capabilities: EngineCapabilities,
  ) {
    this.client.onLine((line) => this.handleLine(line));
  }

  async configure(configuration: Partial<EngineConfiguration>): Promise<void> {
    this.assertUsable();
    const changes: [string, string][] = [];

    const push = (
      name: string,
      value: string | number | boolean | undefined,
      previous: unknown,
    ) => {
      if (value === undefined || value === previous) return;
      changes.push([name, String(value)]);
    };

    push('MultiPV', configuration.multiPv, this.applied.multiPv);
    if (this.capabilities.threads) push('Threads', configuration.threads, this.applied.threads);
    push('Hash', configuration.hashMb, this.applied.hashMb);
    if (configuration.syzygyPath !== undefined) {
      push('SyzygyPath', configuration.syzygyPath, this.applied.syzygyPath);
    }
    if (configuration.useNnue !== undefined) {
      push('Use NNUE', configuration.useNnue, this.applied.useNnue);
    }
    for (const [name, value] of Object.entries(configuration.options ?? {})) {
      changes.push([name, String(value)]);
    }

    this.applied = { ...this.applied, ...configuration };
    if (changes.length === 0) return;

    this.enqueue(async () => {
      await this.stopActiveSearch();
      for (const [name, value] of changes) {
        this.client.send(`setoption name ${name} value ${value}`);
      }
      await this.waitReady();
    });
    return this.queue;
  }

  analyse(request: AnalysisRequest, listener: AnalysisListener): AnalysisHandle {
    this.assertUsable();

    const rootTurn = rootSideToMove(request.fen, request.moves ?? []);
    let resolve!: (analysis: EngineAnalysis) => void;
    let reject!: (error: unknown) => void;
    const finished = new Promise<EngineAnalysis>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const search: Search = {
      id: this.nextSearchId++,
      request,
      listener,
      rootTurn,
      resolve,
      reject,
      lines: new Map(),
      snapshot: EMPTY_ANALYSIS(request.fen),
      cancelled: false,
      lastEmit: 0,
      timer: null,
    };

    this.enqueue(async () => {
      await this.stopActiveSearch();
      if (search.cancelled || this.disposed) {
        search.resolve({ ...search.snapshot, complete: true });
        return;
      }
      this.active = search;
      this.client.send(formatPositionCommand(request.fen, request.moves));
      this.client.send(formatGoCommand(request.limit, request.searchMoves));
    }).catch((error: unknown) => reject(error));

    return {
      stop: () => {
        search.cancelled = true;
        if (this.active === search) {
          try {
            this.client.send('stop');
          } catch {
            // Session already torn down; the finished promise settles below.
          }
        }
      },
      finished,
    };
  }

  stop(): void {
    if (!this.active) return;
    this.active.cancelled = true;
    try {
      this.client.send('stop');
    } catch {
      // Nothing to stop if the worker is gone.
    }
  }

  dispose(): void {
    this.disposed = true;
    const search = this.active;
    this.active = null;
    if (search) {
      if (search.timer) clearTimeout(search.timer);
      search.resolve({ ...search.snapshot, complete: true });
    }
    this.client.dispose();
  }

  private assertUsable(): void {
    if (this.disposed) throw new EngineError('This engine session has been closed.');
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(task, task);
    return this.queue;
  }

  /** Stop whatever is running and wait for the engine to acknowledge. */
  private async stopActiveSearch(): Promise<void> {
    const search = this.active;
    if (!search) return;
    try {
      this.client.send('stop');
      await this.client.waitFor((line) => line.startsWith('bestmove'), 10_000, 'bestmove');
    } catch {
      // A stalled engine must not deadlock the queue; the search is abandoned.
      this.finishSearch(search);
    }
  }

  private waitReady(): Promise<string> {
    this.client.send('isready');
    return this.client.waitFor((line) => line.trim() === 'readyok', 20_000, 'readyok');
  }

  private handleLine(line: string): void {
    const search = this.active;
    if (!search) return;

    const message = parseUciLine(line);
    if (message.kind === 'info') {
      this.applyInfo(search, message.info);
      return;
    }
    if (message.kind === 'bestmove') {
      search.snapshot = {
        ...search.snapshot,
        ...(message.best ? { bestMove: message.best } : {}),
        ...(message.ponder ? { ponder: message.ponder } : {}),
        complete: true,
      };
      this.finishSearch(search);
    }
  }

  private applyInfo(search: Search, info: UciInfo): void {
    // Progress reports without a variation still carry useful counters.
    const base = {
      ...search.snapshot,
      ...(info.depth !== undefined ? { depth: info.depth } : {}),
      ...(info.seldepth !== undefined ? { seldepth: info.seldepth } : {}),
      ...(info.nodes !== undefined ? { nodes: info.nodes } : {}),
      ...(info.nps !== undefined ? { nps: info.nps } : {}),
      ...(info.timeMs !== undefined ? { timeMs: info.timeMs } : {}),
      ...(info.hashFull !== undefined ? { hashFull: info.hashFull } : {}),
      ...(info.tbHits !== undefined ? { tbHits: info.tbHits } : {}),
    };

    if (info.pv && info.pv.length > 0 && info.score) {
      const rank = info.multipv ?? 1;
      // A fresh depth-1 line for rank 1 means the engine restarted its table.
      if (rank === 1 && info.depth !== undefined && info.depth < search.snapshot.depth) {
        search.lines.clear();
      }
      search.lines.set(rank, {
        rank,
        score: toWhitePov(info.score, search.rootTurn),
        depth: info.depth ?? base.depth,
        ...(info.seldepth !== undefined ? { seldepth: info.seldepth } : {}),
        moves: info.pv,
        ...(info.bound ? { bound: info.bound } : {}),
      });
    }

    search.snapshot = {
      ...base,
      lines: [...search.lines.values()].sort((a, b) => a.rank - b.rank),
    };
    this.scheduleEmit(search);
  }

  /** Coalesce the engine's very high update rate into a UI-friendly one. */
  private scheduleEmit(search: Search): void {
    if (search.timer) return;
    const elapsed = Date.now() - search.lastEmit;
    const delay = Math.max(0, UPDATE_INTERVAL_MS - elapsed);
    search.timer = setTimeout(() => {
      search.timer = null;
      search.lastEmit = Date.now();
      if (!search.cancelled || search.snapshot.complete) search.listener(search.snapshot);
    }, delay);
  }

  private finishSearch(search: Search): void {
    if (search.timer) {
      clearTimeout(search.timer);
      search.timer = null;
    }
    if (this.active === search) this.active = null;
    const final: EngineAnalysis = { ...search.snapshot, complete: true };
    search.snapshot = final;
    search.listener(final);
    search.resolve(final);
  }
}

/** Which side moves at the root of the search, after any pre-played moves. */
function rootSideToMove(fen: Fen, moves: readonly Uci[]): Color {
  const parsed = parseFen(fen);
  const start: Color = parsed.ok ? parsed.value.turn : 'w';
  return moves.length % 2 === 0 ? start : start === 'w' ? 'b' : 'w';
}
