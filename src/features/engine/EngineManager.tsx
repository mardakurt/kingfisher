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
import { useCompanionReach } from '@/companion/useCompanion';
import { publicUrl } from '@/release/public-urls';
import type { CatalogueEngine } from '@/companion/client';
import {
  engineDefinitions,
  enginesNotPublishedFor,
  publishedPlatformWords,
} from '@/engine/registry';
import { TRUST_LEVELS, type EngineTrust } from '@/engine/trust';
import { useEngineDefinitionsVersion } from '@/engine/use-engines';
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
  const reach = useCompanionReach();
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

  // The registry is edited at runtime (the full-network Stockfish is
  // registered once the manifest has been read); this subscription is what
  // makes the row appear without a reload.
  useEngineDefinitionsVersion();
  const browserEngines = engineDefinitions().filter((entry) => entry.transport === 'worker');

  return (
    <div className="flex flex-col gap-3">
      {browserEngines.map((browserEngine) => (
        <EngineRow
          key={browserEngine.id}
          id={browserEngine.id}
          name={browserEngine.name}
          state="Ready"
          trust="browser"
          detail={
            browserEngine.id === 'stockfish-wasm-full'
              ? 'Runs in this browser with the full-size evaluation network — the one the native engine uses. 113 MB, fetched from its recorded address the first time it is chosen, checked against a recorded SHA-256, and kept by the browser afterwards. No companion.'
              : 'Runs in this browser. No companion, no install, nothing to download.'
          }
          license={browserEngine.license}
          source={browserEngine.source}
          visible={!hidden.includes(browserEngine.id)}
          onVisible={(value) => toggleHidden(browserEngine.id, value)}
          expanded={expanded === browserEngine.id}
          onExpand={() => setExpanded(expanded === browserEngine.id ? null : browserEngine.id)}
        />
      ))}

      {client === null ? (
        /*
          Phase 63: the empty state used to be one sentence that told
          the user to go elsewhere. It now lists the engines they are
          missing by name, so the cost of not pairing is concrete and
          the next step is obvious. Browsers run Stockfish; everything
          else is the companion's job.

          Phase 72: which next step depends on where this page is served
          from. A companion answers loopback origins only, so on the public
          site there is no companion to pair — the native engines are the
          Mac application's — and saying "pair the companion" there was an
          instruction that could not succeed. See `companion/reach.ts`.
        */
        <div
          className="rounded-[4px] border border-line bg-surface-2 p-3 text-xs text-tertiary"
          data-engine-manager-unpaired={reach}
        >
          <p className="text-secondary">
            <strong className="font-medium text-primary">Stockfish 18</strong> is the engine the
            browser runs.{' '}
            {reach === 'checkout'
              ? 'Everything else is a one-command install once you pair the companion.'
              : 'Every other engine runs natively inside the Kingfisher Mac application, which includes the companion and needs no setup.'}
          </p>
          <p className="mt-2 text-2xs">
            {reach === 'checkout' ? (
              <>
                Pair under <em className="not-italic">Settings → Companion</em>. When the companion
                is up, this list grows to include{' '}
              </>
            ) : (
              <>
                On a Mac, <em className="not-italic">Settings → Engines</em> in the application
                lists{' '}
              </>
            )}
            <strong className="font-medium text-secondary">Lc0</strong> (neural network, plays
            positions Stockfish does not),{' '}
            <strong className="font-medium text-secondary">Stormphrax 8</strong>,{' '}
            <strong className="font-medium text-secondary">Viridithas 20</strong> (independent Rust
            engine), <strong className="font-medium text-secondary">Halogen 16</strong>,{' '}
            <strong className="font-medium text-secondary">PlentyChess 8</strong>, and{' '}
            <strong className="font-medium text-secondary">Stockfish 19 (native)</strong>. Each
            installs with a single click from its own GitHub release, with a SHA-256 check before
            the binary runs.
          </p>
          {reach === 'remote' ? (
            <p className="mt-2 text-2xs">
              <a
                href={publicUrl.landing + '#macos'}
                className="text-accent hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                Download Kingfisher for macOS →
              </a>
            </p>
          ) : null}
        </div>
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
          <NotOfferedHere platform={catalogue.data.platform} />
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

/**
 * The catalogue engines this machine will never be offered, and why.
 *
 * A Mac user who has read that Kingfisher knows nine native engines and
 * finds six in Settings concludes three are broken. They are not: Berserk,
 * Obsidian and Koivisto publish Windows builds only (Koivisto also Linux),
 * which is a fact about those projects' releases. Saying so here is the
 * difference between "the product is defective" and "that engine does not
 * exist for this machine".
 */
function NotOfferedHere({ platform }: { readonly platform: string }) {
  const missing = enginesNotPublishedFor(platform);
  if (missing.length === 0) return null;
  const os = platform.startsWith('darwin')
    ? 'macOS'
    : platform.startsWith('win32')
      ? 'Windows'
      : platform.startsWith('linux')
        ? 'Linux'
        : platform;
  return (
    <div
      className="rounded-[4px] border border-line bg-surface-2 p-3 text-[11px] leading-relaxed text-tertiary"
      data-engines-not-offered
    >
      <p className="text-secondary">
        Not offered on {os}:{' '}
        {missing.map((engine, index) => (
          <span key={engine.id}>
            {index > 0 ? (index === missing.length - 1 ? ' and ' : ', ') : ''}
            <span className="text-primary">{engine.name}</span> (
            {publishedPlatformWords(engine.platforms)})
          </span>
        ))}
        .
      </p>
      <p className="mt-1">
        These projects publish builds for those platforms only. Kingfisher lists an engine only
        where its authors ship a binary for the machine, so this is a fact about their releases, not
        a fault in the application; every engine above installs and runs here.
      </p>
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
