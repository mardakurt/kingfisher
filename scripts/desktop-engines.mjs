#!/usr/bin/env node
/**
 * Every managed engine the packaged application offers, driven inside it.
 *
 * ## The gap this closes
 *
 * Phase 20 verified two engines in the bundle — the browser Stockfish, and Lc0,
 * which had never worked there because a Finder-launched application cannot see
 * Homebrew on its PATH. The other native engines were qualified by
 * `npm run engines:qualify`, which runs them from a checkout as child processes
 * of Node. That answers "is this binary an engine". It does not answer the
 * question a user's session depends on: can the *packaged* application download
 * it, verify it, start it, search with it and stop it — inside a signed bundle
 * whose PATH, working directory, resource paths and process tree are all
 * different from a terminal's.
 *
 * Kingfisher has now been wrong about exactly that difference twice, in the
 * same place, on two different capabilities. So this drives the real thing.
 *
 * ## What "through the product" means here
 *
 * Every request below goes to the companion the shell started, over the URL and
 * token the shell handed the renderer, on the same routes Settings → Engines
 * calls: `/engine/catalogue`, `/engine/install`, `/engine/install-progress`,
 * `/engine/start`, `/engine/send`, `/engine/stop`. It is the product's own path,
 * exercised from the product's own renderer. What it is not is a person clicking
 * Install, and that difference is stated rather than glossed: the button's
 * `onClick` is not covered here, `e2e/engines.spec.ts` covers it in a browser.
 *
 * ## Ready means a search finished
 *
 * A UCI handshake is not evidence that an engine can evaluate anything — Lc0
 * completes one happily with no weights at all. So every engine here is asked
 * for a real search on a real position, and then for a second search on a
 * *different* position immediately after a stop, because an engine that answers
 * the first position for the second is the defect that makes an analysis panel
 * lie rather than break.
 *
 *   npm run desktop:engines -- --packaged
 */

import { _electron as electron } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = { packaged: argv.includes('--packaged') };

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

function shellBinary() {
  const marker = path.join(ROOT, 'desktop', 'node_modules', 'electron', 'path.txt');
  if (!existsSync(marker)) {
    console.error('The desktop shell is not installed. Run npm run desktop:install.');
    exit(1);
  }
  return path.join(
    ROOT,
    'desktop',
    'node_modules',
    'electron',
    'dist',
    readFileSync(marker, 'utf8').trim(),
  );
}

function packagedBinary() {
  const out = process.env.KINGFISHER_DESKTOP_OUT ?? path.join(ROOT, 'desktop', 'dist');
  for (const directory of ['mac-arm64', 'mac', 'mac-x64', 'mac-universal']) {
    const app = path.join(out, directory, 'Kingfisher.app');
    if (existsSync(app)) return path.join(app, 'Contents', 'MacOS', 'Kingfisher');
  }
  return path.join(out, 'mac-arm64', 'Kingfisher.app', 'Contents', 'MacOS', 'Kingfisher');
}

/*
  Two positions, and two different questions about them.

  The first is a back-rank mate: `a1a8` is forced and anything else throws the
  win away, so it is a judgement every engine must get right. Both positions
  come from `scripts/qualify-engines.mjs`, which is where they were validated.

  The second question is not "what is best" but "which position is this answer
  about". An engine that walks its king instead of queening is slow, not stale,
  so demanding the promotion would fail an engine for a move that still wins —
  which is the mistake the first draft of this script made, against a position
  that was not even a mate. The check is therefore membership in the new
  position's complete legal move set. The two positions share no legal move, so
  belonging to that set says precisely "not an answer for the one before it".
*/
const MATE = {
  fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
  best: 'a1a8',
  label: 'the back-rank mate',
};
const AFTER = {
  fen: '8/P6k/8/8/8/8/6K1/8 w - - 0 1',
  label: 'the position it was just given',
  legal: [
    'a7a8q',
    'a7a8r',
    'a7a8b',
    'a7a8n',
    'g2f1',
    'g2f2',
    'g2f3',
    'g2g1',
    'g2g3',
    'g2h1',
    'g2h2',
    'g2h3',
  ],
};

async function main() {
  console.log('Kingfisher packaged managed engines');
  console.log(`node ${process.version} · ${process.platform}-${process.arch}`);
  console.log(args.packaged ? 'target: the packaged application\n' : 'target: the checkout\n');

  const launch = args.packaged
    ? { executablePath: packagedBinary(), args: [] }
    : { executablePath: shellBinary(), args: [path.join(ROOT, 'desktop')] };
  if (args.packaged && !existsSync(launch.executablePath)) {
    console.error(`No packaged application at ${launch.executablePath}. Run npm run desktop:dist.`);
    exit(1);
  }

  const app = await electron.launch({ ...launch, timeout: 120_000 });
  const window = await app.firstWindow({ timeout: 120_000 });
  await window.waitForLoadState('domcontentloaded');
  await window.waitForFunction(
    () => document.documentElement.dataset.kingfisherReady === 'true',
    null,
    {
      timeout: 60_000,
    },
  );

  // What the packaged application offers on this machine, from its own companion.
  const catalogue = await window.evaluate(async () => {
    const { url, token } = window.kingfisher.companion;
    const response = await fetch(`${url}/engine/catalogue`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = await response.json().catch(() => null);
    return (body?.engines ?? []).map((engine) => ({
      id: engine.id,
      name: engine.name,
      // `binary` is downloaded against a recorded digest; `system` is located
      // on the machine. Both are native processes and both are the product's
      // problem; the browser engine is neither and is covered elsewhere.
      kind: engine.kind,
      installed: Boolean(engine.installed),
      offered: engine.available === true,
      unavailableReason: engine.unavailableReason ?? null,
    }));
  });

  const native = catalogue.filter((engine) => engine.kind === 'binary' || engine.kind === 'system');
  const offered = native.filter((engine) => engine.offered);
  check(
    'the packaged application offers a catalogue of native engines',
    offered.length > 0,
    `${offered.length} offered of ${native.length} native rows`,
  );
  for (const engine of native.filter((entry) => !entry.offered)) {
    console.log(`  · ${engine.name} is not offered here — ${engine.unavailableReason}`);
  }

  for (const engine of offered) {
    console.log(`\n${engine.name}`);
    const outcome = await window.evaluate(
      async ({ id, mate, next }) => {
        const { url, token } = window.kingfisher.companion;
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

        // 1. Install through the route Settings → Engines calls. 202 is normal:
        //    a download reports progress rather than blocking a request.
        const started = await call('/engine/install', { engine: id });
        if (started.status !== 200 && started.status !== 202) {
          return { failed: `install returned ${started.status}: ${started.body?.error ?? ''}` };
        }
        for (let attempt = 0; attempt < 600; attempt += 1) {
          const progress = await call(`/engine/install-progress?engine=${encodeURIComponent(id)}`);
          if (!progress.body?.progress) break;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        const after = await call('/engine/catalogue');
        const row = after.body?.engines?.find((entry) => entry.id === id);
        if (!row?.installed) {
          return { failed: row?.unavailableReason ?? 'it never became installed' };
        }

        /*
          2. Two searches, each in its own session, with the engine stopped and
             restarted in between.

          One session with two searches was the obvious way to write this and it
          cannot be made to work from here, for a reason worth recording: the
          companion replays a session's whole backlog to every new subscriber —
          `EngineSessions.subscribe` does it deliberately, so a client that
          reconnects does not lose output — and `EventSource` reconnects on its
          own, silently. A replayed `bestmove` for the first position therefore
          arrives *after* the second position was sent, and reads exactly like a
          stale answer. It fooled three drafts of this script.

          That is a fact about the stream contract rather than a defect: any
          consumer of it has to be able to tell replayed output from new output,
          and Kingfisher's own session layer does, by carrying session, position
          and engine identity on every result before it reaches UI state
          (`src/engine/uci-session.ts`, `src/engine/uci-adversarial.test.ts`).
          A harness cannot borrow that, so it takes the honest route instead: a
          session per position, which removes the ambiguity completely and
          exercises stop-and-restart while it is there.

          The within-session position switch is covered where it can be checked
          without a stream in the way — `npm run engines:qualify`, whose "rapid
          position switch" row runs against the same binaries.
        */
        const run = async (fen) => {
          const session = await call('/engine/start', { engine: id });
          const key = session.body?.session;
          if (!key)
            return { move: null, stopped: false, reason: `no session: HTTP ${session.status}` };

          const lines = [];
          const source = new EventSource(
            `${url}/engine/stream?session=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`,
          );
          source.onmessage = (event) => lines.push(String(JSON.parse(event.data)).trim());
          await new Promise((resolve) => {
            source.onopen = resolve;
            setTimeout(resolve, 3_000);
          });

          /*
            Wait for the engine, not just for the socket.

            `/engine/start` returns when the session exists, which is not the
            same as the engine having finished coming up, and `EventSource`
            opening says only that the stream is attached. A `position` sent
            into that window can be dropped: Halogen answered one run and timed
            out the next from exactly here. `isready`/`readyok` is what UCI
            provides for it, and it turns a race into a wait.
          */
          const ready = lines.length;
          await call('/engine/send', { session: key, line: 'isready' });
          const readyBy = Date.now() + 20_000;
          while (Date.now() < readyBy) {
            if (lines.slice(ready).some((line) => line === 'readyok')) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }

          /*
            Everything said before this point is somebody else's answer.

            `subscribe` replays the session's backlog to a new listener, and a
            freshly started session already has one — the companion verifies an
            engine by making it find a move from the standard start, so the
            backlog opens with a `bestmove` for a position this search never
            asked about. Reading the whole array picked that up and reported
            `e2e4` as the answer to an endgame.
          */
          const mark = lines.length;
          await call('/engine/send', { session: key, line: `position fen ${fen}` });
          /*
            A time limit rather than a depth, because "depth 10" does not mean
            the same thing to every engine here. Lc0 is an MCTS searcher whose
            depth is an average over a tree, and `go depth 10` on a trivial won
            endgame ran past forty seconds and returned nothing while the
            alpha-beta engines answered in milliseconds. Four seconds is a limit
            all six understand and far more than any of them needs for either of
            these positions.
          */
          await call('/engine/send', { session: key, line: 'go movetime 4000' });

          let move = null;
          const deadline = Date.now() + 40_000;
          while (Date.now() < deadline && move === null) {
            const answer = lines.slice(mark).find((line) => /^bestmove\s/.test(line));
            if (answer) move = /^bestmove\s+(\S+)/.exec(answer)?.[1] ?? null;
            else await new Promise((resolve) => setTimeout(resolve, 100));
          }

          source.close();
          const stopped = await call('/engine/stop', { session: key });
          return { move, stopped: stopped.status === 200 };
        };

        const first = await run(mate.fen);
        const second = await run(next.fen);

        return {
          binary: row.record?.binary ?? null,
          reported: row.record?.reportedName ?? null,
          handshake: row.record?.checks?.handshake?.ok === true,
          verified: row.record?.checks?.search?.ok === true,
          first: first.move,
          second: second.move,
          stopped: first.stopped && second.stopped,
        };
      },
      { id: engine.id, mate: MATE, next: AFTER },
    );

    if (outcome.failed) {
      check(`${engine.name} installs inside the bundle`, false, outcome.failed);
      continue;
    }

    check(
      `${engine.name} installs and verifies inside the bundle`,
      outcome.handshake && outcome.verified,
      outcome.reported ?? engine.id,
    );
    check(
      `${engine.name} finds ${MATE.label}`,
      outcome.first === MATE.best,
      `expected ${MATE.best}, got ${outcome.first ?? 'nothing'}`,
    );
    /*
      The one that matters most. A different position, asked straight after the
      first search — an engine answering `a1a8` here is answering the previous
      position, and a legal move from the wrong position is exactly the kind of
      wrong answer nothing downstream can detect.
    */
    check(
      `${engine.name} answers ${AFTER.label}, not the one before it`,
      outcome.second !== null && AFTER.legal.includes(outcome.second),
      outcome.second === MATE.best
        ? `it answered the PREVIOUS position (${outcome.second})`
        : `${outcome.second ?? 'nothing'} — the new position admits ${AFTER.legal.length} moves`,
    );
    check(`${engine.name} stops when it is told to`, outcome.stopped === true);
  }

  await app.close();

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log('\nFailed:');
    for (const entry of failed)
      console.log(`  ✗ ${entry.name}${entry.detail ? ` — ${entry.detail}` : ''}`);
  }
  exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  exit(1);
});
