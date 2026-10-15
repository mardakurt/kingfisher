/**
 * What an account carries between devices, and what it deliberately does not.
 *
 * The starting point is `PORTABLE_STORES` — everything a person authored, the
 * list the backup already proves complete — so the two can never drift: a
 * store added to the backup is synced unless it is named below with a reason.
 * `scope.test.ts` refuses a portable store that is in neither list.
 *
 * Preferences travel too, through a virtual store the stores layer supplies
 * (`src/stores/synced-preferences.ts`), minus the ones that describe the
 * machine rather than the person.
 */

import { PORTABLE_STORES } from '@/persistence/backup';
import { STORE_NAMES, type StoreName } from '@/persistence/schema/migrations';

/** Portable stores that stay on the device that created them, each with the reason. */
export const DEVICE_ONLY_STORES: Readonly<Partial<Record<StoreName, string>>> = {
  [STORE_NAMES.analysisQueue]:
    'a queued engine job belongs to the machine that will run it; its results (engine evidence) do sync',
  [STORE_NAMES.deepAnalysisJobs]:
    'a running deep-analysis job is a process on this machine; another device would show it running forever',
};

export const SYNCED_STORES: readonly StoreName[] = PORTABLE_STORES.filter(
  (store) => !(store in DEVICE_ONLY_STORES),
);

/** The virtual store that carries preferences, keyed by `PREFERENCES_KEY`. */
export const PREFERENCES_STORE = 'preferences';
export const PREFERENCES_KEY = 'portable';

/**
 * A fingerprint of the synced set. When a new build syncs a store an older
 * one did not, the cursor that build left behind skipped that store's rows;
 * a changed fingerprint makes the engine reconcile against the full manifest.
 */
export const scopeFingerprint = (stores: readonly string[]): string => [...stores].sort().join('|');
