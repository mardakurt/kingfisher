/**
 * Proving what an engine can actually do.
 *
 * A catalogue can *claim* an engine supports MultiPV, `searchmoves`, WDL and
 * Syzygy. Only the binary on this disk can settle it, and the answer changes
 * between versions and between builds of the same version. So Kingfisher does
 * not carry a capability table: it runs the engine once at install time and
 * records what happened.
 *
 * The checks are the ones the analysis panel depends on, in the order it
 * depends on them, and each is a real exchange rather than an inference from
 * the option list:
 *
 *   handshake     `uci` → `uciok`, and `isready` → `readyok`
 *   options       the `option name …` lines, kept verbatim
 *   search        `position startpos` + `go depth N` → a legal `bestmove`
 *   stop          `go infinite` + `stop` → `bestmove` promptly
 *   multipv       MultiPV=2 → two distinct `multipv` indices in one search
 *   searchmoves   `go searchmoves e2e4` → `bestmove e2e4`, and nothing else
 *   wdl           UCI_ShowWDL=true → `info … wdl w d l`
 *   syzygy        a `SyzygyPath` option exists
 *   malformed     an option that does not exist → the engine keeps working
 *
 * A failure is recorded, not thrown. An engine that cannot do MultiPV is a
 * usable engine with one fewer feature; an engine that fails the handshake or
 * cannot find a move is not installed at all.
 */

import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT = 25_000;

/** A conversation with one engine process, line by line. */
class UciProcess {
  #child;
  #buffer = '';
  #lines = [];
  #waiters = [];
  #exited = false;

  constructor(binary, args = [], cwd) {
    // argv array, never a shell string. See docs/ENGINES.md.
    this.#child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'], cwd });
    this.#child.stdout.setEncoding('utf8');
    this.#child.stdout.on('data', (chunk) => this.#ingest(chunk));
    this.#child.stderr.resume();
    this.#child.on('exit', () => {
      this.#exited = true;
      for (const waiter of this.#waiters.splice(0)) waiter.reject(new Error('The engine exited.'));
    });
    this.#child.on('error', (error) => {
      this.#exited = true;
      for (const waiter of this.#waiters.splice(0)) waiter.reject(error);
    });
  }

  get exited() {
    return this.#exited;
  }

  #ingest(chunk) {
    this.#buffer += chunk;
    const parts = this.#buffer.split(/\r?\n/);
    this.#buffer = parts.pop() ?? '';
    for (const raw of parts) {
      const line = raw.trim();
      if (!line) continue;
      this.#lines.push(line);
      for (const waiter of [...this.#waiters]) {
        if (waiter.matches(line)) {
          this.#waiters.splice(this.#waiters.indexOf(waiter), 1);
          waiter.resolve(line);
        }
      }
    }
  }

  send(line) {
    if (this.#exited) throw new Error('The engine exited.');
    this.#child.stdin.write(`${line}\n`);
  }

  /** Wait for the first line matching `matches`, or fail after `timeoutMs`. */
  expect(matches, timeoutMs = 10_000) {
    const existing = this.#lines.find(matches);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { matches, resolve, reject };
      this.#waiters.push(waiter);
      setTimeout(() => {
        const index = this.#waiters.indexOf(waiter);
        if (index >= 0) {
          this.#waiters.splice(index, 1);
          reject(new Error('The engine did not answer in time.'));
        }
      }, timeoutMs).unref?.();
    });
  }

  /** Everything seen so far, so a check can look back over a whole search. */
  seen() {
    return [...this.#lines];
  }

  clear() {
    this.#lines = [];
  }

  async close() {
    try {
      this.send('quit');
    } catch {
      // Already gone.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      if (!this.#child.killed) this.#child.kill('SIGKILL');
    } catch {
      // Already gone.
    }
  }
}

const optionNames = (lines) =>
  lines
    .filter((line) => line.startsWith('option name '))
    .map((line) => /^option name (.+?) type /.exec(line)?.[1]?.trim())
    .filter((name) => typeof name === 'string');

/**
 * Run the whole matrix against one binary.
 *
 * Returns a report even when individual checks fail; throws only when the
 * engine cannot be talked to at all, because that is the one outcome that
 * means "do not install this".
 */
export async function verifyEngine(binary, { args = [], cwd, timeoutMs = DEFAULT_TIMEOUT } = {}) {
  const engine = new UciProcess(binary, args, cwd);
  const checks = {};
  const record = async (name, run) => {
    try {
      checks[name] = { ok: Boolean(await run()), error: null };
    } catch (error) {
      checks[name] = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  const deadline = setTimeout(() => void engine.close(), timeoutMs);
  try {
    engine.send('uci');
    const idLines = [];
    await engine.expect((line) => line === 'uciok', 10_000);
    idLines.push(...engine.seen());
    const options = optionNames(idLines);
    const name =
      idLines
        .find((line) => line.startsWith('id name '))
        ?.slice(8)
        .trim() ?? null;
    const author =
      idLines
        .find((line) => line.startsWith('id author '))
        ?.slice(10)
        .trim() ?? null;
    checks.handshake = { ok: true, error: null };

    engine.send('isready');
    await engine.expect((line) => line === 'readyok', 10_000);
    checks.isready = { ok: true, error: null };

    await record('search', async () => {
      engine.clear();
      engine.send('ucinewgame');
      engine.send('position startpos');
      engine.send('go depth 6');
      const best = await engine.expect((line) => line.startsWith('bestmove '), 15_000);
      return /^bestmove [a-h][1-8][a-h][1-8]/.test(best);
    });

    await record('stop', async () => {
      engine.clear();
      engine.send('position startpos');
      engine.send('go infinite');
      await new Promise((resolve) => setTimeout(resolve, 300));
      engine.send('stop');
      const best = await engine.expect((line) => line.startsWith('bestmove '), 8_000);
      return best.length > 0;
    });

    await record('multipv', async () => {
      if (!options.includes('MultiPV')) return false;
      engine.clear();
      engine.send('setoption name MultiPV value 2');
      engine.send('position startpos');
      engine.send('go depth 8');
      await engine.expect((line) => line.startsWith('bestmove '), 15_000);
      const indices = new Set(
        engine
          .seen()
          .map((line) => /\bmultipv (\d+)/.exec(line)?.[1])
          .filter(Boolean),
      );
      engine.send('setoption name MultiPV value 1');
      return indices.size >= 2;
    });

    await record('searchmoves', async () => {
      engine.clear();
      engine.send('position startpos');
      engine.send('go depth 8 searchmoves a2a3');
      const best = await engine.expect((line) => line.startsWith('bestmove '), 15_000);
      // The only legal answer when the search is restricted to one move.
      return best.startsWith('bestmove a2a3');
    });

    await record('wdl', async () => {
      if (!options.includes('UCI_ShowWDL')) return false;
      engine.clear();
      engine.send('setoption name UCI_ShowWDL value true');
      engine.send('position startpos');
      engine.send('go depth 8');
      await engine.expect((line) => line.startsWith('bestmove '), 15_000);
      return engine.seen().some((line) => /\bwdl \d+ \d+ \d+/.test(line));
    });

    checks.syzygy = { ok: options.includes('SyzygyPath'), error: null };

    await record('malformed', async () => {
      engine.clear();
      // An option no engine has. The requirement is that it is ignored and the
      // engine keeps working — not that it complains.
      engine.send('setoption name KingfisherNotAnOption value 1');
      engine.send('isready');
      await engine.expect((line) => line === 'readyok', 8_000);
      return true;
    });

    return {
      name,
      author,
      options,
      checks,
      capabilities: {
        multipv: checks.multipv?.ok === true,
        searchmoves: checks.searchmoves?.ok === true,
        wdl: checks.wdl?.ok === true,
        syzygy: checks.syzygy?.ok === true,
        threads: options.includes('Threads'),
        hash: options.includes('Hash'),
      },
      verifiedAt: Date.now(),
    };
  } finally {
    clearTimeout(deadline);
    await engine.close();
  }
}
