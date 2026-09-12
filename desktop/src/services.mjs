/**
 * The two local processes a desktop Kingfisher owns, and their shutdown.
 *
 * On the web the companion is something a person starts in a terminal and
 * pairs by pasting a token. On the desktop that is infrastructure, and this
 * module is where it becomes invisible: the shell starts both processes, hands
 * the renderer a URL and a token it never had to see, and — the part that
 * matters — guarantees that closing the window ends every native process the
 * session started.
 *
 * ## Why a child process rather than the main process
 *
 * The companion spawns native engines and opens multi-gigabyte SQLite files. A
 * fault in either would take a window down with it if it shared the process,
 * and the engine work already runs off the request thread precisely so that a
 * search cannot block a query. Keeping it a child preserves both, and costs
 * one pipe.
 *
 * It is forked with `ELECTRON_RUN_AS_NODE`, so it runs under the same Node the
 * shell ships (24.20 in Electron 44) rather than under a Node the user may or
 * may not have installed. `node:sqlite` and `worker_threads` are both present
 * there — measured, in `docs/adr/0049-the-desktop-shell.md`, because the whole
 * design rests on it.
 *
 * ## The shutdown contract
 *
 * Three things must be true after `stopAll()` resolves, and each has a reason
 * it is not automatic:
 *
 *  1. **The companion ran its own shutdown.** It is sent `SIGTERM`, which its
 *     handler turns into `engines.stopAll()`. A `SIGKILL` would skip that, and
 *     engines are spawned *detached* — in their own process groups, so that
 *     stopping one stops its helpers — which is exactly what makes them
 *     survive a parent that dies without asking them to stop.
 *  2. **It is given time, and then not given more.** A process that will not
 *     exit is escalated rather than waited on for ever, because a shell that
 *     hangs on quit is a shell people force-quit, which is the orphan case
 *     again.
 *  3. **A shell that crashes still ends them.** `SIGTERM` covers an orderly
 *     quit. It does not cover the shell being killed, so the companion also
 *     watches its IPC channel and shuts down when the parent goes away. That
 *     half lives in `companion/src/server.mjs`; this half is what opens the
 *     channel by forking with one.
 */

import { fork } from 'node:child_process';
import { createServer } from 'node:net';
import { get } from 'node:http';

/** How long a child is given to exit on its own before it is escalated. */
export const GRACE_MS = 4_000;

/** How long a service is given to answer its health check before it is failed. */
export const READY_TIMEOUT_MS = 30_000;

/**
 * A port nothing is listening on.
 *
 * Bound to loopback and released before the child is told to use it. That is a
 * race in principle — something else could take the port in between — and it is
 * the same race every "find a free port" does. It is bounded here by failing
 * loudly on start rather than by retrying silently, so a port collision reads
 * as a port collision instead of as a companion that never became ready.
 */
export function freePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, host, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Resolves once `url` answers with any HTTP status, or rejects on timeout. */
export function waitForHttp(url, { timeoutMs = READY_TIMEOUT_MS, intervalMs = 120 } = {}) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = get(url, (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      });
      request.on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for ${url} after ${timeoutMs} ms.`));
          return;
        }
        setTimeout(attempt, intervalMs);
      });
    };
    attempt();
  });
}

/**
 * One forked service, with a start that fails rather than hangs.
 *
 * `start()` resolves when the health URL answers *or* rejects when the child
 * exits first — the second case is the one worth having. Waiting only on the
 * URL turns "the companion crashed on boot" into a thirty-second pause
 * followed by a timeout that names the symptom instead of the cause.
 */
export class Service {
  #child = null;
  #exited = null;
  #gone = false;
  #log = [];

  constructor({
    name,
    entry,
    args = [],
    env = {},
    healthUrl,
    cwd,
    forkImpl = fork,
    onUnexpectedExit = null,
  }) {
    this.name = name;
    this.entry = entry;
    this.args = args;
    this.env = env;
    this.healthUrl = healthUrl;
    this.cwd = cwd;
    this.forkImpl = forkImpl;
    /**
     * Called when the child exits without `stop()` having been asked for —
     * a crash, a kill from outside, the operating system. `stop()` sets a
     * flag first, so an orderly shutdown never looks like a crash.
     */
    this.onUnexpectedExit = onUnexpectedExit;
    this.#stopping = false;
  }

  #stopping = false;

  get pid() {
    return this.#child?.pid ?? null;
  }

  get running() {
    /*
      `exitCode` is null for a child that died of a *signal* — Node reports
      that in `signalCode` instead — so a companion killed from outside
      (a crash, `kill -9`, the operating system under memory pressure) read
      as running for ever, and Diagnostics said so. The exit event is the
      truth, whichever way the child went.
    */
    return Boolean(this.#child) && !this.#gone && !this.#child.killed;
  }

  /** The last lines the service wrote. Bounded; diagnostics, never a protocol. */
  get log() {
    return [...this.#log];
  }

  #record(chunk) {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line.trim()) continue;
      this.#log.push(line);
      if (this.#log.length > 200) this.#log.shift();
    }
  }

  async start() {
    if (this.running) return this;
    const child = this.forkImpl(this.entry, this.args, {
      cwd: this.cwd,
      // The channel is not used for messages. It exists so that the child can
      // notice this process going away; see the shutdown contract above.
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { ...this.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    this.#child = child;
    this.#gone = false;
    child.stdout?.on('data', (chunk) => this.#record(chunk));
    child.stderr?.on('data', (chunk) => this.#record(chunk));

    this.#stopping = false;
    this.#exited = new Promise((resolve) => {
      child.once('exit', (code, signal) => {
        this.#gone = true;
        this.#record(`[exited: ${code ?? signal}]`);
        resolve({ code, signal });
        if (!this.#stopping && typeof this.onUnexpectedExit === 'function') {
          try {
            this.onUnexpectedExit({ code, signal });
          } catch {
            /* a listener's failure is not the service's */
          }
        }
      });
    });

    const died = this.#exited.then(({ code, signal }) => {
      throw new Error(
        `${this.name} exited before it was ready (${code ?? signal}).` +
          (this.#log.length ? ` Last output: ${this.#log.slice(-3).join(' / ')}` : ''),
      );
    });

    if (this.healthUrl) await Promise.race([waitForHttp(this.healthUrl), died]);
    return this;
  }

  /**
   * Close the IPC channel without signalling, and without waiting.
   *
   * This is what a shell that is killed rather than quit looks like from the
   * child's side, and it is the only way to test the watchdog that covers that
   * case. Named for what it is: nothing in the shell calls it.
   */
  disconnectForTest() {
    this.#child?.disconnect?.();
  }

  /**
   * Ask the service to stop, and make sure it did.
   *
   * Resolves with how it went, rather than throwing: this runs on quit, and a
   * shell that throws while closing leaves exactly the processes it was trying
   * to end.
   */
  async stop({ graceMs = GRACE_MS } = {}) {
    const child = this.#child;
    this.#stopping = true;
    if (!child || this.#gone) return { stopped: true, escalated: false };
    const exited = this.#exited ?? Promise.resolve({ code: null, signal: null });

    child.kill('SIGTERM');
    const graceful = await Promise.race([
      exited.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), graceMs)),
    ]);
    if (graceful) return { stopped: true, escalated: false };

    child.kill('SIGKILL');
    const killed = await Promise.race([
      exited.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), graceMs)),
    ]);
    return { stopped: killed, escalated: true };
  }
}
