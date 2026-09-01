'use client';

/**
 * The opening explorer.
 *
 * Its job is to put several kinds of evidence about one position beside each
 * other without reconciling them: how often a move is played, how it scores, at
 * what level, whether that is changing, what the engine thinks, what the user's
 * repertoire says, and how the user has done with it themselves. Those routinely
 * conflict, and the conflict is the useful part — so nothing here averages them
 * into a recommendation.
 *
 * Sources are never mixed. Every number on screen comes from exactly one
 * dataset, named in the header, because "34%" means nothing without knowing
 * whether it is masters, the user's own archive, or one opponent's games.
 */

import { useCallback, useMemo, useState } from 'react';

import { formatScore } from '@/chess/evaluation';
import { moveIntent } from '@/chess/moves';
import { positionKey } from '@/chess/fen';
import { DatabaseError, type DatabaseMove } from '@/database/types';
import { databaseProviders } from '@/database/registry';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Tabs';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { useRepertoiresAtPosition } from '@/features/persistence/queries';
import { Filter, Plus, Target } from '@/components/icons';
import { cn } from '@/lib/cn';
import { useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

import { buildMoveEvidence, summariseEvidence, trendOf, type MoveEvidence } from './evidence';
import { useExplorer } from './useExplorer';
import { usePositionContext } from './usePositionContext';

/** How far back "recent" reaches, for the theory comparison. */
const RECENT_WINDOWS = [
  { id: 'off', label: 'Off', years: 0 },
  { id: '1y', label: '12 months', years: 1 },
  { id: '3y', label: '3 years', years: 3 },
] as const;

type RecentWindowId = (typeof RECENT_WINDOWS)[number]['id'];

export function ExplorerPanel() {
  const { node, position } = useAnalysisPosition();
  const prefs = usePreferences();
  const play = useAnalysis((state) => state.play);
  const notify = useUi((state) => state.notify);
  const setAddToRepertoireOpen = useUi((state) => state.setAddToRepertoireOpen);
  const setTrainingCaptureOpen = useUi((state) => state.setTrainingCaptureOpen);
  const analysis = useEngine((state) => state.primary.analysis);
  const analysedFen = useEngine((state) => state.primary.analysedFen);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [recentWindow, setRecentWindow] = useState<RecentWindowId>('off');
  const [selected, setSelected] = useState<readonly string[]>([]);

  const providers = databaseProviders();
  const provider = providers.find((entry) => entry.id === prefs.explorerSourceId) ?? providers[0];

  const filters = useMemo(
    () => ({
      ...(prefs.explorerMinRating ? { minRating: prefs.explorerMinRating } : {}),
      ...(prefs.explorerSinceYear ? { sinceYear: prefs.explorerSinceYear } : {}),
    }),
    [prefs.explorerMinRating, prefs.explorerSinceYear],
  );

  const window = RECENT_WINDOWS.find((entry) => entry.id === recentWindow) ?? RECENT_WINDOWS[0];
  const recentFilters = useMemo(
    () =>
      window.years > 0
        ? { ...filters, sinceYear: new Date().getFullYear() - window.years }
        : filters,
    [filters, window.years],
  );

  const query = useExplorer(provider?.id ?? '', node.fen, filters);
  // A second query against the same source with a tighter date window. Two
  // reads of one dataset, never two datasets pretending to be one.
  const recentQuery = useExplorer(
    provider?.id ?? '',
    node.fen,
    window.years > 0 ? recentFilters : filters,
  );
  const repertoireHere = useRepertoiresAtPosition(positionKey(node.fen));
  const context = usePositionContext(node.fen);

  const evidence = useMemo(() => {
    if (!query.data) return [];
    return buildMoveEvidence({
      result: query.data,
      sideToMove: position.turn,
      recent: window.years > 0 ? (recentQuery.data ?? null) : null,
      analysis: analysedFen === node.fen ? analysis : null,
      repertoire: repertoireHere.data?.[0] ?? null,
    });
  }, [
    analysedFen,
    analysis,
    node.fen,
    position.turn,
    query.data,
    recentQuery.data,
    repertoireHere.data,
    window.years,
  ]);

  const playMove = useCallback(
    (move: DatabaseMove) => {
      const legal = position.playUci(move.uci);
      if (!legal.ok) {
        notify({ tone: 'error', message: `The database move ${move.san} is not legal here.` });
        return;
      }
      const played = play(moveIntent(legal.value));
      if (!played.ok) notify({ tone: 'error', message: played.error.message });
    },
    [notify, play, position],
  );

  const toggleSelected = (uci: string) =>
    setSelected((current) =>
      current.includes(uci)
        ? current.filter((entry) => entry !== uci)
        : // Four is the most a side-by-side comparison stays readable at.
          [...current, uci].slice(-4),
    );

  const compared = evidence.filter((entry) => selected.includes(entry.uci));
  const total = query.data?.totalGames ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader
        actions={
          <>
            <IconButton
              label="Explorer filters"
              active={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <Filter />
            </IconButton>
          </>
        }
      >
        Explorer
      </PanelHeader>

      <div className="shrink-0 border-b border-line-subtle px-2.5 py-1.5">
        <select
          aria-label="Evidence source"
          value={provider?.id ?? ''}
          onChange={(event) => prefs.set('explorerSourceId', event.target.value)}
          className="h-6 w-full rounded-[3px] border border-line bg-surface-inset px-1.5 text-[10.5px] text-secondary outline-none focus:border-accent/60"
        >
          {providers.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-tertiary">
          {provider?.description}
          {query.data ? ` · ${total.toLocaleString()} games here` : ''}
        </p>
      </div>

      {filtersOpen ? (
        <div className="shrink-0 space-y-1.5 border-b border-line-subtle bg-surface-2 px-2.5 py-2">
          <div className="flex items-end gap-2">
            <label className="text-[10px] text-tertiary">
              Min Elo
              <input
                value={prefs.explorerMinRating ?? ''}
                inputMode="numeric"
                onChange={(event) =>
                  prefs.set(
                    'explorerMinRating',
                    Number(event.target.value.replace(/\D/g, '')) || null,
                  )
                }
                className="mt-0.5 block h-6 w-[70px] rounded-[3px] border border-line bg-surface-inset px-1.5 text-[10.5px] text-primary outline-none focus:border-accent/60"
              />
            </label>
            <label className="text-[10px] text-tertiary">
              Since year
              <input
                value={prefs.explorerSinceYear ?? ''}
                inputMode="numeric"
                onChange={(event) =>
                  prefs.set(
                    'explorerSinceYear',
                    Number(event.target.value.replace(/\D/g, '').slice(0, 4)) || null,
                  )
                }
                className="mt-0.5 block h-6 w-[70px] rounded-[3px] border border-line bg-surface-inset px-1.5 text-[10.5px] text-primary outline-none focus:border-accent/60"
              />
            </label>
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => {
                prefs.set('explorerMinRating', null);
                prefs.set('explorerSinceYear', null);
              }}
            >
              Clear
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-tertiary">Compare recent</span>
            <Segmented
              items={RECENT_WINDOWS.map((entry) => ({ id: entry.id, label: entry.label }))}
              value={recentWindow}
              onChange={setRecentWindow}
            />
          </div>
          {!provider?.capabilities.dateFilter && window.years > 0 ? (
            <p className="text-[10px] text-caution">
              {provider?.name} cannot filter by date, so the recent column repeats the all-time one.
            </p>
          ) : null}
        </div>
      ) : null}

      <PanelBody>
        {query.isPending ? (
          <p className="px-3 py-5 text-2xs text-tertiary">Reading {provider?.name}…</p>
        ) : query.isError ? (
          <EmptyState
            title="No evidence from this source."
            description={
              query.error instanceof DatabaseError
                ? `${query.error.message}${query.error.remedy ? ` ${query.error.remedy}` : ''}`
                : query.error instanceof Error
                  ? query.error.message
                  : 'The lookup failed.'
            }
          />
        ) : evidence.length === 0 ? (
          <EmptyState
            title="No games reach this position."
            description={`${provider?.name} has nothing here. Try another source, or loosen the filters.`}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[330px] border-collapse text-[10.5px]">
                <thead>
                  <tr className="border-b border-line-subtle text-left text-[9.5px] uppercase tracking-wide text-tertiary">
                    <th className="w-6 px-1.5 py-1.5" />
                    <th className="px-1.5 py-1.5 font-medium">Move</th>
                    <th className="px-1.5 py-1.5 text-right font-medium">Games</th>
                    <th className="px-1.5 py-1.5 text-right font-medium">Freq</th>
                    {window.years > 0 ? (
                      <th className="px-1.5 py-1.5 text-right font-medium">Recent</th>
                    ) : null}
                    <th className="px-1.5 py-1.5 text-right font-medium">Score</th>
                    <th className="px-1.5 py-1.5 text-right font-medium">Elo</th>
                    <th className="px-1.5 py-1.5 font-medium">Mine</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {evidence.map((entry) => (
                    <Row
                      key={entry.uci}
                      entry={entry}
                      showRecent={window.years > 0}
                      selected={selected.includes(entry.uci)}
                      onToggle={() => toggleSelected(entry.uci)}
                      onPlay={() => playMove(entry.database)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {compared.length >= 2 ? <Comparison entries={compared} /> : null}

            <PositionContext context={context.data} />

            <div className="flex flex-wrap gap-1.5 border-t border-line-subtle px-2.5 py-2">
              <Button size="sm" icon={<Plus />} onClick={() => setAddToRepertoireOpen(true)}>
                To repertoire
              </Button>
              <Button size="sm" icon={<Target />} onClick={() => setTrainingCaptureOpen(true)}>
                To training
              </Button>
            </div>
          </>
        )}
      </PanelBody>
    </div>
  );
}

function Row({
  entry,
  showRecent,
  selected,
  onToggle,
  onPlay,
}: {
  readonly entry: MoveEvidence;
  readonly showRecent: boolean;
  readonly selected: boolean;
  readonly onToggle: () => void;
  readonly onPlay: () => void;
}) {
  const trend = trendOf(entry);
  return (
    <tr className={cn(selected && 'bg-accent-muted')}>
      <td className="px-1.5 py-1.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Compare ${entry.san}`}
          className="h-3 w-3"
        />
      </td>
      <td className="px-1.5 py-1.5">
        <button
          type="button"
          className="font-medium text-primary hover:text-accent"
          onClick={onPlay}
        >
          {entry.san}
        </button>
        {entry.engineRank !== undefined ? (
          <span className="ml-1 text-[9px] text-tertiary">#{entry.engineRank}</span>
        ) : null}
      </td>
      <td className="px-1.5 py-1.5 text-right text-secondary tabular">
        {entry.database.games.toLocaleString()}
      </td>
      <td className="px-1.5 py-1.5 text-right text-secondary tabular">
        {Math.round(entry.frequency * 100)}%
      </td>
      {showRecent ? (
        <td className="px-1.5 py-1.5 text-right tabular">
          <span
            className={cn(
              trend === 'rising' && 'text-positive',
              trend === 'falling' && 'text-negative',
              (trend === 'steady' || trend === 'insufficient') && 'text-secondary',
            )}
          >
            {entry.recentFrequency === undefined
              ? '—'
              : `${Math.round(entry.recentFrequency * 100)}%`}
          </span>
        </td>
      ) : null}
      <td className="px-1.5 py-1.5 text-right text-secondary tabular">
        {Math.round(entry.score * 100)}%
      </td>
      <td className="px-1.5 py-1.5 text-right text-secondary tabular">
        {entry.database.averageRating ?? '—'}
      </td>
      <td className="px-1.5 py-1.5 text-[10px] text-tertiary">
        {entry.repertoireRole
          ? entry.repertoireExpected
            ? 'expected'
            : entry.repertoireRole
          : '—'}
      </td>
    </tr>
  );
}

/** Two to four candidates, each source on its own row. */
function Comparison({ entries }: { readonly entries: readonly MoveEvidence[] }) {
  const labels = summariseEvidence(entries[0] as MoveEvidence).map(([label]) => label);
  const byMove = entries.map((entry) => ({
    san: entry.san,
    rows: new Map(summariseEvidence(entry)),
    engineScore: entry.engineScore,
  }));

  return (
    <section className="border-t border-line-subtle bg-surface-2/40 px-2.5 py-2">
      <h3 className="text-[10px] uppercase tracking-wide text-tertiary">
        Comparing {entries.length} moves
      </h3>
      <div className="mt-1.5 overflow-x-auto">
        <table className="w-full border-collapse text-[10.5px]">
          <thead>
            <tr className="text-left text-[9.5px] uppercase tracking-wide text-tertiary">
              <th className="py-1 pr-2 font-medium">Evidence</th>
              {byMove.map((move) => (
                <th key={move.san} className="px-1.5 py-1 text-right font-medium text-primary">
                  {move.san}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {labels.map((label) => (
              <tr key={label}>
                <td className="py-1 pr-2 text-tertiary">{label}</td>
                {byMove.map((move) => (
                  <td key={move.san} className="px-1.5 py-1 text-right text-secondary tabular">
                    {move.rows.get(label) ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
            {byMove.some((move) => move.engineScore) ? (
              <tr>
                <td className="py-1 pr-2 text-tertiary">Engine</td>
                {byMove.map((move) => (
                  <td key={move.san} className="px-1.5 py-1 text-right text-secondary tabular">
                    {move.engineScore ? formatScore(move.engineScore) : '—'}
                  </td>
                ))}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[10px] text-tertiary">
        Each row is one source. There is deliberately no combined score.
      </p>
    </section>
  );
}

/** Where this position already appears in the user's own material. */
function PositionContext({
  context,
}: {
  readonly context: ReturnType<typeof usePositionContext>['data'];
}) {
  if (!context) return null;
  const rows: readonly (readonly [string, number])[] = [
    ['Local games', context.localGames],
    ['My games', context.personalGames],
    ['Repertoires', context.repertoires],
    ['Training positions', context.trainingItems],
    ['Model games', context.modelGames],
  ];
  const anything = rows.some(([, value]) => value > 0) || context.routes.length > 0;
  if (!anything) return null;

  return (
    <section className="border-t border-line-subtle px-2.5 py-2">
      <h3 className="text-[10px] uppercase tracking-wide text-tertiary">In your work</h3>
      <dl className="mt-1 grid grid-cols-2 gap-x-3 text-[10.5px]">
        {rows
          .filter(([, value]) => value > 0)
          .map(([label, value]) => (
            <div key={label} className="col-span-2 flex gap-2">
              <dt className="min-w-0 flex-1 text-tertiary">{label}</dt>
              <dd className="text-secondary tabular">{value}</dd>
            </div>
          ))}
      </dl>
      {context.routes.length > 1 ? (
        <div className="mt-1.5">
          <p className="text-[10px] text-tertiary">
            Also reached by {context.routes.length} move orders in your games:
          </p>
          {context.routes.slice(0, 3).map((route) => (
            <p key={route.join(' ')} className="mt-0.5 truncate text-[10px] text-secondary">
              {route.join(' ')}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
