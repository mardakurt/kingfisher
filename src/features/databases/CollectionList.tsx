'use client';

/**
 * The list of collections, and the one place they are selected from.
 *
 * Multi-select is a checkbox rather than a modifier-click because the two
 * multi-collection workflows — search several at once, find duplicates across
 * several — are things a user goes looking for, and a hidden interaction is a
 * feature nobody finds. Single-click still selects one collection and shows its
 * detail, which is what the great majority of visits want.
 */

import { Check, Database, Warning } from '@/components/icons';
import type { CollectionFacts } from '@/database/collections/types';
import { cn } from '@/lib/cn';

interface CollectionListProps {
  readonly collections: readonly CollectionFacts[];
  readonly focusedId: string | null;
  readonly checked: ReadonlySet<string>;
  readonly onFocus: (id: string) => void;
  readonly onToggle: (id: string) => void;
}

export function CollectionList({
  collections,
  focusedId,
  checked,
  onFocus,
  onToggle,
}: CollectionListProps) {
  return (
    <ul className="p-2" aria-label="Collections">
      {collections.map((collection) => (
        <li key={collection.id} className="mb-1 flex items-stretch gap-1">
          <label
            className="flex shrink-0 cursor-pointer items-center rounded-[4px] px-1.5 hover:bg-surface-2"
            title={`Include ${collection.name} in multi-collection search and duplicate detection`}
          >
            <input
              type="checkbox"
              checked={checked.has(collection.id)}
              onChange={() => onToggle(collection.id)}
              aria-label={`Include ${collection.name}`}
              className="accent-[var(--accent)]"
            />
          </label>
          <button
            type="button"
            onClick={() => onFocus(collection.id)}
            aria-current={collection.id === focusedId}
            className={cn(
              'flex min-w-0 flex-1 items-start gap-2 rounded-[4px] border px-2 py-2 text-left transition-colors',
              collection.id === focusedId
                ? 'border-accent/70 bg-accent-muted'
                : 'border-transparent hover:border-line hover:bg-surface-2',
            )}
          >
            <Database className="mt-0.5 h-4 w-4 shrink-0 text-tertiary" />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary">
                  {collection.name}
                </span>
                {collection.reference ? (
                  <span
                    className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-accent"
                    title="The explorer's default source"
                  >
                    Ref
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-tertiary tabular">
                {collection.games === null
                  ? 'count unavailable'
                  : `${collection.games.toLocaleString()} games`}
                {' · '}
                {collection.kind === 'sqlite' ? 'SQLite' : 'IndexedDB'}
                {/*
                  A size only where it is this collection's size. A SQLite
                  collection is one file and can be measured; the IndexedDB one
                  shares an origin with studies, repertoires, training and now
                  the reference packs, so the only figure available is the
                  origin's — which read as "0 games · 9.6 MB" and looked like a
                  bug. The origin total is on the Storage panel, labelled.
                */}
                {collection.kind === 'sqlite' && collection.bytes !== null
                  ? ` · ${formatBytes(collection.bytes)}`
                  : ''}
              </span>
            </span>
          </button>
        </li>
      ))}
      {collections.length === 0 ? (
        <li className="px-3 py-6 text-xs text-tertiary">
          No collections. Import a PGN to start one, or pair the companion for SQLite collections.
        </li>
      ) : null}
    </ul>
  );
}

/** Shared with the detail pane, so one collection reads the same size twice. */
export function formatBytes(value: number): string {
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)} kB`;
  if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(1)} MB`;
  return `${(value / 1_000_000_000).toFixed(2)} GB`;
}

/** A small status chip that never says "OK" about something it has not checked. */
export function StatusChip({
  label,
  state,
}: {
  readonly label: string;
  readonly state: 'good' | 'warn' | 'unknown';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5 text-[10px]',
        state === 'good'
          ? 'border-positive/40 bg-positive/10 text-positive'
          : state === 'warn'
            ? 'border-caution/40 bg-caution/10 text-caution'
            : 'border-line text-tertiary',
      )}
    >
      {state === 'good' ? (
        <Check className="h-3 w-3" />
      ) : state === 'warn' ? (
        <Warning className="h-3 w-3" />
      ) : null}
      {label}
    </span>
  );
}
