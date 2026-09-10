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
import {
  cancelInstall,
  checkForPackUpdates,
  clearStreamingCache,
  enableStreamingForPack,
  installFromUrl,
  removePack,
  startInstall,
  stopStreamingPack,
  verifyInstalledPack,
} from '@/reference/manager';
import { useDataSources, useSourceActions } from '@/reference/sources';
import { useReferenceSources } from '@/reference/use-references';
import { describeError } from '@/lib/describe-error';
import {
  CAPABILITY_LABELS,
  DEFAULT_SOURCE_PREFERENCE,
  type ReferenceSource,
  type SourceCapability,
  type SourceKind,
} from '@/reference/types';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';
import {
  formatBytesShort,
  readStorageQuota,
  verdictForInstall,
  type StorageQuotaReport,
} from '@/reference/storage-quota';

import { badgeForSource } from './reference-source-state';

const KIND_LABELS: Record<SourceKind, string> = {
  bundled: 'Built in',
  installed: 'Installed',
  catalog: 'Available',
  streaming: 'Streaming',
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
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [installing, setInstalling] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [usingOnline, setUsingOnline] = useState<string | null>(null);
  // A pack install that is too big for the browser's reported free
  // space pauses behind a confirm dialog. The dialog does not block
  // the install — a player who insists on a 5 GB download on a 6 GB
  // device gets to make that call themselves.
  const [pendingInstall, setPendingInstall] = useState<ReferenceSource | null>(null);
  const [quotaReport, setQuotaReport] = useState<StorageQuotaReport | null>(null);

  const requestInstall = async (source: ReferenceSource) => {
    if (!source.installableSize) {
      void startInstall(source.id);
      return;
    }
    const report = await readStorageQuota();
    setQuotaReport(report);
    const verdict = verdictForInstall(report, source.installableSize);
    if (verdict.kind === 'overflows') {
      setPendingInstall(source);
      return;
    }
    void startInstall(source.id);
  };

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
        <Button variant="subtle" className="ml-auto" onClick={() => setAdding((open) => !open)}>
          Install from a URL
        </Button>
        <Button
          variant="subtle"
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

      {adding ? (
        <form
          className="shrink-0 border-b border-line-subtle bg-surface-2 px-4 py-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setInstalling(true);
            const result = await installFromUrl(url.trim());
            setInstalling(false);
            notify({ tone: result.ok ? 'success' : 'error', message: result.message });
            if (result.ok) {
              setUrl('');
              setAdding(false);
            }
          }}
        >
          <label className="block text-xs text-secondary" htmlFor="pack-url">
            Address of a pack’s <code className="font-mono">manifest.json</code>
          </label>
          <p className="mt-0.5 mb-2 text-[11px] text-tertiary">
            Any host that serves a Kingfisher pack. Every chunk is checked against the digest in the
            manifest, exactly as for a catalog pack, and a pack that fails verification leaves
            nothing installed.
          </p>
          <div className="flex gap-2">
            <input
              id="pack-url"
              type="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.org/kingfisher-pack/manifest.json"
              className="h-8 flex-1 rounded-[4px] border border-line bg-surface-1 px-2 text-xs text-primary placeholder:text-tertiary focus:border-accent focus:outline-none"
            />
            <Button type="submit" disabled={installing}>
              {installing ? 'Installing…' : 'Install'}
            </Button>
          </div>
        </form>
      ) : null}

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
                    <StateBadgePill source={source} />
                    {source.inFlightCount && source.inFlightCount > 0 ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-[3px] border border-line px-1.5 py-0.5 text-[10px] text-tertiary"
                        data-streaming-pill
                        aria-label={`${source.inFlightCount} chunks downloading`}
                      >
                        <span
                          className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent"
                          aria-hidden
                        />
                        Downloading {source.inFlightCount} chunk
                        {source.inFlightCount === 1 ? '' : 's'}…
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-tertiary">{source.description}</p>

                  {progress ? (
                    <InstallProgressBar
                      done={progress.bytesDone}
                      total={progress.bytesTotal}
                      phase={progress.phase}
                      reused={progress.bytesReused}
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
                  {open &&
                  source.installed &&
                  (source.kind === 'installed' || source.kind === 'bundled') ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        variant="subtle"
                        disabled={verifying !== null || Boolean(progress)}
                        onClick={async () => {
                          setVerifying(source.id);
                          try {
                            const damaged = await verifyInstalledPack(source.id);
                            notify({
                              tone: damaged.length ? 'error' : 'success',
                              message: damaged.length
                                ? `${damaged.length} chunks failed verification. Reinstall to repair.`
                                : `${source.name}: all chunks verified.`,
                            });
                          } catch (error) {
                            // Phase 29 CH: a verification failure
                            // surfaces the user-facing line, not a
                            // raw exception. The remedy is appended
                            // when one is available.
                            const described = describeError(error);
                            notify({
                              tone: 'error',
                              message: described.remedy
                                ? `${described.message} ${described.remedy}`
                                : described.message || 'Verification failed.',
                            });
                          } finally {
                            setVerifying(null);
                          }
                        }}
                      >
                        {verifying === source.id ? 'Verifying…' : 'Verify integrity'}
                      </Button>
                      <Button
                        variant="subtle"
                        disabled={Boolean(progress) || verifying !== null}
                        onClick={() => void requestInstall(source)}
                      >
                        Reinstall
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <div className="flex items-center gap-1.5">
                    {progress ? (
                      <Button variant="subtle" onClick={() => cancelInstall(source.id)}>
                        Cancel
                      </Button>
                    ) : source.kind === 'catalog' ? (
                      <>
                        <Button
                          variant="subtle"
                          disabled={usingOnline === source.id}
                          onClick={async () => {
                            setUsingOnline(source.id);
                            const result = await enableStreamingForPack(source.id);
                            setUsingOnline(null);
                            notify({
                              tone: result.ok ? 'success' : 'error',
                              message: result.message,
                            });
                          }}
                        >
                          {usingOnline === source.id ? 'Connecting…' : 'Use online'}
                        </Button>
                        <Button icon={<Download />} onClick={() => void requestInstall(source)}>
                          Install
                        </Button>
                      </>
                    ) : source.kind === 'streaming' ? (
                      <>
                        <Button
                          variant="subtle"
                          onClick={() => {
                            clearStreamingCache(source.id);
                            notify({
                              tone: 'info',
                              message: `Cleared the cached chunks for ${source.name}.`,
                            });
                          }}
                        >
                          Clear cache
                        </Button>
                        <Button
                          variant="subtle"
                          icon={<Trash />}
                          onClick={() => {
                            stopStreamingPack(source.id);
                            notify({
                              tone: 'info',
                              message: `${source.name} is no longer used online.`,
                            });
                          }}
                          aria-label={`Stop using ${source.name} online`}
                        >
                          Stop online
                        </Button>
                      </>
                    ) : source.updateAvailable ? (
                      <Button onClick={() => void requestInstall(source)}>Update</Button>
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
      <ConfirmDialog
        open={pendingInstall !== null}
        title={
          pendingInstall?.installableSize
            ? `Install ${pendingInstall.name} (${formatSize(pendingInstall.installableSize)})?`
            : `Install ${pendingInstall?.name ?? ''}?`
        }
        description={
          pendingInstall?.installableSize && quotaReport
            ? (() => {
                const verdict = verdictForInstall(quotaReport, pendingInstall.installableSize);
                if (verdict.kind === 'overflows') {
                  return (
                    'The browser reports ' +
                    formatBytesShort(verdict.shortByBytes) +
                    ' less free space than this pack needs. The download will probably fail. ' +
                    'You can still try — Kingfisher uses online chunks on demand when offline ' +
                    'use is too large, and you can keep working that way without downloading ' +
                    'the whole pack.'
                  );
                }
                if (verdict.kind === 'tight') {
                  return (
                    'The browser reports only ' +
                    formatBytesShort(verdict.headroomBytes) +
                    ' of free space after the install. The download may run out before it finishes.'
                  );
                }
                return (
                  'The browser reports enough free space. Kingfisher will resume the download if it ' +
                  'is interrupted.'
                );
              })()
            : 'Kingfisher will resume the download if it is interrupted.'
        }
        confirmLabel="Install anyway"
        onCancel={() => setPendingInstall(null)}
        onConfirm={() => {
          const target = pendingInstall;
          setPendingInstall(null);
          if (target) void startInstall(target.id);
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

const STATE_TONE_CLASS = {
  neutral: 'border-line text-tertiary',
  positive: 'border-success/40 bg-success/10 text-success',
  accent: 'border-accent/40 bg-accent-muted text-accent',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  danger: 'border-danger/40 bg-danger/10 text-danger',
} as const;

const StateBadgePill = ({ source }: { readonly source: ReferenceSource }) => {
  const badge = badgeForSource(source);
  return (
    <span
      className={`rounded-[3px] border px-1.5 py-0.5 text-[10px] ${STATE_TONE_CLASS[badge.tone]}`}
      title={`Source state: ${badge.label}`}
    >
      {badge.label}
    </span>
  );
};

function Facts({ source }: { readonly source: ReferenceSource }) {
  const facts: string[] = [];
  if (source.freshness) facts.push(source.freshness);
  if (source.gameCount !== undefined) facts.push(`${formatCount(source.gameCount)} games`);
  if (source.openableCount !== undefined && source.openableCount !== source.gameCount) {
    facts.push(`${formatCount(source.openableCount)} openable`);
  }
  if (source.playerCount !== undefined) facts.push(`${formatCount(source.playerCount)} players`);
  if (source.positionCount !== undefined) {
    facts.push(`${formatCount(source.positionCount)} positions`);
  }
  if (source.maxPositionPly !== undefined) {
    facts.push(
      `through ${source.maxPositionPly} plies (${(source.maxPositionPly / 2).toFixed(1).replace('.0', '')} full moves)`,
    );
  }
  if (source.kind === 'streaming') {
    // The brief asks the catalog to communicate four things: WHAT IT
    // IS, HOW FRESH IT IS, HOW LARGE IT IS, HOW IT IS ACCESSED. A
    // streaming source's "HOW IT IS ACCESSED" is the cache state
    // (in-memory + persistent), the install size is "HOW LARGE".
    const cacheBytes = source.cacheBytes ?? 0;
    const persistentBytes = source.persistentCacheBytes ?? 0;
    const cached = cacheBytes + persistentBytes;
    if (cached > 0) {
      facts.push(
        `${formatSize(cached)} cached${persistentBytes > 0 ? ` (${formatSize(persistentBytes)} on disk)` : ''} · ${(source.cacheChunks ?? 0) + (source.persistentCacheChunks ?? 0)} chunks`,
      );
    } else {
      facts.push('Cache empty');
    }
    if (source.installableSize) {
      facts.push(`${formatSize(source.installableSize)} to install for offline`);
    }
    /*
     * A source is "huge" when its logical pack is more than 1 GB.
     * The brief is explicit: do not block online use just because
     * the offline install is huge, but make the size unmistakable
     * on the catalog row so a player who is short on disk can plan
     * for it. The online path remains the recommended default.
     */
    if (source.installableSize && source.installableSize >= 1_000_000_000) {
      facts.push('Use online to avoid downloading the full pack');
    }
  } else if (source.kind === 'installed' || source.kind === 'bundled') {
    facts.push(source.offline ? 'Works offline' : 'Needs a connection');
    if (source.size !== undefined) facts.push(formatSize(source.size));
  } else {
    if (source.size !== undefined) facts.push(formatSize(source.size));
    facts.push(source.offline ? 'Works offline' : 'Needs a connection');
  }
  if (source.note) facts.push(source.note);
  return <p className="mt-1 text-[11px] text-tertiary">{facts.join(' · ')}</p>;
}

function InstallProgressBar({
  done,
  total,
  phase,
  reused,
}: {
  readonly done: number;
  readonly total: number;
  readonly phase: string;
  readonly reused: number;
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
          : reused > 0
            ? `${formatSize(done)} of ${formatSize(total)} · ${formatSize(reused)} reused from the previous install`
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
