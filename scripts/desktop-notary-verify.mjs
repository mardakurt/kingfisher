#!/usr/bin/env node
/**
 * `npm run desktop:notary:verify` — confirm a packaged Kingfisher
 * build has been notarized by Apple and the resulting ticket is
 * stapled to the deliverable.
 *
 * "Apple's servers said Accepted" is the bare minimum; the
 * user-facing check is offline Gatekeeper. If the ticket is not
 * stapled, the very first launch of the .app (or .dmg) over the
 * internet still requires a network round-trip to retrieve it,
 * and Gatekeeper refuses to treat the app as trusted until that
 * round-trip completes. Stapling makes the app self-contained
 * and is the difference between "double-click and run" and
 * "double-click and wait."
 *
 * Usage:
 *   node scripts/desktop-notary-verify.mjs <path-to-Kingfisher.app-or.dmg>
 *   node scripts/desktop-notary-verify.mjs   # picks up dist/mac-arm64/Kingfisher.app
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { exit } from 'node:process';

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const candidate = process.argv[2]
  ? resolve(process.argv[2])
  : join(HERE, 'desktop', 'dist', 'mac-arm64', 'Kingfisher.app');

if (!existsSync(candidate)) {
  console.error(`No Kingfisher at ${candidate}. Run \`npm run desktop:dist\` first.`);
  exit(1);
}

console.log(`Verifying notarization of ${candidate}\n`);

let failed = false;
const report = (label, ok, detail) => {
  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failed = true;
};

/* 1. Stapled ticket present. */
const staplerValidate = spawnSync('xcrun', ['stapler', 'validate', candidate], {
  encoding: 'utf8',
});
const stapled =
  staplerValidate.code === 0 &&
  /The staple and validate action worked/.test(staplerValidate.stdout);
report(
  'stapled notarization ticket is valid',
  stapled,
  stapled
    ? 'ticket stapled and validated'
    : staplerValidate.stderr.split('\n').find(Boolean) ||
        staplerValidate.stdout.split('\n').find(Boolean),
);

/* 2. The notarization receipt can be read. The receipt is what
      Gatekeeper reaches over the network when there is no stapled
      ticket; if the receipt is missing, Apple did not see this
      build. */
const spctlAssess = spawnSync(
  'spctl',
  ['--assess', '--verbose=4', '--type', 'execute', candidate],
  { encoding: 'utf8' },
);
const accepted = spctlAssess.code === 0;
report(
  'Gatekeeper accepts the deliverable',
  accepted,
  accepted
    ? spctlAssess.stdout.split('\n').find(Boolean) || 'accepted'
    : spctlAssess.stderr.split('\n').find(Boolean) || 'rejected',
);

/* 3. notarytool can read the ticket info. This is the diagnostic
      path: if stapling or Gatekeeper failed, the developer can see
      the underlying ticket fields. */
const ticketInfo = spawnSync('xcrun', ['stapler', 'info', candidate, '-t', 'apple notary ticket'], {
  encoding: 'utf8',
});
const ticketReadable = ticketInfo.code === 0 && ticketInfo.stdout.includes('hash');
report(
  'notarization ticket is readable',
  ticketReadable,
  ticketReadable
    ? ticketInfo.stdout.split('\n').find((l) => l.includes('hash')) || ''
    : ticketInfo.stderr.split('\n').find(Boolean) || 'no ticket',
);

console.log('');
if (failed) {
  console.error('Notarization verification: FAILED');
  exit(1);
}
console.log('Notarization verification: PASS');
