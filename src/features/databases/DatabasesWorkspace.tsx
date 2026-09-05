'use client';

/**
 * The database control centre.
 *
 * Before Phase 12 this route was a provider inspector: a list of sources, a
 * health badge, and a connection test. Useful, and not what a player with three
 * archives needs. The job it does now is the one ChessBase's database window
 * does — see what you have, move games between collections, search across
 * several at once, and find the same game held twice.
 *
 * The shape is deliberately conventional: collections on the left, one subject
 * in the middle, health on the right. What changes in the middle is driven by
 * the checkboxes on the left — one collection checked shows that collection,
 * more than one shows the cross-collection tools — because "select the things,
 * then act on them" is the interaction every file manager and every mail client
 * has already taught everybody.
 */

import dynamic from 'next/dynamic';
import { useEnCroissantImport } from '@/stores/en-croissant-import-store';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Import, Plus, Search, Settings } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { companionClient } from '@/companion/session';
import { useCompanionStatus } from '@/companion/useCompanion';
import { listCollections } from '@/database/collections/registry';
import { getRepositories } from '@/persistence/repositories';
import { STORE_NAMES } from '@/persistence/schema/migrations';
import type { ChessDatabaseProvider, ProviderHealth, ProviderHealthState } from '@/database/types';
import { useDatabaseProviders } from '@/database/use-database-providers';
import { NavButton } from '@/features/shell/NavButton';
import { cn } from '@/lib/cn';
import type { GameSearchQuery } from '@/persistence/types';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

import { CollectionDetail } from './CollectionDetail';
import { CollectionList, formatBytes } from './CollectionList';
import { DuplicatesPanel } from './DuplicatesPanel';
import { MultiSearchPanel } from './MultiSearchPanel';
import { ReferenceCatalogPanel } from './ReferenceCatalogPanel';
import { SourceSetsPanel } from './SourceSetsPanel';
import { TransferDialog, type TransferRequest } from './TransferDialog';

const EnCroissantImportDialog = dynamic(() =>
  import('./EnCroissantImportDialog').then((module) => module.EnCroissantImportDialog),
);

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

type CentreTab = 'collection' | 'search' | 'duplicates' | 'sources';

export function DatabasesWorkspace() {
  const queryClient = useQueryClient();
  const [enCroissantOpen, setEnCroissantOpen] = useState(false);
  const enCroissantRunning = useEnCroissantImport((state) => state.running);
  const setImportOpen = useUi((state) => state.setImportOpen);
  const setSettingsOpen = useUi((state) => state.setSettingsOpen);
  const notify = useUi((state) => state.notify);
  const referenceProviderId = usePreferences((state) => state.explorerSourceId);
  const companion = useCompanionStatus();

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [tab, setTab] = useState<CentreTab>('collection');
  const [transfer, setTransfer] = useState<TransferRequest | null>(null);
  const [creating, setCreating] = useState<null | { query?: GameSearchQuery; sourceId?: string }>(
    null,
  );

  const collections = useQuery({
    queryKey: ['collections', referenceProviderId, companion.data?.databases.length ?? 0],
    retry: false,
    queryFn: () => listCollections(referenceProviderId),
  });

  const list = useMemo(() => collections.data ?? [], [collections.data]);
  const focused = list.find((entry) => entry.id === focusedId) ?? list[0] ?? null;
  const selected = list.filter((entry) => checked.has(entry.id));

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['collections'] });
    await companion.refetch();
  };

  const createCollection = async (name: string) => {
    const client = companionClient();
    if (!client) {
      notify({
        tone: 'error',
        message: 'A new SQLite collection needs the companion.',
        detail: 'Start it with `npm run companion`, then pair it in Settings → Companion.',
      });
      return;
    }
    try {
      const created = await client.createDatabase(name);
      notify({ tone: 'success', message: `Created “${created.name}”.` });
      const request = creating;
      await refresh();
      /*
        "Create collection from these results" is a create followed by a copy,
        and is offered as one action because that is what the user asked for.
        Splitting it into two would leave an empty collection behind whenever
        somebody was interrupted between them.
      */
      if (request?.sourceId && request.query) {
        const source = list.find((entry) => entry.id === request.sourceId);
        if (source) {
          setTransfer({
            kind: 'copy',
            source,
            query: request.query,
            scopeLabel: 'The current search results',
          });
        }
      }
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The collection could not be created.',
      });
    } finally {
      setCreating(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {enCroissantOpen ? (
        <EnCroissantImportDialog open onClose={() => setEnCroissantOpen(false)} />
      ) : null}
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-line-subtle bg-surface-1 px-3 md:px-5">
        <NavButton />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-primary">Databases</h1>
          <p className="hidden text-xs text-tertiary sm:block">
            Collections, transfers, cross-database search and duplicates.
          </p>
        </div>
        <Button
          variant="subtle"
          icon={<Plus />}
          className="ml-auto"
          onClick={() => setCreating({})}
        >
          New collection
        </Button>
        <Button variant="subtle" icon={<Import />} onClick={() => setImportOpen(true)}>
          Import PGN
        </Button>
        <Button onClick={() => setEnCroissantOpen(true)}>
          {enCroissantRunning ? 'En Croissant import running…' : 'Import En Croissant'}
        </Button>
        <Button icon={<Settings />} onClick={() => setSettingsOpen(true)}>
          Connections
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[300px_minmax(0,1fr)_300px] lg:overflow-hidden">
        <section className="flex min-h-0 flex-col border-b border-line-subtle bg-surface-1 lg:border-r lg:border-b-0">
          <div className="flex shrink-0 items-center gap-2 border-b border-line-subtle px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-tertiary">
              Collections
            </h2>
            {checked.size > 0 ? (
              <button
                type="button"
                onClick={() => setChecked(new Set())}
                className="ml-auto text-[10px] text-tertiary underline-offset-2 hover:text-secondary hover:underline"
              >
                Clear {checked.size} selected
              </button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <CollectionList
              collections={list}
              focusedId={focused?.id ?? null}
              checked={checked}
              onFocus={(id) => {
                setFocusedId(id);
                setTab('collection');
              }}
              onToggle={(id) =>
                setChecked((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
            />
            <SourceSetsPanel
              collections={list}
              checked={checked}
              onApply={(ids) => {
                setChecked(new Set(ids));
                setTab('search');
              }}
            />
          </div>
        </section>

        <main className="flex min-h-[460px] min-w-0 flex-col lg:min-h-0">
          <nav
            className="flex shrink-0 gap-1 border-b border-line-subtle bg-surface-1 px-3 py-1.5"
            aria-label="Database tools"
          >
            <TabButton active={tab === 'collection'} onClick={() => setTab('collection')}>
              {focused ? focused.name : 'Collection'}
            </TabButton>
            <TabButton
              active={tab === 'search'}
              onClick={() => setTab('search')}
              disabled={checked.size === 0}
              hint={checked.size === 0 ? 'Tick collections to search several at once' : undefined}
            >
              <Search className="h-3.5 w-3.5" />
              Search {checked.size > 0 ? `${checked.size} selected` : 'across collections'}
            </TabButton>
            <TabButton
              active={tab === 'duplicates'}
              onClick={() => setTab('duplicates')}
              disabled={checked.size === 0}
              hint={checked.size === 0 ? 'Tick collections to compare them' : undefined}
            >
              Duplicates
            </TabButton>
            <TabButton
              active={tab === 'sources'}
              onClick={() => setTab('sources')}
              hint="Reference packs, licences, and what each source may answer"
            >
              Reference sources
            </TabButton>
          </nav>

          <div className="min-h-0 flex-1 overflow-auto">
            {tab === 'sources' ? (
              <ReferenceCatalogPanel />
            ) : collections.isPending ? (
              <p className="p-6 text-sm text-tertiary">Reading collections…</p>
            ) : tab === 'search' ? (
              <MultiSearchPanel
                selected={selected}
                onCreateFromResults={(query, sourceId, label) => {
                  setCreating({ query, sourceId });
                  notify({
                    tone: 'info',
                    message: `Name the new collection for “${label}”.`,
                  });
                }}
              />
            ) : tab === 'duplicates' ? (
              <DuplicatesPanel selected={selected} onChanged={() => void refresh()} />
            ) : focused ? (
              <CollectionDetail
                collection={focused}
                onTransfer={setTransfer}
                onChanged={() => void refresh()}
              />
            ) : (
              <p className="p-6 text-sm text-tertiary">
                No collections yet. Import a PGN, or create a SQLite collection with the companion
                running.
              </p>
            )}
          </div>
        </main>

        <aside className="min-h-0 overflow-auto border-t border-line-subtle bg-surface-1 lg:border-t-0 lg:border-l">
          <div className="border-b border-line-subtle px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-tertiary">
              Data sources
            </h2>
          </div>
          <ProviderHealthList />
          <div className="border-t border-line-subtle px-4 py-3">
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
        </aside>
      </div>

      <TransferDialog
        request={transfer}
        collections={list}
        onClose={() => setTransfer(null)}
        onChanged={() => void refresh()}
      />

      <PromptDialog
        open={creating !== null}
        title={creating?.query ? 'Create collection from these results' : 'New SQLite collection'}
        description={
          creating?.query
            ? 'A new SQLite collection is created and the current search results are copied into it. The source is not changed.'
            : 'A SQLite collection file is created by the companion, in its own data directory.'
        }
        label="Name"
        placeholder="Tournament prep"
        confirmLabel="Create"
        onCancel={() => setCreating(null)}
        onSubmit={(value) => void createCollection(value)}
      />
    </div>
  );
}

/**
 * What this browser is actually holding.
 *
 * Kept from the previous version of this route because it answers a question
 * the per-collection facts cannot: the browser reports one storage figure for
 * the whole origin — games, studies, repertoires and training together — and a
 * user near their quota needs the origin number, not a collection's share of it.
 */
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
    <section className="border-t border-line-subtle px-4 py-3">
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

function TabButton({
  active,
  disabled,
  hint,
  onClick,
  children,
}: {
  readonly active: boolean;
  readonly disabled?: boolean;
  readonly hint?: string;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      aria-current={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-xs transition-colors',
        'disabled:opacity-40',
        active
          ? 'bg-accent-muted font-medium text-primary'
          : 'text-secondary hover:bg-surface-2 hover:text-primary',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Provider health, kept from the previous version of this route.
 *
 * Still worth its space: a Lichess source that is rate-limited or a companion
 * that has stopped is exactly what makes an explorer look broken, and this is
 * where somebody comes to find out.
 */
function ProviderHealthList() {
  const providers = useDatabaseProviders();
  return (
    <div className="divide-y divide-line-subtle">
      {providers.map((provider) => (
        <ProviderHealthRow key={provider.id} provider={provider} />
      ))}
    </div>
  );
}

function ProviderHealthRow({ provider }: { readonly provider: ChessDatabaseProvider }) {
  const health = useQuery<ProviderHealth>({
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
      {state !== 'ready' && state !== 'loading' ? (
        <Button
          size="sm"
          className="mt-1.5 ml-4"
          onClick={() => void health.refetch()}
          disabled={health.isFetching}
        >
          {health.isFetching ? 'Testing…' : 'Test connection'}
        </Button>
      ) : null}
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
