#!/usr/bin/env node
/** Fail closed unless both the candidate app and its exact DMG pass trust checks. */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.env.KINGFISHER_DESKTOP_OUT || join(root, 'desktop/dist'));
const app = resolve(process.argv[2] || join(out, 'mac-arm64/Kingfisher.app'));
const version = JSON.parse(readFileSync(join(root, 'desktop/package.json'))).version;
const dmg = resolve(process.argv[3] || join(out, `Kingfisher-${version}-arm64.dmg`));
let failed = false;
for (const [script, target] of [
  ['desktop-sign-verify.mjs', app],
  ['desktop-notary-verify.mjs', app],
  ['desktop-notary-verify.mjs', dmg],
]) {
  if (!existsSync(target)) {
    console.error(`Missing required artifact: ${target}`);
    failed = true;
    continue;
  }
  const r = spawnSync(process.execPath, [join(root, 'scripts', script), target], {
    stdio: 'inherit',
  });
  if (r.status !== 0) failed = true;
}
console.log(`Trust gate: ${failed ? 'NOT GREEN' : 'GREEN'}`);
process.exitCode = failed ? 1 : 0;
