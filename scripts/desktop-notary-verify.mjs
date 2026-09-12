#!/usr/bin/env node
/** Validate a staple and ask Gatekeeper about the actual app or disk image. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.KINGFISHER_DESKTOP_OUT || join(root, 'desktop/dist');
const candidate = resolve(process.argv[2] || join(out, 'mac-arm64/Kingfisher.app'));
if (!existsSync(candidate)) {
  console.error('Candidate does not exist.');
  process.exit(1);
}
const staple = spawnSync('xcrun', ['stapler', 'validate', candidate], { encoding: 'utf8' });
const args = candidate.endsWith('.dmg')
  ? [
      '--assess',
      '--verbose=4',
      '--type',
      'open',
      '--context',
      'context:primary-signature',
      candidate,
    ]
  : ['--assess', '--verbose=4', '--type', 'execute', candidate];
const gate = spawnSync('spctl', args, { encoding: 'utf8' });
const accepted =
  gate.status === 0 && /source=Notarized Developer ID/.test(gate.stdout + gate.stderr);
console.log(`${staple.status === 0 ? '✓' : '✗'} stapled ticket validates`);
console.log(`${accepted ? '✓' : '✗'} Gatekeeper accepts as Notarized Developer ID`);
console.log('This assessment does not assert an offline or quarantined GUI launch.');
process.exitCode = staple.status === 0 && accepted ? 0 : 1;
