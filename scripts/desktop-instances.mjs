#!/usr/bin/env node
/**
 * One Kingfisher, however macOS is asked to start it.
 *
 * Every other desktop harness launches the application through Playwright.
 * This one does not: it asks the operating system — `open -a`, `open` with a
 * document, the executable itself — the way the Finder, the Dock and a
 * double-clicked PGN do, against one isolated profile, and reads the shell's
 * own log for what happened. It checks:
 *
 *   - a second launch, by `open` or by the executable, does not start a
 *     second application: the first is told, the profile has one owner;
 *   - a PGN opened with the application running arrives as an `open-file`
 *     event and is opened;
 *   - three PGNs opened at once, twice in quick succession, all arrive;
 *   - a PGN handed to a cold launch arrives before the window and is opened;
 *   - the only sockets the application listens on are loopback, and no
 *     process carries an inspector or remote-debugging switch;
 *   - quitting through the system (AppleScript, as the Dock does) stops
 *     every process and saves the window frame.
 *
 *   npm run desktop:instances        # the packaged application, desktop/dist or KINGFISHER_DESKTOP_OUT
 */

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { exit } from 'node:process';

import { bundleOf, descendants, packagedBinary } from './desktop-lib/launch.mjs';
import { writeCorpus } from './desktop-lib/pgn-corpus.mjs';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const executable = packagedBinary();
const app = bundleOf(executable);
const profile = mkdtempSync(path.join(tmpdir(), 'kingfisher-instances-'));
const corpus = writeCorpus(mkdtempSync(path.join(tmpdir(), 'kingfisher-instances-pgn-')));
const logFile = path.join(profile, 'logs', 'kingfisher.log');
const readLog = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8') : '');

/** Main processes of this profile: the executable with our profile switch, not a helper. */
function mainProcesses() {
  const out = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
  return out
    .split('\n')
    .filter(
      (line) =>
        line.includes(executable) &&
        line.includes(`--user-data-dir=${profile}`) &&
        !/--type=/.test(line),
    )
    .map((line) => Number(line.trim().split(/\s+/)[0]));
}

function everyProcess() {
  const out = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
  return out.split('\n').filter((line) => line.includes(`--user-data-dir=${profile}`));
}

async function waitFor(predicate, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(200);
  }
  console.log(`  … timed out waiting for ${what}`);
  return false;
}

// Anything after `--args` is the application's own argv, which is where a
// document arrives on a command-line launch; `open` does not deliver a
// document as an open-file event alongside `--args`.
const openApp = (...extra) =>
  spawnSync('open', ['-n', '-a', app, '--args', `--user-data-dir=${profile}`, ...extra], {
    encoding: 'utf8',
  });

async function main() {
  console.log('Kingfisher, launched by the system');
  console.log(`application ${app}`);
  console.log(`profile     ${profile}\n`);

  // 1. Cold launch with a document. A double-clicked PGN reaches a cold
  //    application as an `open-file` event on the *default* profile, which
  //    this harness must never touch; `open … --args` does not deliver a
  //    document alongside a profile switch at all. So the cold-launch route
  //    exercised here is the command-line one the shell also handles, and
  //    the `open-file` route is exercised against the running application
  //    below, where a profile switch is not in the way.
  openApp(corpus.normal);
  const up = await waitFor(
    () =>
      /\[window\]|renderer|companion ready|web server/.test(readLog()) ||
      mainProcesses().length === 1,
    30_000,
    'the first launch',
  );
  await sleep(4_000);
  check(
    'the application launched from the system',
    up && mainProcesses().length === 1,
    `${mainProcesses().length} main process(es)`,
  );
  check(
    'a PGN named on the cold launch command line was opened',
    /opening normal\.pgn/.test(readLog()),
    'queued before the window, delivered after',
  );

  // 2. The only listeners are loopback; nothing debuggable is open.
  // The listeners are the shell's forked children — the web server and the
  // companion — which do not carry the profile switch; walk the tree.
  const listeners = [];
  for (const pid of [
    ...mainProcesses(),
    ...descendants(mainProcesses()[0] ?? 0).map((p) => p.pid),
  ]) {
    const lsof = spawnSync('lsof', ['-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN', '-n', '-P'], {
      encoding: 'utf8',
    });
    for (const row of lsof.stdout.split('\n').slice(1)) {
      const name = row.trim().split(/\s+/)[8];
      if (name) listeners.push(name);
    }
  }
  check(
    'every listening socket is on loopback',
    listeners.length >= 1 && listeners.every((name) => name.startsWith('127.0.0.1:')),
    listeners.join(', ') || 'none found',
  );
  check(
    'no process carries an inspector or remote-debugging switch',
    everyProcess().every((line) => !/--(inspect|remote-debugging)/.test(line)),
    `${everyProcess().length} process(es) inspected`,
  );

  // 3. A second launch by `open`, and one by the executable.
  const before = readLog().length;
  openApp();
  await sleep(3_000);
  check(
    'a second `open` did not start a second application',
    mainProcesses().length === 1,
    `${mainProcesses().length} main process(es)`,
  );
  check(
    'and the first was told',
    /second instance was refused/.test(readLog().slice(before)),
    'from the shell log',
  );

  const direct = spawn(executable, [`--user-data-dir=${profile}`], {
    stdio: 'ignore',
    detached: true,
  });
  direct.unref();
  await sleep(3_000);
  check(
    'a direct launch of the executable did not start a second application',
    mainProcesses().length === 1,
    `${mainProcesses().length} main process(es)`,
  );

  // 4. Documents to the running application, one and then a burst of six.
  const mark = readLog().length;
  spawnSync('open', ['-a', app, corpus.special], { encoding: 'utf8' });
  await waitFor(
    () => /open-file from the system: special-moves\.pgn/.test(readLog().slice(mark)),
    10_000,
    'the open-file event',
  );
  check(
    'a PGN opened while running arrives as an open-file event',
    /open-file from the system: special-moves\.pgn/.test(readLog().slice(mark)),
  );

  const burstMark = readLog().length;
  spawnSync('open', ['-a', app, corpus.setup, corpus.variations, corpus.longGame], {
    encoding: 'utf8',
  });
  spawnSync('open', ['-a', app, corpus.setup, corpus.variations, corpus.longGame], {
    encoding: 'utf8',
  });
  await waitFor(
    () =>
      (
        readLog()
          .slice(burstMark)
          .match(/open-file from the system/g) ?? []
      ).length >= 6,
    15_000,
    'six open-file events',
  );
  const arrived = (
    readLog()
      .slice(burstMark)
      .match(/open-file from the system/g) ?? []
  ).length;
  check('six PGNs opened in two rapid bursts all arrive', arrived === 6, `${arrived} of 6`);
  check(
    'still one application',
    mainProcesses().length === 1,
    `${mainProcesses().length} main process(es)`,
  );

  // 5. Quit the way the Dock does.
  const quitMark = readLog().length;
  spawnSync('osascript', ['-e', 'tell application "Kingfisher" to quit'], { encoding: 'utf8' });
  const gone = await waitFor(() => everyProcess().length === 0, 15_000, 'every process to exit');
  check('quitting through the system stops every process', gone, `${everyProcess().length} left`);
  check(
    'the frame was saved and the services stopped',
    /saved bounds/.test(readLog().slice(quitMark)) &&
      /services stopped/.test(readLog().slice(quitMark)),
  );

  return results;
}

main()
  .then((rows) => {
    const failed = rows.filter((row) => !row.ok);
    console.log(`\n${rows.length - failed.length}/${rows.length} checks passed`);
    if (failed.length) {
      console.log(`profile kept: ${profile}`);
      console.log('--- shell log ---');
      console.log(readLog());
    } else {
      rmSync(profile, { recursive: true, force: true });
    }
    exit(failed.length === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error(`\nThe run failed to complete: ${error?.stack ?? error}`);
    for (const pid of mainProcesses()) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        /* gone */
      }
    }
    exit(2);
  });
