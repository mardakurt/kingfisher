#!/usr/bin/env node
/**
 * `npm run desktop:update:staging:serve` — a local update feed for the
 * update harnesses.
 *
 * Serves a directory holding `appcast.xml` and the update ZIP the way
 * GitHub Releases serves the real ones, redirects included:
 *
 *   /releases/latest/download/<name>   302 → /releases/download/staging/<name>
 *   /releases/download/staging/<name>  the file
 *   /<name>                            the file, directly
 *   /health                            "ok"
 *
 * A packaged Kingfisher launched with
 * `KINGFISHER_UPDATER_FEED_URL=http://127.0.0.1:<port>/releases/latest/download/appcast.xml`
 * therefore takes the same two hops its production feed does, and an
 * appcast written with `--download-url-prefix http://127.0.0.1:<port>/releases/download/staging/`
 * names archives this server has. Sparkle accepts a plain-HTTP feed when
 * the bundle carries an EdDSA key (`SPUUpdater.m`, `checkIfConfiguredProperly…`),
 * and the bundle's ATS exception for local networking keeps it from
 * warning; production feeds are HTTPS.
 *
 * The server is small on purpose. It is not a CDN, it does not cache, and
 * it does not authenticate; the harnesses are the only legitimate client.
 *
 * Usage:
 *   node scripts/desktop-update-staging-server.mjs <staging-dir> [--port 8765]
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
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
  console.error(
    '  node scripts/desktop-mac-appcast.mjs --zip desktop/dist/staging/<new>.zip --out desktop/dist/staging \\',
  );
  console.error('    --download-url-prefix http://127.0.0.1:8765/releases/download/staging/');
  exit(1);
}
if (!existsSync(join(root, 'appcast.xml'))) {
  console.error(`No appcast.xml in ${root}.`);
  exit(1);
}

const MIME = {
  '.xml': 'application/xml; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.yml': 'application/x-yaml; charset=utf-8',
  '.zip': 'application/zip',
  '.json': 'application/json; charset=utf-8',
};

/** The requests, for a harness to read back through `/requests`. */
const requests = [];

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  requests.push({ at: new Date().toISOString(), method: req.method, path: url.pathname });
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (url.pathname === '/requests') {
    res.writeHead(200, { 'content-type': MIME['.json'] });
    res.end(JSON.stringify(requests));
    return;
  }
  const latest = /^\/releases\/latest\/download\/([^/]+)$/.exec(url.pathname);
  if (latest) {
    res.writeHead(302, { location: `/releases/download/staging/${latest[1]}` });
    res.end();
    return;
  }
  const name = (/^\/releases\/download\/staging\/([^/]+)$/.exec(url.pathname)?.[1] ?? url.pathname)
    .replace(/^\/+/, '')
    .replace(/\.\./g, '');
  const file = join(root, name);
  if (!file.startsWith(root) || name.includes('/')) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  const size = statSync(file).size;
  // Sparkle may ask for a byte range to resume a download; GitHub honours it.
  const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'content-range': `bytes ${start}-${end}/${size}`,
      'content-length': end - start + 1,
      'accept-ranges': 'bytes',
    });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': size,
    'accept-ranges': 'bytes',
  });
  createReadStream(file).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Staging update feed listening on http://127.0.0.1:${port}`);
  console.log(`Serving files from ${root}`);
  console.log(`Feed: http://127.0.0.1:${port}/releases/latest/download/appcast.xml`);
});
