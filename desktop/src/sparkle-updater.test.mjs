/**
 * The Sparkle bridge's contract, read from both sides.
 *
 * `bridge.mm` emits events by name; `sparkle-updater.mjs` lists the names
 * it will dispatch. The two are written by hand in two languages, so the
 * first test reads the Objective-C source and requires the lists to be
 * identical — an event the bridge emits that the module does not know is
 * dropped with a log line, which is exactly the kind of silent gap the
 * Phase 45 dialog had.
 *
 * The flags that make the updater manual — no scheduled checks, no
 * automatic download, no permission prompt, no system profile — are set in
 * `bridge.mm`; the second test reads them there, so a maintainer who flips
 * one has to change this file too.
 *
 * On a Mac where the bridge has been built, `load()` opens the vendored
 * framework and reports the version `desktop/sparkle.json` records.
 * Elsewhere — Linux CI, a checkout that has not run the build — `start()`
 * reports the missing bridge as a reason, which is the same assertion the
 * packaged application makes at launch.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(HERE, '..');
const BRIDGE_SOURCE = path.join(DESKTOP, 'native', 'sparkle', 'bridge.mm');
const BRIDGE_BINARY = path.join(DESKTOP, 'native', 'sparkle', 'build', 'kingfisher-sparkle.node');
const FRAMEWORK = path.join(DESKTOP, 'vendor', 'Sparkle', 'Sparkle.framework');
const RECORD = JSON.parse(readFileSync(path.join(DESKTOP, 'sparkle.json'), 'utf8'));

const logged = [];

async function load({ packaged = false } = {}) {
  vi.resetModules();
  logged.length = 0;
  vi.doMock('electron', () => ({
    app: {
      isPackaged: packaged,
      getName: () => 'kingfisher-desktop',
      getPath: (name) => (name === 'cache' ? '/Users/x/Library/Caches' : '/tmp'),
    },
  }));
  vi.doMock('./log.mjs', () => ({ log: (tag, message) => logged.push(`[${tag}] ${message}`) }));
  return import('./sparkle-updater.mjs');
}

beforeEach(() => {
  logged.length = 0;
});

describe('the bridge and the module agree on the events', () => {
  it('every emit(@"…") in bridge.mm is in EVENTS, and every EVENTS entry is emitted', async () => {
    const { EVENTS } = await load();
    const source = readFileSync(BRIDGE_SOURCE, 'utf8');
    const emitted = new Set([...source.matchAll(/emit\(@"([a-z-]+)"/g)].map((m) => m[1]));
    expect([...emitted].sort()).toEqual([...EVENTS].sort());
    expect(EVENTS.length).toBeGreaterThan(10);
  });

  it('the updater is created manual: no scheduled check, no automatic download, no prompt, no profile', () => {
    const source = readFileSync(BRIDGE_SOURCE, 'utf8');
    expect(source).toMatch(/automaticallyChecksForUpdates = NO;/);
    expect(source).toMatch(/automaticallyDownloadsUpdates = NO;/);
    expect(source).toMatch(/sendsSystemProfile = NO;/);
    expect(source).toMatch(
      /updaterShouldPromptForPermissionToCheckForUpdates:\(SPUUpdater \*\)updater \{[^}]*return NO;/s,
    );
    // The relaunch is always postponed for the save barrier, and released
    // only by resumeRelaunch().
    expect(source).toMatch(
      /shouldPostponeRelaunchForUpdate:[\s\S]*?gPostponedInstall = \[installHandler copy\];[\s\S]*?return YES;/,
    );
    // Nothing links Sparkle: the framework is opened by path.
    expect(source).toMatch(/dlopen\(executable\.fileSystemRepresentation/);
    expect(source).not.toMatch(/\[SPUUpdater alloc\]|\[SPUStandardUserDriver alloc\]/);
  });
});

describe('where Sparkle is', () => {
  it('packaged: Contents/Frameworks and the unpacked asar; unpackaged: vendor/ and native/', async () => {
    const { resolveSparkle } = await load();
    const packaged = resolveSparkle({
      packaged: true,
      resourcesPath: '/Applications/Kingfisher.app/Contents/Resources',
    });
    expect(packaged).toEqual({
      framework: '/Applications/Kingfisher.app/Contents/Frameworks/Sparkle.framework',
      bridge:
        '/Applications/Kingfisher.app/Contents/Resources/app.asar.unpacked/native/sparkle/build/kingfisher-sparkle.node',
    });
    const checkout = resolveSparkle({ packaged: false });
    expect(checkout.framework).toBe(FRAMEWORK);
    expect(checkout.bridge).toBe(BRIDGE_BINARY);
  });

  it('the relaunch handoff directory is the one the previous engine used', async () => {
    const { updaterCacheDir } = await load();
    expect(updaterCacheDir()).toBe('/Users/x/Library/Caches/kingfisher-desktop-updater');
  });
});

describe('starting', () => {
  it('a checkout never starts Sparkle, whatever is vendored: Electron.app is not a host', async () => {
    const { start, isUpdaterSupported } = await load({ packaged: false });
    const result = start({ platform: 'darwin' });
    expect(result.started).toBe(false);
    expect(result.reason).toMatch(/development checkout/);
    expect(isUpdaterSupported()).toBe(false);
  });

  it.each(['linux', 'win32'])(
    'on %s the answer is that Sparkle is macOS only, before anything is resolved',
    async (platform) => {
      const { start, isUpdaterSupported } = await load({ packaged: true });
      let resolved = false;
      const result = start({
        platform,
        packaged: true,
        resolve: () => {
          resolved = true;
          return { framework: FRAMEWORK, bridge: BRIDGE_BINARY };
        },
      });
      expect(result.started).toBe(false);
      expect(result.reason).toBe('Updates are delivered through Sparkle, which is macOS only.');
      expect(resolved).toBe(false);
      expect(isUpdaterSupported()).toBe(false);
    },
  );

  it('a missing bridge is a reason, not a throw, and no event listener is ever called', async () => {
    const { start, describe: describeEngine, isUpdaterSupported, on } = await load();
    const heard = [];
    on('found', (payload) => heard.push(payload));
    const result = start({
      platform: 'darwin',
      packaged: true,
      resolve: () => ({
        framework: '/nowhere/Sparkle.framework',
        bridge: '/nowhere/kingfisher-sparkle.node',
      }),
    });
    expect(result.started).toBe(false);
    expect(result.reason).toContain('Sparkle is not in this build');
    expect(isUpdaterSupported()).toBe(false);
    expect(describeEngine().feedURL).toBeNull();
    expect(heard).toEqual([]);
    expect(logged.some((line) => line.includes('Sparkle is not in this build'))).toBe(true);
  });

  it('events from the bridge reach listeners by name; an unknown name is logged, not thrown', async () => {
    const { on, __dispatchForTests, EVENTS } = await load();
    const heard = [];
    const off = on('found', (payload) => heard.push(payload));
    __dispatchForTests('found', { version: '600', displayVersion: '1.1.8' });
    expect(heard).toEqual([{ version: '600', displayVersion: '1.1.8' }]);
    off();
    __dispatchForTests('found', { version: '601' });
    expect(heard).toHaveLength(1);
    expect(() => __dispatchForTests('no-such-event', {})).not.toThrow();
    expect(logged.some((line) => line.includes('unknown event: no-such-event'))).toBe(true);
    expect(() => on('no-such-event', () => {})).toThrow(/Unknown Sparkle event/);
    expect(EVENTS).toContain('postpone-relaunch');
  });

  /*
    The real bridge, where it exists. `load()` opens the vendored framework
    and reads its version; `start()` is refused by Sparkle because the test
    runner is not a bundle with SUPublicEDKey — the same refusal a developer
    checkout gets, reported as a reason. Where the bridge has not been
    built, the missing-bridge reason is asserted instead: one of the two
    branches always runs, and neither is a skip.
  */
  it('the built bridge loads the vendored Sparkle and reports the recorded version', async () => {
    const { start } = await load();
    const built =
      process.platform === 'darwin' && existsSync(BRIDGE_BINARY) && existsSync(FRAMEWORK);
    if (built) {
      const bridge = createRequire(import.meta.url)(BRIDGE_BINARY);
      const loaded = bridge.load(path.join(FRAMEWORK, 'Sparkle'));
      expect(loaded.version).toBe(RECORD.version);
      expect(loaded.bundlePath).toBe(FRAMEWORK);
      expect(Object.keys(bridge).sort()).toEqual([
        'canCheckForUpdates',
        'checkForUpdateInformation',
        'checkForUpdates',
        'feedURL',
        'hasPostponedRelaunch',
        'lastUpdateCheckDate',
        'load',
        'resumeRelaunch',
        'sessionInProgress',
        'setFeedURL',
        'start',
      ]);
      // Started as a packaged application would, but resolved to the
      // checkout's copies: Sparkle refuses the test runner as a host.
      const result = start({
        packaged: true,
        resolve: () => ({ framework: FRAMEWORK, bridge: BRIDGE_BINARY }),
      });
      expect(result.sparkleVersion).toBe(RECORD.version);
      expect(result.started).toBe(false);
      expect(result.reason).toMatch(/bundle identifier|SUPublicEDKey|public|Sparkle/i);
      expect(bridge.canCheckForUpdates()).toBe(false);
      expect(bridge.resumeRelaunch()).toBe(false);
    } else {
      const result = start({
        packaged: true,
        resolve: () => ({ framework: FRAMEWORK, bridge: BRIDGE_BINARY }),
      });
      expect(result.started).toBe(false);
      expect(result.reason).toMatch(/Sparkle is not in this build|macOS only/);
    }
  });
});
