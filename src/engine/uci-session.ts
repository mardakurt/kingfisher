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

import { Position } from '@/chess/position';
import { toWhitePov } from '@/chess/evaluation';
import type { Color } from '@/chess/types';

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
  /** The position the engine was asked about, for checking what it answers. */
  readonly root: Position;
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

    /*
      An engine must never answer from a book of its own.

      An engine playing from its internal book returns a move instantly with no
      search behind it, and Kingfisher's panel would report that as an
      evaluation at depth 0 — a number the engine never computed. Kingfisher
      shows book moves in their own panel, from books it can name; the engine's
      job is to search.

      Sent unconditionally to every engine that declares the option, before any
      configuration the caller asks for, so there is no window in which the
      first search of a session could come from a book.
    */
    if (this.options.some((option) => option.name === 'OwnBook')) {
      this.client.send('setoption name OwnBook value false');
    }
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
      this.assertUsable();
      for (const [name, value] of changes) {
        this.client.send(`setoption name ${name} value ${value}`);
      }
      await this.waitReady();
    });
    return this.queue;
  }

  analyse(request: AnalysisRequest, listener: AnalysisListener): AnalysisHandle {
    this.assertUsable();

    let root = Position.fromTrustedFen(request.fen);
    for (const move of request.moves ?? []) {
      const played = root.playUci(move);
      if (!played.ok) throw new EngineError('Invalid move in engine request.');
      root = Position.fromTrustedFen(played.value.after);
    }
    const rootTurn = root.turn;
    let resolve!: (analysis: EngineAnalysis) => void;
    let reject!: (error: unknown) => void;
    const finished = new Promise<EngineAnalysis>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    // Consumers may observe progress without awaiting completion. Still preserve
    // rejection for those that do, without a global unhandled rejection.
    void finished.catch(() => {});

    const search: Search = {
      id: this.nextSearchId++,
      root,
      request,
      listener,
      rootTurn,
      resolve,
      reject,
      lines: new Map(),
      snapshot: EMPTY_ANALYSIS(root.fen),
      cancelled: false,
      lastEmit: 0,
      timer: null,
    };

    this.enqueue(async () => {
      await this.stopActiveSearch();
      this.assertUsable();
      if (search.cancelled) {
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
          this.stop();
        }
      },
      finished,
    };
  }

  stop(): void {
    if (!this.active) return;
    this.active.cancelled = true;
    void this.enqueue(() => this.stopActiveSearch()).catch(() => {});
  }

  dispose(): void {
    if (this.disposed) return;
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
      const acknowledged = this.client.waitFor(
        (line) => /^bestmove(?:\s|$)/.test(line),
        10_000,
        'bestmove',
      );
      this.client.send('stop');
      await acknowledged;
    } catch (error) {
      // UCI output carries no request ID. Reusing a process after an unacknowledged
      // stop would allow its late output to masquerade as a new search.
      this.fail(error);
      throw error;
    }
  }

  private async waitReady(): Promise<string> {
    const ready = this.client.waitFor((line) => line.trim() === 'readyok', 20_000, 'readyok');
    this.client.send('isready');
    try {
      return await ready;
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  private fail(error: unknown): void {
    if (this.disposed) return;
    const search = this.active;
    this.active = null;
    this.disposed = true;
    if (search?.timer) clearTimeout(search.timer);
    search?.reject(error instanceof Error ? error : new EngineError(String(error)));
    this.client.dispose();
  }

  private handleLine(line: string): void {
    if (/^#(?:error|exit)(?:\s|$)/.test(line)) {
      this.fail(new EngineError('The engine process or connection failed.'));
      return;
    }
    const search = this.active;
    if (!search || this.disposed) return;

    const message = parseUciLine(line);
    if (message.kind === 'info') {
      this.applyInfo(search, message.info);
      return;
    }
    if (message.kind === 'bestmove') {
      /*
        An engine's answer is checked against the question. `bestmove` is
        recorded only if it is a legal move in the position the engine was
        given; otherwise it is dropped, and the analysis completes without
        one. A `bestmove a1h8` — a crashed engine, a protocol slip, a wrong
        position — would otherwise be drawn on the board as an arrow, and
        an arrow is a chess claim.
      */
      const best = message.best && search.root.playUci(message.best).ok ? message.best : null;
      search.snapshot = {
        ...search.snapshot,
        ...(best ? { bestMove: best } : {}),
        ...(best && message.ponder ? { ponder: message.ponder } : {}),
        complete: true,
      };
      const restricted = search.request.searchMoves;
      if (restricted && restricted.length > 0) {
        /*
          Asked at the end rather than assumed at the start. `searchmoves` is
          the one part of a search request an engine may ignore without saying
          so, and the check is the same either way: if the move it came back
          with is not one of the moves it was given, it did not do what it was
          asked, and nothing downstream may treat the result as if it had.
        */
        const allowed = new Set<string>(restricted);
        const answered = search.snapshot.bestMove;
        search.snapshot = {
          ...search.snapshot,
          restrictionHonoured: answered === undefined ? true : allowed.has(answered),
        };
      }
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
      if (!Number.isInteger(rank) || rank < 1 || rank > 500) return;
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
