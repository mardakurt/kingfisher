#!/usr/bin/env node
/**
 * `npm run desktop:certify` — the packaged macOS gate, one command.
 *
 * Every step runs against the **packaged** application: the `Kingfisher.app`
 * electron-builder produced, launched as a user would launch it, with an
 * isolated profile. The checkout shell is not certified here; it is a
 * development convenience and the bundle is what ships.
 *
 * The Phase 45 version of this script could not pass. It left the smoke run
 * open with `--keep-open`, looked for the DMG in a directory that does not
 * exist, invoked a `desktop:dmg:verify` script the root package does not
 * have, and called a static skip-scan "the unit tests". It reported PASSED
 * on a bundle that exited on launch. Each step below is a real command with
 * a real target, and any red is a failed certification.
 *
 *   npm run desktop:certify                          # desktop/dist (or KINGFISHER_DESKTOP_OUT)
 *   npm run desktop:certify -- --app /path/to/Kingfisher.app
 *   npm run desktop:certify -- --dmg /path/to/Kingfisher-*.dmg
 *   npm run desktop:certify -- --quick               # skip the walk and the engine fleet
 *
 * Steps:
 *   1. smoke      launch, bridge, isolation, companion, PGN, tablebase, quit — 17 checks
 *   2. chrome     the window buttons against every layout — 107 checks
 *   3. restart    quit and reopen; the work is still there
 *   4. engines    every managed engine installed and searched in the bundle (skipped with --quick)
 *   5. suspend    stop every process for 20 s, resume
 *   6. walk       a 200-action seeded walk with invariants, one with faults injected (skipped with --quick)
 *   7. dmg        the disk image: launchable bundle, identity, signature, layout
 *   8. tests      the unit and integration suite, with the zero-skip scan
 *
 * Not covered here, deliberately: signing identity and notarisation
 * (`desktop:trust:verify`, allowed to be red without a Developer ID
 * certificate) and the public download (`desktop:public:verify`, about the
 * bytes on GitHub rather than the bytes on disk).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { bundleOf, packagedBinary } from './desktop-lib/launch.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const value = (name) => {
  const found = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (found) return found.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--')
    ? argv[index + 1]
    : null;
};
const quick = argv.includes('--quick');

// --- the target ---------------------------------------------------------------

const env = { ...process.env };
if (value('app')) env.KINGFISHER_DESKTOP_APP = path.resolve(value('app'));
let executable;
try {
  executable = packagedBinary(env);
} catch (error) {
  console.error(error.message);
  exit(1);
}
const app = bundleOf(executable);
const out = env.KINGFISHER_DESKTOP_OUT ?? path.join(ROOT, 'desktop', 'dist');

/** The DMG beside the bundle, newest first, unless one was named. */
function findDmg() {
  if (value('dmg')) return path.resolve(value('dmg'));
  const dir = env.KINGFISHER_DESKTOP_APP ? path.dirname(path.dirname(app)) : out;
  if (!existsSync(dir)) return null;
  const candidates = readdirSync(dir)
    .filter((name) => /^Kingfisher-.*-arm64\.dmg$/.test(name))
    .map((name) => path.join(dir, name))
    .sort((a, b) => (a < b ? 1 : -1));
  return candidates[0] ?? null;
}
const dmg = findDmg();

console.log('Kingfisher desktop certification');
console.log(`application  ${app}`);
console.log(`disk image   ${dmg ?? '(none found)'}`);
console.log(`mode         ${quick ? 'quick' : 'full'}\n`);

// --- steps ------------------------------------------------------------------------

const results = [];

function run(label, command, args, options = {}) {
  const started = Date.now();
  process.stdout.write(`▶ ${label}\n`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: { ...env, ...(options.env ?? {}) },
    stdio: 'pipe',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const ok = result.status === 0;
  // The lines that say what happened: check marks and summaries.
  const summary = output
    .split('\n')
    .filter((line) => /checks passed|passed \(|Tests |findings:|DMG verified|FAILED|✗/.test(line))
    .slice(-4)
    .join(' · ')
    .trim();
  results.push({ label, ok, seconds, summary });
  console.log(`${ok ? '✓' : '✗'} ${label} — ${seconds} s${summary ? ` — ${summary}` : ''}`);
  if (!ok) {
    console.log('---');
    console.log(output.split('\n').slice(-30).join('\n'));
    console.log('---');
  }
  return ok;
}

const node = process.execPath;
const script = (name) => path.join(HERE, name);

run('smoke: launch, bridge, isolation, companion, PGN, tablebase, quit', node, [
  script('desktop-smoke.mjs'),
  '--packaged',
]);
run('chrome: the window buttons against every layout', node, [
  script('desktop-chrome.mjs'),
  '--packaged',
]);
run('restart: quit and reopen, work still there', node, [
  script('desktop-restart.mjs'),
  '--packaged',
]);
if (!quick) {
  run('engines: every managed engine, installed and searched in the bundle', node, [
    script('desktop-engines.mjs'),
    '--packaged',
  ]);
}
run('suspend: every process stopped for 20 s, then resumed', node, [
  script('desktop-suspend.mjs'),
  '--packaged',
]);
if (!quick) {
  run('walk: 200 seeded actions with invariants (seed 46)', node, [
    script('desktop-walk.mjs'),
    '--packaged',
    '--seed=46',
    '--actions=200',
    '--quiet',
  ]);
  run('walk: 120 seeded actions with faults injected (seed 7)', node, [
    script('desktop-walk.mjs'),
    '--packaged',
    '--seed=7',
    '--actions=120',
    '--faults',
    '--quiet',
  ]);
}
if (dmg) {
  run('dmg: launchable bundle, identity, signature, layout', node, [
    path.join(ROOT, 'desktop', 'scripts', 'verify-dmg.mjs'),
    dmg,
  ]);
} else {
  results.push({ label: 'dmg', ok: false, seconds: '0', summary: 'no DMG found' });
  console.log('✗ dmg — no Kingfisher-*-arm64.dmg found; pass --dmg');
}
run('tests: no skipped tests anywhere', node, [script('test-no-skips.mjs')]);
run('tests: unit and integration suite', 'npx', ['vitest', 'run'], { env: { CI: '1' } });

// --- verdict --------------------------------------------------------------------

const failed = results.filter((r) => !r.ok);
console.log('');
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.label}`);
console.log('');
if (failed.length === 0) {
  console.log(`DESKTOP CERTIFIED — ${app}`);
  console.log(
    'Every step ran against the packaged application. Signing identity and the public download are separate gates.',
  );
  exit(0);
}
console.log(`DESKTOP CERTIFICATION FAILED — ${failed.length} of ${results.length} steps`);
exit(1);
