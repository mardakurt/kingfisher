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
  runnableEngineDefinitions,
  setEnginePlatform,
} from './registry';

afterEach(() => setEnginePlatform(null));

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
