#!/usr/bin/env node
/**
 * Native engines under abuse, inside the packaged application.
 *
 * Through the companion the packaged shell started — the product's own
 * path, addressed with the URL and token the bridge hands the renderer:
 *
 *   1. a **storm**: start, search, stop, one hundred times, and after every
 *      cycle no native engine process is left on the machine that was not
 *      there before;
 *   2. **SIGTERM** a searching engine, then **SIGKILL** one: the session's
 *      stream reports the exit, no process is orphaned, and a fresh session
 *      starts and answers;
 *   3. **two engines** at once, positions A, B, C sent rapidly to each, and
 *      every `bestmove` is a legal move in the *last* position that session
 *      was given — never the one before it; then stop one, restart it, stop
 *      the other;
 *   4. **malformed output** cannot be injected into a real binary, so the
 *      protocol half of this — an illegal `bestmove` is dropped, noise never
 *      throws — is `src/engine/uci-adversarial.test.ts`. Stated, not faked.
 *
 * The renderer is asked, after the chaos, whether it still has a board.
 *
 *   npm run desktop:engine-chaos -- --packaged [--cycles=100]
 */

import { Chess } from 'chess.js';
import { argv, exit } from 'node:process';

import { engineProcesses, launchKingfisher, waitForReady } from './desktop-lib/launch.mjs';

const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const found = argv.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const args = { packaged: flag('packaged'), cycles: Number(value('cycles', '100')) };

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const POSITIONS = {
  A: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  B: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
  C: '8/8/8/4k3/8/8/8/K2R4 w - - 0 1',
};

async function main() {
  const k = await launchKingfisher({ packaged: args.packaged });
  await waitForReady(k.window);
  const { url, token } = await k.window.evaluate(() => window.kingfisher.companion);
  const call = async (route, body) => {
    const response = await fetch(`${url}${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };

  const baseline = new Set(engineProcesses().map((p) => p.pid));
  const strangers = () => engineProcesses().filter((p) => !baseline.has(p.pid));
  console.log(`Kingfisher engine chaos · ${k.executable}`);
  console.log(`companion ${url} · ${baseline.size} engine process(es) already on the machine\n`);

  // --- install the native Stockfish (and a second engine, if the catalogue has one ready) ---
  const catalogue = await call('/engine/catalogue');
  const ids = ['stockfish-native', 'stormphrax'].filter((id) =>
    catalogue.body?.engines?.some((e) => e.id === id),
  );
  for (const id of ids) {
    const installed = await call('/engine/install', { engine: id });
    if (installed.status !== 200 && installed.status !== 202) {
      check(`${id} installs`, false, installed.body?.error ?? `HTTP ${installed.status}`);
      continue;
    }
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const progress = await call(`/engine/install-progress?engine=${id}`);
      if (!progress.body?.progress) break;
      await sleep(500);
    }
    const after = await call('/engine/catalogue');
    const row = after.body?.engines?.find((e) => e.id === id);
    check(
      `${id} installs and verifies`,
      row?.installed === true,
      row?.record?.reportedName ?? row?.unavailableReason ?? '',
    );
  }
  const primary = ids[0];
  if (!primary) {
    check('a native engine is available to abuse', false, 'no stockfish-native in the catalogue');
    await k.close();
    return results;
  }

  /** One session: start, stream, wait for readyok. */
  async function session(engine) {
    const started = await call('/engine/start', { engine });
    const key = started.body?.session;
    if (!key) throw new Error(`no session for ${engine}: HTTP ${started.status}`);
    const lines = [];
    // Node has no global EventSource; the stream is read as text, one
    // `data:` line at a time, which is all the companion's events are.
    const controller = new AbortController();
    const streaming = fetch(
      `${url}/engine/stream?session=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`,
      { signal: controller.signal },
    ).then(async (response) => {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const raw = buffer.slice(0, index);
          buffer = buffer.slice(index + 1);
          if (raw.startsWith('data:')) {
            try {
              lines.push(String(JSON.parse(raw.slice(5).trim())).trim());
            } catch {
              lines.push(raw.slice(5).trim());
            }
          }
        }
      }
    });
    streaming.catch(() => {});
    await sleep(300);
    const send = (line) => call('/engine/send', { session: key, line });
    const mark = () => lines.length;
    const readyAt = mark();
    await send('isready');
    const readyBy = Date.now() + 20_000;
    while (Date.now() < readyBy && !lines.slice(readyAt).includes('readyok')) await sleep(30);
    const bestmoveAfter = async (from, timeoutMs = 20_000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const answer = lines.slice(from).find((line) => /^bestmove\s/.test(line));
        if (answer) return /^bestmove\s+(\S+)/.exec(answer)?.[1] ?? null;
        await sleep(25);
      }
      return null;
    };
    const exitedAfter = async (from, timeoutMs = 10_000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (lines.slice(from).some((line) => /^#(exit|error)/.test(line))) return true;
        await sleep(50);
      }
      return false;
    };
    return {
      key,
      lines,
      send,
      mark,
      bestmoveAfter,
      exitedAfter,
      close: () => controller.abort(),
      stop: () => call('/engine/stop', { session: key }),
    };
  }

  // --- 1. the storm -------------------------------------------------------------
  let leaked = 0;
  let answered = 0;
  const stormStarted = Date.now();
  for (let cycle = 1; cycle <= args.cycles; cycle += 1) {
    const s = await session(primary);
    const from = s.mark();
    await s.send(`position fen ${POSITIONS.C}`);
    await s.send('go movetime 150');
    const move = await s.bestmoveAfter(from, 15_000);
    if (move) answered += 1;
    s.close();
    await s.stop();
    // Give the process group a moment to be reaped, then look.
    const deadline = Date.now() + 3_000;
    let left = strangers();
    while (left.length && Date.now() < deadline) {
      await sleep(50);
      left = strangers();
    }
    if (left.length) {
      leaked += 1;
      console.log(
        `  ✗ cycle ${cycle}: ${left.map((p) => `${p.comm} ${p.pid}`).join(', ')} still running`,
      );
    }
    if (cycle % 25 === 0)
      console.log(`  · ${cycle} cycles, ${answered} answered, ${leaked} leaked`);
  }
  check(
    `${args.cycles} start/search/stop cycles leak no engine process`,
    leaked === 0,
    `${answered}/${args.cycles} answered, ${((Date.now() - stormStarted) / 1000).toFixed(0)} s`,
  );

  // --- 2. SIGTERM, then SIGKILL, a searching engine ------------------------------
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    const s = await session(primary);
    const from = s.mark();
    await s.send(`position fen ${POSITIONS.B}`);
    await s.send('go infinite');
    await sleep(600);
    const victims = strangers();
    check(
      `a native engine is searching before ${signal}`,
      victims.length >= 1,
      victims.map((p) => `${p.comm.split('/').pop()} ${p.pid}`).join(', '),
    );
    for (const victim of victims) {
      try {
        process.kill(victim.pid, signal);
      } catch {
        /* gone already */
      }
    }
    const reported = await s.exitedAfter(from);
    check(
      `the session reports the ${signal} death on its stream`,
      reported,
      reported ? 'an #exit/#error line arrived' : 'nothing arrived in 10 s',
    );
    await sleep(1_000);
    const orphans = strangers().filter((p) => p.ppid === 1);
    check(
      `no orphan after ${signal}`,
      orphans.length === 0,
      orphans.map((p) => `${p.comm} ${p.pid}`).join(', ') || 'none',
    );
    s.close();
    await s.stop();
    // A fresh session works afterwards.
    const again = await session(primary);
    const mark = again.mark();
    await again.send(`position fen ${POSITIONS.C}`);
    await again.send('go movetime 300');
    const move = await again.bestmoveAfter(mark);
    check(`a new session answers after ${signal}`, Boolean(move), move ?? 'no bestmove');
    again.close();
    await again.stop();
    await sleep(500);
    check(
      `nothing left after the ${signal} exercise`,
      strangers().length === 0,
      `${strangers().length} process(es)`,
    );
  }

  // --- 3. two engines, rapid positions, no identity swap -------------------------
  {
    const second = ids[1] ?? primary;
    const one = await session(primary);
    const two = await session(second);
    /*
      Rapid switching, the way Kingfisher's session layer does it: stop the
      search, wait for its bestmove, and only then send the next position.
      A `go` on top of a running search is something UCI lets an engine
      ignore, and a harness that sent one would be testing the engine's
      input buffering rather than Kingfisher. Every bestmove is checked
      against the position that search was for.
    */
    const legalIn = (fen, move) => {
      if (!move || move === '(none)') return false;
      try {
        return new Chess(fen)
          .moves({ verbose: true })
          .some((m) => m.from + m.to + (m.promotion ?? '') === move);
      } catch {
        return false;
      }
    };
    const sequence = ['A', 'B', 'C', 'B', 'A', 'C'];
    let wrong = 0;
    let searches = 0;
    for (const [index, name] of sequence.entries()) {
      const other = sequence[(index + 3) % sequence.length];
      for (const [s, position] of [
        [one, name],
        [two, other],
      ]) {
        const from = s.mark();
        await s.send(`position fen ${POSITIONS[position]}`);
        await s.send('go infinite');
        await sleep(60);
        await s.send('stop');
        const move = await s.bestmoveAfter(from, 5_000);
        searches += 1;
        if (!legalIn(POSITIONS[position], move)) {
          wrong += 1;
          console.log(`  ✗ ${s === one ? 'engine 1' : 'engine 2'} answered ${move} to ${position}`);
        }
      }
    }
    check(
      'every answer belongs to the position its search was for, across two engines and twelve rapid switches',
      wrong === 0 && searches === 12,
      `${searches - wrong}/${searches}`,
    );
    one.close();
    await one.stop();
    const restarted = await session(primary);
    const mark = restarted.mark();
    await restarted.send(`position fen ${POSITIONS.C}`);
    await restarted.send('go movetime 300');
    check(
      'engine 1 restarts while engine 2 is still running',
      Boolean(await restarted.bestmoveAfter(mark)),
    );
    restarted.close();
    await restarted.stop();
    two.close();
    await two.stop();
    await sleep(800);
    check(
      'both engines gone after both stops',
      strangers().length === 0,
      `${strangers().length} process(es)`,
    );
  }

  // --- 4. the renderer is still a chess application ----------------------------
  const board = await k.window.evaluate(() => ({
    boards: document.querySelectorAll('[data-chessboard]').length,
    text: document.body.innerText.length,
  }));
  check(
    'the renderer still shows a board after the chaos',
    board.boards > 0 && board.text > 200,
    `${board.boards} board(s), ${board.text} chars`,
  );

  const closed = await k.close();
  check(
    'nothing survives the quit',
    closed.survivors.length === 0 && strangers().length === 0,
    `${closed.descendants} descendants, ${closed.closeMs} ms`,
  );
  return results;
}

main()
  .then((rows) => {
    const failed = rows.filter((row) => !row.ok);
    console.log(`\n${rows.length - failed.length}/${rows.length} checks passed`);
    exit(failed.length === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error(`\nThe run failed to complete: ${error?.stack ?? error}`);
    exit(2);
  });
