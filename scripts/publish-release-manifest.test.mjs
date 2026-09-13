import { afterEach, expect, test } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

test('runtime manifest uses the public descriptor even when a stale build snapshot exists', () => {
  const root = mkdtempSync(join(tmpdir(), 'kingfisher-manifest-test-'));
  roots.push(root);
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'src/release'), { recursive: true });
  copyFileSync(
    new URL('./publish-release-manifest.mjs', import.meta.url),
    join(root, 'scripts/publish-release-manifest.mjs'),
  );
  const descriptor = JSON.parse(
    readFileSync(new URL('../src/release/macos-download.json', import.meta.url), 'utf8'),
  );
  writeFileSync(join(root, 'src/release/macos-download.json'), JSON.stringify(descriptor));
  // An old, otherwise usable snapshot must never select the public version.
  writeFileSync(
    join(root, 'release-manifest.json'),
    JSON.stringify({
      kingfisher: { name: 'kingfisher', version: '0.0.1' },
      desktop: [
        { name: 'Kingfisher-0.0.1-arm64.dmg', path: 'old.dmg', sha256: 'a'.repeat(64), bytes: 1 },
      ],
    }),
  );
  const result = spawnSync(process.execPath, [join(root, 'scripts/publish-release-manifest.mjs')], {
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  const manifest = JSON.parse(readFileSync(join(root, 'kingfisher-release-manifest.json'), 'utf8'));
  expect(manifest.kingfisher.version).toBe(descriptor.version);
  expect(manifest.publishedAt).toBe(descriptor.publishedAt);
  expect(manifest.desktop).toEqual([
    {
      name: descriptor.filename,
      arch: descriptor.architecture,
      sha256: descriptor.sha256,
      bytes: descriptor.bytes,
      url: descriptor.url,
    },
  ]);
});
