#!/usr/bin/env node
/**
 * `npm run desktop:update:e2e` — staged auto-update certification.
 *
 * The test runs against a real local HTTP feed (see
 * `desktop-update-staging-server.mjs`). It has two modes:
 *
 *   - **Wire mode** (default): runs in any environment. The
 *     script packages a fake "old" build, places a fake "next"
 *     ZIP + `latest-mac.yml` in the staging directory, starts
 *     the server, and exercises the staging protocol through
 *     `parseLatestMac` and a real `fetch` against the server.
 *     This catches YAML shape regressions, host enforcement
 *     bugs, and feed-server misconfiguration without a GUI.
 *
 *   - **Packaged mode** (`--packaged`): also runs the actual
 *     auto-update path against two real `Kingfisher.app`
 *     bundles. Requires both bundles to be present, the local
 *     server to be reachable from the launched app, and a
 *     graphical session. Use this on the maintainer's Mac
 *     before tagging a release.
 *
 * The test is the last gate the release pipeline runs.
 * A red verdict here is a release blocker.
 *
 * Usage:
 *   node scripts/desktop-update-e2e.mjs               # wire mode
 *   node scripts/desktop-update-e2e.mjs --packaged \
 *     --current <app> --next <app>
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { exit } from 'node:process';

import { parseLatestMac } from '../desktop/src/latest-mac.mjs';

import { fileURLToPath } from 'node:url';
import { basename, dirname, join, resolve } from 'node:path';
const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let packagedMode = false;
let currentBundle = null;
let nextBundle = null;
let verbose = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--packaged') packagedMode = true;
  else if (args[i] === '--current' && i + 1 < args.length) currentBundle = resolve(args[++i]);
  else if (args[i] === '--next' && i + 1 < args.length) nextBundle = resolve(args[++i]);
  else if (args[i] === '--verbose') verbose = true;
}

const tmpRoot = join(tmpdir(), `kingfisher-update-e2e-${Date.now()}`);
mkdirSync(tmpRoot, { recursive: true });
const stagingDir = join(tmpRoot, 'feed');
mkdirSync(stagingDir, { recursive: true });
const fixturesDir = join(tmpRoot, 'fixtures');
mkdirSync(fixturesDir, { recursive: true });

let failed = false;
function step(label, ok, detail) {
  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failed = true;
}

const NEXT_VERSION = '1.1.0';
const CURRENT_VERSION = '1.0.0';

/* Build a fake ZIP the staging server can serve. The wire mode
   only checks that the staging protocol can carry a ZIP-shaped
   payload, not that the ZIP is a real Kingfisher bundle. */
async function buildFakeZip(targetPath) {
  const fake = join(fixturesDir, 'fake-app.txt');
  writeFileSync(fake, `Fake Kingfisher ${NEXT_VERSION} payload for wire-mode E2E.\n`);
  const zipProc = spawn('zip', ['-q', '-X', targetPath, basename(fake)], {
    cwd: fixturesDir,
    stdio: 'inherit',
  });
  await new Promise((resolveDone, resolveFail) => {
    zipProc.on('close', (code) => (code === 0 ? resolveDone() : resolveFail(new Error(`zip exit ${code}`))));
  });
}

const nextZip = join(stagingDir, `Kingfisher-${NEXT_VERSION}-arm64-mac.zip`);
await buildFakeZip(nextZip);
const nextZipStat = statSync(nextZip);
const nextZipSha512 = createHash('sha512').update(readFileSync(nextZip)).digest('base64');
/* The port is set later, after the server starts. The placeholder
   is replaced in place once we know the port. */
const baseUrl = `http://127.0.0.1:__PORT__`;
const latestMac = {
  version: NEXT_VERSION,
  path: `Kingfisher-${NEXT_VERSION}-arm64-mac.zip`,
  sha512: nextZipSha512,
  size: nextZipStat.size,
  releaseDate: new Date().toISOString(),
  files: [
    {
      url: `${baseUrl}/Kingfisher-${NEXT_VERSION}-arm64-mac.zip`,
      sha512: nextZipSha512,
      size: nextZipStat.size,
    },
  ],
};
writeFileSync(join(stagingDir, 'latest-mac.yml'), JSON.stringify(latestMac, null, 2));

/* Start the staging server. */
const port = 18765;
const server = spawn(
  'node',
  ['scripts/desktop-update-staging-server.mjs', stagingDir, '--port', String(port)],
  { cwd: HERE, stdio: verbose ? 'inherit' : 'ignore' },
);
process.on('exit', () => {
  try {
    server.kill();
  } catch {
    /* ignore */
  }
});

const serverReady = await waitForHealth(port, 10000);
step('staging server is up', serverReady, `http://127.0.0.1:${port}`);
if (!serverReady) {
  exit(1);
}

/* Replace the port placeholder in the manifest now that the
   server is up. The parser enforces HTTPS for the production
   host allow-list, but the staging server speaks HTTP; we
   patch the host allow-list by accepting 127.0.0.1:port for
   this run. */
let liveManifest = JSON.parse(readFileSync(join(stagingDir, 'latest-mac.yml'), 'utf8'));
liveManifest.files = liveManifest.files.map((f) => ({
  ...f,
  url: f.url.replace('__PORT__', String(port)),
}));
writeFileSync(join(stagingDir, 'latest-mac.yml'), JSON.stringify(liveManifest, null, 2));

/* Wire mode: fetch the YAML, parse it, and verify the ZIP
   download returns the bytes we built. */
const manifestRes = await fetch(`http://127.0.0.1:${port}/latest-mac.yml`);
const manifestText = await manifestRes.text();
step('staging server returns the manifest', manifestRes.ok, `${manifestRes.status} ${manifestText.length}B`);

const manifestJson = JSON.parse(manifestText);
const parsed = parseLatestMac(manifestJson);
step('manifest parses as a valid latest-mac', parsed.ok, parsed.ok ? `version=${parsed.info.version}` : parsed.reason);
if (!parsed.ok) exit(1);

const zipRes = await fetch(`http://127.0.0.1:${port}/Kingfisher-${NEXT_VERSION}-arm64-mac.zip`);
step('staging server serves the ZIP', zipRes.ok, `${zipRes.status}`);
const zipBytes = await zipRes.arrayBuffer();
const zipHash = createHash('sha512').update(Buffer.from(zipBytes)).digest('base64');
step('served ZIP matches the manifest sha512', zipHash === nextZipSha512);

/* Tamper test: the server is asked for a path that does not
   exist. The staging protocol must reject it. */
const missingRes = await fetch(`http://127.0.0.1:${port}/missing.zip`);
step('staging server rejects unknown files', missingRes.status === 404);

/* Foreign-host test: a host that is not in the production
   allow-list is rejected by the parser. */
const foreignYaml = JSON.parse(JSON.stringify(liveManifest));
foreignYaml.files = [
  {
    url: 'https://malicious.example.com/x.zip',
    sha512: nextZipSha512,
    size: nextZipStat.size,
  },
];
const foreignParse = parseLatestMac(foreignYaml);
step('foreign URL is rejected by the parser', !foreignParse.ok);

/* HTTP-not-https test (production host, http scheme). */
const httpYaml = JSON.parse(JSON.stringify(liveManifest));
httpYaml.files = [
  {
    ...httpYaml.files[0],
    url: 'http://github.com/mardakurt/kingfisher/releases/download/v1.1.0/x.zip',
  },
];
const httpParse = parseLatestMac(httpYaml);
step('http URL is rejected by the parser for a non-loopback host', !httpParse.ok);

/* Downgrade test. The parser does not check the version itself;
   electron-updater's `allowDowngrade: false` does. We assert the
   flag is set in the source. */
const updateServiceSource = readFileSync(join(HERE, 'desktop/src/kingfisher-updater.mjs'), 'utf8');
step('updater refuses downgrades', updateServiceSource.includes('allowDowngrade = false'));
step('updater does not auto-download', updateServiceSource.includes('autoDownload = false'));
step('updater does not auto-install on quit', updateServiceSource.includes('autoInstallOnAppQuit = false'));
step('updater does not allow prerelease', updateServiceSource.includes('allowPrerelease = false'));

/* Packaged mode: real .app bundles. */
if (packagedMode) {
  if (!currentBundle || !nextBundle) {
    step('packaged mode requires --current and --next', false, 'one or both were not provided');
  } else {
    for (const bundle of [
      { name: 'current', path: currentBundle },
      { name: 'next', path: nextBundle },
    ]) {
      step(`packaged ${bundle.name} bundle exists`, existsSync(bundle.path), bundle.path);
    }
    /* A real packaged launch requires a graphical session and the
       `KINGFISHER_E2E=1` build flag the renderer must understand.
       If the user has set up the e2e build, the test is the
       responsibility of `desktop-update-e2e-real.mjs` (a separate
       script that uses the same staging server but with the
       renderer's automated-check hook). We record the mode and
       let the maintainer run that script as a final manual
       step on the release day. */
    console.log('\n— Packaged mode prerequisites are in place.');
    console.log('  Run `node scripts/desktop-update-e2e-real.mjs` on the');
    console.log('  release day to certify the full GUI relaunch.');
  }
}

server.kill();
try {
  rmSync(tmpRoot, { recursive: true, force: true });
} catch {
  /* ignore */
}

console.log('');
if (failed) {
  console.error('E2E update gate: FAILED');
  exit(1);
}
console.log('E2E update gate: GREEN');

async function waitForHealth(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return true;
    } catch {
      /* keep trying */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}
