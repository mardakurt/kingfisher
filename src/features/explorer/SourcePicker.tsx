'use client';

/**
 * Choosing which database the explorer is reading.
 *
 * A `<select>` of names was not enough once there were reference packs: the
 * one thing a user needs to know before trusting a number is *what kind of
 * thing* produced it — data on this machine, a service that needs a
 * connection, or a pack that is not installed. So each source carries its
 * state, and the ones that cannot answer say why instead of being silently
 * absent.
 */

import { Check, Download, Warning } from '@/components/icons';
import { cn } from '@/lib/cn';
import type { ReferenceSource, SourceKind } from '@/reference/types';

const KIND_LABEL: Record<SourceKind, string> = {
  bundled: 'Built in',
  installed: 'Installed',
  catalog: 'Not installed',
  online: 'Online',
  local: 'This device',
  companion: 'Companion',
};

export function SourcePicker({
  sources,
  value,
  onChange,
  className,
}: {
  readonly sources: readonly ReferenceSource[];
  readonly value: string;
  readonly onChange: (id: string) => void;
  readonly className?: string;
}) {
  const selected = sources.find((source) => source.id === value);
  return (
    <div className={className}>
      <select
        aria-label="Evidence source"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 w-full rounded-[3px] border border-line bg-surface-inset px-1.5 text-[11px] text-secondary outline-none focus:border-accent/60"
      >
        {sources.map((source) => (
          <option key={source.id} value={source.id} disabled={!source.installed}>
            {source.name} — {KIND_LABEL[source.kind]}
            {source.installed ? '' : ' (install first)'}
          </option>
        ))}
      </select>
      {selected ? (
        <p className="mt-1 flex items-start gap-1 text-[10px] text-tertiary">
          {selected.offline ? (
            <Check className="mt-[1px] h-3 w-3 shrink-0 text-success" />
          ) : (
            <Warning className="mt-[1px] h-3 w-3 shrink-0" />
          )}
          <span>
            {selected.offline ? 'Answers without a network.' : 'Needs a network connection.'}
            {selected.gameCount !== undefined
              ? ` ${selected.gameCount.toLocaleString()} games.`
              : ''}
            {selected.license ? ` ${selected.license.id}.` : ''}
          </span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * The banner shown when the chosen source could not answer.
 *
 * §83: never blank the explorer, and never switch the evidence underneath
 * somebody without saying so. The fallback is offered as a button rather than
 * applied automatically — a statistic that quietly came from a different
 * population than the one named above it is the worst thing this panel could
 * do.
 */
export function SourceFallback({
  failed,
  fallback,
  reason,
  onUse,
}: {
  readonly failed: string;
  readonly fallback: ReferenceSource;
  readonly reason: string;
  readonly onUse: () => void;
}) {
  return (
    <div
      className="m-2.5 rounded-[4px] border border-caution/40 bg-caution/10 p-2.5"
      data-source-fallback
    >
      <p className="text-[11px] text-primary">{failed} could not answer.</p>
      <p className="mt-0.5 text-[10.5px] text-tertiary">{reason}</p>
      <button
        type="button"
        onClick={onUse}
        className={cn(
          'mt-2 inline-flex h-7 items-center gap-1.5 rounded-[4px] border border-line-strong',
          'bg-surface-1 px-2 text-[11px] text-primary transition-colors hover:border-accent',
        )}
      >
        <Download className="h-3.5 w-3.5" />
        Show {fallback.name} instead
      </button>
    </div>
  );
}
