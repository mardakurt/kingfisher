'use client';

/**
 * The review queue: positions waiting, positions dealt with.
 *
 * Marking a position critical during analysis is a note to yourself, and until
 * now that note went nowhere — the mark lived in the game tree, where it could
 * not be counted, filtered or worked through. This is the work list those
 * marks were always implying.
 *
 * The queue never fills itself. Suggested candidates arrive only when the
 * player asks for them, each carrying the facts that produced it, and every
 * one can be ignored in a single click. A study system that floods its own
 * inbox is a study system people stop opening.
 *
 * When a row is selected the panel expands to show the same Compare Sources
 * surface the Explorer uses — the same component, not a duplicate.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import type { Fen } from '@/chess/types';
import { Button } from '@/components/ui/Button';
import { EmptyState, Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Tabs';
import { invalidateReview } from '@/features/persistence/queries';
import { getRepositories } from '@/persistence/repositories';
import type { ReviewCategory, ReviewItemRecord, ReviewStatus } from '@/persistence/domain';
import { themeLabel } from '@/persistence/domain';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import { cn } from '@/lib/cn';

import { ReviewSourceComparison } from './ReviewSourceComparison';
import { StrategicContextCard } from './StrategicContextCard';
import { useReviewItems } from './queries';

const CATEGORIES: readonly { readonly id: ReviewCategory | 'all'; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'opening', label: 'Opening' },
  { id: 'calculation', label: 'Calculation' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'endgame', label: 'Endgame' },
  { id: 'time-trouble', label: 'Time trouble' },
];

const STATUS_TABS: readonly { readonly id: ReviewStatus; readonly label: string }[] = [
  { id: 'unreviewed', label: 'Waiting' },
  { id: 'reviewed', label: 'Reviewed' },
  { id: 'converted', label: 'Training' },
];

export function CriticalInbox({
  selectedId,
  onOpen,
}: {
  readonly selectedId: string | null;
  readonly onOpen: (item: ReviewItemRecord) => void;
}) {
  const client = useQueryClient();
  const router = useRouter();
  const notify = useUi((state) => state.notify);
  const openDocument = useAnalysis((state) => state.openDocument);
  const [status, setStatus] = useState<ReviewStatus>('unreviewed');
  const [category, setCategory] = useState<ReviewCategory | 'all'>('all');
  const items = useReviewItems(status);

  const listed = (items.data ?? []).filter(
    (item) => category === 'all' || item.category === category,
  );

  const act = async (
    item: ReviewItemRecord,
    update: Parameters<
      Awaited<ReturnType<typeof getRepositories>>['review']['updateReviewItem']
    >[2],
  ) => {
    try {
      const repositories = await getRepositories();
      await repositories.review.updateReviewItem(item.id, item.revision, update);
      invalidateReview(client);
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That could not be saved.',
      });
    }
  };

  const openInAnalysis = async (item: ReviewItemRecord) => {
    if (!item.gameId) return;
    const repositories = await getRepositories();
    const game = await repositories.games.get(item.gameId);
    if (!game) {
      notify({ tone: 'error', message: 'That game is no longer in your database.' });
      return;
    }
    openDocument({
      tree: game.tree,
      document: {
        kind: 'database-game',
        title: item.gameLabel ?? 'Game',
        gameId: game.id,
      },
      ...(item.nodeId && game.tree.nodes[item.nodeId] ? { currentId: item.nodeId } : {}),
    });
    router.push('/analysis');
  };

  const selectedItem = selectedId ? (listed.find((item) => item.id === selectedId) ?? null) : null;

  return (
    <Panel className="h-full border-0">
      <PanelHeader
        actions={<span className="text-[10px] text-tertiary tabular">{listed.length}</span>}
      >
        Review queue
      </PanelHeader>
      <div className="shrink-0 border-b border-line-subtle px-2 py-1.5">
        <Segmented items={STATUS_TABS} value={status} onChange={setStatus} />
        <div className="mt-1.5 flex flex-wrap gap-1">
          {CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={category === entry.id}
              onClick={() => setCategory(entry.id)}
              className={cn(
                'rounded-full border px-2 py-0.5 text-[10.5px] transition-colors',
                category === entry.id
                  ? 'border-accent bg-accent-muted text-primary'
                  : 'border-line-subtle text-tertiary hover:border-line hover:text-secondary',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>
      <PanelBody className="overflow-y-auto p-0">
        {items.isPending ? (
          <p className="px-3 py-4 text-xs text-tertiary">Reading your review queue…</p>
        ) : listed.length === 0 ? (
          <EmptyState
            title={
              status === 'unreviewed'
                ? 'Nothing waiting.'
                : 'No position has been worked through yet.'
            }
            description={
              status === 'unreviewed'
                ? 'Mark a position critical while analysing, or ask for review candidates from an analysed game.'
                : 'Positions you have worked through will appear here.'
            }
          />
        ) : (
          <>
            {selectedItem ? (
              <div className="border-b border-line-subtle">
                {selectedItem.strategicContext ? (
                  <StrategicContextCard transitions={selectedItem.strategicContext} />
                ) : null}
                <ReviewSourceComparison fen={selectedItem.fen as Fen} />
              </div>
            ) : null}
            <ol className="divide-y divide-line-subtle">
              {listed.map((item) => (
                <li
                  key={item.id}
                  className={cn('px-3 py-2', selectedId === item.id && 'bg-accent-muted')}
                >
                  <button
                    type="button"
                    onClick={() => onOpen(item)}
                    className="block w-full text-left"
                  >
                    <span className="block truncate text-[11.5px] text-primary">
                      {item.gameLabel ?? 'Position'}
                      {item.ply ? (
                        <span className="text-tertiary"> · move {Math.ceil(item.ply / 2)}</span>
                      ) : null}
                    </span>
                    {item.reason ? (
                      <span className="mt-0.5 block text-[10.5px] leading-relaxed text-secondary">
                        {item.reason}
                      </span>
                    ) : null}
                    {item.signals.length > 0 ? (
                      <span className="mt-0.5 block text-[10px] text-tertiary">
                        {item.signals.map((signal) => signal.detail).join(' · ')}
                      </span>
                    ) : null}
                    {item.themes.length > 0 ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {item.themes.map((theme) => (
                          <span
                            key={theme}
                            className="rounded-full border border-line-subtle px-1.5 text-[10px] text-tertiary"
                          >
                            {themeLabel(theme)}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </button>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {item.gameId ? (
                      <Button variant="ghost" onClick={() => void openInAnalysis(item)}>
                        Open game
                      </Button>
                    ) : null}
                    {item.status === 'unreviewed' ? (
                      <>
                        <Button
                          variant="ghost"
                          onClick={() => void act(item, { status: 'ignored' })}
                        >
                          Ignore
                        </Button>
                        {item.category ? null : (
                          <Button
                            variant="ghost"
                            onClick={() => void act(item, { category: 'calculation' })}
                          >
                            Mark critical
                          </Button>
                        )}
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </PanelBody>
    </Panel>
  );
}
