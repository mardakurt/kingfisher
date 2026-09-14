#!/usr/bin/env node
/**
 * Compile the Sparkle bridge.
 *
 * One Objective-C++ file, one `clang++` invocation, one `.node`. No
 * node-gyp: the addon uses Node-API (ABI-stable, `NAPI_VERSION 8`), so it is
 * built once against this Node's headers and loaded by Electron's Node
 * without a rebuild — Electron 44 carries Node-API 10 — and the command
 * below is the whole build, readable by anyone who has to fix it.
 *
 * Nothing is linked against Sparkle. The headers under the vendored
 * framework declare the classes and protocols the bridge speaks; the
 * framework itself is opened at run time from the path JavaScript gives
 * (`bridge.mm`, "Loading"). So the only prerequisites are Xcode's
 * command-line tools and `npm run desktop:sparkle:fetch`.
 *
 *   node desktop/native/sparkle/build.mjs           # build if stale
 *   node desktop/native/sparkle/build.mjs --force   # rebuild
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FRAMEWORK, VENDOR, isVendored } from '../../scripts/fetch-sparkle.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SOURCE = path.join(HERE, 'bridge.mm');
export const OUTPUT = path.join(HERE, 'build', 'kingfisher-sparkle.node');

/** The floor the bundle declares (LSMinimumSystemVersion); the addon targets the same. */
const MACOS_FLOOR = '13.0';

/** Where this Node keeps `node_api.h`. */
function nodeIncludeDir() {
  const candidates = [
    path.join(path.dirname(path.dirname(process.execPath)), 'include', 'node'),
    path.join(
      process.env.HOME ?? '',
      'Library',
      'Caches',
      'node-gyp',
      process.versions.node,
      'include',
      'node',
    ),
  ];
  for (const dir of candidates) if (existsSync(path.join(dir, 'node_api.h'))) return dir;
  throw new Error(
    `node_api.h was not found beside this Node (${process.execPath}); install the Node headers or run under a Node that ships them.`,
  );
}

function isStale() {
  if (!existsSync(OUTPUT)) return true;
  const built = statSync(OUTPUT).mtimeMs;
  return [SOURCE, fileURLToPath(import.meta.url)].some((file) => statSync(file).mtimeMs > built);
}

export function buildBridge({ force = false, log } = {}) {
  // eslint-disable-next-line no-console
  const out = log ?? console.log;
  if (process.platform !== 'darwin') {
    throw new Error('The Sparkle bridge is macOS code; there is nothing to build elsewhere.');
  }
  if (!isVendored()) {
    throw new Error(
      `Sparkle is not vendored at ${VENDOR}; run npm run desktop:sparkle:fetch first.`,
    );
  }
  if (!force && !isStale()) {
    out(`Sparkle bridge is current: ${OUTPUT}`);
    return OUTPUT;
  }
  mkdirSync(path.dirname(OUTPUT), { recursive: true });
  const args = [
    '-std=c++17',
    '-ObjC++',
    '-fobjc-arc',
    '-fvisibility=hidden',
    '-O2',
    '-Wall',
    '-Werror',
    // Node-API only, at the version every supported runtime has.
    '-DNAPI_VERSION=8',
    `-mmacosx-version-min=${MACOS_FLOOR}`,
    '-arch',
    'arm64',
    '-bundle',
    // Node's own symbols (napi_*) come from the host process at load time.
    '-Wl,-undefined,dynamic_lookup',
    '-isystem',
    nodeIncludeDir(),
    // Headers only; see the module comment.
    '-F',
    path.dirname(FRAMEWORK),
    '-framework',
    'Foundation',
    '-framework',
    'AppKit',
    '-o',
    OUTPUT,
    SOURCE,
  ];
  out(`clang++ ${args.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}`);
  execFileSync('xcrun', ['clang++', ...args], { stdio: 'inherit' });
  // `-bundle` output is ad-hoc signed by the linker on Apple Silicon; the
  // packaged copy is re-signed with the Developer ID like everything else.
  const size = statSync(OUTPUT).size;
  out(`built ${OUTPUT} (${size} bytes)`);
  return OUTPUT;
}

/** What the built bridge says about itself, for the build log and the tests. */
export function describeBridge() {
  if (!existsSync(OUTPUT)) return null;
  const header = readFileSync(OUTPUT).subarray(0, 4).toString('hex');
  return { path: OUTPUT, bytes: statSync(OUTPUT).size, machO: header === 'cffaedfe' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    buildBridge({ force: process.argv.includes('--force') });
  } catch (error) {
    console.error(error.message ?? error);
    process.exit(1);
  }
}
