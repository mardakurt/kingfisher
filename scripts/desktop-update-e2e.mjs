#!/usr/bin/env node
/**
 * `npm run desktop:update:e2e` — the update feed, end to end on the wire.
 *
 * Takes the update archive `desktop:dist` produced, writes a Sparkle feed
 * for it the way `release:mac:appcast` does, serves both from the staging
 * server the way GitHub Releases serves the real ones (redirect included),
 * and checks what an installed Kingfisher would find:
 *
 *   - the feed resolves through `/releases/latest/download/appcast.xml`
 *     and describes exactly the archive beside it;
 *   - the archive downloads intact, whole and by byte range (Sparkle
 *     resumes interrupted downloads with a Range request);
 *   - the feed's EdDSA signature verifies for the served bytes with
 *     Sparkle's own `sign_update`, and fails for a tampered copy;
 *   - the archive's bundle names the production feed and the recorded key.
 *
 * No GUI is involved; the update as a person performs it is
 * `desktop:update:real`. This is the gate the release pipeline runs on a
 * macOS runner after `desktop:dist`, where the Sparkle tools are vendored
 * and the signing key is in the keychain (or passed with `--ed-key-file`).
 *
 * Usage:
 *   node scripts/desktop-update-e2e.mjs [--zip <file>] [--ed-key-file <file>] [--account <name>]
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exit } from 'node:process';

import { TOOLS, isVendored } from '../desktop/scripts/fetch-sparkle.mjs';
import { readSparkleRecord } from '../desktop/src/sparkle-bundle.mjs';
import {
  SPARKLE_KEYCHAIN_ACCOUNT,
  appcastMismatch,
  describeArchive,
  releaseNotesHtml,
  summarizeAppcast,
  versionOfArchive,
  writeAppcast,
} from './desktop-mac-appcast.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? null : args[at + 1];
};

let failed = false;
function step(label, ok, detail) {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failed = true;
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

if (!isVendored()) {
  console.error('Sparkle is not vendored; run npm run desktop:sparkle:fetch first.');
  exit(1);
}
const out = path.resolve(process.env.KINGFISHER_DESKTOP_OUT ?? path.join(ROOT, 'desktop', 'dist'));
let zip = option('zip');
if (!zip) {
  const zips = existsSync(out) ? readdirSync(out).filter((name) => versionOfArchive(name)) : [];
  if (zips.length !== 1) {
    console.error(
      zips.length === 0
        ? `No Kingfisher-<version>-arm64.zip in ${out}; run npm run desktop:dist first, or pass --zip.`
        : `More than one update archive in ${out}; pass --zip:\n  ${zips.join('\n  ')}`,
    );
    exit(1);
  }
  zip = path.join(out, zips[0]);
}
zip = path.resolve(zip);
const zipName = path.basename(zip);
const version = versionOfArchive(zipName);
const edKeyFile = option('ed-key-file');
const account = option('account') ?? SPARKLE_KEYCHAIN_ACCOUNT;
const keyArgs = edKeyFile ? ['--ed-key-file', edKeyFile] : ['--account', account];

const staging = mkdtempSync(path.join(tmpdir(), 'kingfisher-update-e2e-'));
const port = 8765 + Math.floor(Math.random() * 1000);
const origin = `http://127.0.0.1:${port}`;
let server = null;
try {
  console.log(`Kingfisher update feed, on the wire\narchive  ${zip}\nstaging  ${staging}\n`);

  // --- 1. The feed, as the release process writes it. -----------------------
  writeFileSync(path.join(staging, zipName), readFileSync(zip));
  const written = writeAppcast({
    zip: path.join(staging, zipName),
    out: staging,
    downloadUrlPrefix: `${origin}/releases/download/staging/`,
    edKeyFile,
    account,
    latestMac: true,
    log: () => {},
  });
  step(
    'appcast written for the archive',
    existsSync(written.appcast),
    `${written.summary.title} · build ${written.summary.version}`,
  );
  // Release notes come from CHANGELOG.md's entry for the version; a build
  // of a version the changelog does not yet name has none, and says so.
  const notesExpected = Boolean(
    releaseNotesHtml(readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'), version),
  );
  step(
    'the feed carries the build number, the version, the macOS floor and the release notes',
    /^\d+$/.test(written.summary.version ?? '') &&
      written.summary.shortVersion === version &&
      Boolean(written.summary.minimumSystemVersion) &&
      written.summary.hasNotes === notesExpected,
    `macOS ${written.summary.minimumSystemVersion}+ · notes ${written.summary.hasNotes ? 'embedded' : notesExpected ? 'MISSING' : `none (CHANGELOG.md has no ${version} entry yet)`}`,
  );
  step(
    'latest-mac.yml written for the installs that predate Sparkle',
    existsSync(path.join(staging, 'latest-mac.yml')),
  );

  // --- 2. The server, and the redirect an installed Kingfisher follows. ------
  server = spawn(
    process.execPath,
    [path.join(ROOT, 'scripts/desktop-update-staging-server.mjs'), staging, '--port', String(port)],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  for (let i = 0; i < 50; i += 1) {
    try {
      if ((await fetch(`${origin}/health`)).ok) break;
    } catch {
      /* not yet */
    }
    await wait(200);
  }
  const hop = await fetch(`${origin}/releases/latest/download/appcast.xml`, { redirect: 'manual' });
  step(
    '/releases/latest/download/appcast.xml redirects, as GitHub does',
    hop.status === 302 && hop.headers.get('location') === '/releases/download/staging/appcast.xml',
    `${hop.status} → ${hop.headers.get('location')}`,
  );
  const feed = await fetch(`${origin}/releases/latest/download/appcast.xml`);
  const xml = feed.ok ? await feed.text() : '';
  const summary = summarizeAppcast(xml);
  const mismatch = appcastMismatch(summary, {
    tag: 'staging',
    version,
    zipSize: statSync(zip).size,
    host: origin,
    allowHttp: true,
  });
  step(
    'the served feed describes exactly the archive beside it',
    feed.ok && mismatch === null,
    mismatch ?? summary.url,
  );

  // --- 3. The archive, whole and by range. ------------------------------------
  const whole = await fetch(summary.url);
  const bytes = Buffer.from(await whole.arrayBuffer());
  const local = readFileSync(zip);
  step(
    'the archive downloads intact',
    whole.ok && sha256(bytes) === sha256(local) && bytes.length === summary.length,
    `${bytes.length} bytes`,
  );
  const ranged = await fetch(summary.url, { headers: { range: 'bytes=1000-1999' } });
  const slice = Buffer.from(await ranged.arrayBuffer());
  step(
    'a byte-range request is honoured (Sparkle resumes downloads with one)',
    ranged.status === 206 &&
      slice.equals(local.subarray(1000, 2000)) &&
      ranged.headers.get('content-range') === `bytes 1000-1999/${local.length}`,
    `${ranged.status} ${ranged.headers.get('content-range')}`,
  );

  // --- 4. The signature, with Sparkle's own tool. -----------------------------
  const served = path.join(staging, 'served.zip');
  writeFileSync(served, bytes);
  const verify = spawnSync(
    path.join(TOOLS, 'sign_update'),
    ['--verify', ...keyArgs, served, summary.edSignature],
    { encoding: 'utf8' },
  );
  step(
    'the feed signature verifies for the served bytes',
    verify.status === 0,
    verify.stderr.trim() || 'sign_update --verify: ok',
  );
  bytes[Math.floor(bytes.length / 2)] ^= 0x01;
  writeFileSync(served, bytes);
  const tampered = spawnSync(
    path.join(TOOLS, 'sign_update'),
    ['--verify', ...keyArgs, served, summary.edSignature],
    { encoding: 'utf8' },
  );
  step(
    'one flipped byte fails the same verification',
    tampered.status !== 0,
    `exit ${tampered.status}`,
  );

  // --- 5. The bundle inside names the production feed and the recorded key. --
  const record = readSparkleRecord();
  const built = describeArchive(zip);
  step(
    'the archived bundle names the production feed and the recorded key',
    Boolean(built) &&
      /^https:\/\//.test(built.feedURL ?? '') &&
      built.publicKey === record.publicKey,
    built ? `${built.feedURL} · key ${built.publicKey?.slice(0, 8)}…` : 'no bundle in the archive',
  );
  step(
    'the feed offers exactly that bundle',
    Boolean(built) && built.build === summary.version && built.version === summary.shortVersion,
    built ? `bundle ${built.version} build ${built.build}` : '',
  );

  // --- 6. What the server saw: the two hops and the downloads, nothing else. --
  const requests = await (await fetch(`${origin}/requests`)).json();
  const paths = requests.map((r) => r.path).filter((p) => p !== '/health' && p !== '/requests');
  step(
    'the server saw the feed hops and the archive requests only',
    paths.every((p) => p.startsWith('/releases/')),
    paths.join(' '),
  );
} catch (error) {
  step('the run completed', false, String(error?.stack ?? error));
} finally {
  server?.kill();
  rmSync(staging, { recursive: true, force: true });
}

console.log(failed ? '\nUpdate feed on the wire: FAILED' : '\nUpdate feed on the wire: PASS');
exit(failed ? 1 : 0);
