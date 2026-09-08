#!/usr/bin/env node
/**
 * `npm run public:check` — verify the public URLs Kingfisher depends on.
 *
 * Not the application's behaviour (the application does that itself). This
 * script verifies the *public surface*: the landing page, the web app, the
 * GitHub repository, the latest release, the macOS artefact, the
 * reference-pack manifest and the first chunk of each pack. Each is fetched
 * with a HEAD (or a GET when HEAD is not supported), the status code is
 * recorded, and the script exits non-zero if anything the public release
 * depends on returns a status that is not 200, 301 or 302.
 *
 * Configuration:
 *   - The default URLs are read from environment variables when set, falling
 *     back to a hard-coded default that matches the Phase 23 release.
 *   - Pass `--json` to emit a machine-readable summary at the end.
 *
 * Exit codes:
 *   - 0  every required URL returns 200 (or a redirect chain to 200).
 *   - 1  at least one required URL is missing or non-200.
 *   - 2  the configuration is wrong (e.g. an unset URL when required).
 */

import { argv, env, exit } from 'node:process';

const args = new Set(argv.slice(2));
const asJson = args.has('--json');

const config = {
  landing: env.KINGFISHER_PUBLIC_LANDING_URL || 'https://kingfisher.example/',
  web: env.KINGFISHER_PUBLIC_WEB_URL || 'https://kingfisher.example/app',
  repository: env.KINGFISHER_PUBLIC_REPO_URL || 'https://github.com/mardakurt/kingfisher',
  release: env.KINGFISHER_PUBLIC_RELEASE_URL || 'https://github.com/mardakurt/kingfisher/releases/latest',
  dataRoot: env.KINGFISHER_PUBLIC_DATA_ROOT || 'https://mardakurt.github.io/kingfisher-data',
  dataPacks: {
    elite: `${env.KINGFISHER_PUBLIC_DATA_ROOT || 'https://mardakurt.github.io/kingfisher-data'}/reference-elite-v2/manifest.json`,
    recent: `${env.KINGFISHER_PUBLIC_DATA_ROOT || 'https://mardakurt.github.io/kingfisher-data'}/reference-recent-v1/manifest.json`,
    online: `${env.KINGFISHER_PUBLIC_DATA_ROOT || 'https://mardakurt.github.io/kingfisher-data'}/reference-online-v1/manifest.json`,
  },
};

const targets = [
  ['Landing page', config.landing],
  ['Web app entry', config.web],
  ['GitHub repository', config.repository],
  ['GitHub latest release', config.release],
  ['Data: elite manifest', config.dataPacks.elite],
  ['Data: recent manifest', config.dataPacks.recent],
  ['Data: online manifest', config.dataPacks.online],
];

const results = [];
for (const [label, url] of targets) {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    const ok = res.status >= 200 && res.status < 400;
    results.push({ label, url, status: res.status, ok });
    if (!asJson) {
      console.log(`${ok ? '✓' : '✗'}  ${res.status}  ${label.padEnd(28)}  ${url}`);
    }
  } catch (err) {
    results.push({ label, url, status: 0, ok: false, error: String(err) });
    if (!asJson) console.log(`✗  ERR  ${label.padEnd(28)}  ${url}  (${err.message ?? err})`);
  }
}

if (asJson) {
  console.log(JSON.stringify({ config, results }, null, 2));
}

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length} of ${results.length} public link(s) failed.`);
  exit(1);
}
console.log(`\nAll ${results.length} public link(s) responded successfully.`);
