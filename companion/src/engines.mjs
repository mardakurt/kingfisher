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

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const MAX_SESSIONS = 4;
/** Lines buffered for a stream that has not connected (or briefly dropped). */
const BACKLOG = 500;

export class EngineHost {
  #sessions = new Map();
  #registry;

  constructor(registry) {
    this.#registry = registry;
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

    // argv array, never a shell string: nothing in a request can become an
    // argument, and nothing can be interpreted as shell syntax.
    const child = spawn(entry.path, entry.args ?? [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: entry.cwd,
      env: { ...process.env, ...(entry.env ?? {}) },
    });

    const session = {
      id,
      engineKey,
      child,
      backlog: [],
      listeners: new Set(),
      startedAt: Date.now(),
      exited: false,
    };
    this.#sessions.set(id, session);

    let pending = '';
    const emit = (line) => {
      session.backlog.push(line);
      if (session.backlog.length > BACKLOG) session.backlog.shift();
      for (const listener of session.listeners) listener(line);
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
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
    session.child.stdin.write(`${String(line).replace(/[\r\n]+/g, ' ')}\n`);
  }

  /** Subscribe to a session's output. Returns an unsubscribe function. */
  subscribe(id, listener) {
    const session = this.#require(id);
    for (const line of session.backlog) listener(line);
    session.listeners.add(listener);
    return () => session.listeners.delete(listener);
  }

  stop(id) {
    const session = this.#sessions.get(id);
    if (!session) return;
    try {
      if (!session.exited) {
        session.child.stdin.write('quit\n');
        // A UCI engine mid-search may ignore `quit`; give it a moment, then end it.
        setTimeout(() => {
          if (!session.exited) session.child.kill('SIGKILL');
        }, 400).unref?.();
      }
    } catch {
      // Already gone.
    }
    this.#sessions.delete(id);
  }

  stopAll() {
    for (const id of [...this.#sessions.keys()]) this.stop(id);
  }

  list() {
    return [...this.#sessions.values()].map((session) => ({
      id: session.id,
      engine: session.engineKey,
      startedAt: session.startedAt,
      exited: session.exited,
    }));
  }

  #require(id) {
    const session = this.#sessions.get(id);
    if (!session) throw new Error('No such engine session.');
    return session;
  }
}
