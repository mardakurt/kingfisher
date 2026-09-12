#!/usr/bin/env node
/**
 * `npm run release:mac:notarize [<Kingfisher-*.dmg>]` — notarise and staple
 * the disk image.
 *
 * The application inside it is already notarised: electron-builder submits
 * the signed .app and staples its ticket in the directory step of
 * `desktop:dist` (see `notarize` in `desktop/electron-builder.yml`), so the
 * DMG and the update ZIP were archived from a stapled app. What the notary
 * service has not yet seen is the disk image itself, and a DMG without its
 * own ticket makes Gatekeeper fetch one over the network on first open.
 *
 * `notarytool` accepts a zip, a dmg or a pkg — never a bare `.app` — which is
 * why an earlier version of this script, which submitted the .app directory,
 * could not have worked.
 *
 * Credentials: APPLE_API_KEY (path to the .p8), APPLE_API_KEY_ID and
 * APPLE_API_ISSUER; or APPLE_KEYCHAIN_PROFILE for a `notarytool
 * store-credentials` profile. Nothing secret is printed.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.env.KINGFISHER_DESKTOP_OUT ?? join(ROOT, 'desktop', 'dist'));

function credentialArgs() {
  const { APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER, APPLE_KEYCHAIN_PROFILE } = process.env;
  if (APPLE_API_KEY && APPLE_API_KEY_ID && APPLE_API_ISSUER) {
    if (!existsSync(APPLE_API_KEY)) {
      console.error('APPLE_API_KEY names a file that does not exist.');
      process.exit(1);
    }
    return ['--key', APPLE_API_KEY, '--key-id', APPLE_API_KEY_ID, '--issuer', APPLE_API_ISSUER];
  }
  if (APPLE_KEYCHAIN_PROFILE) return ['--keychain-profile', APPLE_KEYCHAIN_PROFILE];
  console.error(
    'No notarization credentials. Set APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER, or APPLE_KEYCHAIN_PROFILE.',
  );
  process.exit(1);
}

function pickDmg() {
  if (process.argv[2]) return resolve(process.argv[2]);
  let candidates = [];
  try {
    candidates = readdirSync(OUT).filter((name) => name.endsWith('.dmg'));
  } catch {
    /* reported below */
  }
  if (candidates.length !== 1) {
    console.error(
      candidates.length === 0
        ? `No .dmg in ${OUT}. Run npm run desktop:dist first, or name the file.`
        : `More than one .dmg in ${OUT}; name the one to notarise:\n  ${candidates.join('\n  ')}`,
    );
    process.exit(1);
  }
  return join(OUT, candidates[0]);
}

const dmg = pickDmg();
if (!existsSync(dmg)) {
  console.error(`No disk image at ${dmg}.`);
  process.exit(1);
}
const credentials = credentialArgs();

/* The app the DMG was built from must already carry its ticket. */
const app = join(OUT, 'mac-arm64', 'Kingfisher.app');
if (existsSync(app)) {
  const appTicket = spawnSync('xcrun', ['stapler', 'validate', app], { encoding: 'utf8' });
  if (appTicket.status !== 0) {
    console.error(
      `${app} has no stapled ticket. The build was made without notarization credentials;\n` +
        'rebuild with them set rather than notarising a disk image whose application is not.',
    );
    process.exit(1);
  }
  console.log('✓ the packaged application carries a stapled ticket');
}

console.log(`Submitting ${basename(dmg)} to the notary service (this takes a few minutes)…`);
const submit = spawnSync(
  'xcrun',
  ['notarytool', 'submit', dmg, '--wait', '--output-format', 'json', ...credentials],
  { encoding: 'utf8' },
);
let result = {};
try {
  result = JSON.parse(submit.stdout || '{}');
} catch {
  /* handled below */
}
if (submit.status !== 0 || result.status !== 'Accepted') {
  console.error(`Notarization was not accepted (${result.status ?? 'no verdict'}).`);
  if (result.id) {
    const log = spawnSync('xcrun', ['notarytool', 'log', result.id, ...credentials], {
      encoding: 'utf8',
    });
    console.error(log.stdout || log.stderr);
  } else {
    console.error(submit.stderr);
  }
  process.exit(1);
}
console.log(`✓ Accepted — submission ${result.id}`);

const staple = spawnSync('xcrun', ['stapler', 'staple', dmg], { encoding: 'utf8' });
if (staple.status !== 0) {
  console.error('Stapling the disk image failed.');
  console.error(staple.stderr || staple.stdout);
  process.exit(1);
}
const validate = spawnSync('xcrun', ['stapler', 'validate', dmg], { encoding: 'utf8' });
if (validate.status !== 0) {
  console.error('The stapled ticket does not validate.');
  process.exit(1);
}
console.log('✓ ticket stapled to the disk image and validated');

/* Record the submission beside the artifact for the release manifest. */
const record = join(OUT, `${basename(dmg)}.notarization.json`);
console.log(`Notarization record: ${record}`);
writeFileSync(
  record,
  JSON.stringify(
    {
      file: basename(dmg),
      submission: result.id,
      status: result.status,
      at: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
