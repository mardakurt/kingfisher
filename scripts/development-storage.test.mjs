import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  openSync,
  ftruncateSync,
  closeSync,
  existsSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { developmentCache } from './development-cache.mjs';
import { inspectWorkspace } from './workspace-size.mjs';
import { cleanDevelopment } from './clean-development.mjs';
const defaults = {
  archives: '/cache/archives',
  engines: '/cache/engines',
  dataBuilds: '/cache/data-builds',
};
test('one external root moves all development categories; specific overrides win', () => {
  const paths = developmentCache({ KINGFISHER_CACHE_DIR: '/Volumes/SSD/KF' }, defaults);
  for (const value of Object.values(paths)) assert.ok(value.startsWith('/Volumes/SSD/KF/'));
  assert.equal(paths.archives, '/Volumes/SSD/KF/archives');
  assert.equal(
    developmentCache(
      { KINGFISHER_CACHE_DIR: '/disk', KINGFISHER_DATA_BUILD_DIR: '/other/builds' },
      defaults,
    ).dataBuilds,
    '/other/builds',
  );
});
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kf-storage-test-'));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function sparse(file, bytes) {
  const fd = openSync(file, 'w');
  ftruncateSync(fd, bytes);
  closeSync(fd);
}
test('a stray corpus fails even outside known generated directories', (t) => {
  const root = fixture(t);
  sparse(path.join(root, 'forgotten.sqlite'), 100_000_001);
  assert.ok(inspectWorkspace(root).failures.some((x) => x.includes('forgotten.sqlite')));
});
test('dependency internals count toward workspace ceiling, not per-file check', (t) => {
  const root = fixture(t);
  mkdirSync(path.join(root, 'node_modules'));
  sparse(path.join(root, 'node_modules', 'native.node'), 3_000_000_001);
  const result = inspectWorkspace(root);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /Workspace/);
});
test('split packs in public cannot bypass the aggregate deployment budget', (t) => {
  const root = fixture(t);
  mkdirSync(path.join(root, 'public'));
  sparse(path.join(root, 'public', 'one.gz'), 60_000_000);
  sparse(path.join(root, 'public', 'two.gz'), 60_000_000);
  assert.ok(inspectWorkspace(root).failures.some((x) => x.startsWith('Public')));
});
test('cleanup preserves authored data, dependencies and external symlink targets', (t) => {
  const root = fixture(t),
    external = fixture(t);
  for (const d of ['node_modules', 'companion/data', '.archive-cache', 'studies']) {
    mkdirSync(path.join(root, d), { recursive: true });
    writeFileSync(path.join(root, d, 'keep'), 'authored');
  }
  writeFileSync(path.join(external, 'keep'), 'external');
  symlinkSync(external, path.join(root, '.next'));
  cleanDevelopment(root);
  assert.ok(existsSync(path.join(external, 'keep')));
  assert.ok(!existsSync(path.join(root, '.next')));
  for (const d of ['node_modules', 'companion/data', '.archive-cache', 'studies'])
    assert.ok(existsSync(path.join(root, d, 'keep')));
});
test('cleanup refuses a symlinked parent escaping the project', (t) => {
  const root = fixture(t),
    external = fixture(t);
  mkdirSync(path.join(external, 'web'));
  symlinkSync(external, path.join(root, 'desktop'));
  assert.throws(() => cleanDevelopment(root), /external parent/);
  assert.ok(existsSync(path.join(external, 'web')));
});
