#!/usr/bin/env node
/**
 * Drive the desktop application, and check the things only it can be wrong about.
 *
 * The web suite already proves the application works; running it again inside a
 * window would prove it twice. What this asserts is everything the *shell* is
 * responsible for, and every one of these has a failure mode that a green
 * browser suite cannot see:
 *
 *   - the window opens on a server the shell started, with no terminal and no
 *     pasted token anywhere;
 *   - the companion is already paired, and answering;
 *   - the renderer is cross-origin isolated, so the multi-threaded engine can
 *     actually run — this is the measurement that decided the shell (ADR 0049);
 *   - a PGN handed to the shell reaches the application;
 *   - and quitting leaves nothing behind. That last one is the reason this
 *     script exists at all: an orphaned engine is invisible until somebody
 *     notices their fans.
 *
 *   npm run desktop:smoke              # the unpackaged shell, from the checkout
 *   npm run desktop:smoke -- --packaged  # a built Kingfisher.app
 */

import { _electron as electron } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const args = {
  packaged: argv.includes('--packaged'),
  keepOpen: argv.includes('--keep-open'),
};

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

/** Every descendant of a pid, by walking the process table once. */
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

/**
 * The Electron binary the shell was installed with.
 *
 * Resolved from `desktop/node_modules` rather than the repository root:
 * Electron is a 300 MB dependency of the shell alone, and putting it in the
 * root install would make every web CI job download it.
 */
function shellBinary() {
  const marker = path.join(ROOT, 'desktop', 'node_modules', 'electron', 'path.txt');
  if (!existsSync(marker)) {
    console.error('The desktop shell is not installed. Run npm run desktop:install.');
    exit(1);
  }
  const relative = readFileSync(marker, 'utf8').trim();
  return path.join(ROOT, 'desktop', 'node_modules', 'electron', 'dist', relative);
}

/**
 * The packaged application.
 *
 * `KINGFISHER_DESKTOP_OUT` exists because electron-builder refuses an output
 * directory whose path contains shell-special characters, and the development
 * checkout this was written in lives under one. `npm run desktop:dist` passes
 * the same variable through, so the two always agree.
 */
function packagedBinary() {
  const out = process.env.KINGFISHER_DESKTOP_OUT ?? path.join(ROOT, 'desktop', 'dist');
  for (const directory of ['mac-arm64', 'mac', 'mac-x64', 'mac-universal']) {
    const app = path.join(out, directory, 'Kingfisher.app');
    if (existsSync(app)) return path.join(app, 'Contents', 'MacOS', 'Kingfisher');
  }
  return path.join(out, 'mac-arm64', 'Kingfisher.app', 'Contents', 'MacOS', 'Kingfisher');
}

async function main() {
  console.log('Kingfisher desktop smoke');
  console.log(`node ${process.version} · ${process.platform}-${process.arch}`);
  console.log(args.packaged ? 'target: the packaged application\n' : 'target: the checkout\n');

  const workspace = mkdtempSync(path.join(tmpdir(), 'kingfisher-desktop-smoke-'));
  const pgn = path.join(workspace, 'Smoke.pgn');
  writeFileSync(
    pgn,
    '[Event "Desktop smoke"]\n[White "Fischer, Robert J."]\n[Black "Spassky, Boris V."]\n' +
      '[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *\n',
  );

  const launch = args.packaged
    ? { executablePath: packagedBinary(), args: [] }
    : { executablePath: shellBinary(), args: [path.join(ROOT, 'desktop')] };

  if (args.packaged && !existsSync(launch.executablePath)) {
    console.error(`No packaged application at ${launch.executablePath}. Run npm run desktop:dist.`);
    exit(1);
  }

  const started = Date.now();
  const app = await electron.launch({ ...launch, timeout: 120_000 });
  const window = await app.firstWindow({ timeout: 120_000 });
  await window.waitForLoadState('domcontentloaded');
  const ready = Date.now() - started;

  const shellPid = app.process().pid;

  // 1. A window, on the shell's own server.
  const url = window.url();
  check('a window opens', Boolean(url), url.replace(/:\d+/, ':<port>'));
  check('it is served by the shell, on loopback', /^http:\/\/127\.0\.0\.1:\d+\//.test(url));
  check(`it is ready in under 30 s`, ready < 30_000, `${(ready / 1000).toFixed(1)} s`);

  // 2. The bridge, and the pairing nobody had to do.
  const bridge = await window.evaluate(() => ({
    present: typeof window.kingfisher === 'object' && window.kingfisher !== null,
    platform: window.kingfisher?.platform ?? null,
    companionUrl: window.kingfisher?.companion?.url ?? null,
    hasToken: Boolean(window.kingfisher?.companion?.token),
    tokenLength: window.kingfisher?.companion?.token?.length ?? 0,
    node: typeof window.require,
    isolated: window.crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
  }));
  check('the shell bridge is present', bridge.present && bridge.platform === 'desktop');
  check('the companion is already paired', bridge.hasToken && bridge.tokenLength === 64);
  check('the renderer holds no Node handle', bridge.node === 'undefined');

  // 3. The measurement the whole shell decision rested on.
  check(
    'the renderer is cross-origin isolated',
    bridge.isolated === true,
    'the multi-threaded engine needs this',
  );
  check('SharedArrayBuffer is available', bridge.sharedArrayBuffer === true);

  // 4. The companion actually answers, through the URL the bridge handed over.
  const companion = await window.evaluate(async () => {
    const bridged = window.kingfisher.companion;
    const response = await fetch(`${bridged.url}/status`, {
      headers: { authorization: `Bearer ${bridged.token}` },
    });
    return { status: response.status, body: response.ok ? await response.json() : null };
  });
  check(
    'the companion answers an authenticated request',
    companion.status === 200,
    `platform ${companion.body?.platform ?? '—'}`,
  );

  // 5. A document reaches the application.
  await app.evaluate(({ BrowserWindow }, file) => {
    const [win] = BrowserWindow.getAllWindows();
    win.webContents.send('kingfisher:open-document', {
      kind: 'pgn',
      path: file,
      name: 'Smoke.pgn',
      text:
        '[Event "Desktop smoke"]\n[White "Fischer, Robert J."]\n[Black "Spassky, Boris V."]\n' +
        '[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *\n',
    });
  }, pgn);

  let opened = null;
  for (let attempt = 0; attempt < 50 && !opened; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    opened = await window.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Bb5') && text.includes('a6') ? 'the move list shows Bb5 … a6' : null;
    });
  }
  check(
    'a PGN sent by the shell is opened on the board',
    opened !== null,
    opened ?? 'the move list never showed the game',
  );

  // 6. What the shell says about itself.
  const diagnostics = await window.evaluate(() => window.kingfisher.diagnostics());
  check(
    'diagnostics report both services running',
    diagnostics.web.running === true && diagnostics.companion.running === true,
    `Electron ${diagnostics.shell.version}, Node ${diagnostics.node}`,
  );

  /*
    7. The children, before and after.

    Asserted on the pids the shell reports rather than on a `ps` heuristic:
    both services run under `ELECTRON_RUN_AS_NODE`, so their process names are
    indistinguishable from the renderer's own helpers, and a check that counted
    names would be a check that cannot tell what it is looking at.
  */
  const before = descendants(shellPid);
  const servicePids = [diagnostics.web.pid, diagnostics.companion.pid].filter(Boolean);
  check(
    'the shell owns both services, and they are running',
    servicePids.length === 2 && servicePids.every((pid) => alive(pid)),
    `web ${diagnostics.web.pid}, companion ${diagnostics.companion.pid}`,
  );

  if (args.keepOpen) {
    console.log('\n--keep-open: leaving the application running.');
    return results;
  }

  const closing = Date.now();
  await app.close();
  const closed = Date.now() - closing;

  // Give the operating system a moment to reap, then look for anything left.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const survivors = before.filter((child) => alive(child.pid));
  check(
    'neither service survives the quit',
    servicePids.every((pid) => !alive(pid)),
    servicePids.map((pid) => `${pid}: ${alive(pid) ? 'still running' : 'gone'}`).join(', '),
  );
  check(
    'nothing at all survives the quit',
    survivors.length === 0,
    survivors.length
      ? survivors.map((child) => `${child.comm} (${child.pid})`).join(', ')
      : `${before.length} descendants, all gone, ${closed} ms to close`,
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
    console.error('\nThe smoke run failed to complete:', error);
    exit(1);
  });
