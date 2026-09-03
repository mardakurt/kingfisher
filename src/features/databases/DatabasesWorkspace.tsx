'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Check, Database, Import, Settings, Warning } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { ChessDatabaseProvider, ProviderHealth, ProviderHealthState } from '@/database/types';
import { useDatabaseProviders } from '@/database/use-database-providers';
import { useCompanionStatus } from '@/companion/useCompanion';
import { NavButton } from '@/features/shell/NavButton';
import { cn } from '@/lib/cn';
import { useUi } from '@/stores/ui-store';
import { getRepositories } from '@/persistence/repositories';
import { backfillStructures, type BackfillProgress } from '@/persistence/structure-backfill';
import { STORE_NAMES } from '@/persistence/schema/migrations';
import { companionClient } from '@/companion/session';
import type { CompanionAggregateIntegrity, CompanionDatabaseEntry } from '@/companion/client';
import type { GameSearchResult } from '@/persistence/types';
import {
  LocalClassificationTarget,
  SqliteClassificationTarget,
} from '@/theory/classification-targets';

import { ClassificationSection } from './ClassificationSection';

const LABELS: Record<ProviderHealthState, string> = {
  ready: 'Ready',
  loading: 'Checking',
  'authentication-required': 'Authentication required',
  'companion-offline': 'Companion offline',
  misconfigured: 'Needs configuration',
  'rate-limited': 'Rate limited',
  'network-error': 'Network error',
  unsupported: 'Unsupported',
  error: 'Error',
};

export function DatabasesWorkspace() {
  const providers = useDatabaseProviders();
  const [selectedId, setSelectedId] = useState(providers[0]?.id ?? '');
  const selected = providers.find((provider) => provider.id === selectedId) ?? providers[0];
  const setImportOpen = useUi((state) => state.setImportOpen);
  const setSettingsOpen = useUi((state) => state.setSettingsOpen);
  const companion = useCompanionStatus();
  const selectedSqlite = companion.data?.databases.find(
    (database) => selected?.id === `sqlite:${database.key}`,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-line-subtle bg-surface-1 px-3 md:px-5">
        <NavButton />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-primary">Databases &amp; data sources</h1>
          <p className="hidden text-xs text-tertiary sm:block">
            Collections, provider capabilities, and connection health.
          </p>
        </div>
        <Button
          variant="subtle"
          icon={<Import />}
          className="ml-auto"
          onClick={() => setImportOpen(true)}
        >
          Import PGN
        </Button>
        <Button icon={<Settings />} onClick={() => setSettingsOpen(true)}>
          Connections
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[300px_minmax(0,1fr)_320px] lg:overflow-hidden">
        <section className="border-b border-line-subtle bg-surface-1 lg:border-r lg:border-b-0">
          <div className="border-b border-line-subtle px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-tertiary">
              Sources
            </h2>
          </div>
          <ul className="p-2">
            {providers.map((provider) => (
              <ProviderButton
                key={provider.id}
                provider={provider}
                selected={provider.id === selected?.id}
                onSelect={() => setSelectedId(provider.id)}
              />
            ))}
          </ul>
        </section>

        <main className="min-h-[460px] min-w-0 lg:min-h-0">
          {selected ? (
            <ProviderDetails
              provider={selected}
              sqlite={selectedSqlite}
              onCollectionChanged={() => void companion.refetch()}
              onConfigure={() => setSettingsOpen(true)}
            />
          ) : (
            <p className="p-6 text-sm text-tertiary">No database providers are registered.</p>
          )}
        </main>

        <aside className="border-t border-line-subtle bg-surface-1 lg:border-t-0 lg:border-l">
          <div className="border-b border-line-subtle px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-tertiary">
              Provider health
            </h2>
          </div>
          <div className="divide-y divide-line-subtle">
            {providers.map((provider) => (
              <ProviderHealthSummary key={provider.id} provider={provider} />
            ))}
            <div className="px-4 py-3">
              <div className="flex items-center gap-2">
                <StatusDot
                  state={
                    companion.isError ? 'companion-offline' : companion.data ? 'ready' : 'loading'
                  }
                />
                <span className="text-sm text-primary">Local companion</span>
              </div>
              <p className="mt-1 pl-4 text-xs text-tertiary">
                {companion.isError
                  ? companion.error.message
                  : companion.data
                    ? `${companion.data.engines.length} engines · ${companion.data.databases.length} SQLite collections`
                    : 'Not paired or checking.'}
              </p>
            </div>
            <StorageSummary sqlite={companion.data?.databases ?? []} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function StorageSummary({
  sqlite,
}: {
  readonly sqlite: readonly {
    readonly name: string;
    readonly bytes: number | null;
    readonly games: number | null;
  }[];
}) {
  const storage = useQuery({
    queryKey: ['storage-usage'],
    staleTime: 15_000,
    retry: false,
    queryFn: async () => {
      const repositories = await getRepositories();
      const [estimate, games, studies, training] = await Promise.all([
        navigator.storage?.estimate?.() ?? Promise.resolve({ usage: undefined, quota: undefined }),
        repositories.raw.count(STORE_NAMES.games),
        repositories.raw.count(STORE_NAMES.studies),
        repositories.raw.count(STORE_NAMES.trainingItems),
      ]);
      return { estimate, games, studies, training };
    },
  });
  const usage = storage.data?.estimate.usage;
  const quota = storage.data?.estimate.quota;
  const ratio = usage != null && quota ? usage / quota : null;
  /*
    Four distinct answers, not one blank. Still reading is not the same as the
    browser refusing to estimate, and neither is the same as a failed read —
    collapsing them would have this panel say "Unavailable" about a number it
    is in the middle of fetching.
  */
  const estimate = storage.isPending
    ? 'Reading…'
    : storage.isError
      ? 'Could not be read'
      : usage == null
        ? 'Not reported by this browser'
        : `${formatBytes(usage)}${quota ? ` of ${formatBytes(quota)}` : ''}`;
  return (
    <section className="px-4 py-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">Storage</h3>
      <p className="mt-2 text-xs text-primary">Estimated browser storage: {estimate}</p>
      {ratio !== null ? (
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-inset"
          aria-label={`${Math.round(ratio * 100)} percent of estimated browser quota used`}
        >
          <div
            className={cn('h-full', ratio > 0.85 ? 'bg-caution' : 'bg-accent')}
            style={{ width: `${Math.min(100, ratio * 100)}%` }}
          />
        </div>
      ) : null}
      <p className="mt-2 text-2xs text-tertiary tabular">
        {storage.data
          ? `${storage.data.games.toLocaleString()} games · ${storage.data.studies} studies · ${storage.data.training} training items`
          : storage.isError
            ? 'Stored counts could not be read from this browser.'
            : 'Reading browser storage…'}
      </p>
      {sqlite.map((database) => (
        <p
          key={database.name}
          className="mt-1 truncate text-2xs text-tertiary"
          title={database.name}
        >
          {database.name}:{' '}
          {database.bytes == null ? 'size unavailable' : formatBytes(database.bytes)} ·{' '}
          {database.games?.toLocaleString() ?? 'unknown'} games
        </p>
      ))}
      <p className="mt-2 text-[10px] leading-relaxed text-tertiary">
        Browser figures are estimates. Kingfisher never deletes data automatically when quota is
        low.
      </p>
    </section>
  );
}

function formatBytes(value: number): string {
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)} kB`;
  if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(1)} MB`;
  return `${(value / 1_000_000_000).toFixed(2)} GB`;
}

function useProviderHealth(provider: ChessDatabaseProvider) {
  return useQuery<ProviderHealth>({
    queryKey: ['provider-health', provider.id],
    queryFn: async ({ signal }) =>
      provider.health
        ? provider.health(signal)
        : {
            state: 'unsupported',
            checkedAt: Date.now(),
            message: 'This provider does not expose a connection test.',
          },
    staleTime: 30_000,
    retry: false,
  });
}

function ProviderButton({
  provider,
  selected,
  onSelect,
}: {
  provider: ChessDatabaseProvider;
  selected: boolean;
  onSelect: () => void;
}) {
  const health = useProviderHealth(provider);
  const state = health.isPending ? 'loading' : (health.data?.state ?? 'error');
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected}
        className={cn(
          'mb-1 flex w-full items-start gap-3 rounded-[4px] border px-3 py-3 text-left transition-colors',
          selected
            ? 'border-accent/70 bg-accent-muted'
            : 'border-transparent hover:border-line hover:bg-surface-2',
        )}
      >
        <StatusDot state={state} className="mt-1" />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-primary">{provider.name}</span>
          <span className="mt-0.5 block text-xs text-tertiary">{LABELS[state]}</span>
        </span>
      </button>
    </li>
  );
}

function ProviderDetails({
  provider,
  sqlite,
  onCollectionChanged,
  onConfigure,
}: {
  provider: ChessDatabaseProvider;
  sqlite?: CompanionDatabaseEntry;
  onCollectionChanged: () => void;
  onConfigure: () => void;
}) {
  const health = useProviderHealth(provider);
  const result = health.data;
  const state = health.isFetching ? 'loading' : (result?.state ?? 'error');
  const capabilities = useMemo(
    () =>
      [
        provider.capabilities.offline ? 'Offline' : 'Network',
        provider.capabilities.ratingFilter ? 'Rating filter' : null,
        provider.capabilities.dateFilter ? 'Date filter' : null,
        provider.capabilities.playerFilter ? 'Player filter' : null,
        provider.capabilities.topGames ? 'Game references' : null,
      ].filter(Boolean),
    [provider],
  );

  return (
    <div className="mx-auto max-w-4xl p-5 md:p-8">
      <div className="flex flex-wrap items-start gap-4 border-b border-line-subtle pb-6">
        <Database className="h-11 w-11 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-primary">{provider.name}</h2>
            <HealthBadge state={state} />
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-secondary">
            {provider.description}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-4 border-b border-line-subtle py-5 text-sm md:grid-cols-4">
        <DataPoint label="Status" value={LABELS[state]} />
        <DataPoint
          label="Games"
          value={result?.count == null ? '—' : result.count.toLocaleString()}
        />
        <DataPoint
          label="Last test"
          value={result ? new Date(result.checkedAt).toLocaleTimeString() : '—'}
        />
        <DataPoint
          label="Latency"
          value={result?.latencyMs == null ? '—' : `${result.latencyMs} ms`}
        />
      </dl>

      <section className="border-b border-line-subtle py-5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-tertiary">
          Capabilities
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {capabilities.map((capability) => (
            <span
              key={capability}
              className="rounded-[3px] border border-line bg-surface-2 px-2 py-1 text-xs text-secondary"
            >
              {capability}
            </span>
          ))}
        </div>
      </section>

      {sqlite ? (
        <SqliteCollectionManagement database={sqlite} onChanged={onCollectionChanged} />
      ) : null}

      {provider.id === 'local-collection' ? (
        <ClassificationSection
          cacheKey="local-collection"
          collectionName={provider.name}
          invalidate={[['games'], ['game-count']]}
          target={async () => {
            const repositories = await getRepositories();
            return new LocalClassificationTarget(repositories.raw);
          }}
        />
      ) : null}
      {sqlite ? (
        <ClassificationSection
          cacheKey={`sqlite:${sqlite.key}`}
          collectionName={sqlite.name}
          invalidate={[['sqlite-management', sqlite.key]]}
          target={async () => {
            const client = companionClient();
            if (!client) throw new Error('The companion is not connected.');
            return new SqliteClassificationTarget(client, sqlite.key);
          }}
        />
      ) : null}

      <section className="py-5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-tertiary">
          Connection test
        </h3>
        <div className="mt-3 rounded-[4px] border border-line bg-surface-1 p-4">
          <div className="flex items-start gap-3">
            {state === 'ready' ? (
              <Check className="h-5 w-5 text-positive" />
            ) : (
              <Warning className="h-5 w-5 text-caution" />
            )}
            <div className="min-w-0">
              <p className="text-sm text-primary">{result?.message ?? 'Checking the provider…'}</p>
              {result?.remedy ? (
                <p className="mt-1 text-xs text-tertiary">{result.remedy}</p>
              ) : null}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="accent"
              onClick={() => void health.refetch()}
              disabled={health.isFetching}
            >
              {health.isFetching ? 'Testing…' : 'Test connection'}
            </Button>
            {state !== 'ready' ? <Button onClick={onConfigure}>Configure source</Button> : null}
          </div>
        </div>
      </section>
    </div>
  );
}

type DeleteScope = 'selected' | 'matching' | 'clear' | 'collection';

function SqliteCollectionManagement({
  database,
  onChanged,
}: {
  readonly database: CompanionDatabaseEntry;
  readonly onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const notify = useUi((state) => state.notify);
  const [player, setPlayer] = useState('');
  const [fromYear, setFromYear] = useState('');
  const [minRating, setMinRating] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirm, setConfirm] = useState<DeleteScope | null>(null);
  const [busy, setBusy] = useState(false);
  const filter = useMemo(
    () => ({
      ...(player.trim() ? { player: player.trim().toLocaleLowerCase('en-US') } : {}),
      ...(Number(fromYear) ? { fromYear: Number(fromYear) } : {}),
      ...(Number(minRating) ? { minRating: Number(minRating) } : {}),
    }),
    [fromYear, minRating, player],
  );
  const hasFilter = Object.keys(filter).length > 0;
  const games = useQuery<GameSearchResult>({
    queryKey: ['sqlite-management', database.key, filter],
    queryFn: async () => {
      const client = companionClient();
      if (!client) throw new Error('The companion is not connected.');
      return client.searchGames(database.key, {
        ...filter,
        limit: 100,
        exactTotal: true,
        sortBy: 'date',
        sortDirection: 'desc',
      });
    },
    retry: false,
  });
  const [backfill, setBackfill] = useState<BackfillProgress | null>(null);
  const backfillAbort = useRef<AbortController | null>(null);
  const integrity = useQuery<CompanionAggregateIntegrity>({
    queryKey: ['sqlite-integrity', database.key],
    queryFn: async () => {
      const client = companionClient();
      if (!client) throw new Error('The companion is not connected.');
      return client.databaseIntegrity(database.key);
    },
    enabled: false,
    retry: false,
  });

  /**
   * Backfill structural identities for a collection imported before Phase 8.
   *
   * Runs in the page rather than a worker: the loop is almost entirely waiting
   * on the companion, and it yields between pages, so the board keeps
   * responding. Cancelling keeps every page already committed, which is what
   * makes it safe to start on a hundred thousand games and change your mind.
   */
  const runBackfill = async () => {
    const client = companionClient();
    if (!client) return;
    const controller = new AbortController();
    setBackfill({ stage: 'scanning', processed: 0, remaining: 0, unreadable: 0 });
    backfillAbort.current = controller;
    try {
      const result = await backfillStructures(client, database.key, {
        signal: controller.signal,
        onProgress: setBackfill,
      });
      notify({
        tone: result.stage === 'cancelled' ? 'info' : 'success',
        message:
          result.stage === 'cancelled'
            ? `Structure indexing stopped. ${result.processed.toLocaleString()} positions were indexed and kept.`
            : `Indexed ${result.processed.toLocaleString()} positions.`,
        ...(result.unreadable > 0
          ? { detail: `${result.unreadable} positions could not be read and were left alone.` }
          : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ['sqlite-integrity', database.key] });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Structure indexing failed.',
      });
    } finally {
      backfillAbort.current = null;
      setBackfill(null);
    }
  };

  const execute = async () => {
    if (!confirm) return;
    const client = companionClient();
    if (!client) return;
    setBusy(true);
    try {
      if (confirm === 'collection') {
        await client.deleteDatabase(database.key);
        notify({ tone: 'success', message: `SQLite collection “${database.name}” deleted.` });
      } else {
        const result =
          confirm === 'selected'
            ? await client.deleteGames(database.key, { fingerprints: [...selected] })
            : confirm === 'matching'
              ? await client.deleteGames(database.key, { query: filter })
              : await client.clearDatabase(database.key);
        notify({
          tone: 'success',
          message: `${result.deleted.toLocaleString()} SQLite game${result.deleted === 1 ? '' : 's'} deleted.`,
          detail: result.integrity.consistent
            ? 'Explorer aggregates passed the post-delete integrity check.'
            : 'The integrity check needs attention; use Rebuild aggregates.',
        });
      }
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ['sqlite-management', database.key] });
      await queryClient.invalidateQueries({ queryKey: ['sqlite-integrity', database.key] });
      onChanged();
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The SQLite deletion failed.',
      });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const descriptions: Record<DeleteScope, string> = {
    selected: `${selected.size.toLocaleString()} selected games will be removed in one transaction.`,
    matching: `${(games.data?.total ?? 0).toLocaleString()} games matching the visible filter will be removed in one transaction.`,
    clear: `All ${(database.games ?? 0).toLocaleString()} games will be removed, but the collection file will remain.`,
    collection: `The collection file “${database.file}” and every game in it will be permanently removed.`,
  };

  return (
    <section className="border-b border-line-subtle py-5">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-tertiary">
            Collection management
          </h3>
          <p className="mt-1 text-xs text-tertiary">
            Copy {database.file} before a large deletion if you want a recoverable backup.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {backfill ? (
            <Button onClick={() => backfillAbort.current?.abort()}>Stop indexing</Button>
          ) : (
            <Button onClick={() => void runBackfill()}>Index structures</Button>
          )}
          <Button onClick={() => void integrity.refetch()}>
            {integrity.isFetching ? 'Checking…' : 'Run integrity check'}
          </Button>
        </div>
      </div>
      {backfill ? (
        <p className="mt-2 text-xs text-secondary tabular" role="status">
          {backfill.stage === 'scanning' ? 'Scanning for unindexed positions…' : 'Indexing…'}{' '}
          {backfill.processed.toLocaleString()} done · {backfill.remaining.toLocaleString()} to go
          {backfill.unreadable > 0 ? ` · ${backfill.unreadable} unreadable` : ''}
        </p>
      ) : null}
      {integrity.data ? (
        <p className="mt-2 text-xs text-secondary" role="status">
          {integrity.data.consistent ? 'Integrity healthy' : 'Integrity mismatch'} ·{' '}
          {integrity.data.positions.toLocaleString()} positions · {integrity.data.filteredCacheKeys}{' '}
          exact filter caches
        </p>
      ) : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <ManagementField
          label="Player"
          value={player}
          onChange={setPlayer}
          placeholder="Exact name"
        />
        <ManagementField
          label="From year"
          value={fromYear}
          onChange={setFromYear}
          placeholder="2024"
        />
        <ManagementField
          label="Minimum Elo"
          value={minRating}
          onChange={setMinRating}
          placeholder="2500"
        />
      </div>
      <div className="mt-3 max-h-56 overflow-auto rounded-[4px] border border-line-subtle">
        {(games.data?.games ?? []).map((game) => (
          <label
            key={game.id}
            className="flex items-center gap-2 border-b border-line-subtle px-2 py-1.5 text-xs last:border-0"
          >
            <input
              type="checkbox"
              checked={selected.has(game.fingerprint)}
              onChange={(event) =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(game.fingerprint);
                  else next.delete(game.fingerprint);
                  return next;
                })
              }
            />
            <span className="min-w-0 flex-1 truncate text-secondary">
              {game.white} – {game.black}
            </span>
            <span className="text-tertiary tabular">{game.year ?? '—'}</span>
            <span className="text-primary">{game.result}</span>
          </label>
        ))}
        {games.isPending ? <p className="p-3 text-xs text-tertiary">Loading games…</p> : null}
      </div>
      <p className="mt-1 text-[10px] text-tertiary">
        Showing up to 100 · exact match count {(games.data?.total ?? 0).toLocaleString()}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="danger"
          disabled={selected.size === 0}
          onClick={() => setConfirm('selected')}
        >
          Delete selected ({selected.size})
        </Button>
        <Button
          variant="danger"
          disabled={!hasFilter || (games.data?.total ?? 0) === 0}
          onClick={() => setConfirm('matching')}
        >
          Delete matching filter
        </Button>
        <Button variant="danger" disabled={!database.games} onClick={() => setConfirm('clear')}>
          Clear collection
        </Button>
        <Button variant="danger" onClick={() => setConfirm('collection')}>
          Delete collection
        </Button>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'collection' ? 'Delete this SQLite collection?' : 'Delete SQLite games?'}
        description={confirm ? `${descriptions[confirm]} This cannot be undone in Kingfisher.` : ''}
        confirmLabel={busy ? 'Deleting…' : 'Delete permanently'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void execute()}
      />
    </section>
  );
}

function ManagementField({
  label,
  value,
  onChange,
  placeholder,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
}) {
  return (
    <label className="text-[10px] text-tertiary">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none focus:border-accent/60"
      />
    </label>
  );
}

function ProviderHealthSummary({ provider }: { provider: ChessDatabaseProvider }) {
  const health = useProviderHealth(provider);
  const state = health.isPending ? 'loading' : (health.data?.state ?? 'error');
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2">
        <StatusDot state={state} />
        <span className="min-w-0 flex-1 truncate text-sm text-primary">{provider.name}</span>
        <span className="text-[10px] uppercase tracking-wide text-tertiary">{LABELS[state]}</span>
      </div>
      <p className="mt-1 pl-4 text-xs leading-relaxed text-tertiary">
        {health.data?.message ?? 'Checking connection…'}
      </p>
    </div>
  );
}

function StatusDot({ state, className }: { state: ProviderHealthState; className?: string }) {
  return (
    <span
      className={cn(
        'h-2 w-2 shrink-0 rounded-full',
        state === 'ready'
          ? 'bg-positive'
          : state === 'loading'
            ? 'bg-line-strong'
            : state === 'error' || state === 'network-error'
              ? 'bg-negative'
              : 'bg-caution',
        className,
      )}
    />
  );
}

function HealthBadge({ state }: { state: ProviderHealthState }) {
  return (
    <span
      className={cn(
        'rounded-[3px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        state === 'ready'
          ? 'border-positive/40 bg-positive/10 text-positive'
          : state === 'loading'
            ? 'border-line text-tertiary'
            : 'border-caution/40 bg-caution/10 text-caution',
      )}
    >
      {LABELS[state]}
    </span>
  );
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-tertiary">{label}</dt>
      <dd className="mt-1 text-sm text-primary tabular">{value}</dd>
    </div>
  );
}
