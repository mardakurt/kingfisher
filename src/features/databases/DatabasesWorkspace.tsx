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
import { useChessBaseImport } from '@/stores/chessbase-import-store';
import { useEnCroissantImport } from '@/stores/en-croissant-import-store';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Database, Dossier, Import, Library, Plus, Search, Settings } from '@/components/icons';
import { SearchField } from '@/components/ui/Controls';
import { PageHeader } from '@/features/shell/PageHeader';
import type { CollectionFacts } from '@/database/collections/types';
import { Button } from '@/components/ui/Button';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { companionClient } from '@/companion/session';
import { useCompanionStatus } from '@/companion/useCompanion';
import { listCollections } from '@/database/collections/registry';
import { getRepositories } from '@/persistence/repositories';
import { STORE_NAMES } from '@/persistence/schema/migrations';
import type { ChessDatabaseProvider, ProviderHealth, ProviderHealthState } from '@/database/types';
import { useDatabaseProviders } from '@/database/use-database-providers';
import { cn } from '@/lib/cn';
import type { GameSearchQuery } from '@/persistence/types';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

import { CollectionDetail } from './CollectionDetail';
import { formatBytes } from './CollectionList';
import { DuplicatesPanel } from './DuplicatesPanel';
import { MultiSearchPanel } from './MultiSearchPanel';
import { ReferenceCatalogPanel } from './ReferenceCatalogPanel';
import { SourceSetsPanel } from './SourceSetsPanel';
import { TransferDialog, type TransferRequest } from './TransferDialog';
import { plural } from '@/lib/plural';

const ChessBaseImportDialog = dynamic(() =>
  import('./ChessBaseImportDialog').then((module) => module.ChessBaseImportDialog),
);
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
  const [chessBaseOpen, setChessBaseOpen] = useState(false);
  const chessBaseRunning = useChessBaseImport((state) => state.running);
  const enCroissantRunning = useEnCroissantImport((state) => state.running);
  const setImportOpen = useUi((state) => state.setImportOpen);
  const setSettingsOpen = useUi((state) => state.setSettingsOpen);
  const notify = useUi((state) => state.notify);
  const referenceProviderId = usePreferences((state) => state.explorerSourceId);
  const companion = useCompanionStatus();

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [tab, setTab] = useState<CentreTab>('collection');
  /** Whether a collection is open, rather than the grid of all of them. */
  const [drilled, setDrilled] = useState(false);
  const [filter, setFilter] = useState('');
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
  const shown = filter.trim()
    ? list.filter((entry) => entry.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : list;

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
      {chessBaseOpen ? (
        <ChessBaseImportDialog open onClose={() => setChessBaseOpen(false)} />
      ) : null}
      {enCroissantOpen ? (
        <EnCroissantImportDialog open onClose={() => setEnCroissantOpen(false)} />
      ) : null}
      <PageHeader
        title="Databases"
        subtitle="Collections, reference sources, transfers, cross-database search and duplicates."
        icon={<Database />}
        actions={
          <Button icon={<Settings />} onClick={() => setSettingsOpen(true)}>
            Connections
          </Button>
        }
      />

      <div
        className="flex shrink-0 flex-wrap items-center gap-2 px-3 pt-2.5 pb-2 sm:px-4"
        data-databases-toolbar
      >
        <SearchField
          value={filter}
          onChange={setFilter}
          placeholder="Search databases"
          aria-label="Search databases"
          className="max-w-[320px] min-w-[200px] flex-1"
        />
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" icon={<Plus />} onClick={() => setCreating({})}>
            New collection
          </Button>
          <Button size="sm" icon={<Import />} onClick={() => setImportOpen(true)}>
            Import PGN
          </Button>
          <Button size="sm" onClick={() => setChessBaseOpen(true)}>
            {chessBaseRunning ? 'ChessBase import running…' : 'Import ChessBase'}
          </Button>
          <Button size="sm" onClick={() => setEnCroissantOpen(true)}>
            {enCroissantRunning ? 'En Croissant import running…' : 'Import En Croissant'}
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto border-t border-line-subtle lg:grid-cols-[minmax(0,1fr)_300px] lg:overflow-hidden">
        <main className="flex min-h-[460px] min-w-0 flex-col lg:min-h-0">
          <nav
            className="flex shrink-0 flex-wrap gap-1 border-b border-line-subtle px-3 py-1.5 sm:px-4"
            aria-label="Database tools"
          >
            <TabButton
              active={tab === 'collection' && !drilled}
              onClick={() => {
                setTab('collection');
                setDrilled(false);
              }}
            >
              All databases
            </TabButton>
            {drilled && focused ? (
              <TabButton active={tab === 'collection'} onClick={() => setTab('collection')}>
                {focused.name}
              </TabButton>
            ) : null}
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
            ) : !drilled ? (
              <DatabaseGrid
                collections={shown}
                total={list.length}
                focusedId={focused?.id ?? null}
                checked={checked}
                onOpen={(id) => {
                  setFocusedId(id);
                  setDrilled(true);
                }}
                onToggle={(id) =>
                  setChecked((current) => {
                    const next = new Set(current);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                onClearChecked={() => setChecked(new Set())}
                onReferenceSources={() => setTab('sources')}
                sets={
                  <SourceSetsPanel
                    collections={list}
                    checked={checked}
                    onApply={(ids) => {
                      setChecked(new Set(ids));
                      setTab('search');
                    }}
                  />
                }
              />
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
            <h2 className="text-xs font-semibold text-tertiary">Data sources</h2>
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
      <h3 className="text-[10px] font-semibold text-tertiary">Storage</h3>
      <p className="mt-2 text-xs text-primary">Browser estimate: {estimate}</p>
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
      {/*
        The previous version listed each companion-managed SQLite collection
        on its own line, which on a machine with several study databases
        pushed this rail past a screen of text. Two summaries carry the same
        information: one for browser storage (the headline number the user
        cares about) and one for companion-managed databases (collapsed into
        a single line) — the per-database counts are still visible on each
        collection's own row in the centre.
      */}
      <p className="mt-2 text-2xs text-tertiary tabular">
        {storage.data
          ? `${plural(storage.data.games, 'game')} · ${plural(storage.data.studies, 'study', 'studies')} · ${plural(storage.data.training, 'training item')}`
          : storage.isError
            ? 'Stored counts could not be read from this browser.'
            : 'Reading browser storage…'}
      </p>
      {sqlite.length > 0 ? (
        <p className="mt-1 text-2xs text-tertiary tabular">
          Companion: {sqlite.length} collection{sqlite.length === 1 ? '' : 's'} ·{' '}
          {formatBytes(sqlite.reduce<number>((sum, database) => sum + (database.bytes ?? 0), 0))} on
          disk
        </p>
      ) : null}
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
        'inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-xs transition-colors',
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
  const openSettingsAt = useUi((state) => state.openSettingsAt);
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
      {/*
        The name gets the whole line and the state sits under it. Side by side,
        "AUTHENTICATION REQUIRED" took most of a 220 px rail and left the
        name as "Lichess M…" — three Lichess sources, every one of them cut
        off at the letter that told them apart. That was the owner's Phase 53
        report, word for word. A name is never truncated here; the state is
        short and can take the second line.
      */}
      <div className="flex items-start gap-2">
        <StatusDot state={state} className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <span className="block text-sm text-primary">{provider.name}</span>
          {/*
            What population this source answers about, in one line. Three
            rows all called "Lichess …" and all saying "authentication
            required" read as one source listed three times (the Phase 72
            report); the description is what tells Masters, Rated Games and
            by-player apart, and it is the provider's own.
          */}
          <span className="block text-[11px] leading-snug text-secondary">
            {provider.description}
          </span>
          <span className="mt-0.5 block text-[10px] text-tertiary">{LABELS[state]}</span>
        </div>
      </div>
      {/*
        A source waiting for a credential says so through its button and the
        remedy beside it; repeating the same "needs a token" paragraph under
        each of three Lichess rows was the clutter, not the information.
      */}
      {state !== 'authentication-required' ? (
        <p className="mt-1 pl-4 text-xs leading-relaxed text-tertiary">
          {health.data?.message ?? 'Checking connection…'}
        </p>
      ) : null}
      {/*
        A source that needs a credential gets the button that supplies one.
        "Test connection" on a source with no token re-ran the test and
        reported the same thing, which read as the button doing nothing: the
        test was working, and there was nothing it could change.
      */}
      {state === 'authentication-required' ? (
        <div className="mt-1.5 ml-4 flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="accent" onClick={() => openSettingsAt('accounts')}>
            Connect Lichess
          </Button>
          {health.data?.remedy ? (
            <span className="text-[10.5px] text-tertiary">{health.data.remedy}</span>
          ) : null}
        </div>
      ) : state !== 'ready' && state !== 'loading' ? (
        <div className="mt-1.5 ml-4 flex flex-wrap items-center gap-1.5">
          <Button size="sm" onClick={() => void health.refetch()} disabled={health.isFetching}>
            {health.isFetching ? 'Testing…' : 'Test connection'}
          </Button>
          {health.data?.remedy ? (
            <span className="text-[10.5px] text-tertiary">{health.data.remedy}</span>
          ) : null}
        </div>
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

/**
 * Every collection as a tile, the way a Mac shows a folder of documents.
 *
 * A tile names the collection and says how many games it holds and where
 * they live; a click opens it. The checkbox in its corner is the multi-select
 * the cross-collection search and duplicate finder work from — visible, not a
 * modifier-click nobody would discover.
 */
function DatabaseGrid({
  collections,
  total,
  focusedId,
  checked,
  onOpen,
  onToggle,
  onClearChecked,
  onReferenceSources,
  sets,
}: {
  readonly collections: readonly CollectionFacts[];
  readonly total: number;
  readonly focusedId: string | null;
  readonly checked: ReadonlySet<string>;
  readonly onOpen: (id: string) => void;
  readonly onToggle: (id: string) => void;
  readonly onClearChecked: () => void;
  readonly onReferenceSources: () => void;
  readonly sets: React.ReactNode;
}) {
  return (
    <div className="px-5 py-5 md:px-7" data-database-grid>
      <div className="flex items-baseline gap-2">
        <h2 className="text-[15px] font-semibold text-primary">All databases</h2>
        <span className="text-xs text-tertiary tabular">{total}</span>
        {checked.size > 0 ? (
          <button
            type="button"
            onClick={onClearChecked}
            className="ml-auto text-[11px] text-tertiary underline-offset-2 hover:text-secondary hover:underline"
          >
            Clear {checked.size} selected
          </button>
        ) : null}
      </div>
      <ul
        className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3"
        aria-label="Collections"
      >
        {collections.map((collection) => {
          const isChecked = checked.has(collection.id);
          return (
            <li key={collection.id} className="group relative">
              <button
                type="button"
                onClick={() => onOpen(collection.id)}
                aria-current={collection.id === focusedId}
                className={cn(
                  'flex w-full flex-col items-center gap-2 rounded-[12px] px-2 pt-4 pb-3 text-center transition-colors',
                  isChecked ? 'bg-accent-muted' : 'hover:bg-surface-2',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex size-16 items-center justify-center rounded-[16px] shadow-[0_1px_2px_rgb(0_0_0/0.12),inset_0_0_0_0.5px_rgb(0_0_0/0.08)]',
                    collection.kind === 'sqlite'
                      ? 'bg-gradient-to-b from-[#6f7785] to-[#4b525d] text-white'
                      : 'bg-gradient-to-b from-[#4f8ff0] to-[#2563d4] text-white',
                  )}
                >
                  {collection.kind === 'sqlite' ? (
                    <Database className="h-7 w-7" />
                  ) : (
                    <Library className="h-7 w-7" />
                  )}
                </span>
                <span className="line-clamp-2 text-[12.5px] leading-tight font-medium text-primary">
                  {collection.name}
                </span>
                <span className="-mt-1 text-[11px] text-tertiary tabular">
                  {collection.games === null
                    ? 'count unavailable'
                    : plural(collection.games, 'game')}
                  {' · '}
                  {collection.kind === 'sqlite' ? 'SQLite' : 'this browser'}
                </span>
              </button>
              <label
                className={cn(
                  'absolute top-1.5 left-1.5 flex size-6 cursor-pointer items-center justify-center rounded-[6px] transition-opacity',
                  isChecked
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
                )}
                title={`Include ${collection.name} in multi-collection search and duplicate detection`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggle(collection.id)}
                  aria-label={`Include ${collection.name}`}
                  className="accent-[var(--accent)]"
                />
              </label>
              {collection.reference ? (
                <span
                  className="absolute top-2 right-2 rounded-[4px] bg-accent px-1 text-[9px] font-semibold text-accent-contrast"
                  title="The explorer's default source"
                >
                  Ref
                </span>
              ) : null}
            </li>
          );
        })}
        <li>
          <button
            type="button"
            aria-label="Open the reference catalogue: packs and live services"
            onClick={onReferenceSources}
            className="flex w-full flex-col items-center gap-2 rounded-[12px] px-2 pt-4 pb-3 text-center transition-colors hover:bg-surface-2"
          >
            <span
              aria-hidden
              className="flex size-16 items-center justify-center rounded-[16px] bg-gradient-to-b from-[#f5c451] to-[#e0a21c] text-white shadow-[0_1px_2px_rgb(0_0_0/0.12)]"
            >
              <Dossier className="h-7 w-7" />
            </span>
            <span className="text-[12.5px] leading-tight font-medium text-primary">
              Reference sources
            </span>
            <span className="-mt-1 text-[11px] text-tertiary">Packs and live services</span>
          </button>
        </li>
      </ul>
      {collections.length === 0 && total > 0 ? (
        <p className="mt-4 text-xs text-tertiary">No collection matches the search.</p>
      ) : null}
      {total === 0 ? (
        <p className="mt-4 text-xs text-tertiary">
          No collections. Import a PGN to start one, or pair the companion for SQLite collections.
        </p>
      ) : null}
      <div className="mt-6 max-w-[520px]">{sets}</div>
    </div>
  );
}
