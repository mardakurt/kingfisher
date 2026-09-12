/**
 * Launching Kingfisher for a harness, packaged or from the checkout.
 *
 * Every desktop script used to carry its own copy of "find the packaged
 * binary" and "launch it with Playwright and wait for the first window". The
 * copies agreed with each other and were all wrong in the same way: when the
 * packaged application started, logged that it was incomplete, showed an
 * error box and exited, each of them reported `firstWindow: Timeout 120000ms
 * exceeded` — a sentence about Playwright — and Phase 45 recorded that as a
 * harness limitation. The application had said exactly what was wrong, in a
 * log nobody read.
 *
 * So this is the one place launch happens, and it does two things the copies
 * did not:
 *
 *   1. it races the first window against the process exiting, and when the
 *      process wins it reads the shell's own log out of the profile and puts
 *      that in the error;
 *   2. it records what it launched — binary, profile, build identity — so a
 *      result can say which bytes it is about.
 *
 * `KINGFISHER_DESKTOP_APP` names a `.app` (or its executable) directly;
 * `KINGFISHER_DESKTOP_OUT` names an electron-builder output directory; with
 * neither, `desktop/dist` is assumed. `desktop/scripts/build.mjs` exports the
 * second, so a build and a harness look in the same place without being told
 * twice.
 */

import { _electron as electron } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The Electron binary the shell was installed with, from `desktop/node_modules`. */
export function shellBinary() {
  const marker = path.join(ROOT, 'desktop', 'node_modules', 'electron', 'path.txt');
  if (!existsSync(marker)) {
    throw new Error('The desktop shell is not installed. Run npm run desktop:install.');
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

/** A `.app` path or its executable, normalised to the executable. */
function executableOf(app) {
  if (app.endsWith('.app')) return path.join(app, 'Contents', 'MacOS', 'Kingfisher');
  return app;
}

/** The packaged application's executable. Throws, naming where it looked. */
export function packagedBinary(env = process.env) {
  if (env.KINGFISHER_DESKTOP_APP) {
    const exe = executableOf(path.resolve(env.KINGFISHER_DESKTOP_APP));
    if (!existsSync(exe)) throw new Error(`KINGFISHER_DESKTOP_APP names nothing at ${exe}`);
    return exe;
  }
  const out = env.KINGFISHER_DESKTOP_OUT ?? path.join(ROOT, 'desktop', 'dist');
  const looked = [];
  for (const directory of ['mac-arm64', 'mac', 'mac-x64', 'mac-universal']) {
    const app = path.join(out, directory, 'Kingfisher.app');
    looked.push(app);
    if (existsSync(app)) return executableOf(app);
  }
  throw new Error(
    `No packaged application. Looked in:\n  ${looked.join('\n  ')}\n` +
      'Run npm run desktop:dist, or set KINGFISHER_DESKTOP_APP / KINGFISHER_DESKTOP_OUT.',
  );
}

/** The `.app` directory for an executable path, or null. */
export function bundleOf(executable) {
  const match = /^(.*\.app)\/Contents\/MacOS\//.exec(executable);
  return match ? match[1] : null;
}

/** Every descendant of a pid, by walking the process table once. */
export function descendants(root) {
  const out = execFileSync('ps', ['-eo', 'pid=,ppid=,comm='], { encoding: 'utf8' });
  const children = new Map();
  for (const line of out.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) continue;
    const [, pid, ppid, comm] = match;
    if (!children.has(ppid)) children.set(ppid, []);
    children.get(ppid).push({ pid: Number(pid), comm });
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

export function alive(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Native engine processes on the whole machine, by name.
 *
 * Engines are spawned detached into their own process groups, so an orphan
 * is not a descendant of anything the harness can walk from — it has to be
 * found by what it is. The names are the managed engines' binaries; a custom
 * engine a user registered is not in this list, and is theirs.
 */
export function engineProcesses() {
  const out = execFileSync('ps', ['-eo', 'pid=,ppid=,comm='], { encoding: 'utf8' });
  return out
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map(([, pid, ppid, comm]) => ({ pid: Number(pid), ppid: Number(ppid), comm }))
    .filter(({ comm }) => /(^|\/)(stockfish|lc0|stormphrax|kingfisher-tbprobe)[^/]*$/i.test(comm));
}

/** The shell's own log for a profile, or an explanation of why there is none. */
export function shellLog(profile) {
  const file = path.join(profile, 'logs', 'kingfisher.log');
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return `(no log at ${file})`;
  }
}

/**
 * Launch Kingfisher and wait for its window, or explain why there is none.
 *
 * @param {object} options
 * @param {boolean} [options.packaged]  the packaged application, or the checkout
 * @param {string}  [options.profile]   a userData directory; a fresh one is made otherwise
 * @param {string[]} [options.args]     extra command-line arguments (documents, switches)
 * @param {object}  [options.env]       extra environment for the shell
 * @param {number}  [options.timeout]   how long a window may take
 * @param {boolean} [options.offline]   block every request that does not go to loopback
 */
export async function launchKingfisher({
  packaged = false,
  profile = null,
  args = [],
  env = {},
  timeout = 120_000,
  offline = false,
  executablePath = null,
} = {}) {
  const userData = profile ?? mkdtempSync(path.join(tmpdir(), 'kingfisher-harness-'));
  const exe = executablePath ?? (packaged ? packagedBinary() : shellBinary());
  const launch = packaged
    ? { executablePath: exe, args: [...args] }
    : { executablePath: exe, args: [path.join(ROOT, 'desktop'), ...args] };

  const started = Date.now();
  const app = await electron.launch({
    ...launch,
    args: [...launch.args, `--user-data-dir=${userData}`],
    env: { ...process.env, ...env },
    timeout,
  });
  const child = app.process();

  if (offline) {
    await app.evaluate(({ session }) => {
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const local = /^(https?:\/\/)?(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(details.url);
        const internal = /^(devtools|chrome|chrome-extension|blob|data|file):/.test(details.url);
        callback(local || internal ? {} : { cancel: true });
      });
    });
  }

  /*
    The first window, or the reason there will not be one.

    `firstWindow` alone waits its whole timeout when the process has already
    exited, and then names the timeout. Racing the exit turns that into the
    application's own account of what went wrong.
  */
  const exited = new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  const outcome = await Promise.race([
    app.firstWindow({ timeout }).then((window) => ({ window })),
    exited.then((exit) => ({ exit })),
  ]);
  if (outcome.exit) {
    throw new Error(
      `Kingfisher exited before opening a window (${outcome.exit.code ?? outcome.exit.signal}).\n` +
        `Binary: ${exe}\nProfile: ${userData}\n--- shell log ---\n${shellLog(userData)}`,
    );
  }
  const window = outcome.window;
  await window.waitForLoadState('domcontentloaded');
  const ready = Date.now() - started;

  return {
    app,
    window,
    /** The shell's pid; services and renderers hang below it. */
    pid: child.pid,
    profile: userData,
    ownsProfile: profile === null,
    executable: exe,
    bundle: bundleOf(exe),
    readyMs: ready,
    exited,
    /** Close, wait for the shell to go, and delete a profile we made. */
    async close({ keepProfile = false } = {}) {
      const before = descendants(child.pid);
      const closing = Date.now();
      await app.close();
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 15_000))]);
      // Give the operating system a moment to reap before looking for survivors.
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      const survivors = before.filter((p) => alive(p.pid));
      if (profile === null && !keepProfile) rmSync(userData, { recursive: true, force: true });
      return { closeMs: Date.now() - closing, descendants: before.length, survivors };
    },
  };
}

/** Wait until the application has mounted, as the renderer itself reports it. */
export async function waitForReady(window, timeout = 60_000) {
  await window.waitForSelector('html[data-kingfisher-ready="true"]', { timeout });
}
