import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from './preferences-store';
import { portablePreferences } from './portable-preferences';

describe('portable backup preferences', () => {
  it('keeps user choices and excludes every credential', () => {
    const preferences = portablePreferences({
      ...DEFAULT_PREFERENCES,
      boardTheme: 'walnut',
      autoBackupRetention: 5,
      companionToken: 'private-companion',
      lichessToken: 'private-lichess',
      assistantApiKey: 'private-assistant',
    });
    expect(preferences).toMatchObject({ boardTheme: 'walnut', autoBackupRetention: 5 });
    expect(preferences).not.toHaveProperty('companionToken');
    expect(preferences).not.toHaveProperty('lichessToken');
    expect(preferences).not.toHaveProperty('assistantApiKey');
  });
});
