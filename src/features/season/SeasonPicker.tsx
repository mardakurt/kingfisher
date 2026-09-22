'use client';

/**
 * The named-set picker.
 *
 * One control: a `Segmented` of the four kinds (`last`, `event`, `site`,
 * `opening`) above a single-line `Select` listing the matching options.
 * The URL parameter changes when either the kind or the option changes;
 * the page reads the URL via `useSearchParams`.
 *
 * The picker refuses a mixed-source set without an explicit `allowMixed`
 * toggle — the design says the reader refuses too, so the toggle has to
 * be reachable here.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import { Toggle } from '@/components/ui/Toggle';
import {
  describeNamedSet,
  eventOptions,
  namedSetUrl,
  openingOptions,
  SEASON_LAST_DAYS,
  siteOptions,
  type SeasonKind,
  type SeasonNamedSet,
} from '@/season/named-set';
import type { GameSummary } from '@/persistence/types';

interface SeasonPickerProps {
  readonly games: readonly GameSummary[];
  readonly predicate: SeasonNamedSet | null;
}

const KIND_LABEL: Record<SeasonKind, string> = {
  last: 'Last N days',
  event: 'Event',
  site: 'Site',
  opening: 'Opening',
};

export function SeasonPicker({ games, predicate }: SeasonPickerProps) {
  const router = useRouter();
  const params = useSearchParams();
  const kind: SeasonKind = predicate?.kind ?? 'last';

  const eventList = useMemo(() => eventOptions(games), [games]);
  const siteList = useMemo(() => siteOptions(games), [games]);
  const openingList = useMemo(() => openingOptions(games), [games]);

  const navigateTo = useCallback(
    (next: SeasonNamedSet) => {
      router.push(namedSetUrl(next));
    },
    [router],
  );

  const setKind = (next: SeasonKind) => {
    if (next === kind && predicate) return;
    // Switching kinds resets to a sensible default within that kind.
    if (next === 'last') {
      navigateTo({ kind: 'last', value: '90' });
    } else if (next === 'event' && eventList[0]) {
      navigateTo({ kind: 'event', value: eventList[0] });
    } else if (next === 'site' && siteList[0]) {
      navigateTo({ kind: 'site', value: siteList[0] });
    } else if (next === 'opening' && openingList[0]) {
      navigateTo({ kind: 'opening', value: openingList[0] });
    } else {
      navigateTo({ kind: next, value: '' });
    }
  };

  const setValue = (value: string) => {
    if (!value) return;
    if (!predicate) return;
    navigateTo({ ...predicate, value });
  };

  const setAllowMixed = (next: boolean) => {
    if (!predicate) return;
    navigateTo({ ...predicate, allowMixed: next });
  };

  const options = currentOptions(kind, { eventList, siteList, openingList });
  const noOptions = kind !== 'last' && options.length === 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Named-set kind" className="flex gap-1 rounded-md border border-line-subtle bg-surface-1 p-1">
          {(Object.keys(KIND_LABEL) as SeasonKind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={k === kind}
              onClick={() => setKind(k)}
              className="rounded px-3 py-1 text-sm transition-colors"
              style={{
                background: k === kind ? 'var(--accent)' : 'transparent',
                color: k === kind ? 'var(--accent-foreground)' : 'var(--text-secondary)',
              }}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        {kind === 'last' ? (
          <select
            aria-label="Days"
            value={predicate?.value ?? '90'}
            onChange={(event) => navigateTo({ kind: 'last', value: event.target.value })}
            className="rounded-md border border-line-subtle bg-surface-1 px-2 py-1 text-sm"
          >
            {SEASON_LAST_DAYS.map((days) => (
              <option key={days} value={days}>
                {days} days
              </option>
            ))}
          </select>
        ) : noOptions ? (
          <span className="text-sm text-secondary">
            No {KIND_LABEL[kind].toLowerCase()}s in your games.
          </span>
        ) : (
          <select
            aria-label={KIND_LABEL[kind]}
            value={predicate?.value ?? ''}
            onChange={(event) => setValue(event.target.value)}
            className="rounded-md border border-line-subtle bg-surface-1 px-2 py-1 text-sm"
          >
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        )}
        {predicate && (
          <label className="ml-2 flex items-center gap-2 text-sm text-secondary">
            <Toggle
              label="Allow mixed sources (OTB + Lichess + Chess.com)"
              checked={Boolean(predicate.allowMixed)}
              onChange={setAllowMixed}
            />
            <span>All sources</span>
          </label>
        )}
      </div>
      {predicate && (
        <div className="text-xs text-secondary">
          {describeNamedSet(predicate)}
          {predicate.allowMixed ? ' · all sources' : ''}
          {params?.toString() ? ` · /${params.toString()}` : ''}
        </div>
      )}
    </div>
  );
}

interface OptionLists {
  readonly eventList: readonly string[];
  readonly siteList: readonly string[];
  readonly openingList: readonly string[];
}

const currentOptions = (kind: SeasonKind, lists: OptionLists): readonly string[] => {
  switch (kind) {
    case 'last':
      return [];
    case 'event':
      return lists.eventList;
    case 'site':
      return lists.siteList;
    case 'opening':
      return lists.openingList;
  }
};
