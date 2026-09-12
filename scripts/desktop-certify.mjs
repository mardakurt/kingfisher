#!/usr/bin/env node
/**
 * `npm run desktop:certify` — the maintainer's one-shot desktop quality gate.
 *
 * Runs the desktop checks a packaged Kingfisher.app should pass before a
 * maintainer calls the application healthy on macOS. The gate is deliberately
 * cheap: each command is one the maintainer would otherwise run by hand, the
 * script just runs them in order, stops on the first red, and prints the
 * verdict in a format a CI matrix would understand.
 *
 * What it does NOT cover:
 *   - signing identity — `npm run desktop:trust:verify` is the separate gate
 *     and it is allowed to be red when the Developer ID Application
 *     certificate is absent.
 *   - notarization — same.
 *   - real-Safari — that is the web surface, not the Electron one.
 *   - Wave 1 user feedback — that arrives in `docs/product/first-100-field-findings.md`.
 *
 * Usage:
 *   node scripts/desktop-certify.mjs                       # against the packaged app at /Applications/Kingfisher.app
 *   node scripts/desktop-certify.mjs /path/to/Kingfisher.app  # against an arbitrary build
 *
 * Each step prints ✓ or ✗ and the script exits non-zero on any ✗.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const target = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join('/', 'Applications', 'Kingfisher.app');

if (!existsSync(target)) {
  console.error(`No Kingfisher at ${target}.`);
  console.error(`Run \`npm run desktop:dist\` first, or pass the path explicitly.`);
  exit(1);
}

console.log(`Desktop certification target: ${target}\n`);

let failed = false;
function step(label, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failed = true;
}

function runNpmScript(label, args, env = {}) {
  const result = spawnSync('npm', ['run', ...args], {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
  });
  const stdout = String(result.stdout ?? '');
  const stderr = String(result.stderr ?? '');
  // Print the last few lines so a maintainer can see what happened.
  const tail = stdout
    .split('\n')
    .filter((l) => l.includes('✓') || l.includes('✗') || l.includes('OK') || l.includes('failed'))
    .slice(-6)
    .join('\n');
  step(
    label,
    result.status === 0,
    tail || (result.status === 0 ? 'passed' : `exit ${result.status}`),
  );
  if (result.status !== 0 && (stdout || stderr)) {
    console.log('---');
    console.log((stderr || stdout).split('\n').slice(-15).join('\n'));
    console.log('---');
  }
}

/* 1. The shell starts, the renderer paints, no orphan engines. */
runNpmScript('desktop smoke', ['desktop:smoke', '--', '--packaged', '--keep-open']);

/* 2. The window chrome does not collide with anything the renderer draws. */
runNpmScript('window chrome', ['desktop:chrome', '--', '--packaged']);

/* 3. Quit, reopen, work is still there. */
runNpmScript('restart preserves work', ['desktop:restart', '--', '--packaged']);

/* 4. Managed engines start, search, and stop cleanly. */
runNpmScript('managed engines', ['desktop:engines', '--', '--packaged']);

/* 5. Sleep/wake: stop every process for 20 s and resume, as a sleep does. */
runNpmScript('suspend / resume', ['desktop:suspend', '--', '--packaged']);

/* 6. DMG structure and volume icon. */
const dmgPath = path.join(ROOT, 'desktop', 'dist', 'mac-arm64', 'Kingfisher-1.0.0-arm64.dmg');
const altDmg = path.join('/var/folders', 'kingfisher-desktop-dist', 'Kingfisher-1.0.0-arm64.dmg');
const dmg = existsSync(dmgPath) ? dmgPath : existsSync(altDmg) ? altDmg : null;
if (dmg) {
  runNpmScript('dmg structure', ['--silent', '--', 'desktop:dmg:verify', dmg]);
} else {
  step('dmg structure', false, 'no DMG found at desktop/dist/mac-arm64/');
}

/* 7. The unit/integration tests that pin the desktop shell. */
runNpmScript('desktop unit tests', ['test:no-skips']);

console.log('');
if (failed) {
  console.log('DESKTOP CERTIFICATION: FAILED');
  console.log('Resolve the failing checks above and re-run.');
  exit(1);
} else {
  console.log('DESKTOP CERTIFICATION: PASSED');
  console.log('The application is healthy on macOS subject to the trust gate.');
  exit(0);
}
