#!/usr/bin/env node
/**
 * A shell that is killed — a crash, a force quit, the operating system — must
 * still take its services with it, and Kingfisher must open again afterwards.
 *
 * Before 1.4.8 the companion honoured this and the web server did not: it was
 * left orphaned on the profile's port, and every later launch refused with
 * "Kingfisher needs its own port" until the orphan was found and killed or the
 * Mac restarted (closure audit, 2026-10-05; three orphans from three quits).
 *
 *   KINGFISHER_DESKTOP_APP=<Kingfisher.app> node scripts/desktop-killed-shell.mjs
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { exit } from 'node:process';

import { alive, descendants, launchKingfisher, waitForReady } from './desktop-lib/launch.mjs';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const profile = mkdtempSync(path.join(tmpdir(), 'kingfisher-killed-shell-'));
let second = null;
try {
  const first = await launchKingfisher({ packaged: true, profile });
  await waitForReady(first.window);
  const services = descendants(first.pid);
  const port = JSON.parse(readFileSync(path.join(profile, 'origin.json'), 'utf8')).port;
  check(
    'the application is running with its services',
    services.length > 0,
    `${services.length} processes, port ${port}`,
  );

  process.kill(first.pid, 'SIGKILL');
  let left = services.filter((p) => alive(p.pid));
  for (let i = 0; i < 40 && left.length; i++) {
    await wait(250);
    left = services.filter((p) => alive(p.pid));
  }
  check(
    'every service ends within 10 s of the shell being killed',
    left.length === 0,
    left.length
      ? `still alive: ${left.map((p) => `${p.pid} ${p.comm.split('/').pop()}`).join(', ')}`
      : 'none left',
  );

  second = await launchKingfisher({ packaged: true, profile, timeout: 30_000 }).catch(
    (error) => error,
  );
  const reopened = !(second instanceof Error);
  check(
    'Kingfisher opens again on the same profile',
    reopened,
    reopened ? '' : String(second.message).split('\n').slice(0, 3).join(' '),
  );
  if (reopened) {
    await waitForReady(second.window);
    const closed = await second.close({ keepProfile: true });
    check('and quits cleanly', closed.survivors.length === 0, `${closed.descendants} descendants`);
  }
  for (const p of left) {
    try {
      process.kill(p.pid, 'SIGKILL');
    } catch {
      /* gone */
    }
  }
} catch (error) {
  check(
    'the run completed without an exception',
    false,
    String(error?.message ?? error).slice(0, 400),
  );
} finally {
  rmSync(profile, { recursive: true, force: true });
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
  exit(results.every((r) => r.ok) ? 0 : 1);
}
