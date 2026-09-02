'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Check, Database, Import, Settings, Warning } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import type { ChessDatabaseProvider, ProviderHealth, ProviderHealthState } from '@/database/types';
import { useDatabaseProviders } from '@/database/use-database-providers';
import { useCompanionStatus } from '@/companion/useCompanion';
import { NavButton } from '@/features/shell/NavButton';
import { cn } from '@/lib/cn';
import { useUi } from '@/stores/ui-store';

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
            <ProviderDetails provider={selected} onConfigure={() => setSettingsOpen(true)} />
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
          </div>
        </aside>
      </div>
    </div>
  );
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
  onConfigure,
}: {
  provider: ChessDatabaseProvider;
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
