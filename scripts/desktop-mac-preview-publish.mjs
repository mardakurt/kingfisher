#!/usr/bin/env node
/**
 * Publish the current-master macOS build as a preview, and point the landing at it.
 *
 * Why a preview channel exists. The landing page must offer the *current*
 * desktop build, and a stable release needs a Developer ID Application
 * certificate the project does not yet have. Between those two facts sits
 * this script: it takes a DMG built from a clean checkout on the `preview`
 * channel, attaches it to a GitHub **pre-release** under its own immutable tag,
 * downloads it back from the public URL to prove the bytes arrived intact,
 * and writes `src/release/macos-download.json` — the one file the landing,
 * the install guide and the verifiers read.
 *
 * What it will not do:
 *
 *   - replace the bytes of an existing asset. The tag carries the build
 *     number (`macos-preview-431`), the filename carries it too, and a tag
 *     that already exists is an error, not an overwrite;
 *   - touch `/releases/latest`. A pre-release never becomes GitHub's latest
 *     release, so the stable updater feed — which ignores pre-releases —
 *     cannot see it either;
 *   - bump the version. A preview is `1.0.0` with a build number, and stays
 *     that until a real release earns `1.1.0`;
 *   - publish a build whose recorded commit is not the clean HEAD it is run
 *     from, or one that was built from a dirty tree;
 *   - commit. The descriptor is written into the tree; the commit that
 *     carries it (and any documentation that names the build) is yours.
 *
 *   KINGFISHER_DESKTOP_CHANNEL=preview npm run desktop:dist
 *   npm run release:mac:preview -- [--dmg path] [--dry-run]
 */

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { verifyDmg } from '../desktop/scripts/verify-dmg.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO = 'mardakurt/kingfisher';
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const found = argv.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : null;
};
const dryRun = flag('dry-run');

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const gh = (args, options = {}) => {
  const result = spawnSync('gh', args, { encoding: 'utf8', ...options });
  if (result.status !== 0)
    throw new Error(`gh ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
};

function step(label, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) exit(1);
}

async function main() {
  // 1. The tree: clean, and HEAD is what will be recorded.
  const porcelain = git('status', '--porcelain');
  step('the working tree is clean', porcelain.length === 0, porcelain.split('\n')[0] ?? '');
  const head = git('rev-parse', 'HEAD');
  const build = Number(git('rev-list', '--count', 'HEAD'));
  const { version } = JSON.parse(readFileSync(path.join(ROOT, 'desktop', 'package.json'), 'utf8'));
  const filename = `Kingfisher-${version}-preview-${build}-arm64.dmg`;
  const tag = `macos-preview-${build}`;
  console.log(`\n${version} · build ${build} · ${head.slice(0, 7)} · ${filename}\n`);

  // 2. The DMG: built from this commit, on the preview channel, launchable.
  const out = process.env.KINGFISHER_DESKTOP_OUT ?? path.join(ROOT, 'desktop', 'dist');
  const dmg = value('dmg') ?? path.join(out, filename);
  step('the DMG exists', existsSync(dmg), dmg);
  const verified = await verifyDmg(dmg, {
    expectVersion: version,
    expectBuild: build,
    expectCommit: head,
  });
  for (const row of verified.checks) step(`dmg: ${row.label}`, row.ok, row.detail);
  step(
    'the DMG was built on the preview channel',
    verified.facts.identity?.channel === 'preview',
    String(verified.facts.identity?.channel),
  );
  const bytes = statSync(dmg).size;
  const sha256 = createHash('sha256').update(readFileSync(dmg)).digest('hex');
  console.log(`\nsha256 ${sha256}\nbytes  ${bytes}\n`);
  const identity = /Developer ID Application/.test(verified.facts.signingAuthority ?? '')
    ? 'Developer ID Application'
    : 'Apple Development';

  // 3. The tag must be new: same name, different bytes is the thing this exists to prevent.
  const existing = spawnSync('gh', ['release', 'view', tag, '--repo', REPO, '--json', 'tagName'], {
    encoding: 'utf8',
  });
  step('no release with this tag exists yet', existing.status !== 0, tag);
  step(
    'the commit is on the remote',
    spawnSync('git', ['branch', '-r', '--contains', head], {
      cwd: ROOT,
      encoding: 'utf8',
    }).stdout.includes('origin/master'),
    'push master first',
  );

  const notes = [
    `Kingfisher ${version} — macOS preview, build ${build}`,
    '',
    `Built from \`${head}\` on master. Apple Silicon only. Code-signed with an ${identity} identity` +
      (identity === 'Apple Development'
        ? ', **not notarised**: right-click → Open on first launch (see the install guide).'
        : '.'),
    '',
    'A preview is the current source, not a release. It keeps the marketing version and carries a',
    'build number instead; it does not update itself, and the stable updater feed does not see',
    'pre-releases. The newest preview is always the one the landing page links.',
    '',
    `SHA-256: \`${sha256}\``,
  ].join('\n');

  const descriptor = {
    schema: 'kingfisher-macos-download/1',
    channel: 'preview',
    version,
    build,
    commit: head,
    filename,
    url: `https://github.com/${REPO}/releases/download/${tag}/${filename}`,
    sha256,
    bytes,
    architecture: 'arm64',
    minimumMacOS: verified.facts.minimumMacOS ?? '11.0',
    signature: { identity, notarized: false },
    publishedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    releasePage: `https://github.com/${REPO}/releases/tag/${tag}`,
  };

  if (dryRun) {
    console.log('\n--dry-run: would create the pre-release and write:\n');
    console.log(JSON.stringify(descriptor, null, 2));
    return;
  }

  // 4. Publish: pre-release, at the commit, with the DMG, its sums and the descriptor.
  const staging = mkdtempSync(path.join(tmpdir(), 'kingfisher-preview-publish-'));
  try {
    const sums = path.join(staging, 'SHA256SUMS.txt');
    writeFileSync(sums, `${sha256}  ${filename}\n`);
    const json = path.join(staging, 'macos-download.json');
    writeFileSync(json, `${JSON.stringify(descriptor, null, 2)}\n`);
    gh([
      'release',
      'create',
      tag,
      '--repo',
      REPO,
      '--prerelease',
      '--target',
      head,
      '--title',
      `Kingfisher ${version} — macOS preview (build ${build})`,
      '--notes',
      notes,
      dmg,
      sums,
      json,
    ]);
    step('the pre-release was created', true, descriptor.releasePage);

    // 5. Download it back from the public URL. Not the local file: the bytes
    //    a user gets are the only bytes that matter.
    const back = path.join(staging, 'downloaded.dmg');
    let response = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      response = await fetch(descriptor.url, { redirect: 'follow' });
      if (response.ok) break;
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
    step('the public URL answers', Boolean(response?.ok), `HTTP ${response?.status}`);
    const hash = createHash('sha256');
    let received = 0;
    const counting = new TransformStream({
      transform(chunk, controller) {
        hash.update(chunk);
        received += chunk.length;
        controller.enqueue(chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body.pipeThrough(counting)), createWriteStream(back));
    step('every byte came back', received === bytes, `${received} of ${bytes}`);
    step('the public bytes hash as recorded', hash.digest('hex') === sha256);
    const again = await verifyDmg(back, {
      expectVersion: version,
      expectBuild: build,
      expectCommit: head,
    });
    step(
      'the public DMG verifies',
      again.ok,
      `${again.checks.filter((c) => c.ok).length}/${again.checks.length}`,
    );

    // 6. The latest release is still the stable one.
    const latest = gh(['release', 'view', '--repo', REPO, '--json', 'tagName', '--jq', '.tagName']);
    step('/releases/latest still names the stable release', latest.startsWith('v'), latest);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }

  // 7. Point the repository at it.
  const target = path.join(ROOT, 'src', 'release', 'macos-download.json');
  writeFileSync(target, `${JSON.stringify(descriptor, null, 2)}\n`);
  console.log(`\nwrote ${path.relative(ROOT, target)}`);
  console.log(
    'Now: npm run docs:check, commit the descriptor with any docs that name the build, push.',
  );
  console.log(
    'The landing deploys from master; then: npm run desktop:public:verify -- --landing --full',
  );
}

main().catch((error) => {
  console.error(`\npublish did not complete: ${error?.stack ?? error}`);
  exit(2);
});
