'use client';

/**
 * The tag row: every tag in use, most recently used first, and what is
 * selected. Selecting several narrows — a study must carry all of them —
 * because a filter that returns more as you add to it is not a filter
 * (`docs/design/organising-work.md`).
 */

import { tagCounts } from '@/persistence/tags';
import { cn } from '@/lib/cn';

export function TagFilter({
  records,
  selected,
  onToggle,
  onClear,
  label,
}: {
  readonly records: readonly { readonly tags?: readonly string[]; readonly updatedAt?: number }[];
  readonly selected: readonly string[];
  readonly onToggle: (tag: string) => void;
  readonly onClear: () => void;
  readonly label: string;
}) {
  const counts = tagCounts(records);
  if (counts.length === 0 && selected.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-line-subtle px-2 py-1.5">
      <span className="sr-only">{label}</span>
      {counts.map((entry) => {
        const active = selected.includes(entry.tag);
        return (
          <button
            key={entry.tag}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(entry.tag)}
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10.5px]',
              active
                ? 'border-accent/70 bg-accent-muted text-primary'
                : 'border-line text-secondary hover:bg-surface-2',
            )}
          >
            {entry.tag}
            <span className="ml-1 text-tertiary tabular">{entry.count}</span>
          </button>
        );
      })}
      {selected.length ? (
        <button type="button" onClick={onClear} className="text-[10.5px] text-tertiary underline">
          Clear
        </button>
      ) : null}
    </div>
  );
}
