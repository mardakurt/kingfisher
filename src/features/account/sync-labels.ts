/**
 * Human words for sync state and for the stores an account carries.
 */

import { STORE_NAMES, type StoreName } from '@/persistence/schema/migrations';
import { PREFERENCES_STORE } from '@/sync/cloud/scope';
import type { AccountState } from '@/stores/account-store';

const STORE_LABELS: Partial<Record<StoreName | typeof PREFERENCES_STORE, [string, string]>> = {
  [STORE_NAMES.studies]: ['study', 'studies'],
  [STORE_NAMES.chapters]: ['chapter', 'chapters'],
  [STORE_NAMES.drafts]: ['unsaved analysis', 'unsaved analyses'],
  [STORE_NAMES.repertoires]: ['repertoire', 'repertoires'],
  [STORE_NAMES.repertoirePositions]: ['repertoire position', 'repertoire positions'],
  [STORE_NAMES.trainingItems]: ['training card', 'training cards'],
  [STORE_NAMES.trainingReviews]: ['training review', 'training reviews'],
  [STORE_NAMES.trainingSets]: ['training set', 'training sets'],
  [STORE_NAMES.preparationSessions]: ['preparation', 'preparations'],
  [STORE_NAMES.openingFiles]: ['opening file', 'opening files'],
  [STORE_NAMES.endgamePositions]: ['endgame position', 'endgame positions'],
  [STORE_NAMES.pinnedLines]: ['pinned line', 'pinned lines'],
  [STORE_NAMES.journal]: ['journal entry', 'journal entries'],
  [STORE_NAMES.decisions]: ['decision', 'decisions'],
  [STORE_NAMES.reviewItems]: ['review item', 'review items'],
  [STORE_NAMES.savedQueries]: ['saved search', 'saved searches'],
  [STORE_NAMES.puzzleAttempts]: ['puzzle attempt', 'puzzle attempts'],
  [STORE_NAMES.analysisHistory]: ['analysed position', 'analysed positions'],
  [STORE_NAMES.engineEvidence]: ['stored engine result', 'stored engine results'],
  [PREFERENCES_STORE]: ['settings', 'settings'],
};

export function describeStore(store: string, count: number): string {
  const label = STORE_LABELS[store as StoreName];
  if (!label) return `${count} other ${count === 1 ? 'record' : 'records'}`;
  if (store === PREFERENCES_STORE) return 'your settings';
  return `${count.toLocaleString()} ${count === 1 ? label[0] : label[1]}`;
}

export function describeSummary(byStore: Readonly<Record<string, number>>): string[] {
  const named: string[] = [];
  let other = 0;
  for (const [store, count] of Object.entries(byStore).sort((a, b) => b[1] - a[1])) {
    if (STORE_LABELS[store as StoreName]) named.push(describeStore(store, count));
    else other += count;
  }
  if (other > 0)
    named.push(`${other.toLocaleString()} other ${other === 1 ? 'record' : 'records'}`);
  return named;
}

export function relativeTime(at: number | null, now = Date.now()): string {
  if (at === null) return 'not yet';
  const seconds = Math.round((now - at) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(at).toLocaleDateString();
}

export type SyncTone = 'neutral' | 'positive' | 'busy' | 'caution' | 'negative';

export function syncHeadline(
  state: Pick<AccountState, 'status' | 'phase' | 'lastSyncedAt' | 'conflicts'>,
): {
  readonly text: string;
  readonly tone: SyncTone;
} {
  if (state.status !== 'signed-in') return { text: 'Saved on this device', tone: 'neutral' };
  if (state.phase === 'syncing') return { text: 'Syncing…', tone: 'busy' };
  if (state.phase === 'awaiting-import')
    return { text: 'Waiting for your decision', tone: 'caution' };
  if (state.phase === 'offline')
    return { text: 'Offline — changes are kept and will upload', tone: 'caution' };
  if (state.phase === 'error') return { text: 'Sync stopped', tone: 'negative' };
  if (state.conflicts.length > 0) {
    return { text: `Synced · ${state.conflicts.length} to review`, tone: 'caution' };
  }
  return {
    text: state.lastSyncedAt ? 'Synced' : 'Connecting…',
    tone: state.lastSyncedAt ? 'positive' : 'busy',
  };
}
