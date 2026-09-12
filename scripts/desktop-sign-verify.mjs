#!/usr/bin/env node
/** Verify the actual signing chain, every nested Mach-O, and release entitlements. */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.KINGFISHER_DESKTOP_OUT || join(root, 'desktop/dist');
const candidate = resolve(process.argv[2] || join(out, 'mac-arm64/Kingfisher.app'));
let failed = false;
function check(label, ok) {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failed = true;
}
function run(command, args, input) {
  return spawnSync(command, args, { encoding: 'utf8', input });
}
function plist(text) {
  const start = text.indexOf('<?xml');
  const r = run(
    'plutil',
    ['-convert', 'json', '-o', '-', '--', '-'],
    start >= 0 ? text.slice(start) : text,
  );
  try {
    return r.status === 0 ? JSON.parse(r.stdout) : null;
  } catch {
    return null;
  }
}
function walk(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const p = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (entry.name.endsWith('.app') || entry.name.endsWith('.framework')) found.push(p);
      found.push(...walk(p));
    } else if (entry.isFile()) {
      const fd = openSync(p, 'r');
      const magic = Buffer.alloc(4);
      try {
        readSync(fd, magic, 0, 4, 0);
      } finally {
        closeSync(fd);
      }
      if (
        [
          'cffaedfe',
          'cefaedfe',
          'feedfacf',
          'feedface',
          'cafebabe',
          'bebafeca',
          'cafebabf',
          'bfbafeca',
        ].includes(magic.toString('hex'))
      )
        found.push(p);
    }
  }
  return found;
}
if (!existsSync(candidate)) {
  console.error('Candidate app does not exist.');
  process.exit(1);
}
const required = [
  'Contents/MacOS/Kingfisher',
  'Contents/Frameworks/Electron Framework.framework',
  'Contents/Frameworks/Kingfisher Helper.app',
  'Contents/Frameworks/Kingfisher Helper (Renderer).app',
  'Contents/Frameworks/Kingfisher Helper (GPU).app',
];
for (const p of required) check(`required executable ${p}`, existsSync(join(candidate, p)));
const expectedResult = run('plutil', [
  '-convert',
  'json',
  '-o',
  '-',
  join(root, 'desktop/build/entitlements.mac.plist'),
]);
const expected = expectedResult.status === 0 ? JSON.parse(expectedResult.stdout) : null;
check('audited entitlements are readable', !!expected);
let outerTeam;
const targets = [candidate, ...walk(candidate)];
for (const target of targets) {
  const name = relative(candidate, target) || 'Kingfisher.app';
  const detail = run('codesign', ['-dvvv', target]);
  const text = detail.stdout + detail.stderr;
  const team = /^TeamIdentifier=(\w+)$/m.exec(text)?.[1];
  if (target === candidate) outerTeam = team;
  check(
    `${name}: Developer ID, same team, secure timestamp`,
    detail.status === 0 &&
      /^Authority=Developer ID Application:/m.test(text) &&
      !!team &&
      team === outerTeam &&
      /^Timestamp=.+/m.test(text),
  );
  check(`${name}: valid signature`, run('codesign', ['--verify', '--strict', target]).status === 0);
  // Hardened Runtime applies to executable code, not resource-only frameworks/dylibs.
  if (target.endsWith('.app') || text.includes('executable'))
    check(`${name}: Hardened Runtime`, /flags=.*\bruntime\b/.test(text));
  const ent = run('codesign', ['-d', '--entitlements', '-', target]);
  const raw = ent.stdout + ent.stderr;
  if (raw.includes('<plist')) {
    const actual = plist(raw);
    check(
      `${name}: no unaudited entitlements`,
      !!actual &&
        Object.entries(actual).every(([k, v]) => expected?.[k] === v) &&
        !actual['com.apple.security.get-task-allow'],
    );
    if (target === candidate)
      check(
        'outer app matches audited entitlements',
        !!actual &&
          JSON.stringify(Object.entries(actual).sort()) ===
            JSON.stringify(Object.entries(expected || {}).sort()),
      );
  } else if (target === candidate) check('outer app has audited entitlements', false);
}
check(
  'complete sealed bundle verifies',
  run('codesign', ['--verify', '--deep', '--strict', candidate]).status === 0,
);
console.log(
  `Signature verification: ${failed ? 'FAILED' : 'PASS'} (${targets.length} code objects)`,
);
process.exitCode = failed ? 1 : 0;
