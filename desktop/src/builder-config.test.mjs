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

import { MINIMUM_MACOS } from './platform-floor.mjs';

import { missingParts, resolveLayout } from './paths.mjs';
import { REQUIRED_DESKTOP_RESOURCES } from './required-resources.mjs';

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = yaml.load(readFileSync(path.join(DESKTOP, 'electron-builder.yml'), 'utf8'));

const resources = new Map((config.extraResources ?? []).map((entry) => [entry.to, entry]));

describe('electron-builder.yml', () => {
  it('blocks archives until resource and boot verification pass', () => {
    expect(config.afterPack).toBe('scripts/verify-package.mjs');
    expect(config.afterSign).toBe('scripts/verify-package-boot.mjs');
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
    expect(config.mac.extendInfo.LSMinimumSystemVersion).toBe(MINIMUM_MACOS);
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

  it("ships Sparkle: the framework beside Electron's, the bridge unpacked, the policy in the plist", () => {
    // The framework under Contents/Frameworks is what gets it signed and
    // notarised with the bundle; the bridge is a shared library and cannot
    // be loaded from inside the asar. `sparkle-bundle.mjs` checks the built
    // result; this checks the instruction that produces it.
    expect(config.extraFiles).toContainEqual({
      from: 'vendor/Sparkle/Sparkle.framework',
      to: 'Frameworks/Sparkle.framework',
    });
    expect(config.files).toContain('native/sparkle/build/kingfisher-sparkle.node');
    expect(config.asarUnpack).toEqual(['native/sparkle/build/kingfisher-sparkle.node']);
    // No scheduled check, no automatic download: the two keys Sparkle
    // reads before anything the bridge sets.
    expect(config.mac.extendInfo.SUEnableAutomaticChecks).toBe(false);
    expect(config.mac.extendInfo.SUAllowsAutomaticUpdates).toBe(false);
    // The feed and the key come from their single sources, through build.mjs.
    expect(config.mac.extendInfo.SUFeedURL).toBeUndefined();
    expect(config.mac.extendInfo.SUPublicEDKey).toBeUndefined();
    const build = readFileSync(path.join(DESKTOP, 'scripts', 'build.mjs'), 'utf8');
    expect(build).toMatch(/-c\.mac\.extendInfo\.SUFeedURL=\$\{publicUrl\.appcast\}/);
    expect(build).toMatch(/-c\.mac\.extendInfo\.SUPublicEDKey=\$\{sparklePublicKey\}/);
    expect(build).toMatch(/await fetchSparkle\(\);\s*buildBridge\(\);/);
    // A publishable build carries the recorded key and nothing else.
    expect(build).toMatch(
      /identity\.channel !== 'dev' && sparklePublicKey !== SPARKLE\.publicKey[\s\S]*process\.exit\(1\)/,
    );
  });

  it('never uploads from the build: no publish block, and no electron-updater feed', () => {
    expect(config.publish).toBeUndefined();
    const yml = readFileSync(path.join(DESKTOP, 'electron-builder.yml'), 'utf8');
    expect(yml).not.toMatch(/app-update\.yml/);
    const pkg = JSON.parse(readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'));
    expect(pkg.dependencies?.['electron-updater']).toBeUndefined();
  });

  it('records the Sparkle it embeds, with a digest and the public key', () => {
    const record = JSON.parse(readFileSync(path.join(DESKTOP, 'sparkle.json'), 'utf8'));
    expect(record.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(record.url).toBe(
      `https://github.com/sparkle-project/Sparkle/releases/download/${record.version}/Sparkle-${record.version}.tar.xz`,
    );
    expect(record.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(record.publicKey).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(record.licence).toBe('MIT');
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
