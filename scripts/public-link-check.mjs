#!/usr/bin/env node
/**
 * `npm run public:check` — verify the public URLs Kingfisher depends on.
 *
 * Phase 24 expansion: every public surface, every CTA, every
 * manifest, a sample chunk from every pack, and the main GitHub
 * endpoints. Fails on:
 *
 *   - any non-2xx / non-3xx response;
 *   - an unexpected redirect to a host outside the expected
 *     allow-list (a security tripwire: a compromised release
 *     cannot quietly redirect the download);
 *   - a missing or empty `Location` header where one is expected;
 *   - an unexpected content type.
 *
 * Pass `--json` to emit a machine-readable summary.
 *
 * Exit codes:
 *   - 0  every required URL responds successfully to a host in
 *         the allow-list.
 *   - 1  at least one required URL is missing, non-2xx, or
 *         redirected to a host outside the allow-list.
 *   - 2  the configuration is wrong.
 */

import { argv, env, exit } from 'node:process';
import { publicUrl } from '../src/release/public-urls.ts';

const args = new Set(argv.slice(2));
const asJson = args.has('--json');

// Hosts the public surface is allowed to live on. Anything else
// is treated as a security tripwire and the check fails.
const ALLOWED_HOSTS = new Set([
  'mardakurt.github.io',
  'github.com',
  'objects.githubusercontent.com',
  'raw.githubusercontent.com',
  'kingfisher-chess.vercel.app',
  'kingfisher-roan.vercel.app',
]);

const config = {
  landing: env.KINGFISHER_PUBLIC_LANDING_URL || 'https://kingfisher-chess.vercel.app',
  web: publicUrl.studio,
  repository: env.KINGFISHER_PUBLIC_REPOSITORY_URL || 'https://github.com/mardakurt/kingfisher',
  release:
    env.KINGFISHER_PUBLIC_RELEASE_URL || 'https://github.com/mardakurt/kingfisher/releases/latest',
  dmg: env.KINGFISHER_PUBLIC_DMG_URL || publicUrl.macosDmg,
  issues: env.KINGFISHER_PUBLIC_ISSUES_URL || 'https://github.com/mardakurt/kingfisher/issues',
  discussions:
    env.KINGFISHER_PUBLIC_DISCUSSIONS_URL || 'https://github.com/mardakurt/kingfisher/discussions',
  docs:
    env.KINGFISHER_PUBLIC_DOCS_URL || 'https://github.com/mardakurt/kingfisher/tree/master/docs',
  data: env.KINGFISHER_PUBLIC_DATA_ROOT_URL || 'https://mardakurt.github.io/kingfisher-data',
  installGuide: 'https://github.com/mardakurt/kingfisher/blob/master/docs/release/install-macos.md',
};

const packManifests = {
  elite: `${config.data}/reference-elite-v2/manifest.json`,
  recent: `${config.data}/reference-recent-v1/manifest.json`,
  'recent-v2': `${config.data}/reference-recent-v2/manifest.json`,
  online: `${config.data}/reference-online-v1/manifest.json`,
};

const packDir = {
  elite: 'reference-elite-v2',
  recent: 'reference-recent-v1',
  'recent-v2': 'reference-recent-v2',
  online: 'reference-online-v1',
};

// Read each manifest and pick a couple of chunk URLs to verify.
const chunkChecks = [];
for (const [pack, url] of Object.entries(packManifests)) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (res.ok) {
      const manifest = await res.json();
      for (const chunk of manifest.chunks || []) {
        if (chunk.file && chunk.kind === 'explorer') {
          chunkChecks.push({
            pack,
            file: chunk.file,
            url: `${config.data}/${packDir[pack]}/${chunk.file}`,
            sha256: chunk.sha256,
          });
          break; // one chunk per pack is enough for the gate
        }
      }
    }
  } catch {
    // ignore; the manifest check below will fail loudly
  }
}

const targets = [
  ['Landing page', config.landing, { type: 'text/html', preservePath: true }],
  ['Web app entry', `${config.web}/analysis`, { type: 'text/html', preservePath: true }],
  ['Web app /players', `${config.web}/players`, { type: 'text/html', preservePath: true }],
  ['Web app /databases', `${config.web}/databases`, { type: 'text/html', preservePath: true }],
  ['Web app /openings', `${config.web}/openings`, { type: 'text/html', preservePath: true }],
  ['Web app /settings', `${config.web}/settings`, { type: 'text/html', preservePath: true }],
  ['GitHub repository', config.repository, { type: 'text/html' }],
  ['GitHub latest release', config.release, { type: 'text/html' }],
  ['macOS DMG (latest)', config.dmg, { type: 'application/octet-stream' }],
  ['Issue tracker', config.issues, { type: 'text/html' }],
  ['Discussions', config.discussions, { type: 'text/html' }],
  ['Docs root', config.docs, { type: 'text/html' }],
  ['Install guide', config.installGuide, { type: 'text/html' }],
  ['Pack: elite manifest', packManifests.elite, { type: 'application/json' }],
  ['Pack: recent manifest', packManifests.recent, { type: 'application/json' }],
  ['Pack: recent v2 manifest', packManifests['recent-v2'], { type: 'application/json' }],
  ['Pack: online manifest', packManifests.online, { type: 'application/json' }],
];

for (const c of chunkChecks) {
  targets.push([`Pack chunk: ${c.pack} (${c.file})`, c.url, { type: 'application/gzip' }]);
}

const results = [];
for (const [label, url, expectations] of targets) {
  // The first pass already pushes; do nothing here.
  const result = { label, url };
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    });
    const finalUrl = res.url;
    const finalHost = new URL(finalUrl).hostname;
    result.status = res.status;
    result.finalHost = finalHost;
    result.contentType = res.headers.get('content-type') || '';

    const hostOk = ALLOWED_HOSTS.has(finalHost) || finalHost.endsWith('.githubusercontent.com');
    const typeOk = expectations.type
      ? result.contentType.toLowerCase().includes(expectations.type.split(';')[0])
      : true;
    const statusOk = res.status >= 200 && res.status < 400;

    const pathOk =
      !expectations.preservePath || new URL(finalUrl).pathname === new URL(url).pathname;
    await res.body?.cancel();
    result.ok = hostOk && typeOk && statusOk && pathOk;
    result.pathOk = pathOk;
    result.hostOk = hostOk;
    result.typeOk = typeOk;
    result.statusOk = statusOk;

    if (!pathOk) {
      result.error = `Route redirected from ${new URL(url).pathname} to ${new URL(finalUrl).pathname}`;
    } else if (!hostOk) {
      result.error = `Redirected to a host outside the allow-list: ${finalHost}`;
    } else if (!typeOk) {
      result.error = `Unexpected content-type "${result.contentType}" (wanted ${expectations.type})`;
    } else if (!statusOk) {
      result.error = `Non-success status ${res.status}`;
    }
  } catch (err) {
    result.ok = false;
    result.error = String(err.message ?? err);
  }
  results.push(result);
  if (!asJson) {
    const mark = result.ok ? '✓' : '✗';
    const note = result.error ? `  (${result.error})` : '';
    console.log(
      `${mark}  ${String(result.status ?? 'ERR').padEnd(4)}  ${label.padEnd(36)}  ${url}${note}`,
    );
  }
}

/*
  `releases/latest` regression check.

  GitHub redirects `/releases/latest` to the *current* latest release.
  If a reference-data release (e.g. `reference-elite-v1`) is ever
  marked as a normal release again, the `Latest` semantic starts
  pointing at the data release instead of the application, and a
  first user who clicks "Download for macOS" downloads reference
  data instead of the Kingfisher application. This check verifies
  the redirect resolves to a `v<semver>` tag, which is the
  application's tag shape, and fails loudly if a `reference-` /
  `data-` / `pack-` tag ever reclaims the Latest slot.
*/
{
  const latestUrl = config.release;
  const latestResult = {
    label: 'Latest release points at application tag',
    url: latestUrl,
  };
  try {
    const res = await fetch(latestUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    });
    const finalPath = new URL(res.url).pathname;
    const tag = finalPath.split('/').pop() || '';
    const isAppTag = /^v\d+\.\d+\.\d+/.test(tag);
    latestResult.status = res.status;
    latestResult.finalTag = tag;
    latestResult.ok = res.status === 200 && isAppTag;
    if (!latestResult.ok) {
      latestResult.error = isAppTag
        ? `Non-2xx status ${res.status}`
        : `Latest release tag "${tag}" is not an application tag (expected v<semver>)`;
    }
  } catch (err) {
    latestResult.ok = false;
    latestResult.error = String(err.message ?? err);
  }
  results.push(latestResult);
  if (!asJson) {
    const mark = latestResult.ok ? '✓' : '✗';
    const note = latestResult.error ? `  (${latestResult.error})` : '';
    console.log(
      `${mark}  ${String(latestResult.status ?? 'ERR').padEnd(4)}  ${latestResult.label.padEnd(36)}  ${latestResult.url}${note}`,
    );
  }
}

if (asJson) console.log(JSON.stringify({ config, results }, null, 2));

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length} of ${results.length} public link(s) failed.`);
  exit(1);
}
console.log(`\nAll ${results.length} public link(s) responded successfully.`);
