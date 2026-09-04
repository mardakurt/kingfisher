'use client';

/**
 * Settings → Engines.
 *
 * Two things this replaces. The first is a page of sliders with no way to
 * *get* an engine: Kingfisher could run any UCI engine and offered no way to
 * obtain one, so "install an engine" meant finding a GitHub release, unpacking
 * a tarball and pasting a path. The second is the silence about what running
 * one means.
 *
 * Compact rows, not cards. An engine list is a table of facts — where it came
 * from, what it can do, whether it is running — and marketing panels for
 * software the user has already chosen to use waste the space those facts need.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Check, ChevronDown, ChevronUp, Download, Info, Trash, Warning } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Toggle } from '@/components/ui/Toggle';
import { companionClient } from '@/companion/session';
import type { CatalogueEngine } from '@/companion/client';
import { engineDefinitions } from '@/engine/registry';
import { TRUST_LEVELS, type EngineTrust } from '@/engine/trust';
import { cn } from '@/lib/cn';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

const CAPABILITY_LABELS: readonly (readonly [keyof CapabilityShape, string])[] = [
  ['multipv', 'MultiPV'],
  ['searchmoves', 'searchmoves'],
  ['wdl', 'WDL'],
  ['syzygy', 'Syzygy'],
];
type CapabilityShape = NonNullable<CatalogueEngine['record']>['capabilities'];

const formatBytes = (value: number): string =>
  value >= 1e6 ? `${(value / 1e6).toFixed(1)} MB` : `${Math.round(value / 1e3)} kB`;

export function EngineManager() {
  const client = companionClient();
  const queryClient = useQueryClient();
  const notify = useUi((state) => state.notify);
  const hidden = usePreferences((state) => state.hiddenEngineIds);
  const setPreference = usePreferences((state) => state.set);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [removing, setRemoving] = useState<CatalogueEngine | null>(null);

  const catalogue = useQuery<{ platform: string; engines: readonly CatalogueEngine[] }>({
    queryKey: ['engine-catalogue'],
    enabled: client !== null,
    retry: false,
    refetchInterval: (query) =>
      (query.state.data?.engines ?? []).some((engine) => engine.installing) ? 1000 : false,
    queryFn: async ({ signal }) => {
      const active = companionClient();
      if (!active) throw new Error('The companion is not paired.');
      return active.engineCatalogue(signal);
    },
  });

  const install = useMutation({
    mutationFn: async (id: string) => {
      const active = companionClient();
      if (!active) throw new Error('The companion is not paired.');
      return active.installEngine(id);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['engine-catalogue'] }),
    onError: (error) =>
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The engine could not be installed.',
      }),
  });

  const uninstall = useMutation({
    mutationFn: async (id: string) => {
      const active = companionClient();
      if (!active) throw new Error('The companion is not paired.');
      return active.uninstallEngine(id);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['engine-catalogue'] }),
  });

  const toggleHidden = (id: string, visible: boolean) => {
    const next = new Set(hidden);
    if (visible) next.delete(id);
    else next.add(id);
    setPreference('hiddenEngineIds', [...next]);
  };

  const browserEngine = engineDefinitions().find((entry) => entry.transport === 'worker');

  return (
    <div className="flex flex-col gap-3">
      {browserEngine ? (
        <EngineRow
          id={browserEngine.id}
          name={browserEngine.name}
          state="Ready"
          trust="browser"
          detail="Runs in this browser. No companion, no install, nothing to download."
          license={browserEngine.license}
          source={browserEngine.source}
          visible={!hidden.includes(browserEngine.id)}
          onVisible={(value) => toggleHidden(browserEngine.id, value)}
          expanded={expanded === browserEngine.id}
          onExpand={() => setExpanded(expanded === browserEngine.id ? null : browserEngine.id)}
        />
      ) : null}

      {client === null ? (
        <p className="rounded-[4px] border border-line bg-surface-2 p-3 text-xs text-tertiary">
          Native engines need the companion, which runs on this machine and starts processes the
          browser cannot. Pair it under Settings → Companion, and this list becomes installable.
        </p>
      ) : catalogue.isPending ? (
        <p className="text-xs text-tertiary">Asking the companion what it can install…</p>
      ) : catalogue.isError ? (
        <p className="text-xs text-tertiary">
          The companion did not answer:{' '}
          {catalogue.error instanceof Error ? catalogue.error.message : 'unknown error'}
        </p>
      ) : (
        <>
          <p className="text-[11px] text-tertiary">
            Managed engines for {catalogue.data.platform}. Each is downloaded from its own project’s
            release page, checked against a digest recorded in Kingfisher, and made to prove it
            speaks UCI before it is registered.
          </p>
          {catalogue.data.engines
            .filter((engine) => engine.kind !== 'wasm')
            .map((engine) => (
              <ManagedRow
                key={engine.id}
                engine={engine}
                visible={!hidden.includes(engine.id)}
                onVisible={(value) => toggleHidden(engine.id, value)}
                expanded={expanded === engine.id}
                onExpand={() => setExpanded(expanded === engine.id ? null : engine.id)}
                onInstall={() => install.mutate(engine.id)}
                onRemove={() => setRemoving(engine)}
                busy={install.isPending && install.variables === engine.id}
              />
            ))}
        </>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? ''}?`}
        description="The engine’s files are deleted from this machine. It can be installed again at any time, and nothing you have analysed is affected."
        confirmLabel="Remove"
        danger
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          const target = removing;
          setRemoving(null);
          if (target) await uninstall.mutateAsync(target.id);
        }}
      />
    </div>
  );
}

function ManagedRow({
  engine,
  visible,
  onVisible,
  expanded,
  onExpand,
  onInstall,
  onRemove,
  busy,
}: {
  readonly engine: CatalogueEngine;
  readonly visible: boolean;
  readonly onVisible: (value: boolean) => void;
  readonly expanded: boolean;
  readonly onExpand: () => void;
  readonly onInstall: () => void;
  readonly onRemove: () => void;
  readonly busy: boolean;
}) {
  const record = engine.record;
  const progress = engine.progress;

  const state = engine.installing
    ? progress?.phase === 'verifying'
      ? 'Testing UCI'
      : progress?.phase === 'checking'
        ? 'Verifying'
        : 'Downloading'
    : engine.installed
      ? 'Ready'
      : engine.available
        ? engine.kind === 'system'
          ? 'Not on this machine'
          : 'Not installed'
        : 'Unavailable';

  return (
    <EngineRow
      id={engine.id}
      name={engine.name}
      version={engine.version}
      state={state}
      trust="managed"
      detail={
        engine.installing && progress
          ? progress.total > 0
            ? `${formatBytes(progress.bytes)} of ${formatBytes(progress.total)}`
            : progress.message
          : (engine.unavailableReason ??
            (engine.installed ? (record?.reportedName ?? engine.notes) : engine.notes))
      }
      license={engine.license}
      source={engine.source}
      capabilities={record?.capabilities}
      checks={record?.checks}
      sha256={record?.sha256 ?? engine.sha256}
      binary={record?.binary}
      installHint={engine.installed ? null : engine.installHint}
      visible={visible}
      onVisible={onVisible}
      expanded={expanded}
      onExpand={onExpand}
      progress={
        engine.installing && progress && progress.total > 0 ? progress.bytes / progress.total : null
      }
      action={
        engine.installed ? (
          <Button variant="subtle" icon={<Trash />} onClick={onRemove}>
            Remove
          </Button>
        ) : engine.installing ? null : engine.available ? (
          <Button icon={<Download />} onClick={onInstall} disabled={busy}>
            {engine.kind === 'system' ? 'Locate' : 'Install'}
          </Button>
        ) : null
      }
    />
  );
}

function EngineRow({
  id,
  name,
  version,
  state,
  trust,
  detail,
  license,
  source,
  capabilities,
  checks,
  sha256,
  binary,
  installHint,
  visible,
  onVisible,
  expanded,
  onExpand,
  progress,
  action,
}: {
  readonly id: string;
  readonly name: string;
  readonly version?: string | null;
  readonly state: string;
  readonly trust: EngineTrust;
  readonly detail?: string | null;
  readonly license: string;
  readonly source: string;
  readonly capabilities?: CapabilityShape;
  readonly checks?: Readonly<Record<string, { ok: boolean; error: string | null }>>;
  readonly sha256?: string | null;
  readonly binary?: string;
  readonly installHint?: string | null;
  readonly visible: boolean;
  readonly onVisible: (value: boolean) => void;
  readonly expanded: boolean;
  readonly onExpand: () => void;
  readonly progress?: number | null;
  readonly action?: React.ReactNode;
}) {
  const level = TRUST_LEVELS[trust];
  return (
    <div className="rounded-[5px] border border-line bg-surface-2 p-2.5" data-engine-row={id}>
      <div className="flex items-start gap-2.5">
        <Toggle
          label={`Show ${name} in the engine selector`}
          checked={visible}
          onChange={onVisible}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium text-primary">{name}</span>
            {version ? <span className="text-[10px] text-tertiary">{version}</span> : null}
            <span
              className={cn(
                'rounded-[3px] px-1.5 py-0.5 text-[10px]',
                state === 'Ready'
                  ? 'bg-accent-muted text-accent'
                  : 'border border-line text-tertiary',
              )}
            >
              {state}
            </span>
            <span className="text-[10px] text-tertiary">{level.label}</span>
          </div>
          {detail ? <p className="mt-0.5 text-[11px] text-tertiary">{detail}</p> : null}
          {progress !== null && progress !== undefined ? (
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full bg-accent transition-[width]"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          ) : null}
          {capabilities ? (
            <p className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
              {CAPABILITY_LABELS.map(([key, label]) => (
                <span
                  key={key}
                  className={cn(
                    'rounded-[3px] border px-1',
                    capabilities[key]
                      ? 'border-line-strong text-secondary'
                      : 'border-line text-tertiary line-through',
                  )}
                  title={
                    capabilities[key]
                      ? `${label}: confirmed by running this engine`
                      : `${label}: this build did not support it when tested`
                  }
                >
                  {label}
                </span>
              ))}
            </p>
          ) : null}
          {installHint ? (
            <p className="mt-1 font-mono text-[10px] text-tertiary">{installHint}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {action}
          <button
            type="button"
            aria-label={expanded ? `Hide details of ${name}` : `Show details of ${name}`}
            aria-expanded={expanded}
            onClick={onExpand}
            className="rounded-[4px] p-1 text-tertiary transition-colors hover:bg-surface-3 hover:text-primary"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="mt-2.5 space-y-2.5 border-t border-line-subtle pt-2.5">
          <div>
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-tertiary">
              {level.label}
            </h4>
            <p className="mt-1 text-[11px] text-secondary">{level.summary}</p>
            <ul className="mt-1.5 space-y-0.5">
              {level.guarantees.map((line) => (
                <li key={line} className="flex items-start gap-1.5 text-[11px] text-tertiary">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                  <span>{line}</span>
                </li>
              ))}
              {level.limits.map((line) => (
                <li key={line} className="flex items-start gap-1.5 text-[11px] text-tertiary">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {checks ? (
            <div>
              <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-tertiary">
                Checks run against this binary
              </h4>
              <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {Object.entries(checks).map(([check, result]) => (
                  <li key={check} className="flex items-center gap-1 text-[11px]">
                    {result.ok ? (
                      <Check className="h-3 w-3 text-success" />
                    ) : (
                      <Warning className="h-3 w-3 text-tertiary" />
                    )}
                    <span className={result.ok ? 'text-secondary' : 'text-tertiary'}>{check}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[11px]">
            <dt className="text-tertiary">Licence</dt>
            <dd className="text-secondary">{license}</dd>
            <dt className="text-tertiary">Source</dt>
            <dd className="min-w-0 truncate">
              <a
                href={source.startsWith('http') ? source : undefined}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline-offset-2 hover:underline"
              >
                {source}
              </a>
            </dd>
            {sha256 ? (
              <>
                <dt className="text-tertiary">SHA-256</dt>
                <dd className="min-w-0 truncate font-mono text-tertiary">{sha256}</dd>
              </>
            ) : null}
            {binary ? (
              <>
                <dt className="text-tertiary">Installed at</dt>
                <dd className="min-w-0 truncate font-mono text-tertiary">{binary}</dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
