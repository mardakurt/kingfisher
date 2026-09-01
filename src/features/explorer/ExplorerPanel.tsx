'use client';

import { useMemo } from 'react';

import { DatabaseError, moveScore, type DatabaseMove } from '@/database/types';
import { databaseProviders } from '@/database/registry';
import { Button } from '@/components/ui/Button';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Tabs';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { cn } from '@/lib/cn';
import { useAnalysis } from '@/stores/analysis-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

import { useExplorer } from './useExplorer';

/**
 * What strong players actually play here.
 *
 * The table answers three different questions at once — how popular a move is,
 * how it scores, and at what level it is played — because those three are
 * routinely in conflict and the difference is the interesting part.
 */
export function ExplorerPanel() {
  const { node, position } = useAnalysisPosition();
  const prefs = usePreferences();
  const play = useAnalysis((state) => state.play);
  const notify = useUi((state) => state.notify);

  const filters = useMemo(
    () => ({
      ...(prefs.explorerMinRating ? { minRating: prefs.explorerMinRating } : {}),
      ...(prefs.explorerSinceYear ? { sinceYear: prefs.explorerSinceYear } : {}),
    }),
    [prefs.explorerMinRating, prefs.explorerSinceYear],
  );

  const query = useExplorer(prefs.explorerSourceId, node.fen, filters);
  const result = query.data;
  const total = result?.totalGames ?? 0;

  const playMove = (move: DatabaseMove) => {
    const legal = position.playUci(move.uci);
    if (!legal.ok) {
      notify({ tone: 'error', message: `The database move ${move.san} is not legal here.` });
      return;
    }
    const played = play({
      from: legal.value.from,
      to: legal.value.to,
      ...(legal.value.promotion ? { promotion: legal.value.promotion } : {}),
    });
    if (!played.ok) notify({ tone: 'error', message: played.error.message });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader
        actions={
          <Segmented
            items={databaseProviders().map((provider) => ({
              id: provider.id,
              label: provider.name,
            }))}
            value={prefs.explorerSourceId}
            onChange={(value) => prefs.set('explorerSourceId', value)}
          />
        }
      >
        {result?.opening ? (
          <span className="truncate normal-case tracking-normal text-secondary">
            {result.opening.eco && (
              <span className="mr-1.5 font-mono text-tertiary">{result.opening.eco}</span>
            )}
            {result.opening.name}
          </span>
        ) : (
          <span>Explorer</span>
        )}
      </PanelHeader>

      {result && total > 0 && (
        <div className="shrink-0 px-2.5 pb-1.5 pt-2">
          <ResultBar white={result.white} draws={result.draws} black={result.black} />
          <div className="mt-1 flex justify-between text-[10.5px] text-tertiary tabular">
            <span>{total.toLocaleString()} games</span>
            <span>
              {percent(result.white, total)} / {percent(result.draws, total)} /{' '}
              {percent(result.black, total)}
            </span>
          </div>
        </div>
      )}

      <PanelBody>
        {query.isPaused ? (
          <EmptyState
            title="This database needs a connection"
            description="The browser reports that it is offline, so the lookup is waiting. Your own games are always available."
            action={
              <Button
                variant="subtle"
                onClick={() => prefs.set('explorerSourceId', 'local-collection')}
              >
                Use my own games instead
              </Button>
            }
          />
        ) : query.isPending ? (
          <EmptyState title="Looking up this position…" />
        ) : query.isError ? (
          <EmptyState
            title={query.error instanceof Error ? query.error.message : 'The lookup failed.'}
            description={
              query.error instanceof DatabaseError && query.error.remedy
                ? query.error.remedy
                : 'Try another database, or check your connection.'
            }
            action={
              prefs.explorerSourceId !== 'local-collection' ? (
                <Button
                  variant="subtle"
                  onClick={() => prefs.set('explorerSourceId', 'local-collection')}
                >
                  Use my own games instead
                </Button>
              ) : null
            }
          />
        ) : !result || result.moves.length === 0 ? (
          <EmptyState
            title="No games reach this position"
            description={
              prefs.explorerSourceId === 'local-collection'
                ? 'No games stored on this device reach this position. Import a PGN collection to expand your local explorer.'
                : 'The position is outside this database, which usually means you have left known theory.'
            }
          />
        ) : (
          <table className="w-full text-[11.5px]">
            <thead className="sticky top-0 z-10 bg-surface-1">
              <tr className="text-[10px] uppercase tracking-wide text-tertiary">
                <th className="px-2.5 py-1 text-left font-medium">Move</th>
                <th className="w-[70px] px-1.5 py-1 text-right font-medium sm:w-[86px] sm:px-2">
                  Games
                </th>
                <th className="w-[82px] px-1.5 py-1 text-left font-medium sm:w-[96px] sm:px-2">
                  Score
                </th>
                <th className="w-[46px] py-1 text-right font-medium max-[419px]:hidden">Avg</th>
                <th className="w-[54px] px-2.5 py-1 text-right font-medium max-[419px]:hidden">
                  Perf
                </th>
              </tr>
            </thead>
            <tbody>
              {result.moves.map((move) => (
                <tr
                  key={move.uci}
                  onClick={() => playMove(move)}
                  className="cursor-pointer border-t border-line-subtle transition-colors hover:bg-surface-2"
                >
                  <td className="px-2.5 py-1 font-medium text-primary">{move.san}</td>
                  <td className="px-1.5 py-1 text-right tabular sm:px-2">
                    <span className="text-secondary">{compact(move.games)}</span>
                    <span className="ml-1.5 text-tertiary">{percent(move.games, total)}</span>
                  </td>
                  <td className="px-1.5 py-1 sm:px-2">
                    <ResultBar
                      white={move.white}
                      draws={move.draws}
                      black={move.black}
                      compact
                      title={`${move.white} / ${move.draws} / ${move.black}`}
                    />
                  </td>
                  <td className="py-1 text-right text-tertiary tabular max-[419px]:hidden">
                    {move.averageRating ?? '—'}
                  </td>
                  <td
                    className={cn(
                      'px-2.5 py-1 text-right tabular',
                      'max-[419px]:hidden',
                      performanceTone(move, position.turn),
                    )}
                  >
                    {move.performance ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {result && result.topGames && result.topGames.length > 0 && (
          <div className="border-t border-line-subtle px-2.5 py-2">
            <h3 className="mb-1 text-[10px] uppercase tracking-wide text-tertiary">Top games</h3>
            <ul className="flex flex-col gap-0.5">
              {result.topGames.map((game) => (
                <li key={game.id} className="flex items-baseline gap-2 text-[11px]">
                  <span className="min-w-0 flex-1 truncate text-secondary">
                    {game.white} – {game.black}
                  </span>
                  <span className="shrink-0 text-tertiary tabular">{game.result}</span>
                  <span className="w-8 shrink-0 text-right text-tertiary tabular">
                    {game.year ?? ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PanelBody>
    </div>
  );
}

interface ResultBarProps {
  readonly white: number;
  readonly draws: number;
  readonly black: number;
  readonly compact?: boolean;
  readonly title?: string;
}

/** White / draw / Black shares, the shape every chess player already reads. */
function ResultBar({ white, draws, black, compact, title }: ResultBarProps) {
  const total = Math.max(1, white + draws + black);
  return (
    <div
      title={title}
      className={cn('flex overflow-hidden rounded-[2px]', compact ? 'h-2.5' : 'h-3')}
    >
      <span className="bg-eval-white" style={{ width: `${(white / total) * 100}%` }} />
      <span className="bg-surface-3" style={{ width: `${(draws / total) * 100}%` }} />
      <span className="bg-eval-black" style={{ width: `${(black / total) * 100}%` }} />
    </div>
  );
}

const percent = (value: number, total: number): string =>
  total === 0 ? '—' : `${Math.round((value / total) * 100)}%`;

const compact = (value: number): string =>
  value >= 1e6
    ? `${(value / 1e6).toFixed(1)}M`
    : value >= 1e4
      ? `${(value / 1e3).toFixed(0)}k`
      : value.toLocaleString();

/** Highlight moves whose results beat the field for the side to move. */
function performanceTone(move: DatabaseMove, sideToMove: 'w' | 'b'): string {
  if (move.performance === undefined || move.averageRating === undefined) return 'text-tertiary';
  const edge = move.performance - move.averageRating;
  if (edge > 25 && moveScore(move, sideToMove) > 0.5) return 'text-positive';
  if (edge < -25) return 'text-negative/80';
  return 'text-tertiary';
}
