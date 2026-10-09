/**
 * Native UCI engines as child processes.
 *
 * A session is one running engine. The browser writes UCI lines in over POST
 * and reads them out over Server-Sent Events — deliberately not WebSocket,
 * because SSE needs no protocol implementation, no dependency, and no upgrade
 * handshake, and UCI output is one-directional and line-based anyway.
 *
 * Nothing here understands chess. Parsing `info depth ... score cp ...` is the
 * browser's job, in `src/engine/uci.ts`, which already does it for the WASM
 * engine — one parser for every engine is the whole point of the abstraction.
 */

import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import {
  clampCommand,
  engineEnvironment,
  resourceCeiling,
  truncatePending,
} from './engine-sandbox.mjs';

const MAX_SESSIONS = 4;
/** Lines buffered so a stream can resume from a cursor after a drop. */
const BACKLOG = 500;
/**
 * How long an engine is kept after its last event-stream subscriber leaves.
 *
 * EventSource reconnects by itself. Stopping at the instant the socket closes
 * kills a search that was only on a blip; waiting forever is how a reload
 * during infinite analysis fills the four session slots with engines still in
 * `go`. The stream announces a shorter retry than this, and the timer is
 * referenced so a quit cannot discard it.
 */
export const SUBSCRIBER_GRACE_MS = 2_000;

/**
 * End a child and anything it started.
 *
 * POSIX signals the negated process-group id, which works because engines are
 * spawned detached. Windows has no equivalent signal, so the child tree is
 * walked by `taskkill /T` instead — a different mechanism, which is why
 * `GROUP_TERMINATION` names which one this platform got rather than letting
 * "we kill the process group" stand as a claim on both.
 *
 * Falls back to killing the child alone if the group signal fails: a process
 * that is already gone raises ESRCH, and refusing to fall back would leave a
 * live engine because a dead one could not be signalled twice.
 */
function terminateGroup(child) {
  const pid = child.pid;
  if (!pid) return;
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {});
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // Already gone.
    }
  }
}

export class EngineHost {
  #sessions = new Map();
  #registry;
  #ceiling;

  /**
   * `ceiling` is injectable so the resource limits can be tested against a
   * stated machine rather than against whatever runs the suite. It defaults to
   * this machine's cores and memory divided by the session limit — see
   * `resourceCeiling`, and note that the divisor is `MAX_SESSIONS` rather than
   * the number running now: a ceiling that rose as sessions closed would let
   * the first engine of four take everything and keep it.
   */
  constructor(registry, options = {}) {
    this.#registry = registry;
    this.#ceiling = options.ceiling ?? resourceCeiling({ sessions: MAX_SESSIONS });
  }

  /** The per-session resource ceiling, so the interface can show it. */
  get ceiling() {
    return { ...this.#ceiling };
  }

  /**
   * Start an engine from the installed manifest.
   *
   * The binary comes from the registry by key. A request never carries a path,
   * so no request can start something that was not installed.
   */
  start(engineKey) {
    if (this.#sessions.size >= MAX_SESSIONS) {
      throw new Error(`At most ${MAX_SESSIONS} engines may run at once.`);
    }
    const entry = this.#registry.resolve(engineKey);
    const id = randomUUID();

    /*
      argv array, never a shell string: nothing in a request can become an
      argument, and nothing can be interpreted as shell syntax.

      `env` is an allowlist plus this engine's own configured variables, not
      the companion's environment — see `engine-sandbox.mjs`. `detached` puts
      the engine in its own process group so that stopping it stops anything it
      started; the exit handlers below are what keep that from leaving orphans
      if the companion goes away.
    */
    const child = spawn(entry.path, entry.args ?? [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: entry.cwd,
      env: engineEnvironment(process.env, entry.env ?? {}),
      detached: process.platform !== 'win32',
    });

    const session = {
      id,
      engineKey,
      child,
      /** Monotonic ids. A subscriber resumes after the last id it has seen. */
      nextId: 0,
      backlog: [],
      listeners: new Set(),
      startedAt: Date.now(),
      exited: false,
      clamped: [],
      idleTimer: null,
      writes: Promise.resolve(),
      reaping: null,
    };
    this.#sessions.set(id, session);

    let pending = '';
    const emit = (line) => {
      const entry = { id: ++session.nextId, line };
      session.backlog.push(entry);
      if (session.backlog.length > BACKLOG) session.backlog.shift();
      for (const listener of session.listeners) listener(entry.line, entry.id);
    };
    session.emit = emit;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      /*
        A partial line is held until its newline arrives. Something writing
        without one is not speaking UCI, and holding it would grow until the
        companion died — so it is cut, and the cut is reported rather than
        hidden, because silently losing engine output is how a stale line
        becomes evidence about the wrong position.
      */
      const cut = truncatePending(pending);
      if (cut.overflowed) {
        pending = cut.pending;
        emit('#error The engine wrote a line longer than 64 kB; it was discarded.');
      }
      for (const line of lines) if (line.trim()) emit(line);
    });

    // Engines write real diagnostics to stderr (Lc0 announces its backend
    // there). Tagging rather than discarding keeps that visible in the UI.
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (line.trim()) emit(`#stderr ${line}`);
      }
    });

    child.on('error', (error) => {
      emit(`#error ${error.message}`);
      session.exited = true;
    });
    child.on('exit', (code, signal) => {
      session.exited = true;
      emit(`#exit ${code ?? signal ?? 'unknown'}`);
      for (const listener of session.listeners) listener(null);
    });

    return { id, engine: entry };
  }

  send(id, line) {
    const session = this.#require(id);
    if (session.exited) throw new Error('That engine has exited.');
    // One command per line, and never anything with a newline smuggled in.
    const flattened = String(line).replace(/[\r\n]+/g, ' ');
    const { line: sent, clamped } = clampCommand(flattened, this.#ceiling);
    if (clamped) {
      /*
        Reported into the session's own output, not swallowed. An engine given
        fewer threads than it was asked for is a fact about this search, and a
        reader comparing two engines' node counts is entitled to know it.
      */
      session.clamped.push(clamped);
      session.emit(
        `#limit ${clamped.option} ${clamped.requested} exceeds this machine's ceiling of ${clamped.allowed}; ${clamped.allowed} was used.`,
      );
    }
    /*
      One write queue per session. Two POSTs can finish reading their bodies
      in either order; chaining here is what keeps `position` ahead of `go`
      and a `stop` from landing after the next `go`.
    */
    const job = session.writes.then(() => this.#write(session, sent));
    session.writes = job.then(
      () => undefined,
      () => undefined,
    );
    return job;
  }

  /**
   * Subscribe to a session's output.
   *
   * `after` is the last event id the subscriber has already applied. Lines at
   * or before that id are not replayed: an EventSource reconnect would
   * otherwise deliver an old `info` or `bestmove` as if the engine had just
   * written it. A first connection passes no cursor and still receives the
   * backlog, which is how a stream opened after the handshake sees `uciok`.
   *
   * Returns an unsubscribe function. The last subscriber arms a grace timer;
   * a reconnect within it keeps the process.
   */
  subscribe(id, listener, after = null) {
    const session = this.#require(id);
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }
    const cursor = typeof after === 'number' && Number.isFinite(after) ? after : null;
    for (const entry of session.backlog) {
      if (cursor !== null && entry.id <= cursor) continue;
      listener(entry.line, entry.id);
    }
    session.listeners.add(listener);
    return () => {
      session.listeners.delete(listener);
      this.#armIdle(session);
    };
  }

  /**
   * Ask the engine to quit, then kill its process group if it is still there.
   *
   * The returned promise settles when the process has exited, or after the
   * group has been signalled and the exit has been observed. The kill timer
   * stays referenced: an unref'd timer is discarded when a quit with no open
   * connections calls `process.exit` on the next turn, and the engine — spawned
   * detached — keeps running.
   */
  stop(id) {
    const session = this.#sessions.get(id);
    if (!session) return Promise.resolve();
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }
    this.#sessions.delete(id);
    return this.#reap(session);
  }

  stopAll() {
    return Promise.all([...this.#sessions.keys()].map((id) => this.stop(id)));
  }

  list() {
    return [...this.#sessions.values()].map((session) => ({
      id: session.id,
      engine: session.engineKey,
      startedAt: session.startedAt,
      exited: session.exited,
      clamped: [...session.clamped],
    }));
  }

  #require(id) {
    const session = this.#sessions.get(id);
    if (!session) throw new Error('No such engine session.');
    return session;
  }

  #write(session, sent) {
    if (session.exited) return Promise.reject(new Error('That engine has exited.'));
    return new Promise((resolve, reject) => {
      try {
        session.child.stdin.write(`${sent}\n`, (error) => {
          if (error) reject(error);
          else resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  #armIdle(session) {
    if (session.listeners.size > 0 || session.exited) return;
    if (!this.#sessions.has(session.id) || session.idleTimer) return;
    session.idleTimer = setTimeout(() => {
      session.idleTimer = null;
      if (session.listeners.size === 0 && this.#sessions.has(session.id)) {
        void this.stop(session.id);
      }
    }, SUBSCRIBER_GRACE_MS);
  }

  #reap(session) {
    if (session.reaping) return session.reaping;
    session.reaping = new Promise((resolve) => {
      const done = () => resolve();
      if (
        session.exited ||
        !session.child.pid ||
        session.child.exitCode !== null ||
        session.child.signalCode !== null
      ) {
        done();
        return;
      }
      try {
        session.child.stdin.write('quit\n', () => {});
      } catch {
        // The pipe may already be closed. The kill below is the fallback.
      }
      // Referenced on purpose. See `stop`.
      const killTimer = setTimeout(() => {
        if (!session.exited) terminateGroup(session.child);
      }, 400);
      const onExit = () => {
        clearTimeout(killTimer);
        done();
      };
      session.child.once('exit', onExit);
      if (session.exited || session.child.exitCode !== null || session.child.signalCode !== null) {
        session.child.removeListener('exit', onExit);
        clearTimeout(killTimer);
        done();
      }
    });
    return session.reaping;
  }
}
