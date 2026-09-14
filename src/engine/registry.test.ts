/**
 * Which engines a machine is offered.
 *
 * Phase 15 added Berserk, Obsidian and Koivisto, all of which publish
 * Windows-only builds. Listing them everywhere would put three engines in a
 * Mac user's selector that produce an error when chosen — the exact "dead
 * control" this catalogue was built to avoid.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_ENGINE_ID,
  engineDefinition,
  engineDefinitions,
  engineDefinitionsVersion,
  registerBrowserEngineBuilds,
  runnableEngineDefinitions,
  setEnginePlatform,
  subscribeEngineDefinitions,
  enginesNotPublishedFor,
  publishedPlatformWords,
} from './registry';
import { buildsForNetwork } from './stockfish/provider';

afterEach(() => {
  setEnginePlatform(null);
  registerBrowserEngineBuilds([]);
});

const ids = () => runnableEngineDefinitions().map((engine) => engine.id);

describe('the engines offered on a machine', () => {
  it('offers everything until the companion says what platform it is on', () => {
    expect(ids()).toEqual(engineDefinitions().map((engine) => engine.id));
  });

  it('drops engines with no build for this platform', () => {
    setEnginePlatform('darwin-arm64');
    expect(ids()).not.toContain('berserk');
    expect(ids()).not.toContain('obsidian');
    expect(ids()).not.toContain('koivisto');
    expect(ids()).toContain('stockfish-native');
    expect(ids()).toContain('plentychess');
  });

  it('offers the Windows-only engines on Windows', () => {
    setEnginePlatform('win32-x64');
    for (const id of ['berserk', 'obsidian', 'koivisto', 'stockfish-native']) {
      expect(ids(), id).toContain(id);
    }
  });

  it('always keeps the browser engine, which needs nothing installed', () => {
    for (const platform of [
      'darwin-arm64',
      'darwin-x64',
      'linux-x64',
      'linux-arm64',
      'win32-x64',
    ]) {
      setEnginePlatform(platform);
      expect(ids(), platform).toContain(DEFAULT_ENGINE_ID);
    }
  });

  it('still resolves a hidden engine by id, so a running analysis keeps its name', () => {
    setEnginePlatform('darwin-arm64');
    // A profile that moved between machines can be configured for an engine
    // this one cannot run. It must still have a name.
    expect(engineDefinition('berserk')?.name).toBe('Berserk 14');
  });
});

describe('the engines a machine will never be offered', () => {
  /*
    A Mac user who has read that Kingfisher knows nine native engines and
    finds six in Settings concludes three are broken. This is the list the
    Settings page and the selector name instead, with the reason.
  */
  it('names the Windows-only catalogue engines for a Mac', () => {
    const names = enginesNotPublishedFor('darwin-arm64').map((engine) => engine.name);
    expect(names).toEqual(['Berserk 14', 'Koivisto 9.0', 'Obsidian 16.0']);
    expect(enginesNotPublishedFor('darwin').map((engine) => engine.name)).toEqual(names);
  });

  it('offers everything on Windows, and Koivisto on Linux', () => {
    expect(enginesNotPublishedFor('win32-x64')).toEqual([]);
    expect(enginesNotPublishedFor('linux-x64').map((engine) => engine.name)).toEqual([
      'Berserk 14',
      'Obsidian 16.0',
    ]);
  });

  it('never lists the browser engine or an engine published anywhere', () => {
    for (const engine of enginesNotPublishedFor('darwin-arm64')) {
      expect(engine.transport).toBe('native');
      expect(engine.platforms).toBeDefined();
    }
  });

  it('says where an engine is published in words a user reads', () => {
    expect(publishedPlatformWords(['win32-x64'])).toBe('Windows');
    expect(publishedPlatformWords(['linux-x64', 'win32-x64'])).toBe('Linux and Windows');
    expect(publishedPlatformWords(['darwin-arm64', 'linux-x64', 'win32-x64'])).toBe(
      'Linux, Windows and macOS',
    );
    expect(publishedPlatformWords(undefined)).toBe('no platform');
  });
});

describe('the full-network browser engine', () => {
  /*
    Registered from the manifest, never declared: the 113 MB build exists on
    the web deployment and not in the Mac application, and a selector that
    named it where it was not installed would fail on first use.
  */
  it('is absent until a manifest lists a full-network build', () => {
    registerBrowserEngineBuilds([]);
    expect(ids()).not.toContain('stockfish-wasm-full');
    expect(engineDefinition('stockfish-wasm-full')).toBeUndefined();
  });

  it('appears when the manifest lists one, and tells subscribers', () => {
    const seen: number[] = [];
    const stop = subscribeEngineDefinitions(() => seen.push(engineDefinitionsVersion()));
    const before = engineDefinitionsVersion();
    registerBrowserEngineBuilds([
      { id: 'lite-single', label: 'lite', script: '/a.js', threads: false },
      { id: 'full-mt', label: 'full', script: '/b.js', threads: true, network: 'full' },
    ]);
    expect(ids()).toContain('stockfish-wasm-full');
    expect(engineDefinition('stockfish-wasm-full')?.transport).toBe('worker');
    expect(engineDefinition('stockfish-wasm-full')?.name).toBe('Stockfish 18 (full network)');
    expect(seen).toEqual([before + 1]);

    // Reading the same manifest again changes nothing and tells nobody.
    registerBrowserEngineBuilds([
      { id: 'full-mt', label: 'full', script: '/b.js', threads: true, network: 'full' },
    ]);
    expect(seen).toEqual([before + 1]);
    stop();
  });

  it('is offered on every platform the companion can report, like the lite build', () => {
    registerBrowserEngineBuilds([
      { id: 'full-mt', label: 'full', script: '/b.js', threads: true, network: 'full' },
    ]);
    for (const platform of ['darwin-arm64', 'linux-x64', 'win32-x64']) {
      setEnginePlatform(platform);
      expect(ids(), platform).toContain('stockfish-wasm-full');
    }
    expect(enginesNotPublishedFor('darwin-arm64').map((engine) => engine.id)).not.toContain(
      'stockfish-wasm-full',
    );
  });

  it('is withdrawn again when the manifest stops listing it', () => {
    registerBrowserEngineBuilds([
      { id: 'full-mt', label: 'full', script: '/b.js', threads: true, network: 'full' },
    ]);
    registerBrowserEngineBuilds([
      { id: 'lite-single', label: 'lite', script: '/a.js', threads: false },
    ]);
    expect(ids()).not.toContain('stockfish-wasm-full');
  });

  it('reads a manifest written before networks existed as lite-only', () => {
    const legacy = [{ id: 'lite-single', label: 'lite', script: '/a.js', threads: false }];
    expect(buildsForNetwork(legacy, 'lite')).toHaveLength(1);
    expect(buildsForNetwork(legacy, 'full')).toHaveLength(0);
  });
});
