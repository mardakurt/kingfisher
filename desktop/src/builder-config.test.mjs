/**
 * The packaging configuration, pinned.
 *
 * `electron-builder.yml` is the file that decides whether a packaged
 * Kingfisher contains an application. A Phase 35 rewrite dropped the
 * `extraResources` block, and every build from that commit to Phase 45 was a
 * shell with nothing to serve: it launched, logged "This build is incomplete"
 * and exited before a window. The build succeeded, the DMG verified, and the
 * handovers reported the packaged app healthy. Nothing in the test suite read
 * this file.
 *
 * These tests do. They are deliberately literal — the `to:` paths are the
 * contract `desktop/src/paths.mjs` and the companion's own root resolution
 * depend on, so a rename here must be a rename there.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { missingParts, resolveLayout } from './paths.mjs';
import { REQUIRED_DESKTOP_RESOURCES } from './required-resources.mjs';

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = yaml.load(readFileSync(path.join(DESKTOP, 'electron-builder.yml'), 'utf8'));

const resources = new Map((config.extraResources ?? []).map((entry) => [entry.to, entry]));

describe('electron-builder.yml', () => {
  it('blocks archives until resource and boot verification pass', () => {
    expect(config.afterPack).toBe('scripts/verify-package.mjs');
    const build = readFileSync(path.join(DESKTOP, 'scripts/build.mjs'), 'utf8');
    expect(build).toContain('await packagePipeline(');
    expect(build).toContain('boot: verifyPackageBoot');
  });
  it('stages the web server and the companion where paths.mjs will look for them', () => {
    // The layout the shell resolves inside a bundle, with the resources root
    // it will actually be given.
    const layout = resolveLayout({ packaged: true, resourcesPath: '/Contents/Resources' });
    const staged = [...resources.keys()].map((to) => path.join('/Contents/Resources', to));
    const covers = (file) => staged.some((root) => file === root || file.startsWith(`${root}/`));
    expect(
      covers(layout.webEntry),
      `${layout.webEntry} is not under any extraResources target`,
    ).toBe(true);
    expect(
      covers(layout.companionEntry),
      `${layout.companionEntry} is not under any extraResources target`,
    ).toBe(true);
  });

  it('ships everything the companion resolves relative to its root', () => {
    // companion/src/server.mjs resolves ROOT two levels up and reads these.
    for (const to of [
      'kingfisher/web',
      'kingfisher/web/node_modules',
      'kingfisher/companion/src',
      'kingfisher/scripts/engine-catalogue.mjs',
      'kingfisher/scripts/engine-digests.json',
      'kingfisher/public/engine',
      'kingfisher/engines/tablebase',
    ]) {
      expect(resources.has(to), `extraResources has no entry for ${to}`).toBe(true);
    }
  });

  it('names sources that exist in the checkout, or are produced by the web build', () => {
    const produced = new Set([
      'web',
      'web/node_modules',
      'resources/engine',
      'resources/tablebase',
    ]);
    for (const entry of config.extraResources) {
      if (produced.has(entry.from)) continue;
      expect(existsSync(path.join(DESKTOP, entry.from)), `${entry.from} does not exist`).toBe(true);
    }
  });

  it('keeps the spawned processes out of the archive and the tests out of the bundle', () => {
    expect(config.asar).toBe(true);
    expect(config.files).toContain('src/**/*');
    expect(config.files).toContain('!web/**/*');
    expect(config.files).toContain('!**/*.test.mjs');
    const companion = resources.get('kingfisher/companion/src');
    expect(companion.filter).toContain('!**/*.test.mjs');
    expect(companion.filter).toContain('!__fixtures__/**');
  });

  it('ships the one tablebase helper and not a Finder duplicate beside it', () => {
    // The public 1.0.0 bundle carried `kingfisher-tbprobe 3` next to the
    // helper, from a duplicate in the build machine's staging directory.
    expect(resources.get('kingfisher/engines/tablebase').filter).toEqual(['kingfisher-tbprobe']);
  });

  it('is the application the documentation describes', () => {
    expect(config.appId).toBe('app.kingfisher.chess');
    expect(config.productName).toBe('Kingfisher');
    expect(config.electronVersion).toBe('44.2.0');
    expect(config.mac.hardenedRuntime).toBe(true);
    expect(config.mac.entitlements).toBe('build/entitlements.mac.plist');
    expect(config.mac.extendInfo.LSMinimumSystemVersion).toBe('11.0');
    // The .app is notarised in the directory step when credentials are set,
    // so the boot gate and the archives see a stapled application.
    expect(config.mac.notarize).toBe(true);
  });

  it('refuses a publishable build without notarization credentials', () => {
    const build = readFileSync(path.join(DESKTOP, 'scripts/build.mjs'), 'utf8');
    expect(build).toMatch(
      /identity\.channel !== 'dev'[\s\S]*APPLE_API_KEY[\s\S]*process\.exit\(1\)/,
    );
  });

  it('builds for Apple silicon only, as a DMG and an update ZIP', () => {
    const targets = config.mac.target.map((t) => `${t.target}:${t.arch}`).sort();
    expect(targets).toEqual(['dmg:arm64', 'zip:arm64']);
  });

  it('lets the Finder offer Kingfisher for a .pgn', () => {
    const pgn = (config.fileAssociations ?? []).find((a) => a.ext === 'pgn');
    expect(pgn).toBeDefined();
    expect(pgn.role).toBe('Viewer');
  });

  it('declares the stable feed so app-update.yml is written, and only ever uploads by hand', () => {
    // A feed has to be declared for electron-builder to write app-update.yml
    // into the bundle; with `publish: null` a packaged build had nothing to
    // ask. Uploading is the release scripts' job: build.mjs passes
    // `--publish never` on every run.
    expect(config.publish).toMatchObject({
      provider: 'github',
      owner: 'mardakurt',
      repo: 'kingfisher',
    });
    expect(config.publish.releaseType).toBe('release');
    const build = readFileSync(path.join(DESKTOP, 'scripts', 'build.mjs'), 'utf8');
    expect(build).toMatch(/'--publish',\s*'never'/);
  });

  it('the DMG contract the verifier asserts', () => {
    expect(config.dmg.title).toBe('${productName}');
    expect(config.dmg.icon).toBe('build/dmg/icon.icns');
    const kinds = config.dmg.contents.map((c) => c.type).sort();
    expect(kinds).toEqual(['file', 'link']);
    expect(config.dmg.contents.find((c) => c.type === 'link').path).toBe('/Applications');
  });
});

describe('the layout a build must satisfy', () => {
  it('missingParts names every required resource in an empty bundle', () => {
    const layout = resolveLayout({ packaged: true, resourcesPath: '/nowhere' });
    expect(missingParts(layout)).toHaveLength(REQUIRED_DESKTOP_RESOURCES.length);
  });
});
