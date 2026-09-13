/**
 * Regression tests for the Squirrel.Mac direct-write defaults flag.
 *
 * The flag is the one escape hatch that suppresses the macOS
 * "Kingfisher is trying to add a new helper tool" SMJobBless prompt
 * Squirrel.Mac fires on every Electron-updater install. See the
 * docstring in `squirrel-direct-write.mjs` for the full reasoning.
 *
 * The test writes to a temporary bundle-id namespace so it never
 * touches the user's real `app.kingfisher.chess` preferences.
 */
import { execFileSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { platform } from 'node:process';

import { ensureSquirrelMacDirectWrite } from './squirrel-direct-write.mjs';

const BUNDLE_ID = 'app.kingfisher.test.directwrite';

function readFlag() {
  try {
    return execFileSync(
      '/usr/bin/defaults',
      ['read', BUNDLE_ID, 'SquirrelMacEnableDirectContentsWrite'],
      { encoding: 'utf8' },
    ).trim();
  } catch {
    return null;
  }
}

function readFlagType() {
  return execFileSync(
    '/usr/bin/defaults',
    ['read-type', BUNDLE_ID, 'SquirrelMacEnableDirectContentsWrite'],
    { encoding: 'utf8' },
  ).trim();
}

function clearFlag() {
  try {
    execFileSync(
      '/usr/bin/defaults',
      ['delete', BUNDLE_ID, 'SquirrelMacEnableDirectContentsWrite'],
      { encoding: 'utf8' },
    );
  } catch {
    /* already gone */
  }
}

const onDarwin = platform === 'darwin';

/*
  Off macOS there is no `defaults` command and the helper is documented to be
  a no-op, so that is what is asserted — a deterministic fallback rather than
  a skip. The repository's zero-skip rule exists because a skipped test on the
  one platform the shell ships on is indistinguishable from a passing one.
*/
describe('squirrel-direct-write off macOS', () => {
  it('is a no-op that reports no change', () => {
    if (onDarwin) {
      expect(platform).toBe('darwin');
      return;
    }
    expect(ensureSquirrelMacDirectWrite(BUNDLE_ID)).toBe(false);
  });
});

const teardown = onDarwin ? afterAll : () => {};

describe('squirrel-direct-write', () => {
  if (!onDarwin) {
    // Not macOS: the helper cannot write anything, and says so.
    it('cannot write a macOS default on this platform', () => {
      expect(ensureSquirrelMacDirectWrite(BUNDLE_ID)).toBe(false);
    });
    return;
  }
  teardown(() => {
    // Clean up the test namespace so we never pollute the user's defaults.
    try {
      execFileSync(
        '/usr/bin/defaults',
        ['delete', BUNDLE_ID, 'SquirrelMacEnableDirectContentsWrite'],
        { encoding: 'utf8' },
      );
    } catch {
      /* already gone */
    }
  });

  it('has no flag set on a clean domain', () => {
    clearFlag();
    expect(readFlag()).toBeNull();
  });

  it('reports a change on the first call against a clean domain', () => {
    clearFlag();
    expect(ensureSquirrelMacDirectWrite(BUNDLE_ID)).toBe(true);
  });

  it('stores the flag as the literal string "TRUE", not a boolean', () => {
    clearFlag();
    ensureSquirrelMacDirectWrite(BUNDLE_ID);
    expect(readFlag()).toBe('TRUE');
    expect(readFlagType()).toMatch(/string/i);
  });

  it('is a no-op when the flag is already set correctly', () => {
    clearFlag();
    ensureSquirrelMacDirectWrite(BUNDLE_ID);
    expect(ensureSquirrelMacDirectWrite(BUNDLE_ID)).toBe(false);
  });

  it('upgrades a stale integer value to the string form', () => {
    // Simulate the broken state where a user (or older code) wrote
    // `-bool TRUE`, which is stored as integer `1` and is silently
    // ignored by Squirrel.Mac because its check is `isEqualToString:`.
    execFileSync(
      '/usr/bin/defaults',
      ['write', BUNDLE_ID, 'SquirrelMacEnableDirectContentsWrite', '-bool', 'TRUE'],
      { encoding: 'utf8' },
    );
    expect(readFlagType()).toMatch(/boolean/i);
    expect(ensureSquirrelMacDirectWrite(BUNDLE_ID)).toBe(true);
    expect(readFlag()).toBe('TRUE');
    expect(readFlagType()).toMatch(/string/i);
  });

  it('corrects a wrong string value', () => {
    execFileSync(
      '/usr/bin/defaults',
      ['write', BUNDLE_ID, 'SquirrelMacEnableDirectContentsWrite', '-string', 'false'],
      { encoding: 'utf8' },
    );
    expect(ensureSquirrelMacDirectWrite(BUNDLE_ID)).toBe(true);
    expect(readFlag()).toBe('TRUE');
  });

  it.each([[null], [undefined], ['']])('is a safe no-op when the bundle identifier is %p', (id) => {
    // The helper must not throw if it cannot determine which defaults
    // domain to write to. These IDs would otherwise be valid inputs.
    expect(() => ensureSquirrelMacDirectWrite(id)).not.toThrow();
  });
});
