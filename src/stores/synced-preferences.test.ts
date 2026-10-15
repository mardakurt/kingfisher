import { describe, expect, it } from 'vitest';

import { SECRET_PREFERENCE_KEYS } from './portable-preferences';
import { DEFAULT_PREFERENCES } from './preferences-store';
import { acceptablePreferences } from './synced-preferences-source';
import { DEVICE_PREFERENCE_KEYS, SYNCED_PREFERENCE_KEYS } from './synced-preferences';

describe('synced preferences', () => {
  it('never carries a secret or a machine setting', () => {
    for (const key of SYNCED_PREFERENCE_KEYS) {
      expect(SECRET_PREFERENCE_KEYS.has(key)).toBe(false);
      expect(DEVICE_PREFERENCE_KEYS.has(key)).toBe(false);
    }
    expect(SYNCED_PREFERENCE_KEYS).not.toContain('lichessToken');
    expect(SYNCED_PREFERENCE_KEYS).not.toContain('engineThreads');
  });

  it('names only preferences that exist', () => {
    for (const key of DEVICE_PREFERENCE_KEYS) expect(key in DEFAULT_PREFERENCES).toBe(true);
  });

  it('applies only values shaped like the defaults, and ignores unknown or secret keys', () => {
    const accepted = acceptablePreferences({
      theme: 'dark',
      showEvaluationBar: 'yes',
      engineMultiPv: 4,
      explorerMinRating: 2200,
      lichessToken: 'stolen',
      notAPreference: 1,
    });
    expect(accepted).toEqual({ theme: 'dark', engineMultiPv: 4, explorerMinRating: 2200 });
  });

  it('refuses something that is not a record at all', () => {
    expect(acceptablePreferences(null)).toEqual({});
    expect(acceptablePreferences([1, 2])).toEqual({});
    expect(acceptablePreferences('theme=dark')).toEqual({});
  });
});
