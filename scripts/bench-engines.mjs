#!/usr/bin/env node
/**
 * How long an engine takes to become useful.
 *
 * "Startup" is not process spawn. What a user waits for is the engine
 * answering `uci` with `uciok`, accepting its options and answering
 * `isready` with `readyok` — after that a position can be analysed. A neural
 * engine loading a network spends most of its startup between those two, which
 * is exactly the part a spawn timer would miss.
 *
 * Native engines run through the companion, over the same HTTP and SSE
 * transport the browser uses, so the number includes the transport the user
 * actually pays for.
 *
 *   npm run companion                      # in another terminal
 *   KINGFISHER_COMPANION_TOKEN=… npm run bench:engines
 *
 * Stockfish WASM is measured separately by the browser E2E suite; this process
 * has no WebAssembly worker to load it into.
 */

import { performance } from 'node:perf_hooks';
import { env, exit } from 'node:process';

const PORT = Number(env.KINGFISHER_COMPANION_PORT ?? 4321);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = (env.KINGFISHER_COMPANION_TOKEN ?? '').trim();
const RUNS = Number(env.RUNS ?? 3);

if (!TOKEN) {
  console.error('Set KINGFISHER_COMPANION_TOKEN to the token from the companion pairing URL.');
  exit(1);
}

const auth = { Authorization: `Bearer ${TOKEN}` };

async function call(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...auth, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}

/**
 * Reads the engine's stdout as server-sent events and resolves on a predicate.
 *
 * Returns a reader rather than a promise per line: `uciok`, `readyok` and the
 * first `info depth` all arrive on one stream, and reopening it between them
 * would measure reconnection instead of the engine.
 */
async function openStream(session) {
  const response = await fetch(`${BASE}/engine/stream?session=${encodeURIComponent(session)}`, {
    headers: { ...auth, Accept: 'text/event-stream' },
  });
  if (!response.ok || !response.body) throw new Error('The engine stream did not open.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  const pending = [];

  const pump = async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffered += decoder.decode(value, { stream: true });
      const frames = buffered.split('\n\n');
      buffered = frames.pop() ?? '';
      for (const frame of frames) {
        for (const raw of frame.split('\n')) {
          if (!raw.startsWith('data: ')) continue;
          try {
            pending.push(JSON.parse(raw.slice(6)));
          } catch {
            // A heartbeat comment or a partial frame; nothing to record.
          }
        }
      }
    }
  };
  void pump();

  return {
    async until(matches, timeoutMs = 120_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        while (pending.length) {
          const line = pending.shift();
          if (typeof line === 'string' && matches(line)) return line;
          if (typeof line === 'string' && line.startsWith('#error')) {
            throw new Error(line);
          }
        }
        if (Date.now() > deadline) throw new Error('Timed out waiting for the engine.');
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    },
    close: () => void reader.cancel().catch(() => {}),
  };
}

async function timeEngine(id) {
  const spawnStarted = performance.now();
  const { session } = await call('/engine/start', { engine: id });
  const stream = await openStream(session);

  await call('/engine/send', { session, line: 'uci' });
  await stream.until((line) => line.trim() === 'uciok');
  const uciok = performance.now() - spawnStarted;

  await call('/engine/send', { session, line: 'isready' });
  await stream.until((line) => line.trim() === 'readyok');
  const ready = performance.now() - spawnStarted;

  await call('/engine/send', { session, line: 'position startpos' });
  await call('/engine/send', { session, line: 'go depth 10' });
  await stream.until((line) => line.startsWith('info') && line.includes(' pv '));
  const firstInfo = performance.now() - spawnStarted;
  await stream.until((line) => line.startsWith('bestmove'));
  const bestmove = performance.now() - spawnStarted;

  await call('/engine/send', { session, line: 'stop' });
  await call('/engine/stop', { session });
  stream.close();
  return { uciok, ready, firstInfo, bestmove };
}

const ms = (value) => `${value.toFixed(0)} ms`;
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function main() {
  const status = await call('/status');
  const engines = status.engines ?? [];
  if (engines.length === 0) {
    console.error('No native engines are installed. Run `npm run engines:install` first.');
    exit(1);
  }

  console.log(`\nKingfisher native engine startup — ${RUNS} runs each`);
  console.log(`node ${process.version} · ${process.platform}-${process.arch}`);
  console.log('Measured through the companion over HTTP + SSE, as the browser does.');
  console.log('Caches are warm: each engine is started once before it is timed.\n');

  const rows = [];
  for (const engine of engines) {
    try {
      // A discarded warm-up, so the first run does not also measure the
      // operating system reading the binary off disk for the first time.
      await timeEngine(engine.id);
      const runs = [];
      for (let index = 0; index < RUNS; index += 1) runs.push(await timeEngine(engine.id));
      rows.push({
        name: engine.name,
        uciok: median(runs.map((run) => run.uciok)),
        ready: median(runs.map((run) => run.ready)),
        firstInfo: median(runs.map((run) => run.firstInfo)),
        bestmove: median(runs.map((run) => run.bestmove)),
      });
    } catch (error) {
      rows.push({ name: engine.name, error: error.message });
    }
  }

  const width = Math.max(...rows.map((row) => row.name.length));
  console.log(`${'engine'.padEnd(width)}     uciok    readyok   first pv   bestmove (depth 10)`);
  for (const row of rows) {
    if (row.error) {
      console.log(`${row.name.padEnd(width)}   ${row.error}`);
      continue;
    }
    console.log(
      `${row.name.padEnd(width)}   ${ms(row.uciok).padStart(7)}  ${ms(row.ready).padStart(9)}` +
        `  ${ms(row.firstInfo).padStart(9)}  ${ms(row.bestmove).padStart(9)}`,
    );
  }
  console.log('\nAll timings are from the start request, not from process spawn.\n');
}

main().catch((error) => {
  console.error(error.message);
  exit(1);
});
