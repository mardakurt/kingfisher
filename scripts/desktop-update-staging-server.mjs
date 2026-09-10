#!/usr/bin/env node
/**
 * `npm run desktop:update:staging:serve` — local update feed for
 * the auto-update E2E test.
 *
 * The server speaks just enough of the electron-updater feed
 * protocol to feed a packaged Kingfisher against a deterministic
 * candidate without touching GitHub. The staging test goes:
 *
 *   1. Build two packaged Kingfisher.app bundles, one for the
 *      "old" version (e.g. 1.0.0) and one for the "new" version
 *      (e.g. 1.1.0).
 *   2. Place the new ZIP in a known directory and write a
 *      matching `latest-mac.yml` next to it.
 *   3. Start this server, pointed at that directory.
 *   4. Run the old Kingfisher with
 *      `KINGFISHER_UPDATER_FEED_URL=http://localhost:<port>`.
 *   5. The old app checks the feed, downloads the new ZIP,
 *      quits, installs the new app, and relaunches.
 *
 * The server is small on purpose. It is not a CDN, it does not
 * cache, and it does not authenticate; the local E2E test is
 * the only legitimate client. Production never talks to it.
 *
 * Usage:
 *   node scripts/desktop-update-staging-server.mjs <staging-dir> [--port 8765]
 */

import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { exit } from 'node:process';

import { fileURLToPath } from 'node:url';
import { dirname, extname, join, resolve } from 'node:path';
const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let port = 8765;
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && i + 1 < args.length) {
    port = Number(args[++i]);
  } else {
    positional.push(args[i]);
  }
}
const root = positional[0] ? resolve(positional[0]) : join(HERE, 'desktop', 'dist', 'staging');
if (!existsSync(root)) {
  console.error(`Staging directory ${root} does not exist.`);
  console.error('Build a candidate with:');
  console.error('  mkdir -p desktop/dist/staging && cp <new>.zip desktop/dist/staging/');
  console.error('  and generate a matching latest-mac.yml next to it.');
  exit(1);
}
const manifestPath = join(root, 'latest-mac.yml');
if (!existsSync(manifestPath)) {
  console.error(`No latest-mac.yml in ${root}.`);
  exit(1);
}

const MIME = {
  '.yml': 'application/x-yaml; charset=utf-8',
  '.yaml': 'application/x-yaml; charset=utf-8',
  '.zip': 'application/zip',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/latest-mac.yml') {
    const body = readFileSync(manifestPath);
    res.writeHead(200, {
      'content-type': MIME['.yml'],
      'content-length': body.byteLength,
    });
    res.end(body);
    return;
  }
  if (url.pathname === '/kingfisher-release-manifest.json') {
    const body = JSON.stringify({
      schema: 'kingfisher-runtime-release-manifest/1',
      kingfisher: { version: 'staging', tag: 'staging' },
      desktop: [],
    });
    res.writeHead(200, { 'content-type': MIME['.json'] });
    res.end(body);
    return;
  }
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  /* Otherwise treat the path as a relative file under `root`. */
  const safe = url.pathname.replace(/\.\./g, '').replace(/^\/+/, '');
  const file = join(root, safe);
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': statSync(file).size,
  });
  createReadStream(file).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Staging update feed listening on http://127.0.0.1:${port}`);
  console.log(`Serving files from ${root}`);
  console.log(`Manifest: ${manifestPath}`);
});
