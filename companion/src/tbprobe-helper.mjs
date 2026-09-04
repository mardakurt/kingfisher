/**
 * The managed Syzygy probe helper.
 *
 * Phase 11 could read local tables only if the user separately started a
 * `lila-tablebase`-shaped server themselves. That is a reasonable thing to ask
 * of a developer and an unreasonable thing to ask of a chess player, and it was
 * the largest remaining "you have to leave Kingfisher to do this" in the
 * application.
 *
 * So the companion owns a helper process instead: it starts it when a directory
 * is configured, keeps one alive, restarts it if it dies, and stops it on
 * shutdown. The user selects a folder and that is the whole procedure.
 *
 * Three properties this class exists to guarantee:
 *
 * **One request at a time.** The helper answers one line per line, in order.
 * Requests are queued rather than interleaved, because two overlapping probes
 * on one stdout stream would each be able to read the other's answer — and a
 * tablebase result attributed to the wrong position is the worst possible bug
 * in a feature whose whole claim is that it is proof rather than opinion.
 *
 * **A deadline on every request.** A helper that has wedged rather than exited
 * accepts a line and never answers. Without a timeout that probe never settles
 * and the panel waits for ever.
 *
 * **Failure is a state, not an exception.** A missing binary, an unreadable
 * directory or a crashed process are all normal conditions whose correct
 * response is to answer the remote provider instead, with the provenance
 * changed. They are reported, never thrown at the route.
 */

import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';

/** Long enough for a cold seven-piece probe off spinning disk, short enough to notice. */
const PROBE_TIMEOUT_MS = 8_000;
/** The helper prints its banner as soon as `tb_init` returns. */
const START_TIMEOUT_MS = 20_000;

export class TablebaseHelper {
  #binary;
  #path = null;
  #child = null;
  #buffer = '';
  /** Resolvers for requests sent and not yet answered, oldest first. */
  #pending = [];
  #ready = null;
  #largest = 0;
  #error = null;
  #starts = 0;

  constructor(binary) {
    this.#binary = binary;
  }

  get configuredPath() {
    return this.#path;
  }

  /** Whether a probe can be attempted right now. */
  get running() {
    return this.#child !== null && this.#child.exitCode === null;
  }

  get largest() {
    return this.#largest;
  }

  get lastError() {
    return this.#error;
  }

  get restarts() {
    // Reported in status so an unstable helper is visible rather than merely
    // slow: a process that has restarted forty times is a fact worth showing.
    return Math.max(0, this.#starts - 1);
  }

  /**
   * Point the helper at a directory, starting or restarting it.
   *
   * Returns a state rather than throwing. `available: false` with a reason is
   * an ordinary outcome — no binary built, no such directory, no tables in it.
   */
  async use(path) {
    if (this.#path === path && this.running) return this.state();
    await this.stop();
    this.#path = path || null;
    this.#error = null;
    if (!this.#path) return this.state();
    return this.start();
  }

  async start() {
    if (!this.#binary || !existsSync(this.#binary)) {
      this.#error = 'The local probe helper has not been built. Run `npm run tablebase:install`.';
      return this.state();
    }
    if (!this.#path) {
      this.#error = 'No tablebase directory is configured.';
      return this.state();
    }
    try {
      if (!statSync(this.#path).isDirectory()) {
        this.#error = 'That path is not a directory.';
        return this.state();
      }
    } catch {
      this.#error = 'That directory could not be read.';
      return this.state();
    }

    this.#starts += 1;
    const child = spawn(this.#binary, [`--path=${this.#path}`], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.#child = child;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => this.#consume(chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      this.#error = String(chunk).trim().slice(0, 200);
    });
    /*
      Every queued request is failed when the process goes, rather than left to
      time out one by one. A crash is knowable immediately and the caller
      should hear about it immediately.
    */
    const abandon = (reason) => {
      for (const request of this.#pending.splice(0)) request.reject(new Error(reason));
      if (this.#child === child) this.#child = null;
    };
    child.on('error', (error) => {
      this.#error = error.message;
      abandon('The tablebase helper could not be started.');
    });
    child.on('exit', (code, signal) => {
      abandon(
        signal
          ? `The tablebase helper stopped (${signal}).`
          : `The tablebase helper exited with code ${code}.`,
      );
    });

    const ready = await this.#awaitBanner();
    if (!ready.ok) {
      await this.stop();
      this.#error = ready.reason;
    }
    return this.state();
  }

  #awaitBanner() {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.#ready = null;
        resolve({ ok: false, reason: 'The tablebase helper did not start in time.' });
      }, START_TIMEOUT_MS);
      this.#ready = (message) => {
        clearTimeout(timer);
        this.#ready = null;
        if (message && message.ready === true) {
          this.#largest = Number(message.largest) || 0;
          resolve({ ok: true });
          return;
        }
        resolve({
          ok: false,
          reason: (message && message.reason) || 'The tablebase helper refused to start.',
        });
      };
    });
  }

  #consume(chunk) {
    this.#buffer += chunk;
    for (;;) {
      const newline = this.#buffer.indexOf('\n');
      if (newline === -1) break;
      const line = this.#buffer.slice(0, newline).trim();
      this.#buffer = this.#buffer.slice(newline + 1);
      if (!line) continue;

      let message;
      try {
        message = JSON.parse(line);
      } catch {
        // A line that is not JSON is a bug in the helper, not a probe result.
        // Recorded and dropped rather than handed to a waiting request.
        this.#error = `Unreadable helper output: ${line.slice(0, 120)}`;
        continue;
      }

      if (this.#ready) {
        this.#ready(message);
        continue;
      }
      const request = this.#pending.shift();
      if (request) request.resolve(message);
    }
  }

  /**
   * Probe one position.
   *
   * Queued behind whatever is already in flight, which is what keeps answers
   * matched to their questions on a single stream.
   */
  async probe(fen) {
    if (!this.running) {
      const started = await this.start();
      if (!started.available) {
        return { ok: false, reason: started.reason ?? 'The local tablebase is unavailable.' };
      }
    }
    const child = this.#child;
    if (!child) return { ok: false, reason: 'The local tablebase is unavailable.' };

    return new Promise((resolve) => {
      const request = {
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
        reject: (error) => {
          clearTimeout(timer);
          resolve({ ok: false, reason: error.message });
        },
      };
      const timer = setTimeout(() => {
        const index = this.#pending.indexOf(request);
        if (index !== -1) this.#pending.splice(index, 1);
        resolve({ ok: false, reason: 'The local tablebase did not answer in time.' });
      }, PROBE_TIMEOUT_MS);

      this.#pending.push(request);
      child.stdin.write(`${fen}\n`);
    });
  }

  /** What the panel prints. Never asserts more than the helper has reported. */
  state() {
    return {
      available: this.running && this.#largest > 0,
      running: this.running,
      built: Boolean(this.#binary && existsSync(this.#binary)),
      path: this.#path,
      largest: this.#largest,
      restarts: this.restarts,
      ...(this.#error ? { reason: this.#error } : {}),
    };
  }

  async stop() {
    const child = this.#child;
    this.#child = null;
    this.#largest = 0;
    for (const request of this.#pending.splice(0)) {
      request.reject(new Error('The tablebase helper was stopped.'));
    }
    if (!child || child.exitCode !== null) return;
    try {
      child.stdin.write('quit\n');
    } catch {
      // Already gone; the kill below is the fallback.
    }
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 1_000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
