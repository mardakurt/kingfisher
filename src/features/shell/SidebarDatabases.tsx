'use client';

/**
 * The databases, listed in the sidebar with their game counts.
 *
 * ChessBase for Mac keeps every database one click away under its sidebar's
 * Databases heading. Kingfisher had them only on the Databases grid, two
 * clicks and a page away from any board. Each row opens that database
 * (`/databases?db=<id>`), and the counts are the collections' own, from the
 * same `listCollections` the grid reads — never an estimate.
 */

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { ChevronDown, ChevronUp, Database, Library } from '@/components/icons';
import { useCompanionStatus } from '@/companion/useCompanion';
import { listCollections } from '@/database/collections/registry';
import { cn } from '@/lib/cn';
import { usePreferences } from '@/stores/preferences-store';

/** Rows shown before "Show more", as ChessBase shows four. */
export const SIDEBAR_DATABASES_SHOWN = 4;

/** 9,876 as is; 12,282,170 as 12.3M — the sidebar has room for five characters. */
export function sidebarCount(games: number | null): string {
  if (games === null) return '—';
  if (games < 10_000) return games.toLocaleString('en');
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
    .format(games)
    .replace('K', 'k');
}

const ROW =
  'flex h-[28px] items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 text-[13px] transition-colors';
const IDLE =
  'text-primary/85 hover:bg-black/[0.04] hover:text-primary active:bg-black/[0.08] dark:hover:bg-white/[0.06] dark:active:bg-white/[0.11]';
const ACTIVE =
  'bg-black/[0.075] font-medium text-primary dark:bg-white/[0.1] active:bg-black/[0.11] dark:active:bg-white/[0.14]';

export function SidebarDatabases({ onNavigate }: { readonly onNavigate?: () => void }) {
  const pathname = usePathname();
  const openId = useSearchParams().get('db');
  const referenceProviderId = usePreferences((state) => state.explorerSourceId);
  const companion = useCompanionStatus();
  const [expanded, setExpanded] = useState(false);

  // The grid's query key, so the two share one read and one invalidation.
  const collections = useQuery({
    queryKey: ['collections', referenceProviderId, companion.data?.databases.length ?? 0],
    retry: false,
    staleTime: 30_000,
    queryFn: () => listCollections(referenceProviderId),
  });

  const list = collections.data ?? [];
  const shown = expanded ? list : list.slice(0, SIDEBAR_DATABASES_SHOWN);
  const onDatabases = pathname.startsWith('/databases');

  if (list.length === 0) return null;

  return (
    <ul
      className="mt-px flex flex-col gap-px pl-4"
      aria-label="Databases"
      data-sidebar-databases=""
    >
      {shown.map((collection) => {
        const active = onDatabases && openId === collection.id;
        return (
          <li key={collection.id}>
            <Link
              href={`/databases?db=${encodeURIComponent(collection.id)}`}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              title={`${collection.name} — ${
                collection.games === null
                  ? 'count unavailable'
                  : `${collection.games.toLocaleString('en')} games`
              } · ${collection.location}`}
              data-sidebar-database={collection.id}
              className={cn(ROW, active ? ACTIVE : IDLE)}
            >
              {collection.kind === 'sqlite' ? (
                <Database className="h-[15px] w-[15px] shrink-0 text-tertiary" />
              ) : (
                <Library className="h-[15px] w-[15px] shrink-0 text-accent-ink" />
              )}
              <span className="min-w-0 flex-1 truncate">{collection.name}</span>
              <span className="shrink-0 text-[11px] text-tertiary tabular">
                {sidebarCount(collection.games)}
              </span>
            </Link>
          </li>
        );
      })}
      {list.length > SIDEBAR_DATABASES_SHOWN ? (
        <li>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className={cn(ROW, IDLE, 'w-full text-secondary')}
          >
            {expanded ? (
              <ChevronUp className="h-[15px] w-[15px] shrink-0" />
            ) : (
              <ChevronDown className="h-[15px] w-[15px] shrink-0" />
            )}
            <span>
              {expanded ? 'Show less' : `Show ${list.length - SIDEBAR_DATABASES_SHOWN} more`}
            </span>
          </button>
        </li>
      ) : null}
    </ul>
  );
}
