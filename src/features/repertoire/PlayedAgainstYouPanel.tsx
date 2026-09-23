'use client';

/**
 * Played against you — the repertoire read in the order it is met.
 *
 * Two columns, two populations, kept apart: how many of *your* games (your
 * colour, by your profile aliases) reached each position, and how many of a
 * named pack's did. Most met first; a toggle shows the other end — the
 * positions none of your games reached and the population hardly does —
 * because that is where drilling time goes to waste. Nothing here says a
 * line is good; it says how often you will need it.
 */
import { useMemo, useState } from 'react';

import { useDatabaseProviders } from '@/database/use-database-providers';
import type { ChessDatabaseProvider } from '@/database/types';
import { useProfile } from '@/features/persistence/queries';
import type { RepertoireWithPositions } from '@/persistence/domain';
import { neverReached, rankByReach, RARE_SHARE, referenceShare } from '@/repertoire/reach';
import { cn } from '@/lib/cn';

import { useRepertoireReach } from './reach';
import { SOURCES, type SourceId } from './sources';

const percent = (share: number) => `${(share * 100).toFixed(share < 0.01 ? 2 : 1)}%`;

export function PlayedAgainstYouPanel({
  repertoire,
  selectedId,
  onSelect,
}: {
  readonly repertoire: RepertoireWithPositions | null;
  readonly selectedId: string | null;
  readonly onSelect: (positionId: string) => void;
}) {
  const providers = useDatabaseProviders();
  const [sourceId, setSourceId] = useState<SourceId>('kingfisher-starter');
  const provider = useMemo(
    () => (providers.find((entry) => entry.id === sourceId) as ChessDatabaseProvider) ?? null,
    [providers, sourceId],
  );
  const profile = useProfile();
  const aliases = profile.data?.aliases ?? [];
  const reach = useRepertoireReach(repertoire, provider, aliases);
  const [view, setView] = useState<'most' | 'never'>('most');
  const [expanded, setExpanded] = useState(false);

  if (!repertoire || repertoire.positions.length === 0) return null;

  const rows = reach.data?.rows ?? [];
  const list = view === 'most' ? rankByReach(rows) : neverReached(rows, RARE_SHARE);
  const shown = expanded ? list : list.slice(0, 8);
  const sourceName = reach.data?.source?.name ?? SOURCES.find((s) => s.id === sourceId)?.label;

  return (
    <section className="shrink-0 border-b border-line-subtle" data-played-against-you>
      <div className="flex h-8 items-center gap-2 px-3">
        <h2 className="text-[10px] text-tertiary">Played against you</h2>
        <select
          aria-label="Reference population"
          value={sourceId}
          onChange={(event) => setSourceId(event.target.value as SourceId)}
          className="ml-auto h-6 rounded-[5px] border border-line bg-surface-inset px-1.5 text-[10px] text-primary outline-none focus:border-accent/60"
        >
          {SOURCES.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1 border-t border-line-subtle px-3 py-1 text-[10px]">
        <button
          type="button"
          onClick={() => setView('most')}
          aria-pressed={view === 'most'}
          className={cn(
            'rounded px-1.5 py-0.5',
            view === 'most' ? 'bg-surface-2 text-primary' : 'text-tertiary',
          )}
        >
          Most met
        </button>
        <button
          type="button"
          onClick={() => setView('never')}
          aria-pressed={view === 'never'}
          className={cn(
            'rounded px-1.5 py-0.5',
            view === 'never' ? 'bg-surface-2 text-primary' : 'text-tertiary',
          )}
        >
          Never reached
        </button>
        <span className="ml-auto text-tertiary tabular" data-played-against-you-status>
          {reach.isPending
            ? 'Counting…'
            : reach.data?.ownIsEveryGame
              ? `all ${reach.data.ownOf} local games`
              : `${reach.data?.ownOf ?? 0} of your games`}
        </span>
      </div>
      {reach.data && !reach.data.ownIsEveryGame ? null : reach.data ? (
        <p className="border-t border-line-subtle px-3 py-1.5 text-[10px] text-tertiary">
          Counted over every local game: add your name under Settings → Profile to count only yours.
        </p>
      ) : null}
      {reach.isError ? (
        <p className="border-t border-line-subtle px-3 py-2 text-[10.5px] text-tertiary">
          The counts could not be read.
        </p>
      ) : !reach.isPending && list.length === 0 ? (
        <p className="border-t border-line-subtle px-3 py-2 text-[10.5px] text-tertiary">
          {view === 'never'
            ? `Every position was reached in your games or in more than ${percent(RARE_SHARE)} of ${sourceName}.`
            : 'Nothing to count yet.'}
        </p>
      ) : (
        <ol className="max-h-56 overflow-y-auto border-t border-line-subtle">
          <li className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-1 text-[9.5px] text-tertiary">
            <span>Position</span>
            <span className="text-right">Yours</span>
            <span className="text-right">{sourceName}</span>
          </li>
          {shown.map((row) => {
            const line = row.position.moves.map((move) => move.san).join(' / ') || 'Position note';
            return (
              <li key={row.position.id}>
                <button
                  type="button"
                  onClick={() => onSelect(row.position.id)}
                  title={line}
                  data-reach-row={row.position.positionKey}
                  className={cn(
                    'grid w-full grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-1 text-left text-[10.5px] transition-colors hover:bg-surface-2',
                    row.position.id === selectedId ? 'bg-surface-2 text-primary' : 'text-secondary',
                  )}
                >
                  <span className="truncate">
                    <span className="text-tertiary tabular">d{row.position.depth}</span> {line}
                  </span>
                  <span className="text-right tabular" data-reach-own>
                    {row.own ?? '…'}
                  </span>
                  <span className="text-right tabular" data-reach-reference>
                    {row.reference ? percent(referenceShare(row.reference)) : '—'}
                  </span>
                </button>
              </li>
            );
          })}
          {list.length > 8 ? (
            <li className="px-3 py-1">
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="text-[10px] text-accent hover:underline"
              >
                {expanded ? 'Show fewer' : `Show all ${list.length}`}
              </button>
            </li>
          ) : null}
        </ol>
      )}
    </section>
  );
}
