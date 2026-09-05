#!/usr/bin/env node

/**
 * Install every managed engine this platform offers, and interrogate it.
 *
 * Kingfisher's engine rows claim MultiPV, WDL, searchmoves and Syzygy support.
 * This is where those claims are produced: each engine is downloaded, checked
 * against its recorded digest, launched, and asked. Nothing here reads a name
 * and infers a capability.
 *
 *   node scripts/verify-engine-fleet.mjs
 *   node scripts/verify-engine-fleet.mjs --keep   # leave the binaries in place
 */

import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ManagedEngines } from '../companion/src/managed-engines.mjs';
import { cpuFeatures } from '../companion/src/cpu.mjs';
import { CATALOGUE, DIGESTS, PLATFORM } from './engine-catalogue.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = process.env.KINGFISHER_FLEET_DIR ?? path.join(ROOT, '.engine-fleet');

async function main() {
  const keep = process.argv.includes('--keep');
  mkdirSync(DIR, { recursive: true });
  const features = cpuFeatures();
  const managed = new ManagedEngines({
    catalogue: CATALOGUE,
    digests: DIGESTS,
    platform: PLATFORM,
    engineDir: DIR,
    recordFile: path.join(DIR, 'engines.json'),
    registry: { register() {}, unregister() {} },
    features,
  });

  console.log(`Kingfisher engine fleet — ${PLATFORM}`);
  console.log(`cpu features  ${features.join(', ') || 'none detected'}`);

  const rows = [];
  for (const entry of managed.list()) {
    /*
      A `system` engine — Lc0 today — is located on the path rather than
      downloaded, and used to be skipped here entirely. Skipping it meant its
      capability row was dashes for ever, which reads as "unknown" and is
      indistinguishable from "never asked". It is now put through exactly the
      same interrogation as a downloaded binary, because the interesting claim
      is identical: does it speak UCI, and can it find a move?

      For Lc0 that second question is the whole question. Its handshake
      succeeds with no network weights at all; only a real search proves it has
      something to think with. `managed.install` already requires both, so the
      only change needed here was to stop stepping around it.

      An absent system engine is not a failure. Most machines, and every CI
      runner, will not have one, and reporting that as a broken fleet would
      make the exit code meaningless.
    */
    if (entry.kind === 'system') {
      process.stdout.write(`locating ${entry.id}… `);
      try {
        const record = await managed.install(entry.id);
        console.log('found and verified');
        rows.push({
          ...entry,
          status: `located and verified at ${record.binary ?? 'the path'}`,
          reported: record.reportedName,
          capabilities: record.capabilities,
        });
      } catch (error) {
        console.log('not on this machine');
        rows.push({
          ...entry,
          status: `not on this machine (${error instanceof Error ? error.message : error})`,
          absent: true,
        });
      }
      continue;
    }
    if (!entry.available) {
      rows.push({ ...entry, status: entry.unavailableReason ?? 'no compatible build' });
      continue;
    }
    process.stdout.write(`installing ${entry.id}… `);
    try {
      const record = await managed.install(entry.id);
      const can = record.capabilities;
      console.log('verified');
      rows.push({
        ...entry,
        status: 'installed and verified',
        reported: record.reportedName,
        binarySha256: record.binarySha256,
        capabilities: can,
        checks: Object.fromEntries(
          Object.entries(record.checks).map(([name, value]) => [name, value.ok]),
        ),
      });
    } catch (error) {
      console.log('FAILED');
      rows.push({ ...entry, status: `FAILED: ${error instanceof Error ? error.message : error}` });
    }
  }

  console.log('');
  // An absent field means the check was never run, which is not the same
  // answer as "no" and must not be printed as one.
  const capability = (row, name) =>
    !row.capabilities || row.capabilities[name] === undefined
      ? '—'
      : row.capabilities[name]
        ? 'yes'
        : 'no';
  const pad = (value, width) => String(value).padEnd(width);
  console.log(
    `${pad('engine', 18)}${pad('version', 9)}${pad('multipv', 9)}${pad('wdl', 6)}` +
      `${pad('srchmvs', 9)}${pad('syzygy', 8)}${pad('chess960', 10)}status`,
  );
  for (const row of rows) {
    console.log(
      pad(row.id, 18) +
        pad(row.version ?? '—', 9) +
        pad(capability(row, 'multipv'), 9) +
        pad(capability(row, 'wdl'), 6) +
        pad(capability(row, 'searchmoves'), 9) +
        pad(capability(row, 'syzygy'), 8) +
        pad(capability(row, 'chess960'), 10) +
        row.status,
    );
    if (row.reported) console.log(`  reported by UCI  ${row.reported}`);
    if (row.binarySha256) console.log(`  binary sha256    ${row.binarySha256}`);
  }

  const failed = rows.filter((row) => String(row.status).startsWith('FAILED'));
  if (!keep) rmSync(DIR, { recursive: true, force: true });
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
