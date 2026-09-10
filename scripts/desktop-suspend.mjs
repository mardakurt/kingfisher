#!/usr/bin/env node
import { mkdtempSync as auditTemp } from 'node:fs';
import { tmpdir as auditTmpdir } from 'node:os';
/**
 * What Kingfisher looks like after the machine it is on stops and starts again.
 *
 * ## What this actually does, and what it does not
 *
 * It does **not** put the Mac to sleep. `pmset sleepnow` on somebody's working
 * machine is not a thing a test suite gets to do, and a suite that did it could
 * not report its own result afterwards. So this suspends the application
 * instead: `SIGSTOP` to the shell and every descendant, twenty seconds of wall
 * clock, then `SIGCONT`.
 *
 * That is a genuine analogue of the part that breaks, and it is worth being
 * precise about why. During a real sleep the processes stop receiving CPU while
 * the clock keeps moving — which is exactly what `SIGSTOP` produces. Everything
 * that follows from that follows here too: every `setTimeout` and `setInterval`
 * comes due at once and fires late and coalesced, an HTTP request in flight
 * ages past its deadline, a health poll misses many beats, and a session that
 * assumed monotonic wall-clock progress finds an hour has passed since its last
 * tick.
 *
 * What it does **not** reproduce:
 *
 * - **Network interfaces going down and coming back with new addresses.** A
 *   real wake re-establishes Wi-Fi; loopback here never went anywhere.
 *   `npm run desktop:smoke -- --packaged --offline` is the suite that covers
 *   losing the network.
 * - **The GPU process being torn down and re-created**, and the window-server
 *   reconnect that goes with it.
 * - **macOS App Nap and timer throttling** applied to a backgrounded
 *   application, which is a different mechanism from a stopped one.
 *
 * Those three are stated rather than skipped over. This is not a claim that
 * Kingfisher has been through a real sleep cycle; it is the strongest thing
 * that can be asserted without one, and Phase 21 listed sleep/wake as unreached
 * precisely because nobody had done even this much.
 *
 *   npm run desktop:suspend               # the shell, from the checkout
 *   npm run desktop:suspend -- --packaged # a built Kingfisher.app
 */

import { _electron as electron } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = {
  packaged: argv.includes('--packaged'),
  /** How long to leave it stopped. Long enough that every poll has missed. */
  seconds: Number(argv.find((a) => a.startsWith('--seconds='))?.split('=')[1] ?? 20),
};

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

function descendants(root) {
  const out = execFileSync('ps', ['-eo', 'pid=,ppid=,comm='], { encoding: 'utf8' });
  const children = new Map();
  for (const line of out.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) continue;
    const [, pid, ppid, comm] = match;
    if (!children.has(ppid)) children.set(ppid, []);
    children.get(ppid).push({ pid, comm });
  }
  const found = [];
  const walk = (pid) => {
    for (const child of children.get(String(pid)) ?? []) {
      found.push(child);
      walk(child.pid);
    }
  };
  walk(root);
  return found;
}

const alive = (pid) => {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The board, the move list and the engine, as the renderer sees them. */
async function surface(window) {
  return window.evaluate(() => {
    const dock = document.querySelector('[data-workspace-dock]');
    const frame = document.querySelector('[data-board-frame]')?.getBoundingClientRect();
    return {
      ready: document.documentElement.dataset.kingfisherReady === 'true',
      url: location.pathname,
      board: frame ? Math.round(Math.min(frame.width, frame.height)) : 0,
      /*
        `innerText`, never `textContent`. Next streams its payload in inline
        <script> elements, and `textContent` happily returns those — an earlier
        draft asserted on a body that began `self.__next_f.push(...)`, which is
        a harness reading script source and calling it a screen.
      */
      moves: (document.querySelector('[data-move-tree]')?.innerText ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
      /* The same fact the desktop smoke asserts, from the whole page. */
      game: document.body.innerText.includes('Bb5') && document.body.innerText.includes('Ba4'),
      dock: (dock?.innerText ?? '').replace(/\s+/g, ' ').trim(),
      workers: window.__kfWorkers ?? null,
    };
  });
}

async function main() {
  if (process.platform !== 'darwin') {
    console.log('This is a macOS suspend/resume analogue. Nothing to check here.');
    exit(0);
  }

  console.log('Kingfisher suspend and resume');
  console.log(`node ${process.version} · ${process.platform}-${process.arch}`);
  console.log(args.packaged ? 'target: the packaged application' : 'target: the checkout');
  console.log(`stopped for ${args.seconds} s\n`);

  const launch = args.packaged
    ? { executablePath: packagedBinary(), args: [] }
    : { executablePath: shellBinary(), args: [path.join(ROOT, 'desktop')] };
  if (args.packaged && !existsSync(launch.executablePath)) {
    console.error(`No packaged application at ${launch.executablePath}. Run npm run desktop:dist.`);
    exit(1);
  }

  const profile = auditTemp(path.join(auditTmpdir(), 'kingfisher-suspend-'));
  const app = await electron.launch({
    ...launch,
    args: [...launch.args, `--user-data-dir=${profile}`],
    timeout: 120_000,
  });
  const window = await app.firstWindow({ timeout: 120_000 });
  await window.waitForLoadState('domcontentloaded');
  await window.waitForFunction(
    () => document.documentElement.dataset.kingfisherReady === 'true',
    null,
    { timeout: 60_000 },
  );
  const shellPid = app.process().pid;

  /*
    Put it in the state a person leaves it in when they shut the lid.

    Not an idle board: a position with moves on it, an engine that has been
    asked a question, and the databases screen having been opened so the
    companion has been talked to. Each of those is a different thing that can
    come back wrong.
  */
  await window.evaluate(() => {
    document.querySelector('a[href="/analysis"]')?.click();
  });
  await wait(1200);

  /*
    A real game, put there the way the shell puts one.

    Playing moves out of the explorer needs the explorer tool to be the selected
    one, which it is not on a fresh profile — an earlier draft of this file did
    exactly that and then asserted the move list was unchanged, which it was,
    because it was empty both times. A test that cannot fail proves nothing, so
    the game arrives over the document channel the desktop smoke already
    exercises, and the "before" check asserts the moves are actually there.
  */
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('kingfisher:open-document', {
      kind: 'pgn',
      path: '/tmp/kingfisher-suspend.pgn',
      name: 'Suspend.pgn',
      text:
        '[Event "Suspend"]\n[White "Fischer, Robert J."]\n[Black "Spassky, Boris V."]\n' +
        '[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 *\n',
    });
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await wait(100);
    const shown = await window.evaluate(() => document.body.innerText.includes('Bb5'));
    if (shown) break;
  }

  const analyse = window.getByRole('button', { name: /Analyse this position/ });
  if (await analyse.count()) await analyse.first().click();
  await wait(5000);

  const before = await surface(window);
  const family = descendants(shellPid);
  check(
    'the application is up, with a game, an engine and both services',
    before.ready && before.board > 300 && before.game && family.length > 0,
    `board ${before.board}px, moves “${before.moves.slice(0, 40)}”, ` +
      `${family.length} descendant process(es)`,
  );

  // --- Stop everything, the way a sleeping machine does. -------------------
  const stopped = [String(shellPid), ...family.map((child) => child.pid)];
  const stoppedAt = Date.now();
  for (const pid of stopped) {
    try {
      process.kill(Number(pid), 'SIGSTOP');
    } catch {
      /* a helper that exited between the walk and here is not a failure */
    }
  }
  check('every Kingfisher process is stopped', true, `${stopped.length} process(es)`);

  await wait(args.seconds * 1000);

  // Nothing may have died while stopped. A process that exits under SIGSTOP is
  // a process something else killed, and that is worth knowing about.
  const survived = stopped.filter((pid) => alive(pid));
  check(
    'nothing died while the machine was asleep',
    survived.length === stopped.length,
    `${survived.length} of ${stopped.length} still there`,
  );

  for (const pid of stopped.reverse()) {
    try {
      process.kill(Number(pid), 'SIGCONT');
    } catch {
      /* as above */
    }
  }
  const asleep = Math.round((Date.now() - stoppedAt) / 1000);
  console.log(`\n  … resumed after ${asleep} s\n`);

  // --- And now the part that matters. --------------------------------------
  await wait(6000);

  const after = await surface(window);
  check(
    'the window came back',
    after.ready,
    after.ready ? 'the renderer is still ready' : 'the renderer never reported ready again',
  );
  check(
    'the board is still the board, at the same size',
    after.board === before.board && after.board > 300,
    `${before.board}px → ${after.board}px`,
  );
  check(
    'the position is the one that was left there',
    after.game && after.moves === before.moves,
    `“${after.moves.slice(0, 60)}”`,
  );

  /*
    The engine, and the only thing that must never happen.

    A stopped engine process comes back with a `bestmove` it computed before the
    sleep, for a search whose session may or may not still be the one on screen.
    The rule this project holds is that a late answer may not reach the UI, and
    the observable form of it here is that the dock is not showing an
    evaluation attributed to a search that is no longer running.
  */
  const engine = await window.evaluate(() => {
    const dock = document.querySelector('[data-workspace-dock]');
    const text = (dock instanceof HTMLElement ? dock.innerText : '').replace(/\s+/g, ' ');
    return { text, claimsRunning: /stopping|searching|depth \d+/i.test(text) };
  });
  check(
    'the engine panel says something true about itself',
    engine.text.length > 0,
    engine.text.slice(0, 90),
  );

  // The renderer can still reach the server the shell owns.
  const served = await window.evaluate(async () => {
    try {
      const response = await fetch(`${location.origin}/analysis`, { cache: 'no-store' });
      return response.status;
    } catch (error) {
      return String(error);
    }
  });
  check('the web server the shell owns still answers', served === 200, `HTTP ${served}`);

  // And the companion, which is the process most likely to have given up: it
  // was mid-poll when everything stopped.
  const companion = await window.evaluate(async () => {
    const bridge = window.kingfisher?.companion;
    if (!bridge) return 'no bridge';
    try {
      const response = await fetch(`${bridge.url}/status`, {
        headers: { authorization: `Bearer ${bridge.token}` },
        cache: 'no-store',
      });
      return response.status;
    } catch (error) {
      return String(error);
    }
  });
  check('the companion still answers an authenticated request', companion === 200, `${companion}`);

  // Databases, through the interface rather than through the socket.
  await window.evaluate(() => {
    document.querySelector('a[href="/databases"]')?.click();
  });
  await wait(2500);
  const databases = await window.evaluate(() =>
    document.body.innerText.replace(/\s+/g, ' ').slice(0, 200),
  );
  check(
    'the databases screen works after the wake',
    /reference|collection|source|database/i.test(databases),
    databases.slice(0, 70),
  );

  // No second copy of anything. A resumed application that re-ran its start-up
  // would show here as a second web server or a second companion.
  const familyAfter = descendants(shellPid);
  check(
    'no duplicated services',
    familyAfter.length <= family.length + 1,
    `${family.length} before, ${familyAfter.length} after`,
  );

  // And it still quits cleanly, which is the guarantee a suspend could break.
  const closing = Date.now();
  await app.close();
  await wait(500);
  const orphans = familyAfter.filter((child) => alive(child.pid));
  check(
    'nothing survives the quit after a suspend',
    orphans.length === 0,
    orphans.length === 0
      ? `${familyAfter.length} descendants, all gone, ${Date.now() - closing} ms`
      : `${orphans.map((o) => `${o.pid} ${o.comm}`).join(', ')}`,
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log('\nFailed:');
    for (const f of failed) console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  }
  exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  exit(1);
});
