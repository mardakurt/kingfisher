#!/usr/bin/env node
/**
 * Real Lichess archives, imported the way Databases → Import a large file
 * imports them: a companion process, `/db/create` with the compact
 * (`postings`) index, `/db/import-file` with the publisher's SHA-256, then
 * polled exactly as the dialog polls.
 *
 *   node scripts/large-db-import.mjs --dir=<collections> \
 *     --tier=<name>:<archive.pgn.zst>:<sha256> [--tier=…] [--cancel-first]
 *
 * Measures, per tier: games accepted, duplicates, rejected, wall time,
 * games/s, companion resident memory (sampled), and bytes on disk. With
 * `--cancel-first`, the first tier is stopped part-way, its committed count
 * read back, and the same archive imported again into the same collection —
 * which must finish with the archive's games once, not twice.
 *
 * Writes a JSON report to `--report=`. Leaves the companion's collections in
 * `--dir` for the UI acceptance that follows.
 */

import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { argv, exit } from 'node:process';

const all = (name) =>
  argv.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
const one = (name, fallback) => all(name)[0] ?? fallback;
const DIR = one('dir');
const PORT = Number(one('port', '4339'));
const TOKEN = 'large-db-acceptance';
const REPORT = one('report', path.join(DIR ?? '.', 'large-db-import.json'));
const tiers = all('tier').map((spec) => {
  const [name, file, sha256] = spec.split(':');
  return { name, file, sha256 };
});
if (!DIR || tiers.length === 0) {
  console.error('--dir and at least one --tier=<name>:<file>:<sha256> are required');
  exit(2);
}
mkdirSync(DIR, { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const base = `http://127.0.0.1:${PORT}`;
async function post(route, body, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await postOnce(route, body);
    } catch (error) {
      // A reset keep-alive socket is not a failed import; a dead companion fails every attempt.
      if (attempt >= attempts || !/fetch failed/.test(String(error))) throw error;
      console.log(`  ${route}: ${String(error.cause?.code ?? error)} — retrying (${attempt})`);
      await wait(1000);
    }
  }
}
async function postOnce(route, body) {
  const response = await fetch(`${base}${route}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${route} ${response.status}: ${JSON.stringify(json)}`);
  return json;
}
const rssMb = (pid) => {
  try {
    return Math.round(
      Number(
        execFileSync('ps', ['-o', 'rss=', '-p', String(pid)])
          .toString()
          .trim(),
      ) / 1024,
    );
  } catch {
    return null;
  }
};
const bytesOn = (dir, prefix) =>
  readdirSync(dir)
    .filter((name) => name.startsWith(prefix))
    .reduce((sum, name) => sum + statSync(path.join(dir, name)).size, 0);

const companion = spawn(process.execPath, ['companion/src/server.mjs'], {
  env: {
    ...process.env,
    KINGFISHER_COMPANION_PORT: String(PORT),
    KINGFISHER_COMPANION_TOKEN: TOKEN,
    KINGFISHER_COMPANION_DATA_DIR: DIR,
  },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const report = { startedAt: new Date().toISOString(), companionPid: companion.pid, tiers: [] };
// If the companion ends, say how: a crash and a dropped connection look alike from fetch.
companion.on('exit', (code, signal) => {
  report.companionExit = { code, signal, at: new Date().toISOString() };
  console.log(`  companion exited: code ${code} signal ${signal}`);
});

async function importInto(key, tier, { stopAt } = {}) {
  const { jobId } = await post('/db/import-file', {
    key,
    path: tier.file,
    sha256: tier.sha256,
    licence: 'CC0 1.0 — Lichess standard rated games database',
    maxBytes: 40 * 1024 ** 3,
    keepPositions: true,
    minRating: 0,
    excludeBots: false,
  });
  const samples = [];
  let status;
  let stopped = false;
  for (;;) {
    await wait(2000);
    status = await post('/db/import-file-status', { jobId });
    const rss = rssMb(companion.pid);
    samples.push({
      t: Math.round(status.elapsedMs ?? 0),
      phase: status.phase,
      imported: status.imported ?? 0,
      rss,
    });
    if (samples.length % 15 === 0)
      console.log(`  ${tier.name}: ${status.phase} ${status.imported ?? 0} games, rss ${rss} MB`);
    if (stopAt && !stopped && (status.imported ?? 0) >= stopAt) {
      const asked = Date.now();
      await post('/db/import-file-cancel', { jobId });
      stopped = asked;
    }
    if (['done', 'stopped', 'failed'].includes(status.phase)) break;
  }
  return { status, samples, stopLatencyMs: stopped ? Date.now() - stopped : null };
}

async function main() {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`${base}/health`);
      break;
    } catch {
      await wait(200);
    }
  }
  for (const [index, tier] of tiers.entries()) {
    const name = `lichess-${tier.name}`;
    const created = await post('/db/create', { name, layout: 'postings' });
    const entry = { tier: tier.name, file: path.basename(tier.file), key: created.key };
    console.log(`${name}: importing ${path.basename(tier.file)}`);

    if (index === 0 && argv.includes('--cancel-first')) {
      const partial = await importInto(created.key, tier, { stopAt: 40_000 });
      entry.cancelled = {
        phase: partial.status.phase,
        committed: partial.status.imported,
        stopLatencyMs: partial.stopLatencyMs,
      };
      console.log(`  stopped: ${JSON.stringify(entry.cancelled)}`);
    }
    const started = Date.now();
    const run = await importInto(created.key, tier);
    const wallMs = Date.now() - started;
    const s = run.status;
    entry.result = {
      phase: s.phase,
      imported: s.imported,
      duplicates: s.duplicates,
      rejected: s.rejected,
      filtered: s.filtered,
      wallSeconds: Math.round(wallMs / 1000),
      gamesPerSecond: Math.round((s.imported + s.duplicates) / (wallMs / 1000)),
      peakRssMb: Math.max(...run.samples.map((x) => x.rss ?? 0)),
      bytesOnDisk: bytesOn(DIR, name),
    };
    entry.samples = run.samples;
    report.tiers.push(entry);
    console.log(`  ${JSON.stringify(entry.result)}`);
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
  }
}

main()
  .catch((error) => {
    report.error = String(error?.stack ?? error);
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
    companion.kill('SIGTERM');
    console.log(`report: ${REPORT}`);
  });
