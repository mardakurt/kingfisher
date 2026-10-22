'use client';

/**
 * The account: who is signed in, and how their work's sync is going.
 *
 * This is the one place Supabase Auth, the sync engine and the rest of the
 * application meet. It owns the engine's lifetime — built on sign-in, dropped
 * on sign-out — and the triggers that run it: a local write (debounced), a
 * wake-up from another device over Realtime, the window regaining focus or
 * the network, and a slow timer. Every trigger asks for the same thing, a
 * sync, and the engine serialises them; none of them carries data.
 *
 * Signed out, nothing here runs and Kingfisher is exactly the local-first
 * application it always was.
 */

import type { RealtimeChannel, Session, SupabaseClient, User } from '@supabase/supabase-js';
import { create } from 'zustand';

import { announceChapterReplaced } from '@/persistence/cross-tab';
import type { ChapterId } from '@/persistence/types';
import { subscribeLocalWrites } from '@/persistence/change-feed';
import { getSyncDatabase } from '@/persistence/repositories';
import { STORE_NAMES } from '@/persistence/schema/migrations';
import {
  IndexedDbSyncStateStore,
  type ImportDecision,
  type SyncConflictRecord,
} from '@/persistence/sync-state';
import { collectionGamesSource, collectionsSource } from '@/sync/cloud/collections-source';
import { databaseSource } from '@/sync/cloud/local-sources';
import { SYNCED_STORES } from '@/sync/cloud/scope';
import { cloudConfigProblem, getCloudClient } from '@/sync/cloud/supabase-client';
import { CloudRequestError, SupabaseRemote } from '@/sync/cloud/supabase-remote';
import { CloudSyncEngine, type ImportSummary } from '@/sync/cloud/sync-engine';

import { usePreferences } from './preferences-store';
import { preferencesSource } from './synced-preferences-source';
import { gamesSource } from '@/sync/cloud/games-source';
import { SYNCED_PREFERENCE_KEYS } from './synced-preferences';

export type AccountStatus = 'unconfigured' | 'loading' | 'signed-out' | 'signed-in';

export type SyncPhase =
  /** Nothing to report: up to date, or not signed in. */
  | 'idle'
  | 'syncing'
  /** The first-sign-in question is waiting for an answer. */
  | 'awaiting-import'
  /** The last attempt failed for a reason that retrying can fix. */
  | 'offline'
  | 'error';

export interface AccountUser {
  readonly id: string;
  readonly email: string | null;
  /** The first way this account signed in; `providers` lists every linked one. */
  readonly provider: string;
  readonly providers: readonly string[];
  readonly emailConfirmed: boolean;
  readonly displayName: string | null;
}

export interface AccountState {
  readonly status: AccountStatus;
  readonly user: AccountUser | null;
  readonly phase: SyncPhase;
  readonly lastSyncedAt: number | null;
  readonly lastError: string | null;
  readonly pendingImport: ImportSummary | null;
  readonly conflicts: readonly SyncConflictRecord[];
  /** Whether the session came back from a password-recovery link. */
  readonly recovering: boolean;
}

export interface AccountActions {
  init(): void;
  syncNow(options?: { reconcile?: boolean }): Promise<void>;
  decideImport(decision: ImportDecision): Promise<void>;
  restoreConflict(id: string): Promise<void>;
  dismissConflict(id: string): Promise<void>;
  signOut(options: { removeSyncedCopies: boolean }): Promise<{ removed: number; kept: number }>;
  deleteAccount(): Promise<void>;
}

const DEVICE_KEY = 'kingfisher.device-id';
const LOCAL_DEBOUNCE_MS = 2_000;
const REMOTE_DEBOUNCE_MS = 400;
const POLL_MS = 60_000;
const RECONCILE_MS = 15 * 60_000;
const RETRY_MS = [5_000, 15_000, 60_000, 180_000];

/**
 * Query prefixes whose data does not live in IndexedDB — remote sources, the
 * companion, engines. Everything else is invalidated when another device's
 * records land, so open lists redraw from storage.
 */
const REMOTE_QUERY_PREFIXES = [
  'explorer',
  'explorer-move-players',
  'companion',
  'companion-file-imports',
  'tablebase',
  'tablebase-status',
  'provider-health',
  'engine-catalogue',
  'player-photo',
  'titled-roster-index',
  'titled-roster-entry',
  'reference-player-games',
  'pack-history',
  'opening-book',
  'opening-books',
  'setup-reference',
  'player-catalog',
  'opening-catalog',
  'storage-usage',
];

export function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const created = `${navigatorPlatform()}-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    return 'unknown-device';
  }
}

function navigatorPlatform(): string {
  if (typeof navigator === 'undefined') return 'web';
  const agent = navigator.userAgent;
  if (/Electron/i.test(agent)) return 'mac-app';
  if (/iPhone|iPad/i.test(agent)) return 'ios';
  if (/Android/i.test(agent)) return 'android';
  if (/Macintosh/i.test(agent)) return 'mac';
  if (/Windows/i.test(agent)) return 'windows';
  return 'web';
}

/**
 * Every sign-in method linked to the account. Supabase links a Google sign-in
 * to an existing email account with the same verified address, and
 * `app_metadata.provider` keeps only the first, so a person who added Google
 * was shown "Email and password" alone.
 */
function providersOf(user: User): string[] {
  const listed = user.app_metadata.providers;
  const fromMetadata = Array.isArray(listed)
    ? listed.filter((p): p is string => typeof p === 'string')
    : [];
  const fromIdentities = (user.identities ?? []).map((identity) => identity.provider);
  const all = [...new Set([...fromMetadata, ...fromIdentities])];
  return all.length > 0 ? all : [(user.app_metadata.provider as string | undefined) ?? 'email'];
}

function toAccountUser(user: User): AccountUser {
  const metadata = user.user_metadata as Record<string, unknown>;
  const name = metadata.full_name ?? metadata.name;
  return {
    id: user.id,
    email: user.email ?? null,
    provider: (user.app_metadata.provider as string | undefined) ?? 'email',
    providers: providersOf(user),
    emailConfirmed: Boolean(user.email_confirmed_at ?? user.confirmed_at),
    displayName: typeof name === 'string' && name.trim() ? name.trim() : null,
  };
}

/** The engine and everything that triggers it, for one signed-in account. */
interface Session_ {
  readonly userId: string;
  readonly engine: CloudSyncEngine;
  readonly dispose: () => void;
}

let session: Session_ | null = null;
let starting: Promise<void> | null = null;
let retryAttempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let initialised = false;

const INITIAL: AccountState = {
  status: 'loading',
  user: null,
  phase: 'idle',
  lastSyncedAt: null,
  lastError: null,
  pendingImport: null,
  conflicts: [],
  recovering: false,
};

export const useAccount = create<AccountState & AccountActions>()((set, get) => {
  async function refreshConflicts() {
    if (!session) return;
    set({ conflicts: await session.engine.conflicts() });
  }

  function scheduleRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    const delay = RETRY_MS[Math.min(retryAttempt, RETRY_MS.length - 1)]!;
    retryAttempt += 1;
    retryTimer = setTimeout(() => void get().syncNow(), delay);
  }

  async function run(options: { reconcile?: boolean } = {}) {
    const current = session;
    if (!current) return;
    set({ phase: 'syncing' });
    try {
      const result = await current.engine.sync(options);
      if (session !== current) return;
      if (result.status === 'awaiting-import') {
        set({ phase: 'awaiting-import', pendingImport: result.summary, lastError: null });
        return;
      }
      retryAttempt = 0;
      set({ phase: 'idle', lastSyncedAt: Date.now(), lastError: null, pendingImport: null });
      if (result.conflicts > 0) await refreshConflicts();
    } catch (error) {
      if (session !== current) return;
      const transient =
        !(error instanceof CloudRequestError) ||
        error.transient ||
        (typeof navigator !== 'undefined' && !navigator.onLine);
      set({
        phase: transient ? 'offline' : 'error',
        lastError: error instanceof Error ? error.message : 'Sync failed.',
      });
      if (transient) scheduleRetry();
    }
  }

  async function start(client: SupabaseClient, userId: string) {
    if (session?.userId === userId) return;
    stop();
    const [database, state] = await Promise.all([
      getSyncDatabase(),
      IndexedDbSyncStateStore.open(),
    ]);
    const engine = new CloudSyncEngine({
      userId,
      deviceId: deviceId(),
      remote: new SupabaseRemote(client),
      state,
      sources: [
        ...SYNCED_STORES.map((store) => databaseSource(database, store)),
        preferencesSource(),
        // My games and the collections kept beside it travel together, on
        // the same switch. A collection's writes are not on the change feed,
        // so they are picked up by the minute's poll rather than at once.
        ...(usePreferences.getState().syncMyGames
          ? [gamesSource(database), collectionsSource(), collectionGamesSource()]
          : []),
      ],
      onApplied: (changes) => announceApplied(changes),
    });

    const disposers: (() => void)[] = [];
    let localTimer: ReturnType<typeof setTimeout> | null = null;
    const soon = (delay: number) => {
      if (localTimer) clearTimeout(localTimer);
      localTimer = setTimeout(() => void run(), delay);
    };
    disposers.push(() => localTimer && clearTimeout(localTimer));

    const synced = new Set<string>(SYNCED_STORES);
    disposers.push(
      subscribeLocalWrites((stores) => {
        if (stores.some((store) => synced.has(store))) soon(LOCAL_DEBOUNCE_MS);
      }),
    );
    disposers.push(
      usePreferences.subscribe((next, previous) => {
        if (SYNCED_PREFERENCE_KEYS.some((key) => next[key] !== previous[key]))
          soon(LOCAL_DEBOUNCE_MS);
        // The game source is in the engine or not: switching it restarts sync
        // with the new set of sources.
        if (next.syncMyGames !== previous.syncMyGames) {
          stop();
          void start(client, userId);
        }
      }),
    );

    const onVisible = () => {
      if (document.visibilityState === 'visible') soon(REMOTE_DEBOUNCE_MS);
    };
    const onOnline = () => soon(REMOTE_DEBOUNCE_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    disposers.push(() => document.removeEventListener('visibilitychange', onVisible));
    disposers.push(() => window.removeEventListener('online', onOnline));

    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void run();
    }, POLL_MS);
    const reconcile = setInterval(() => void run({ reconcile: true }), RECONCILE_MS);
    disposers.push(
      () => clearInterval(poll),
      () => clearInterval(reconcile),
    );

    // Realtime is a doorbell. Its payload is never applied; a pull is.
    let channel: RealtimeChannel | null = null;
    try {
      channel = client
        .channel(`user-records-${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_records', filter: `user_id=eq.${userId}` },
          () => soon(REMOTE_DEBOUNCE_MS),
        )
        .subscribe();
    } catch {
      channel = null;
    }
    disposers.push(() => {
      if (channel) void client.removeChannel(channel);
    });

    session = {
      userId,
      engine,
      dispose: () => {
        for (const dispose of disposers) dispose();
      },
    };
    await refreshConflicts();
    await run();
  }

  function stop() {
    session?.dispose();
    session = null;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    retryAttempt = 0;
  }

  async function adopt(client: SupabaseClient, value: Session | null) {
    if (!value) {
      stop();
      set({ ...INITIAL, status: 'signed-out' });
      return;
    }
    set({ status: 'signed-in', user: toAccountUser(value.user) });
    if (session?.userId === value.user.id) return;
    starting = start(client, value.user.id).catch((error: unknown) => {
      set({
        phase: 'error',
        lastError: error instanceof Error ? error.message : 'Sync could not start.',
      });
    });
    await starting;
  }

  return {
    ...INITIAL,

    init() {
      if (initialised) return;
      initialised = true;
      if (cloudConfigProblem()) {
        set({ ...INITIAL, status: 'unconfigured' });
        return;
      }
      void getCloudClient().then((client) => {
        if (!client) {
          set({ ...INITIAL, status: 'unconfigured' });
          return;
        }
        void client.auth.getSession().then(({ data }) => adopt(client, data.session));
        client.auth.onAuthStateChange((event, value) => {
          if (event === 'PASSWORD_RECOVERY') set({ recovering: true });
          if (event === 'USER_UPDATED' && value) set({ user: toAccountUser(value.user) });
          // Defer: Supabase holds a lock during this callback, and the engine's
          // first request would wait on it.
          setTimeout(() => void adopt(client, value), 0);
        });
      });
    },

    async syncNow(options) {
      if (starting) await starting;
      await run(options);
    },

    async decideImport(decision) {
      if (!session) return;
      await session.engine.decideImport(decision);
      set({ pendingImport: null });
      await run();
    },

    async restoreConflict(id) {
      if (!session) return;
      await session.engine.restoreConflict(id);
      await refreshConflicts();
      announceApplied([]);
      await run();
    },

    async dismissConflict(id) {
      if (!session) return;
      await session.engine.dismissConflict(id);
      await refreshConflicts();
    },

    async signOut({ removeSyncedCopies }) {
      const client = await getCloudClient();
      let outcome = { removed: 0, kept: 0 };
      if (session) {
        // Upload what can be uploaded first, so "remove" removes as much as possible.
        await run().catch(() => undefined);
        if (removeSyncedCopies) {
          outcome = await session.engine.removeSyncedCopies();
          announceApplied([]);
        }
      }
      stop();
      await client?.auth.signOut({ scope: 'local' });
      set({ ...INITIAL, status: 'signed-out' });
      return outcome;
    },

    async deleteAccount() {
      const client = await getCloudClient();
      if (!client) return;
      const { error } = await client.rpc('delete_my_account');
      if (error) throw new Error(error.message);
      const userId = session?.userId;
      stop();
      if (userId) await (await IndexedDbSyncStateStore.open()).clearUser(userId);
      await client.auth.signOut({ scope: 'local' });
      set({ ...INITIAL, status: 'signed-out' });
    },
  };
});

/**
 * Tell the open screens that records changed underneath them.
 *
 * Lists re-read through TanStack Query; an open chapter is told the way a
 * write from another tab tells it, so the existing revision check — not a
 * second mechanism — decides whether the editor reloads or reports a
 * conflict.
 */
function announceApplied(changes: readonly { store: string; key: string }[]): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('kingfisher:cloud-applied', { detail: { changes } }));
  for (const change of changes) {
    if (change.store !== STORE_NAMES.chapters) continue;
    void getSyncDatabase()
      .then((database) => database.get<{ revision?: number }>(STORE_NAMES.chapters, change.key))
      .then((chapter) => {
        if (chapter && typeof chapter.revision === 'number')
          announceChapterReplaced(change.key as ChapterId, chapter.revision);
      })
      .catch(() => undefined);
  }
}

export function isRemoteQuery(queryKey: readonly unknown[]): boolean {
  return typeof queryKey[0] === 'string' && REMOTE_QUERY_PREFIXES.includes(queryKey[0]);
}
