import { describe, expect, it } from 'vitest';

import { DEFAULT_PREFERENCES, type Preferences } from '@/stores/preferences-store';

import { exportSettings, parseSettingsExport, SECRET_PREFERENCE_KEYS } from './settings-transfer';

const preferences: Preferences = {
  ...DEFAULT_PREFERENCES,
  boardTheme: 'sage',
  engineThreads: 4,
  companionToken: 'super-secret-companion-token',
  lichessToken: 'lip_secret',
  assistantApiKey: 'sk-secret',
  companionUrl: 'http://127.0.0.1:4337',
  assistantBaseUrl: 'https://internal.example',
};

const exported = () =>
  exportSettings({
    preferences,
    layout: { arrangements: { 'desktop:analysis': { dockWidth: 500 } } },
    shortcuts: { flip: 'f' },
    now: 1_700_000_000_000,
  });

describe('exportSettings', () => {
  it('carries the settings worth moving between machines', () => {
    const file = exported();
    expect(file.preferences.boardTheme).toBe('sage');
    expect(file.preferences.engineThreads).toBe(4);
    expect(file.shortcuts).toEqual({ flip: 'f' });
    expect(file.layout).toEqual({ arrangements: { 'desktop:analysis': { dockWidth: 500 } } });
  });

  /* The promise the whole feature rests on. */
  it('carries no secret', () => {
    const serialised = JSON.stringify(exported());
    expect(serialised).not.toContain('super-secret-companion-token');
    expect(serialised).not.toContain('lip_secret');
    expect(serialised).not.toContain('sk-secret');
    expect(serialised).not.toContain('127.0.0.1');
    expect(serialised).not.toContain('internal.example');
  });

  it('omits every denied key by name, not merely by value', () => {
    const file = exported();
    for (const key of SECRET_PREFERENCE_KEYS) {
      expect(file.preferences).not.toHaveProperty(key);
    }
  });

  /*
    The deny-list's dangerous direction, turned into a build error: a
    preference added next phase whose name reads like a credential must be
    added to the deny-list, or this fails.
  */
  it('denies every preference whose name reads like a credential', () => {
    /*
      Names that look like credentials but are not, each one reviewed:
      `rememberLichessToken` is the boolean asking whether to persist the
      token, and exporting a preference about persistence carries nothing.
      Anything not on this list must be denied, which is what turns "somebody
      added a secret and forgot the deny-list" into a failing test.
    */
    const reviewedSafe: readonly string[] = ['rememberLichessToken'];
    const suspicious = Object.keys(DEFAULT_PREFERENCES).filter(
      (key) => /token|key|secret|password|url/i.test(key) && !reviewedSafe.includes(key),
    );
    expect(suspicious.length).toBeGreaterThan(0);
    for (const key of suspicious) {
      expect(SECRET_PREFERENCE_KEYS).toContain(key as keyof Preferences);
    }
  });
});

describe('parseSettingsExport', () => {
  it('round-trips its own output', () => {
    const result = parseSettingsExport(JSON.parse(JSON.stringify(exported())));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.preferences.boardTheme).toBe('sage');
    expect(result.value.shortcuts).toEqual({ flip: 'f' });
  });

  it('refuses a file that is not a settings export', () => {
    expect(parseSettingsExport({ kind: 'kingfisher.backup' }).ok).toBe(false);
    expect(parseSettingsExport('nonsense').ok).toBe(false);
    expect(parseSettingsExport(null).ok).toBe(false);
  });

  it('refuses an export from a newer build rather than guessing at it', () => {
    const result = parseSettingsExport({ ...exported(), version: 99 });
    expect(result.ok).toBe(false);
  });

  /*
    §64: malformed configuration must fall back safely without rejecting what
    is valid alongside it.
  */
  it('drops a preference of the wrong type and keeps the rest', () => {
    const result = parseSettingsExport({
      ...exported(),
      preferences: { boardTheme: 'sage', engineThreads: 'lots' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.preferences.boardTheme).toBe('sage');
    expect(result.value.preferences).not.toHaveProperty('engineThreads');
  });

  it('drops a preference this build has never heard of', () => {
    const result = parseSettingsExport({
      ...exported(),
      preferences: { fromTheFuture: true, boardTheme: 'sage' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.preferences).not.toHaveProperty('fromTheFuture');
  });

  it('refuses to import a secret even from a hand-edited file', () => {
    const result = parseSettingsExport({
      ...exported(),
      preferences: { lichessToken: 'lip_injected', boardTheme: 'sage' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.preferences).not.toHaveProperty('lichessToken');
  });

  it('drops a binding that is not a string', () => {
    const result = parseSettingsExport({ ...exported(), shortcuts: { flip: 42, comment: 'c' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.shortcuts).toEqual({ comment: 'c' });
  });

  /*
    The preset is a label for MultiPV, hash and the limit, not a second source
    of truth — every control that changes one of those writes `custom` for
    exactly that reason. Import was the one wholesale write that did not, so a
    file could leave Settings reading "Deep" over an engine that was neither
    five lines nor a 256 MB hash. Every key below passes the per-key type check
    that already ran; the disagreement is between them, which no per-key check
    can see.
  */
  describe('an engine preset that does not describe the values it arrives with', () => {
    const imported = (prefs: Record<string, unknown>) => {
      const result = parseSettingsExport({ ...exported(), preferences: prefs });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected a valid export');
      return result.value.preferences;
    };

    it('becomes custom when the line count disagrees', () => {
      const restored = imported({
        enginePreset: 'deep',
        engineMultiPv: 1,
        engineHashMb: 256,
        engineLimit: { kind: 'infinite' },
      });
      expect(restored.enginePreset).toBe('custom');
      // The values the file actually carried are kept: the import is a
      // transfer, not a reconfiguration.
      expect(restored.engineMultiPv).toBe(1);
      expect(restored.engineHashMb).toBe(256);
    });

    it('becomes custom when the hash disagrees', () => {
      expect(
        imported({ enginePreset: 'deep', engineMultiPv: 5, engineHashMb: 64 }).enginePreset,
      ).toBe('custom');
    });

    it('becomes custom when the limit is a different limit', () => {
      expect(
        imported({
          enginePreset: 'deep',
          engineMultiPv: 5,
          engineHashMb: 256,
          engineLimit: { kind: 'movetime', ms: 2000 },
        }).enginePreset,
      ).toBe('custom');
    });

    it('becomes custom when the file names a preset and no values beside it', () => {
      // A one-key file is valid: there is no type error to catch. The machine's
      // defaults are what will be in force, and they are Standard's.
      expect(imported({ enginePreset: 'deep' }).enginePreset).toBe('custom');
    });

    it('keeps a preset that genuinely describes the values beside it', () => {
      const restored = imported({
        enginePreset: 'deep',
        engineMultiPv: 5,
        engineHashMb: 256,
        engineLimit: { kind: 'infinite' },
        // Threads are not consulted: a preset scales them per machine, so a
        // workstation's count cannot be expected to survive the move.
        engineThreads: 12,
      });
      expect(restored.enginePreset).toBe('deep');
      expect(restored.engineThreads).toBe(12);
    });

    it('leaves custom and unknown preset ids exactly as they were', () => {
      expect(imported({ enginePreset: 'custom', engineMultiPv: 1 }).enginePreset).toBe('custom');
      expect(imported({ enginePreset: 'fromTheFuture', engineMultiPv: 1 }).enginePreset).toBe(
        'fromTheFuture',
      );
    });

    it('treats a file with no preset key as untouched', () => {
      const restored = imported({ engineMultiPv: 5, boardTheme: 'sage' });
      expect(restored).not.toHaveProperty('enginePreset');
      expect(restored.engineMultiPv).toBe(5);
    });
  });
});
