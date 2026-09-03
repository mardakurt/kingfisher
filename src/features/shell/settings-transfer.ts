/**
 * Exporting and importing configuration, without exporting secrets.
 *
 * The whole value of this feature is the promise that it carries no
 * credentials, so the exclusion is expressed as an explicit deny-list of
 * preference keys and enforced in one function that a test can hold to it.
 *
 * A deny-list rather than an allow-list because the failure modes are not
 * symmetric. With an allow-list, a preference added next phase is silently
 * dropped from every export — annoying. With a deny-list, a *secret* added
 * next phase is silently exported — a leak. So the deny-list is paired with a
 * test that fails the moment a preference whose name looks like a credential
 * is not on it, which turns the dangerous direction into a build error.
 */

import { DEFAULT_PREFERENCES, type Preferences } from '@/stores/preferences-store';

/** Preference keys that must never leave the machine. */
export const SECRET_PREFERENCE_KEYS: readonly (keyof Preferences)[] = [
  'companionToken',
  'lichessToken',
  'assistantApiKey',
  /*
    Not a secret itself, but it is the address of a service on the user's own
    network, and an exported file is a thing people paste into issue trackers.
  */
  'companionUrl',
  'assistantBaseUrl',
];

export const SETTINGS_EXPORT_KIND = 'kingfisher.settings';
export const SETTINGS_EXPORT_VERSION = 1;

export interface SettingsExport {
  readonly kind: typeof SETTINGS_EXPORT_KIND;
  readonly version: number;
  readonly exportedAt: number;
  readonly preferences: Partial<Preferences>;
  /** Opaque to this module: shape belongs to the layout store. */
  readonly layout: unknown;
  readonly shortcuts: Readonly<Record<string, string>>;
}

export function exportSettings(input: {
  readonly preferences: Preferences;
  readonly layout: unknown;
  readonly shortcuts: Readonly<Record<string, string>>;
  readonly now?: number;
}): SettingsExport {
  const preferences: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.preferences)) {
    if (typeof value === 'function') continue;
    if ((SECRET_PREFERENCE_KEYS as readonly string[]).includes(key)) continue;
    preferences[key] = value;
  }
  return {
    kind: SETTINGS_EXPORT_KIND,
    version: SETTINGS_EXPORT_VERSION,
    exportedAt: input.now ?? Date.now(),
    preferences: preferences as Partial<Preferences>,
    layout: input.layout,
    shortcuts: input.shortcuts,
  };
}

export type SettingsImportResult =
  | { readonly ok: true; readonly value: SettingsExport }
  | { readonly ok: false; readonly error: string };

/**
 * Parse an export, rejecting anything that is not one.
 *
 * §64's rule, applied here: malformed configuration must be rejected without
 * taking anything valid down with it. So preference keys the current build
 * does not know are dropped rather than treated as an error, and a preference
 * whose type is wrong is dropped rather than written — a file edited by hand,
 * or written by a much older build, should cost the user the settings it got
 * wrong and nothing else.
 */
export function parseSettingsExport(raw: unknown): SettingsImportResult {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, error: 'That file does not contain Kingfisher settings.' };
  }
  const value = raw as Record<string, unknown>;
  if (value.kind !== SETTINGS_EXPORT_KIND) {
    return { ok: false, error: 'That file is not a Kingfisher settings export.' };
  }
  if (typeof value.version !== 'number' || value.version > SETTINGS_EXPORT_VERSION) {
    return {
      ok: false,
      error: 'That export was written by a newer version of Kingfisher.',
    };
  }

  const preferences: Record<string, unknown> = {};
  const incoming = (value.preferences ?? {}) as Record<string, unknown>;
  for (const [key, entry] of Object.entries(incoming)) {
    if (!(key in DEFAULT_PREFERENCES)) continue;
    if ((SECRET_PREFERENCE_KEYS as readonly string[]).includes(key)) continue;
    const expected = DEFAULT_PREFERENCES[key as keyof Preferences];
    // Objects (the engine limit) are compared loosely; scalars must match type.
    if (typeof expected === 'object' && expected !== null) {
      if (typeof entry === 'object' && entry !== null) preferences[key] = entry;
      continue;
    }
    if (typeof entry === typeof expected) preferences[key] = entry;
  }

  const shortcuts: Record<string, string> = {};
  const incomingShortcuts = (value.shortcuts ?? {}) as Record<string, unknown>;
  for (const [action, binding] of Object.entries(incomingShortcuts)) {
    if (typeof binding === 'string' && binding.length > 0 && binding.length <= 24) {
      shortcuts[action] = binding;
    }
  }

  return {
    ok: true,
    value: {
      kind: SETTINGS_EXPORT_KIND,
      version: value.version,
      exportedAt: typeof value.exportedAt === 'number' ? value.exportedAt : 0,
      preferences: preferences as Partial<Preferences>,
      layout: value.layout ?? null,
      shortcuts,
    },
  };
}
