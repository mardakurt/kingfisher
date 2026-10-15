/**
 * Preferences as one record that cloud sync can carry.
 *
 * A value from another device is applied key by key, and only where its type
 * matches the default's: a newer build's unknown key is ignored, and a value
 * of the wrong shape never reaches the store a component reads from.
 */

import type { LocalSource } from '@/sync/cloud/local-sources';
import { PREFERENCES_KEY, PREFERENCES_STORE } from '@/sync/cloud/scope';
import { canonicalJson } from '@/sync/cloud/canonical';

import { DEFAULT_PREFERENCES, usePreferences, type Preferences } from './preferences-store';
import { SYNCED_PREFERENCE_KEYS, syncedPreferences } from './synced-preferences';

const shapeOf = (value: unknown): string =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

/** The subset of `incoming` safe to apply, keyed by synced preference. */
export function acceptablePreferences(incoming: unknown): Partial<Preferences> {
  if (typeof incoming !== 'object' || incoming === null || Array.isArray(incoming)) return {};
  const source = incoming as Record<string, unknown>;
  const accepted: Record<string, unknown> = {};
  for (const key of SYNCED_PREFERENCE_KEYS) {
    if (!(key in source)) continue;
    const fallback = DEFAULT_PREFERENCES[key];
    const value = source[key];
    // `null` is a legitimate value for the nullable filters (no minimum rating).
    if (
      shapeOf(value) === shapeOf(fallback) ||
      (value === null && fallback === null) ||
      (fallback === null && typeof value === 'number')
    ) {
      accepted[key] = value;
    }
  }
  return accepted as Partial<Preferences>;
}

/**
 * Keys another (newer) build synced that this one does not apply, kept so the
 * record this device reports matches the one it received. Without this, two
 * builds would take turns removing and restoring each other's keys forever.
 */
let foreign: Record<string, unknown> = {};

function current(): Record<string, unknown> {
  return { ...foreign, ...syncedPreferences(usePreferences.getState()) };
}

const DEFAULTS_JSON = canonicalJson(syncedPreferences(DEFAULT_PREFERENCES));

export function preferencesSource(): LocalSource {
  return {
    store: PREFERENCES_STORE,
    singleton: true,
    isPristine: (value) => canonicalJson(value) === DEFAULTS_JSON,
    async list() {
      return [{ key: PREFERENCES_KEY, value: current() }];
    },
    async get(key) {
      return key === PREFERENCES_KEY ? current() : null;
    },
    async put(key, value) {
      if (key !== PREFERENCES_KEY) return [];
      const accepted = acceptablePreferences(value);
      const incoming = value as Record<string, unknown>;
      foreign = Object.fromEntries(
        Object.entries(incoming).filter(([name]) => !(name in accepted)),
      );
      usePreferences.setState(accepted);
      return [];
    },
    async delete() {
      // Preferences are never deleted, only changed.
    },
    isValid: (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
  };
}
