/**
 * The preferences an account carries between devices.
 *
 * Everything in Settings that describes the person — board, pieces, engine
 * display, explorer filters — follows them; what describes this machine does
 * not, and secrets never leave it.
 */

import { DEFAULT_PREFERENCES, type Preferences } from './preferences-store';
import { SECRET_PREFERENCE_KEYS } from './portable-preferences';

/**
 * Preferences that describe this machine, not the person: hardware, installed
 * engines and sources, local service addresses, local backups. Secrets
 * (`SECRET_PREFERENCE_KEYS`) are excluded as well and never leave the device.
 */
export const DEVICE_PREFERENCE_KEYS: ReadonlySet<keyof Preferences> = new Set<keyof Preferences>([
  'engineThreads',
  'engineHashMb',
  'hiddenEngineIds',
  'primaryEngineId',
  'secondaryEngineId',
  'companionUrl',
  'assistantBaseUrl',
  'assistantModel',
  'rememberLichessToken',
  'explorerSourceId',
  'reportCollectionId',
  'sourceSettings',
  'sourcePriority',
  'databaseIcons',
  'autoBackupEnabled',
  'autoBackupReminderDays',
  'autoBackupRetention',
]);

export const SYNCED_PREFERENCE_KEYS: readonly (keyof Preferences)[] = (
  Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]
).filter((key) => !DEVICE_PREFERENCE_KEYS.has(key) && !SECRET_PREFERENCE_KEYS.has(key));

export function syncedPreferences(state: Preferences): Record<string, unknown> {
  return Object.fromEntries(SYNCED_PREFERENCE_KEYS.map((key) => [key, state[key]]));
}
