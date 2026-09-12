#!/usr/bin/env node
/**
 * Is the macOS build the public is offered the one the repository says it is?
 *
 * Reads `src/release/macos-download.json` — the one file that names the
 * public DMG — and checks it against the world:
 *
 *   default   HEAD the asset URL through GitHub's redirect; the final answer
 *             must be 200 with the descriptor's byte count and an
 *             `application/octet-stream` body, and the release page must
 *             exist. A few hundred bytes of network; safe for CI.
 *   --landing also fetch the production landing page and the install guide
 *             and require both to link the descriptor's URL and name its
 *             file — the check that the deployed site and the repository
 *             agree.
 *   --full    download the whole DMG from the public URL into a temporary
 *             directory, compare its SHA-256 with the descriptor, mount it,
 *             and run the DMG verifier with the descriptor's version, build
 *             and commit as expectations. This validates the exact bytes a
 *             user receives; it is the release gate and it is not run on
 *             every push.
 *
 *   npm run desktop:public:verify
 *   npm run desktop:public:verify -- --landing
 *   npm run desktop:public:verify -- --full
 */

import { createHash } from 'node:crypto';
import { createWriteStream, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { argv, exit } from 'node:process';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import { verifyDmg } from '../desktop/scripts/verify-dmg.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const flag = (name) => argv.includes(`--${name}`);

const descriptor = JSON.parse(
  readFileSync(path.join(ROOT, 'src', 'release', 'macos-download.json'), 'utf8'),
);
const { publicUrl } = await import('../src/release/public-urls.ts');

const results = [];
const check = (label, ok, detail = '') => {
  results.push({ label, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

async function head(url) {
  // GitHub answers a HEAD on an asset with the redirect chain; `fetch`
  // follows it and reports the final response.
  const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  return {
    status: response.status,
    url: response.url,
    length: Number(response.headers.get('content-length')),
    type: response.headers.get('content-type') ?? '',
    cache: response.headers.get('cache-control') ?? '',
  };
}

async function main() {
  console.log(
    `descriptor: ${descriptor.channel} ${descriptor.version}` +
      `${descriptor.build === null ? '' : ` build ${descriptor.build}`} · ${descriptor.filename}`,
  );
  console.log(`url: ${descriptor.url}\n`);

  check('the descriptor is what the landing links', publicUrl.macosDmg === descriptor.url);
  check(
    'the URL is immutable, not the moving latest pointer',
    !/releases\/latest/.test(descriptor.url),
  );

  const asset = await head(descriptor.url);
  check('the asset answers', asset.status === 200, `HTTP ${asset.status}`);
  check('as a binary', /octet-stream/.test(asset.type), asset.type);
  check(
    'with the descriptor byte count',
    asset.length === descriptor.bytes,
    `${asset.length} bytes, descriptor says ${descriptor.bytes}`,
  );
  check(
    'the final hop names the file',
    /Kingfisher-[^&]*\.dmg/.test(decodeURIComponent(asset.url)),
    asset.url.replace(/\?.*$/, '?…'),
  );

  const page = await fetch(descriptor.releasePage, { redirect: 'follow' });
  check(
    'the release page exists',
    page.status === 200,
    `HTTP ${page.status} ${descriptor.releasePage}`,
  );

  if (flag('landing')) {
    for (const [label, url] of [
      ['landing', `${publicUrl.landing}/`],
      ['install guide', `${publicUrl.landing}/install`],
    ]) {
      const response = await fetch(url, { redirect: 'follow' });
      const html = await response.text();
      check(`the production ${label} is up`, response.status === 200, `HTTP ${response.status}`);
      check(
        `the production ${label} links the descriptor's URL`,
        html.includes(descriptor.url),
        url,
      );
      check(
        `the production ${label} names the file`,
        html.includes(descriptor.filename),
        descriptor.filename,
      );
    }
  }

  if (flag('full')) {
    const dir = mkdtempSync(path.join(tmpdir(), 'kingfisher-public-verify-'));
    const file = path.join(dir, descriptor.filename);
    try {
      console.log(
        `\ndownloading ${descriptor.filename} (${(descriptor.bytes / 1e6).toFixed(0)} MB)…`,
      );
      const started = Date.now();
      const response = await fetch(descriptor.url, { redirect: 'follow' });
      check(
        'the download starts',
        response.ok && Boolean(response.body),
        `HTTP ${response.status}`,
      );
      const hash = createHash('sha256');
      let received = 0;
      const counting = new TransformStream({
        transform(chunk, controller) {
          hash.update(chunk);
          received += chunk.length;
          controller.enqueue(chunk);
        },
      });
      const { Readable } = await import('node:stream');
      await pipeline(
        Readable.fromWeb(response.body.pipeThrough(counting)),
        createWriteStream(file),
      );
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      check(
        'every byte arrived',
        received === descriptor.bytes,
        `${received} bytes in ${seconds} s`,
      );
      const digest = hash.digest('hex');
      check("the SHA-256 is the descriptor's", digest === descriptor.sha256, digest);

      console.log('\nmounting and verifying the downloaded image…');
      const verified = await verifyDmg(file, {
        expectVersion: descriptor.version,
        expectBuild: descriptor.build,
        expectCommit: descriptor.commit,
        expectArch: descriptor.architecture,
        // The public 1.0.0 predates the bundle id change; the descriptor says
        // which build this is, so the expectation follows it.
        expectBundle: descriptor.bundleId ?? 'app.kingfisher.chess',
      });
      for (const row of verified.checks) check(`dmg: ${row.label}`, row.ok, row.detail);
      const family = /Developer ID Application/.test(verified.facts.signingAuthority ?? '')
        ? 'Developer ID Application'
        : /Apple Development/.test(verified.facts.signingAuthority ?? '')
          ? 'Apple Development'
          : 'unknown';
      check(
        'the signing identity is the one the descriptor claims',
        family === descriptor.signature.identity,
        `${family} (${verified.facts.signingAuthority ?? 'unsigned'})`,
      );
      // Notarisation leaves a ticket the stapler can validate; its absence is
      // the descriptor's `notarized: false`, and a mismatch either way is a lie
      // on the landing page.
      const { spawnSync } = await import('node:child_process');
      const mount = spawnSync('hdiutil', ['attach', '-nobrowse', '-readonly', '-noverify', file], {
        encoding: 'utf8',
      });
      const point = mount.stdout.trim().split('\n').pop().split('\t').pop().trim();
      try {
        const stapled = spawnSync(
          'xcrun',
          ['stapler', 'validate', path.join(point, 'Kingfisher.app')],
          { encoding: 'utf8' },
        );
        const notarized = stapled.status === 0;
        check(
          'the notarisation state is the one the descriptor claims',
          notarized === descriptor.signature.notarized,
          notarized ? 'stapler validates a ticket' : 'no notarisation ticket',
        );
      } finally {
        spawnSync('hdiutil', ['detach', point, '-quiet']);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log(
    failed.length === 0
      ? `PUBLIC DMG VERIFIED: ${descriptor.filename}${flag('full') ? ' (every byte)' : ' (metadata)'}`
      : 'PUBLIC DMG VERIFICATION FAILED',
  );
  exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nverification did not complete: ${error?.stack ?? error}`);
  exit(2);
});
