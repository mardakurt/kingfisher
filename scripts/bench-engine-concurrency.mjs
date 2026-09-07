#!/usr/bin/env node
/**
 * What each extra engine costs the ones already running.
 *
 * Phase 18 proved four native engines can search at once and each answers
 * about its own position. That settles a correctness question and leaves the
 * product one: the comparison view has two slots, and whether it should have
 * three or four is not a matter of whether the backend can do it.
 *
 * It is a chess question, and it has a chess answer. A user's machine is one
 * budget. Splitting it three ways instead of two does not give three opinions
 * for free — it gives three shallower opinions, and the third is only worth
 * having if the first two are still deep enough to be worth reading.
 *
 * So this holds the budget fixed, splits it N ways exactly as
 * `shareResources` does in the application, runs N sessions of the **same**
 * engine on the **same** position for the same movetime, and reports the depth
 * each one reached. One engine repeated is deliberate: with four different
 * engines the depths differ for reasons that have nothing to do with sharing.
 *
 * Live only. It drives real processes through a running companion.
 *
 *   npm run companion   # in another terminal
 *   KINGFISHER_COMPANION_TOKEN=… node scripts/bench-engine-concurrency.mjs
 *   … --engine stormphrax --movetime 4000 --threads 8 --hash 1024
 */

import { cpus, totalmem } from 'node:os';
import { argv, env, exit } from 'node:process';

const BASE = env.KINGFISHER_COMPANION_URL ?? 'http://127.0.0.1:4321';
const TOKEN = env.KINGFISHER_COMPANION_TOKEN ?? '';

const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : fallback;
};

/**
 * A middlegame with plenty to think about.
 *
 * The starting position is a bad choice for this: it is in every engine's book
 * shape, the tree is narrow, and depth there says more about pruning than
 * about how much machine an engine was given.
 */
const FEN = 'r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2Q1RK1 w - - 0 9';

const MOVETIME = Number(flag('movetime', 4000));
const THREADS = Number(flag('threads', Math.max(2, cpus().length)));
const HASH = Number(flag('hash', 1024));

/** The application's own split. `src/engine/presets.ts` does the same thing. */
const share = (total, sessions) => Math.max(1, Math.floor(total / Math.max(1, sessions)));

async function call(route, body) {
  const response = await fetch(`${BASE}${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`${route} → ${response.status} ${await response.text()}`);
  return response.json();
}

async function listen(session, sink) {
  const response = await fetch(
    `${BASE}/engine/stream?session=${encodeURIComponent(session)}&token=${encodeURIComponent(TOKEN)}`,
  );
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let cut = buffer.indexOf('\n');
    while (cut >= 0) {
      const line = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 1);
      if (line.startsWith('data: ')) {
        const payload = line.slice(6);
        if (payload !== '{}') sink(JSON.parse(payload));
      }
      cut = buffer.indexOf('\n');
    }
  }
}

/** Run `count` sessions of one engine on one position, and read each depth. */
async function round(engineId, count) {
  const threads = share(THREADS, count);
  const hashMb = share(HASH, count);
  const runs = [];
  for (let index = 0; index < count; index += 1) {
    const opened = await call('/engine/open', { engine: engineId });
    const run = { session: opened.id, depth: 0, nodes: 0, bestmove: null, clamped: false };
    runs.push(run);
    void listen(opened.id, (event) => {
      const line = typeof event === 'string' ? event : (event.line ?? '');
      if (line.startsWith('#')) {
        if (line.includes('clamped')) run.clamped = true;
        return;
      }
      const depth = /\bdepth (\d+)/.exec(line);
      if (depth && !line.includes('lowerbound') && !line.includes('upperbound')) {
        run.depth = Math.max(run.depth, Number(depth[1]));
      }
      const nodes = /\bnodes (\d+)/.exec(line);
      if (nodes) run.nodes = Math.max(run.nodes, Number(nodes[1]));
      if (line.startsWith('bestmove')) run.bestmove = line.split(/\s+/)[1] ?? null;
    });
  }

  for (const run of runs) await call('/engine/send', { session: run.session, line: 'uci' });
  for (const run of runs) {
    await call('/engine/send', {
      session: run.session,
      line: `setoption name Threads value ${threads}`,
    });
    await call('/engine/send', {
      session: run.session,
      line: `setoption name Hash value ${hashMb}`,
    });
    await call('/engine/send', { session: run.session, line: 'isready' });
    await call('/engine/send', { session: run.session, line: `position fen ${FEN}` });
  }

  const started = Date.now();
  for (const run of runs)
    await call('/engine/send', { session: run.session, line: `go movetime ${MOVETIME}` });
  while (Date.now() - started < MOVETIME + 6000 && runs.some((run) => run.bestmove === null)) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const elapsed = Date.now() - started;
  for (const run of runs) {
    try {
      await call('/engine/close', { session: run.session });
    } catch {
      /* closing a session that already exited is not a failure */
    }
  }
  return { count, threads, hashMb, elapsed, runs };
}

async function main() {
  if (!TOKEN) {
    console.error('Set KINGFISHER_COMPANION_TOKEN to the token the companion printed.');
    exit(1);
  }
  let status;
  try {
    status = await call('/status');
  } catch (error) {
    console.error(
      `No companion answered at ${BASE}. Start it with \`npm run companion\`.\n${error.message}`,
    );
    exit(1);
  }
  const engineId = flag('engine', status.engines[0]?.id);
  if (!engineId) {
    console.error('The companion has no native engine installed. Run `npm run engines:install`.');
    exit(1);
  }

  console.log('Kingfisher engine concurrency');
  console.log(`node ${process.version} · ${process.platform}-${process.arch}`);
  console.log(`${cpus().length} logical cores · ${(totalmem() / 1024 ** 3).toFixed(0)} GB`);
  console.log(
    `engine ${engineId} · movetime ${MOVETIME} ms · budget ${THREADS} threads, ${HASH} MB\n`,
  );
  console.log('engines  per engine        depths reached          median  vs one  wall'.padEnd(78));

  const results = [];
  for (const count of [1, 2, 3, 4]) {
    const result = await round(engineId, count);
    const depths = result.runs.map((run) => run.depth).sort((a, b) => a - b);
    const median = depths[Math.floor(depths.length / 2)] ?? 0;
    results.push({ ...result, median, depths });
    const first = results[0].median;
    console.log(
      `${String(count).padStart(4)}     ${String(result.threads).padStart(2)}t ${String(result.hashMb).padStart(5)}MB   ` +
        `${depths.join(', ').padEnd(22)}  ${String(median).padStart(6)}  ${(median - first >= 0 ? '+' : '') + (median - first)}     ` +
        `${(result.elapsed / 1000).toFixed(1)} s`,
    );
    if (result.runs.some((run) => run.bestmove === null)) {
      console.log('         (an engine returned no bestmove in time)');
    }
  }

  console.log('\nWhat the depths mean');
  const one = results[0].median;
  for (const result of results.slice(1)) {
    console.log(
      `  ${result.count} engines: each reaches depth ${result.median}, ` +
        `${one - result.median} shallower than one engine with the whole budget.`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  exit(1);
});
