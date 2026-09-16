import { DEFAULT_PREFERENCES, type Preferences } from './preferences-store';

export const SECRET_PREFERENCE_KEYS = new Set<keyof Preferences>([
  'companionToken',
  'lichessToken',
  'assistantApiKey',
]);

export function portablePreferences(state: Preferences): Record<string, unknown> {
  return Object.fromEntries(
    (Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[])
      .filter((key) => !SECRET_PREFERENCE_KEYS.has(key))
      .map((key) => [key, state[key]]),
  );
}
