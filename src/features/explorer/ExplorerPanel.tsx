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
import Link from 'next/link';

import { formatScore } from '@/chess/evaluation';
import { moveIntent } from '@/chess/moves';
import { positionKey } from '@/chess/fen';
import { DatabaseError, type DatabaseMove } from '@/database/types';
import { useDatabaseProviders } from '@/database/use-database-providers';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Tabs';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { useChessWorkspace } from '@/features/workspace/ChessWorkspaceContext';
import { useRepertoiresAtPosition } from '@/features/persistence/queries';
import { Filter, Plus, Target } from '@/components/icons';
import { cn } from '@/lib/cn';
import { useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

import { buildMoveEvidence, summariseEvidence, trendOf, type MoveEvidence } from './evidence';
import { useSourcesFor } from '@/reference/sources';
import { useOpeningClassification } from '@/theory/useOpeningClassification';

import { SourceFallback, SourcePicker } from './SourcePicker';
import { useExplorer, useExplorerPrefetch } from './useExplorer';
import { usePositionContext } from './usePositionContext';

/** Whatever went wrong, in the words the source itself used. */
function describeFailure(error: unknown): string {
  if (error instanceof DatabaseError) {
    return `${error.message}${error.remedy ? ` ${error.remedy}` : ''}`;
  }
  return error instanceof Error ? error.message : 'The lookup failed.';
}

/** How far back "recent" reaches, for the theory comparison. */
const RECENT_WINDOWS = [
  { id: 'off', label: 'All time', years: 0 },
  { id: '1y', label: '12 months', years: 1 },
  { id: '3y', label: '3 years', years: 3 },
  { id: '5y', label: '5 years', years: 5 },
] as const;

type RecentWindowId = (typeof RECENT_WINDOWS)[number]['id'];

export function ExplorerPanel() {
  const { node, position } = useAnalysisPosition();
  const { tree, currentId } = useChessWorkspace();
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
  const [player, setPlayer] = useState('');
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');

  const providers = useDatabaseProviders();
  const sources = useSourcesFor('explorer');
  const provider = providers.find((entry) => entry.id === prefs.explorerSourceId) ?? providers[0];
  /*
    The source to offer when the chosen one cannot answer: the first installed
    one that works without a network. On a fresh profile that is the bundled
    reference, which is the whole point of bundling it — §83's "never blank the
    explorer" is only possible because there is always something local.
  */
  const fallback = sources.find(
    (source) => source.offline && source.installed && source.id !== provider?.id,
  );
  const playerFilter = provider?.capabilities.playerFilter ?? false;

  const filters = {
    ...(prefs.explorerMinRating ? { minRating: prefs.explorerMinRating } : {}),
    ...(prefs.explorerSinceYear ? { sinceYear: prefs.explorerSinceYear } : {}),
    ...(playerFilter && player.trim() ? { player: player.trim(), playerColor } : {}),
  };

  const window = RECENT_WINDOWS.find((entry) => entry.id === recentWindow) ?? RECENT_WINDOWS[0];
  const recentFilters =
    window.years > 0 ? { ...filters, sinceYear: new Date().getFullYear() - window.years } : filters;

  const query = useExplorer(provider?.id ?? '', node.fen, filters);
  // A second query against the same source with a tighter date window. Two
  // reads of one dataset, never two datasets pretending to be one.
  const recentQuery = useExplorer(
    provider?.id ?? '',
    node.fen,
    window.years > 0 ? recentFilters : filters,
  );
  useExplorerPrefetch(provider?.id ?? '', node.fen, filters, query.data?.moves);
  const repertoireHere = useRepertoiresAtPosition(positionKey(node.fen));
  const context = usePositionContext(node.fen);
  /*
    Kingfisher's own classification first, then whatever the source called it.
    That order is deliberate: Kingfisher classifies by position from a CC0
    dataset it replays through its own rules code, and a remote source's name
    was computed by a different program from a different table. Where both
    exist they usually agree about the family and disagree about the depth.
  */
  const classification = useOpeningClassification(tree, currentId);
  const opening = classification ?? query.data?.opening;

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
  /*
    The Recent column appears when there is something recent to show, which is
    either window the user asked for *or* a source that carries its own. It
    used to appear only for the first, which meant a reference pack's recent
    counters — the only recent figure an aggregate can honestly produce — were
    computed, stored, shipped and never displayed.
  */
  const carriedSince = evidence.find((entry) => entry.recentFrom === 'source')?.recentSince;
  const showRecent = window.years > 0 || carriedSince !== undefined;

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
        {/*
          The opening, above the numbers rather than buried in a column. It is
          the first thing a player wants from a position and the last thing the
          table gets round to saying.
        */}
        <div className="mb-1.5 flex items-baseline gap-1.5">
          {opening?.eco ? (
            <span className="shrink-0 rounded-[3px] bg-surface-3 px-1 font-mono text-[10px] text-accent">
              {opening.eco}
            </span>
          ) : null}
          <span className="min-w-0 truncate text-[11.5px] text-primary">
            {opening ? opening.name : 'Starting position'}
          </span>
          {opening?.variation ? (
            <span className="min-w-0 truncate text-[10px] text-tertiary">{opening.variation}</span>
          ) : null}
          <Link
            href="/openings"
            className="ml-auto shrink-0 text-[10px] text-accent underline-offset-2 hover:underline"
          >
            Browse openings
          </Link>
        </div>

        <SourcePicker
          sources={sources}
          value={provider?.id ?? ''}
          onChange={(id) => prefs.set('explorerSourceId', id)}
        />
        <p className="mt-1 text-[10px] text-tertiary">
          {provider?.description}
          {query.data ? ` · ${total.toLocaleString()} games here` : ''}
        </p>
        {provider?.capabilities.playerFilter ? (
          <div className="mt-2 flex gap-1.5">
            <input
              value={player}
              onChange={(event) => setPlayer(event.target.value)}
              placeholder="Exact Lichess username"
              aria-label="Lichess player"
              className="h-8 min-w-0 flex-1 rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none focus:border-accent/60"
            />
            <select
              value={playerColor}
              onChange={(event) => setPlayerColor(event.target.value as 'w' | 'b')}
              aria-label="Player colour"
              className="h-8 rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary"
            >
              <option value="w">as White</option>
              <option value="b">as Black</option>
            </select>
          </div>
        ) : null}
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
              {provider?.name} cannot filter by date.
              {carriedSince !== undefined
                ? ` It carries its own recent counters instead, covering ${carriedSince} onwards, and that is what the Recent column shows.`
                : ' The recent column would repeat the all-time one, so it is not shown.'}
            </p>
          ) : null}
        </div>
      ) : null}

      <PanelBody>
        {/* A paused fetch is `status: 'pending'`, so treating pending as
            "loading" renders a message that never resolves. The client asks
            for `networkMode: 'always'` precisely so this cannot happen, but a
            spinner with no end is bad enough that the panel refuses to render
            one on its own account rather than trusting that setting. */}
        {query.fetchStatus === 'paused' && fallback ? (
          <SourceFallback
            failed={provider?.name ?? 'That source'}
            fallback={fallback}
            reason="The browser is reporting no network connection, so the request is on hold. The reference below is on this machine and answers without one."
            onUse={() => prefs.set('explorerSourceId', fallback.id)}
          />
        ) : query.fetchStatus === 'paused' ? (
          <EmptyState
            title="This source is not being queried."
            description={`The browser is reporting no network connection, so the request to ${provider?.name} is on hold.`}
          />
        ) : query.isPending ? (
          <p className="px-3 py-5 text-2xs text-tertiary">Reading {provider?.name}…</p>
        ) : query.isError && fallback ? (
          <SourceFallback
            failed={provider?.name ?? 'That source'}
            fallback={fallback}
            reason={describeFailure(query.error)}
            onUse={() => prefs.set('explorerSourceId', fallback.id)}
          />
        ) : query.isError ? (
          <EmptyState
            title="No evidence from this source."
            description={describeFailure(query.error)}
          />
        ) : evidence.length === 0 ? (
          <EmptyState
            title="No games reach this position."
            description={`${provider?.name} has nothing here. Try another source, or loosen the filters.`}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] border-collapse text-[10.5px]">
                <thead>
                  <tr className="border-b border-line-subtle text-left text-[9.5px] uppercase tracking-wide text-tertiary">
                    <th className="w-6 px-1.5 py-1.5" />
                    <th className="px-1.5 py-1.5 font-medium">Move</th>
                    <th className="px-1.5 py-1.5 text-right font-medium">Games</th>
                    <th className="px-1.5 py-1.5 text-right font-medium">Freq</th>
                    {showRecent ? (
                      <th
                        className="px-1.5 py-1.5 text-right font-medium"
                        title={
                          carriedSince !== undefined && window.years === 0
                            ? `Games in this source from ${carriedSince} onwards`
                            : `Games in the last ${window.label.toLowerCase()}`
                        }
                      >
                        {carriedSince !== undefined && window.years === 0
                          ? `Since ${carriedSince}`
                          : 'Recent'}
                      </th>
                    ) : null}
                    <th className="px-1.5 py-1.5 text-right font-medium">Score</th>
                    <th className="px-1.5 py-1.5 text-right font-medium">W</th>
                    <th className="px-1.5 py-1.5 text-right font-medium">D</th>
                    <th className="px-1.5 py-1.5 text-right font-medium">B</th>
                    <th className="px-1.5 py-1.5 text-right font-medium">Elo</th>
                    <th className="px-1.5 py-1.5 font-medium">Opening</th>
                    <th className="px-1.5 py-1.5 font-medium">Mine</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {evidence.map((entry) => (
                    <Row
                      key={entry.uci}
                      entry={entry}
                      showRecent={showRecent}
                      selected={selected.includes(entry.uci)}
                      onToggle={() => toggleSelected(entry.uci)}
                      onPlay={() => playMove(entry.database)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {compared.length >= 2 ? <Comparison entries={compared} /> : null}

            {(query.data?.topGames?.length ?? 0) > 0 ? (
              <section className="border-t border-line-subtle">
                <h3 className="px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                  {provider?.id === 'lichess-player' ? 'Recent games' : 'Model games'}
                </h3>
                <div className="divide-y divide-line-subtle">
                  {query.data?.topGames?.slice(0, 8).map((game) => (
                    <a
                      key={game.id}
                      href={game.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 px-2.5 py-2 hover:bg-surface-2"
                    >
                      <span className="truncate text-xs text-primary">
                        {game.white} – {game.black}
                      </span>
                      <span className="text-xs text-secondary tabular">{game.result}</span>
                      <span className="truncate text-[10px] text-tertiary">
                        {[game.event, game.year].filter(Boolean).join(' · ')}
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

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
      <td className="px-1.5 py-1.5 text-right text-secondary tabular">{entry.database.white}</td>
      <td className="px-1.5 py-1.5 text-right text-secondary tabular">{entry.database.draws}</td>
      <td className="px-1.5 py-1.5 text-right text-secondary tabular">{entry.database.black}</td>
      <td className="px-1.5 py-1.5 text-right text-secondary tabular">
        {entry.database.averageRating ?? '—'}
      </td>
      <td className="max-w-[150px] truncate px-1.5 py-1.5 text-tertiary">
        {[entry.database.opening?.eco, entry.database.opening?.name].filter(Boolean).join(' ') ||
          '—'}
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
