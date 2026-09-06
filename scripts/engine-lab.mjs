#!/usr/bin/env node
/**
 * Four engines at once, each asked about a different position.
 *
 * `npm run engines:qualify` drives one engine at a time. That answers "does
 * this engine stay correct", and leaves the question a comparison view
 * actually depends on: when four native processes are searching simultaneously
 * through one companion, does each session get its own engine's answer about
 * its own position?
 *
 * UCI output carries no request identity. Every line an engine writes is
 * attributed to whatever search the session believes is running, so an
 * attribution defect between concurrent sessions would look exactly like a
 * working comparison — four panels, four evaluations, silently swapped. The
 * check has to be a fact about chess rather than about plumbing.
 *
 * So the four positions below have **pairwise disjoint legal-move sets**. A
 * bestmove from the wrong session is not merely suspicious, it is illegal in
 * the position it arrived at, and this script says so by name.
 *
 * Live only. It drives real processes through a running companion; there is
 * nothing mocked in it, and if no companion is running it says that and stops
 * rather than reporting a result it did not obtain.
 *
 *   node scripts/engine-lab.mjs
 *   node scripts/engine-lab.mjs --engines stormphrax,plentychess --movetime 4000
 *
 * Reads KINGFISHER_COMPANION_URL (default http://127.0.0.1:4321) and
 * KINGFISHER_COMPANION_TOKEN.
 */

import { argv, env, exit } from 'node:process';

/**
 * The board positions, and every legal move in each.
 *
 * Generated once with the rules library behind `src/chess/position.ts` and
 * pasted here, the same way `qualify-engines.mjs` carries its expectations: a
 * script under `scripts/` is outside the chess.js boundary and does not get to
 * import it. Regenerate by loading each FEN and listing `moves({verbose:true})`
 * as `from + to + promotion`.
 *
 * The disjointness is the whole design and is asserted below rather than
 * trusted, because editing one FEN without re-checking would quietly turn this
 * into a test that cannot fail.
 */
const POSITIONS = [
  {
    id: 'A',
    label: 'rook ending, White to move',
    fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
    legal: [
      'a1a2',
      'a1a3',
      'a1a4',
      'a1a5',
      'a1a6',
      'a1a7',
      'a1a8',
      'a1b1',
      'a1c1',
      'a1d1',
      'a1e1',
      'a1f1',
      'f2f3',
      'f2f4',
      'g1f1',
      'g1h1',
      'g2g3',
      'g2g4',
      'h2h3',
      'h2h4',
    ],
  },
  {
    id: 'B',
    label: 'two connected pawns, White to move',
    fen: '4k3/8/8/8/8/8/1PP5/1K6 w - - 0 1',
    legal: ['b1a1', 'b1a2', 'b1c1', 'b2b3', 'b2b4', 'c2c3', 'c2c4'],
  },
  {
    id: 'C',
    label: 'knight against pawns, Black to move',
    fen: '8/2p5/1p1k4/8/8/4P3/5N2/6K1 b - - 0 1',
    legal: ['b6b5', 'c7c5', 'c7c6', 'd6c5', 'd6c6', 'd6d5', 'd6d7', 'd6e5', 'd6e6', 'd6e7'],
  },
  {
    id: 'D',
    label: 'queenside castling available, Black to move',
    fen: 'r3k3/4pppp/8/8/8/8/8/4K3 b q - 0 1',
    legal: [
      'a8a1',
      'a8a2',
      'a8a3',
      'a8a4',
      'a8a5',
      'a8a6',
      'a8a7',
      'a8b8',
      'a8c8',
      'a8d8',
      'e7e5',
      'e7e6',
      'e8c8',
      'e8d7',
      'e8d8',
      'e8f8',
      'f7f5',
      'f7f6',
      'g7g5',
      'g7g6',
      'h7h5',
      'h7h6',
    ],
  },
];

function assertDisjoint() {
  for (let i = 0; i < POSITIONS.length; i += 1) {
    for (let j = i + 1; j < POSITIONS.length; j += 1) {
      const other = new Set(POSITIONS[j].legal);
      const shared = POSITIONS[i].legal.filter((move) => other.has(move));
      if (shared.length > 0) {
        console.error(
          `The positions are not disjoint: ${POSITIONS[i].id} and ${POSITIONS[j].id} ` +
            `share ${shared.join(', ')}. A cross-talk defect would pass unnoticed.`,
        );
        exit(2);
      }
    }
  }
}

const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = (env.KINGFISHER_COMPANION_URL ?? 'http://127.0.0.1:4321').replace(/\/$/, '');
const TOKEN = env.KINGFISHER_COMPANION_TOKEN ?? '';
const MOVETIME = Number(flag('movetime', '3000'));

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

/**
 * One session's output, read as it arrives.
 *
 * The companion publishes engine output as server-sent events, so this reads
 * the stream directly rather than polling: a bestmove that arrived late is a
 * different fact from one that arrived out of order, and only the arrival time
 * separates them.
 */
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
        if (payload !== '{}') sink(JSON.parse(payload), Date.now());
      }
      cut = buffer.indexOf('\n');
    }
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  assertDisjoint();

  let status;
  try {
    status = await call('/status');
  } catch (error) {
    console.error(
      `No companion answered at ${BASE}. Start it with \`npm run companion\` and set ` +
        `KINGFISHER_COMPANION_TOKEN to its token.\n${error.message}`,
    );
    exit(1);
  }

  const named = flag('engines', '');
  const available = status.engines.map((engine) => engine.id);
  const chosen = named
    ? named.split(',').map((id) => id.trim())
    : available.slice(0, POSITIONS.length);
  for (const id of chosen) {
    if (!available.includes(id)) {
      console.error(
        `The companion does not know an engine called ${id}. It has: ${available.join(', ')}`,
      );
      exit(1);
    }
  }
  if (chosen.length < 2) {
    console.error(
      `Only ${chosen.length} engine is registered, so there is nothing concurrent to measure. ` +
        'Install or register a second one first.',
    );
    exit(1);
  }

  console.log(`Companion ${BASE} · ${status.platform ?? 'unknown platform'}`);
  console.log(`${chosen.length} engines, ${MOVETIME} ms each, started together\n`);

  const runs = chosen.map((engine, index) => ({
    engine,
    name: status.engines.find((e) => e.id === engine)?.name ?? engine,
    position: POSITIONS[index % POSITIONS.length],
    lines: [],
    session: null,
    firstAt: null,
    bestAt: null,
    best: null,
  }));

  for (const run of runs) {
    const started = await call('/engine/start', { engine: run.engine });
    run.session = started.session;
    void listen(run.session, (line, at) => {
      run.lines.push(line);
      if (run.firstAt === null) run.firstAt = at;
      if (line.startsWith('bestmove')) {
        run.best = line.split(/\s+/)[1] ?? null;
        run.bestAt = at;
      }
    }).catch(() => {
      /* The stream ends when the session stops; that is not a failure. */
    });
  }
  await wait(300);

  for (const run of runs) await call('/engine/send', { session: run.session, line: 'uci' });
  for (const run of runs) await call('/engine/send', { session: run.session, line: 'isready' });
  await wait(500);

  // Sent in two passes so the four searches overlap as much as one process can
  // arrange: every engine has its position before any of them is told to go.
  for (const run of runs) {
    await call('/engine/send', { session: run.session, line: `position fen ${run.position.fen}` });
  }
  const launched = Date.now();
  for (const run of runs) {
    await call('/engine/send', { session: run.session, line: `go movetime ${MOVETIME}` });
  }

  const deadline = launched + MOVETIME + 15_000;
  while (Date.now() < deadline && runs.some((run) => run.best === null)) await wait(200);

  let failures = 0;
  const rows = [];
  for (const run of runs) {
    const own = new Set(run.position.legal);
    const foreign = POSITIONS.filter((p) => p.id !== run.position.id).find((p) =>
      p.legal.includes(run.best ?? ''),
    );
    const verdict =
      run.best === null
        ? 'no bestmove'
        : foreign
          ? `ANSWERED POSITION ${foreign.id}`
          : own.has(run.best)
            ? 'own position'
            : 'illegal everywhere';
    if (verdict !== 'own position') failures += 1;
    rows.push({
      engine: run.name,
      position: run.position.id,
      best: run.best ?? '—',
      verdict,
      lines: run.lines.length,
      // How long this session was searching while the others were. A run where
      // the engines took turns would prove nothing about concurrency.
      searchedMs: run.bestAt === null ? null : run.bestAt - launched,
    });
  }

  const width = Math.max(...rows.map((row) => row.engine.length), 6);
  console.log(`${'engine'.padEnd(width)}  pos  bestmove  lines  ms    verdict`);
  for (const row of rows) {
    console.log(
      `${row.engine.padEnd(width)}  ${row.position}    ${row.best.padEnd(8)}  ` +
        `${String(row.lines).padStart(5)}  ${String(row.searchedMs ?? '—').padStart(4)}  ${row.verdict}`,
    );
  }

  /*
    Concurrency, stated rather than assumed, and stated as the only thing the
    timings actually prove. An engine may finish early on its own account — a
    forced mate ends a search whatever the movetime says — so the spread between
    the first and last answer is not evidence of anything. What is evidence is
    when the *last* one arrives: searches that overlapped all land inside one
    movetime, and searches that took turns cannot.
  */
  const finishes = rows.map((row) => row.searchedMs).filter((ms) => ms !== null);
  if (finishes.length === rows.length) {
    const last = Math.max(...finishes);
    const serial = MOVETIME * rows.length;
    console.log(
      `\nThe last of the ${rows.length} answered ${last} ms after they were all told to go. ` +
        `Taking turns, the last would have arrived at about ${serial} ms.`,
    );
    if (last > serial * 0.75) {
      console.log('That is close enough to serial execution to be worth investigating.');
    }
  }

  for (const run of runs) await call('/engine/stop', { session: run.session }).catch(() => {});

  if (failures > 0) {
    console.error(
      `\n${failures} of ${rows.length} sessions did not answer about their own position.`,
    );
    exit(1);
  }
  console.log(`\nEvery session answered about its own position.`);
}

main().catch((error) => {
  console.error(error);
  exit(1);
});
