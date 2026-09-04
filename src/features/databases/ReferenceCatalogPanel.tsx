'use client';

/**
 * The data catalog.
 *
 * One list of every source Kingfisher can query, what it holds, where it came
 * from, and what it is allowed to answer. The switches are the point: a
 * research tool that decides for you which populations to mix is a tool whose
 * numbers you cannot check.
 *
 * Two switch levels rather than one per surface. A master switch turns a
 * source off everywhere, which is what almost everybody wants; the capability
 * switches underneath exist for the case that is real and specific — "use my
 * own archive for player search but not for opening statistics" — and are
 * folded away until asked for.
 */

import { useState } from 'react';

import { Check, ChevronDown, ChevronUp, Download, Info, Trash, Warning } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Toggle } from '@/components/ui/Toggle';
import { cancelInstall, checkForPackUpdates, removePack, startInstall } from '@/reference/manager';
import { useDataSources, useSourceActions } from '@/reference/sources';
import { useReferenceSources } from '@/reference/use-references';
import {
  CAPABILITY_LABELS,
  DEFAULT_SOURCE_PREFERENCE,
  type ReferenceSource,
  type SourceCapability,
  type SourceKind,
} from '@/reference/types';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

const KIND_LABELS: Record<SourceKind, string> = {
  bundled: 'Built in',
  installed: 'Installed',
  catalog: 'Available',
  online: 'Online',
  local: 'This browser',
  companion: 'Companion',
};

export const formatCount = (value: number): string => value.toLocaleString();

export function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.round(bytes / 1e3)} kB`;
}

export function ReferenceCatalogPanel() {
  const sources = useDataSources();
  const references = useReferenceSources();
  const actions = useSourceActions();
  const settings = usePreferences((state) => state.sourceSettings);
  const notify = useUi((state) => state.notify);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ReferenceSource | null>(null);
  const [checking, setChecking] = useState(false);

  const order = sources.map((source) => source.id);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line-subtle px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-primary">Reference sources</h2>
          <p className="text-xs text-tertiary">
            Every database Kingfisher can query, and what each one is allowed to answer. Sources are
            never merged: a statistic names the source it came from.
          </p>
        </div>
        <Button
          variant="subtle"
          className="ml-auto"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            await checkForPackUpdates();
            setChecking(false);
            notify({ tone: 'info', message: 'Checked installed packs for updates.' });
          }}
        >
          {checking ? 'Checking…' : 'Check for updates'}
        </Button>
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-line-subtle overflow-auto">
        {sources.map((source, index) => {
          const preference = settings[source.id] ?? DEFAULT_SOURCE_PREFERENCE;
          const progress = references.progress[source.id];
          const error = references.errors[source.id];
          const open = expanded === source.id;

          return (
            <li key={source.id} className="px-4 py-3" data-source-row={source.id}>
              <div className="flex items-start gap-3">
                <Toggle
                  label={`Use ${source.name}`}
                  checked={source.installed && preference.enabled}
                  disabled={!source.installed}
                  onChange={(value) => actions.setEnabled(source.id, value)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-medium text-primary">{source.name}</span>
                    <Badge kind={source.kind} />
                    {source.updateAvailable ? (
                      <span className="rounded-[3px] bg-accent-muted px-1.5 py-0.5 text-[10px] text-accent">
                        Update available
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-tertiary">{source.description}</p>

                  {progress ? (
                    <InstallProgressBar
                      done={progress.bytesDone}
                      total={progress.bytesTotal}
                      phase={progress.phase}
                    />
                  ) : (
                    <Facts source={source} />
                  )}

                  {error ? (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-danger">
                      <Warning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{error}</span>
                    </p>
                  ) : null}

                  {open ? (
                    <Details
                      source={source}
                      disabled={preference.disabled}
                      onCapability={(capability, value) =>
                        actions.setCapability(source.id, capability, value)
                      }
                    />
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <div className="flex items-center gap-1.5">
                    {progress ? (
                      <Button variant="subtle" onClick={() => cancelInstall(source.id)}>
                        Cancel
                      </Button>
                    ) : source.kind === 'catalog' ? (
                      <Button icon={<Download />} onClick={() => void startInstall(source.id)}>
                        Install
                      </Button>
                    ) : source.updateAvailable ? (
                      <Button onClick={() => void startInstall(source.id)}>Update</Button>
                    ) : null}
                    {source.kind === 'installed' && !progress ? (
                      <Button
                        variant="subtle"
                        icon={<Trash />}
                        onClick={() => setRemoving(source)}
                        aria-label={`Remove ${source.name}`}
                      >
                        Remove
                      </Button>
                    ) : null}
                    <button
                      type="button"
                      aria-label={
                        open ? `Hide details of ${source.name}` : `Show details of ${source.name}`
                      }
                      aria-expanded={open}
                      onClick={() => setExpanded(open ? null : source.id)}
                      className="rounded-[4px] p-1 text-tertiary transition-colors hover:bg-surface-2 hover:text-primary"
                    >
                      {open ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={`Move ${source.name} up`}
                      disabled={index === 0}
                      onClick={() => actions.promote(source.id, order)}
                      className="rounded-[3px] px-1 text-[11px] text-tertiary transition-colors hover:bg-surface-2 hover:text-primary disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${source.name} down`}
                      disabled={index === sources.length - 1}
                      onClick={() => actions.demote(source.id, order)}
                      className="rounded-[3px] px-1 text-[11px] text-tertiary transition-colors hover:bg-surface-2 hover:text-primary disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? ''}?`}
        description={
          'The pack is deleted from this browser. Nothing you have saved — studies, repertoires, ' +
          'your own games — is touched, and the pack can be installed again.'
        }
        confirmLabel="Remove"
        danger
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          const target = removing;
          setRemoving(null);
          if (target) await removePack(target.id);
        }}
      />
    </div>
  );
}

const Badge = ({ kind }: { readonly kind: SourceKind }) => (
  <span className="rounded-[3px] border border-line px-1.5 py-0.5 text-[10px] text-tertiary">
    {KIND_LABELS[kind]}
  </span>
);

function Facts({ source }: { readonly source: ReferenceSource }) {
  const facts: string[] = [];
  if (source.gameCount !== undefined) facts.push(`${formatCount(source.gameCount)} games`);
  if (source.openableCount !== undefined && source.openableCount !== source.gameCount) {
    facts.push(`${formatCount(source.openableCount)} openable`);
  }
  if (source.playerCount !== undefined) facts.push(`${formatCount(source.playerCount)} players`);
  if (source.positionCount !== undefined) {
    facts.push(`${formatCount(source.positionCount)} positions`);
  }
  if (source.size !== undefined) facts.push(formatSize(source.size));
  facts.push(source.offline ? 'Works offline' : 'Needs a connection');
  if (source.note) facts.push(source.note);
  return <p className="mt-1 text-[11px] text-tertiary">{facts.join(' · ')}</p>;
}

function InstallProgressBar({
  done,
  total,
  phase,
}: {
  readonly done: number;
  readonly total: number;
  readonly phase: string;
}) {
  const share = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <div className="mt-2" data-install-progress>
      <div className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full bg-accent transition-[width]"
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-tertiary">
        {phase === 'verifying'
          ? 'Verifying…'
          : `${formatSize(done)} of ${formatSize(total)} · verifying each file as it arrives`}
      </p>
    </div>
  );
}

function Details({
  source,
  disabled,
  onCapability,
}: {
  readonly source: ReferenceSource;
  readonly disabled: readonly SourceCapability[];
  readonly onCapability: (capability: SourceCapability, enabled: boolean) => void;
}) {
  return (
    <div className="mt-3 space-y-3 border-t border-line-subtle pt-3">
      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-tertiary">
          Use this source for
        </h4>
        <ul className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
          {source.capabilities.map((capability) => (
            <li key={capability} className="flex items-center gap-2">
              <Toggle
                label={`${source.name}: ${CAPABILITY_LABELS[capability]}`}
                checked={!disabled.includes(capability)}
                disabled={!source.installed}
                onChange={(value) => onCapability(capability, value)}
              />
              <span className="truncate text-xs text-secondary">
                {CAPABILITY_LABELS[capability]}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {source.license ? (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-tertiary">
            Licence and provenance
          </h4>
          <p className="mt-1 text-xs text-secondary">
            <a
              href={source.license.url}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline-offset-2 hover:underline"
            >
              {source.license.name}
            </a>
            {source.license.attribution ? ` — ${source.license.attribution}` : null}
          </p>
          {source.provenance ? (
            <p className="mt-1 text-[11px] text-tertiary">
              From{' '}
              <a
                href={source.provenance.url}
                target="_blank"
                rel="noreferrer"
                className="underline-offset-2 hover:underline"
              >
                {source.provenance.source}
              </a>
              , retrieved {source.provenance.retrieved}
              {source.version ? ` · version ${source.version}` : ''}.{' '}
              {source.provenance.transformation}
              {source.provenance.upstream.length > 0
                ? ` Built from ${source.provenance.upstream.length} verified upstream files.`
                : ''}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="flex items-start gap-1.5 text-[11px] text-tertiary">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {source.kind === 'local'
              ? 'Games you imported. Kingfisher makes no claim about where they came from.'
              : source.kind === 'companion'
                ? 'A SQLite collection on this machine, reached through the companion.'
                : 'A remote service. Its terms are its own.'}
          </span>
        </p>
      )}

      {source.installed && source.kind !== 'online' ? (
        <p className="flex items-center gap-1.5 text-[11px] text-tertiary">
          <Check className="h-3.5 w-3.5 text-success" />
          <span>Every file was checked against the digest in its manifest when it was stored.</span>
        </p>
      ) : null}
    </div>
  );
}
