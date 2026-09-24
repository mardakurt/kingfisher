'use client';

/**
 * The preparation report: one opponent, read as a page.
 *
 * The shape of the announced ChessBase preparation page — the player, their
 * record as a ring, then Openings, Games and Style — with Kingfisher's own
 * work folded in rather than left out: the repertoire comparison, the
 * surprise finder and the priority queue sit beside the opening tree they
 * are about, the dossier and the game-day sheet are tabs of their own, and
 * every figure names the games it is of. Nothing here grades the player; see
 * `src/preparation/style.ts`.
 */

import { useMemo, useState, type ReactNode } from 'react';

import type { San } from '@/chess/types';
import { Board, ChevronLeft } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { ScoreRing } from '@/components/ui/Controls';
import { EmptyState } from '@/components/ui/Panel';
import type { RepertoirePositionRecord } from '@/persistence/domain';
import type { GameRecord } from '@/persistence/types';
import type {
  OpeningTree,
  PlayerProfile,
  PreparationEdge,
  PreparationPriority,
  RepertoireComparison,
} from '@/preparation';
import { buildStyleReport, type StyleReport } from '@/preparation/style';
import { cn } from '@/lib/cn';

import { DossierPanel } from './DossierPanel';
import { SheetBoard } from './SheetBoard';
import { SurprisesPanel } from './SurprisesPanel';
import type { Surprise } from '@/preparation/surprises';

export type ReportView = 'openings' | 'games' | 'style' | 'dossier' | 'sheet';

type TreeNode = NonNullable<OpeningTree['nodes'] extends ReadonlyMap<string, infer T> ? T : never>;

export interface PreparationReportProps {
  readonly name: string;
  readonly profile: PlayerProfile;
  readonly games: readonly GameRecord[];
  readonly aliases: readonly string[];
  readonly sources: readonly { id: string; name: string; games: number; found: number }[];
  readonly localTotal: number | null;
  readonly tree: OpeningTree;
  readonly node: TreeNode;
  readonly line: readonly San[];
  readonly canGoBack: boolean;
  readonly orientation: 'w' | 'b';
  readonly opponentColor: 'w' | 'b';
  readonly comparison: RepertoireComparison;
  readonly priorities: readonly PreparationPriority[];
  readonly repertoire: readonly RepertoirePositionRecord[];
  readonly hasRepertoire: boolean;
  /** The compare-with selector, when there is more than one repertoire. */
  readonly repertoirePicker?: ReactNode;
  /** The game-day sheet, when a session is open. */
  readonly sheet?: ReactNode;
  readonly onSelectMove: (key: string, san: San) => void;
  readonly onBack: () => void;
  readonly onPrepare: (edge: PreparationEdge) => void;
  readonly onOpenPosition: () => void;
  readonly onOpenSurprise: (surprise: Surprise) => void;
  readonly onOpenGame: (game: GameRecord) => void;
  readonly onAddToSheet?: () => void;
}

const VIEWS: readonly { id: ReportView; label: string }[] = [
  { id: 'openings', label: 'Openings' },
  { id: 'games', label: 'Games' },
  { id: 'style', label: 'Style' },
  { id: 'dossier', label: 'Dossier' },
  { id: 'sheet', label: 'Sheet' },
];

export function PreparationReport(props: PreparationReportProps) {
  const [view, setView] = useState<ReportView>('openings');
  const style = useMemo(
    () => buildStyleReport(props.games, props.aliases),
    [props.games, props.aliases],
  );
  const views = VIEWS.filter((entry) => entry.id !== 'sheet' || props.sheet);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-preparation-report>
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-5 py-5 md:px-8">
        <PlayerCard {...props} style={style} />

        <div role="tablist" aria-label="Report" className="flex flex-wrap items-center gap-1">
          {views.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={view === entry.id}
              onClick={() => setView(entry.id)}
              className={cn(
                'h-7 rounded-[7px] px-3 text-xs font-medium transition-colors',
                view === entry.id
                  ? 'bg-accent text-accent-contrast shadow-sm'
                  : 'text-secondary hover:bg-surface-2 hover:text-primary',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" aria-label={views.find((entry) => entry.id === view)?.label}>
          {view === 'openings' ? <OpeningsView {...props} /> : null}
          {view === 'games' ? <GamesView games={props.games} onOpen={props.onOpenGame} /> : null}
          {view === 'style' ? <StyleView style={style} /> : null}
          {view === 'dossier' ? (
            <DossierPanel name={props.name} games={props.games} color={props.opponentColor} />
          ) : null}
          {view === 'sheet' ? props.sheet : null}
        </div>
      </div>
    </div>
  );
}

// --- the player ----------------------------------------------------------------

const initials = (name: string): string =>
  name
    .split(/[,\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

function PlayerCard({
  name,
  profile,
  sources,
  localTotal,
  style,
}: PreparationReportProps & { readonly style: StyleReport }) {
  const { overall } = style;
  return (
    <section className="flex flex-wrap items-center gap-x-8 gap-y-4" data-player-card>
      <div className="flex min-w-0 items-center gap-3.5">
        <span
          aria-hidden
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-surface-3 text-lg font-semibold text-secondary"
        >
          {initials(name)}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-[-0.01em] text-primary">
            {profile.name}
          </h2>
          <p className="text-xs text-tertiary tabular">
            {profile.games.toLocaleString()} {profile.games === 1 ? 'game' : 'games'}
            {profile.firstYear && profile.lastYear
              ? ` · ${profile.firstYear}–${profile.lastYear}`
              : ''}
            {profile.averageRating ? ` · average Elo ${profile.averageRating}` : ''}
          </p>
          {/*
            Each source with its own count, never a merged figure presented as
            one population: a reference game and an imported one are different
            evidence about the same person.
          */}
          <ul className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-tertiary tabular">
            {sources.map((source) => (
              <li key={source.id} data-report-source={source.id}>
                {source.games.toLocaleString()} from {source.name}
                {source.found > source.games
                  ? ` (the newest of ${source.found.toLocaleString()} found; Filters → Most recent games reads more)`
                  : ''}
              </li>
            ))}
            {localTotal !== null && localTotal > profile.games ? (
              <li>{localTotal.toLocaleString()} in My games</li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <ScoreRing wins={overall.wins} draws={overall.draws} losses={overall.losses} size={88} />
        <dl className="grid grid-cols-[auto_auto] gap-x-5 gap-y-1 text-xs tabular">
          <Legend color="bg-positive" label="Wins" value={overall.wins} />
          <Legend color="bg-line-strong" label="Draws" value={overall.draws} />
          <Legend color="bg-negative" label="Losses" value={overall.losses} />
        </dl>
      </div>

      <dl className="ml-auto grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-xs tabular">
        <dt className="text-tertiary">As White</dt>
        <dd className="text-right text-secondary">
          {style.white.score}% · {style.white.games}
        </dd>
        <dt className="text-tertiary">As Black</dt>
        <dd className="text-right text-secondary">
          {style.black.score}% · {style.black.games}
        </dd>
        {style.averageMoves ? (
          <>
            <dt className="text-tertiary">Average length</dt>
            <dd className="text-right text-secondary">{style.averageMoves} moves</dd>
          </>
        ) : null}
      </dl>
    </section>
  );
}

function Legend({
  color,
  label,
  value,
}: {
  readonly color: string;
  readonly label: string;
  readonly value: number;
}) {
  return (
    <>
      <dt className="flex items-center gap-1.5 text-tertiary">
        <span aria-hidden className={cn('size-2 rounded-full', color)} />
        {label}
      </dt>
      <dd className="text-right font-medium text-primary">{value.toLocaleString()}</dd>
    </>
  );
}

// --- openings ----------------------------------------------------------------

function OpeningsView(props: PreparationReportProps) {
  const {
    name,
    node,
    line,
    canGoBack,
    orientation,
    comparison,
    priorities,
    repertoire,
    hasRepertoire,
    tree,
  } = props;
  const prepared = new Set(comparison.prepared.map((edge) => edge.resultingKey));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!canGoBack} onClick={props.onBack} icon={<ChevronLeft />}>
            Back
          </Button>
          <p className="min-w-0 flex-1 truncate text-xs text-secondary" data-preparation-line>
            {line.length ? formatLine(line) : 'Starting position'}
          </p>
          <span className="text-[11px] text-tertiary tabular">
            {node.games.toLocaleString()} games here
          </span>
        </div>
        <div className="overflow-hidden rounded-[10px] border border-line-subtle">
          <MoveTable
            node={node}
            preparedKeys={prepared}
            onSelect={props.onSelectMove}
            onPrepare={props.onPrepare}
          />
        </div>
        <PriorityQueue priorities={priorities} onPrepare={props.onPrepare} />
      </section>

      <aside className="flex min-w-0 flex-col gap-4">
        <SheetBoard fen={node.fen} orientation={orientation} className="w-full" />
        <div className="flex flex-wrap gap-1.5">
          <Button variant="accent" icon={<Board />} onClick={props.onOpenPosition}>
            Open on the board
          </Button>
          {props.onAddToSheet ? (
            <Button variant="subtle" onClick={props.onAddToSheet}>
              Add to sheet
            </Button>
          ) : null}
        </div>

        <section>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-primary">Your repertoire</h3>
            <span className="ml-auto">{props.repertoirePicker}</span>
          </div>
          {hasRepertoire ? (
            <>
              <p className="mt-1 text-[11.5px] text-secondary tabular">
                {comparison.prepared.length} observed continuation
                {comparison.prepared.length === 1 ? '' : 's'} prepared · {comparison.gaps.length}{' '}
                gap{comparison.gaps.length === 1 ? '' : 's'}
              </p>
              {comparison.gaps.slice(0, 5).map((edge) => (
                <button
                  key={edge.uci}
                  type="button"
                  onClick={() => props.onPrepare(edge)}
                  className="mt-1 block w-full text-left text-[11px] text-tertiary hover:text-accent"
                >
                  {edge.san} · {edge.games} games · no prepared reply — prepare one
                </button>
              ))}
            </>
          ) : (
            <p className="mt-1 text-[11px] text-tertiary">
              No repertoire for this colour yet. Build one from Repertoire, and this compares it
              with what {name} plays.
            </p>
          )}
        </section>

        {hasRepertoire ? (
          <section>
            <h3 className="text-xs font-semibold text-primary">Surprises</h3>
            <SurprisesPanel
              repertoire={repertoire}
              opponent={tree}
              opponentName={name}
              onOpen={props.onOpenSurprise}
            />
          </section>
        ) : null}
      </aside>
    </div>
  );
}

const formatLine = (line: readonly San[]): string =>
  line.map((san, index) => (index % 2 === 0 ? `${index / 2 + 1}.${san}` : san)).join(' ');

export function MoveTable({
  node,
  preparedKeys,
  onSelect,
  onPrepare,
}: {
  readonly node: TreeNode;
  readonly preparedKeys: ReadonlySet<string>;
  readonly onSelect: (key: string, san: San) => void;
  readonly onPrepare: (edge: PreparationEdge) => void;
}) {
  if (node.edges.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-xs text-tertiary">
        No game in the selected set continues from here.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-line-subtle bg-surface-2/60 text-left text-[11px] text-tertiary">
            <th className="px-3 py-1.5 font-medium">Move</th>
            <th className="px-2 py-1.5 text-right font-medium">Games</th>
            <th className="w-[22%] px-2 py-1.5 font-medium">Frequency</th>
            <th className="px-2 py-1.5 text-right font-medium">Score</th>
            <th className="px-2 py-1.5 text-right font-medium">Avg Elo</th>
            <th className="px-2 py-1.5 text-right font-medium">Last</th>
            <th className="px-3 py-1.5 font-medium">Reply</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {node.edges.map((edge) => (
            <tr
              key={edge.uci}
              className="cursor-pointer text-secondary hover:bg-surface-2/70"
              onClick={() => onSelect(edge.resultingKey, edge.san)}
            >
              <td className="px-3 py-1.5">
                <button
                  type="button"
                  className="font-semibold text-primary hover:text-accent"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(edge.resultingKey, edge.san);
                  }}
                >
                  {edge.san}
                </button>
              </td>
              <td className="px-2 py-1.5 text-right tabular">{edge.games}</td>
              <td className="px-2 py-1.5">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <span
                      className="block h-full rounded-full bg-accent/70"
                      style={{ width: `${Math.min(100, edge.frequency)}%` }}
                    />
                  </span>
                  <span className="w-10 text-right tabular">{edge.frequency}%</span>
                </span>
              </td>
              <td className="px-2 py-1.5 text-right tabular">{edge.playerScore}%</td>
              <td className="px-2 py-1.5 text-right tabular">{edge.averageElo ?? '—'}</td>
              <td className="px-2 py-1.5 text-right tabular">{edge.lastPlayed ?? '—'}</td>
              <td className="px-3 py-1.5">
                {preparedKeys.has(edge.resultingKey) ? (
                  <span className="text-positive">Prepared</span>
                ) : (
                  <button
                    type="button"
                    className="text-tertiary hover:text-accent"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPrepare(edge);
                    }}
                  >
                    Prepare
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PriorityQueue({
  priorities,
  onPrepare,
}: {
  readonly priorities: readonly PreparationPriority[];
  readonly onPrepare: (edge: PreparationEdge) => void;
}) {
  if (priorities.length === 0) return null;
  return (
    <section className="mt-6" data-preparation-priorities>
      <h3 className="text-xs font-semibold text-primary">Preparation priorities</h3>
      <p className="mt-0.5 text-[11px] text-tertiary">
        Ordered by missing response, recent growth, then local frequency. No hidden score.
      </p>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {priorities.slice(0, 8).map((priority) => (
          <article
            key={priority.edge.uci}
            className="rounded-[8px] border border-line-subtle bg-surface-1 px-3 py-2"
          >
            <div className="flex items-center gap-2 text-xs">
              <strong className="text-primary">{priority.edge.san}</strong>
              <span className="text-tertiary tabular">
                Local {priority.edge.frequency}% · recent {priority.edge.recentFrequency}%
              </span>
              <span className="ml-auto text-tertiary">
                {priority.prepared ? 'Prepared' : 'No response'}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-secondary">{priority.reasons.join(' ')}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10.5px] text-tertiary">
              <span>{priority.edge.games} opponent games</span>
              <span>{priority.modelGames} model games</span>
              <span>{priority.trainingItems} training</span>
              {priority.lastReviewedAt ? (
                <span>Reviewed {new Date(priority.lastReviewedAt).toLocaleDateString()}</span>
              ) : null}
              {!priority.prepared ? (
                <Button size="sm" className="ml-auto" onClick={() => onPrepare(priority.edge)}>
                  Add response
                </Button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// --- games -------------------------------------------------------------------

const GAME_PAGE = 200;

function GamesView({
  games,
  onOpen,
}: {
  readonly games: readonly GameRecord[];
  readonly onOpen: (game: GameRecord) => void;
}) {
  const [shown, setShown] = useState(GAME_PAGE);
  const sorted = useMemo(
    () =>
      [...games].sort(
        (a, b) =>
          (b.date ?? String(b.year ?? '')).localeCompare(a.date ?? String(a.year ?? '')) ||
          a.id.localeCompare(b.id),
      ),
    [games],
  );
  if (sorted.length === 0) {
    return <EmptyState title="No games." description="The selected set holds no games." />;
  }
  return (
    <div className="overflow-hidden rounded-[10px] border border-line-subtle">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-xs" data-preparation-games>
          <thead>
            <tr className="border-b border-line-subtle bg-surface-2/60 text-left text-[11px] text-tertiary">
              <th className="px-3 py-1.5 font-medium">White</th>
              <th className="px-2 py-1.5 text-right font-medium">Elo</th>
              <th className="px-3 py-1.5 font-medium">Black</th>
              <th className="px-2 py-1.5 text-right font-medium">Elo</th>
              <th className="px-2 py-1.5 font-medium">Result</th>
              <th className="px-2 py-1.5 font-medium">ECO</th>
              <th className="px-3 py-1.5 font-medium">Event</th>
              <th className="px-3 py-1.5 text-right font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {sorted.slice(0, shown).map((game) => (
              <tr
                key={game.id}
                tabIndex={0}
                onClick={() => onOpen(game)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onOpen(game);
                }}
                className="cursor-pointer text-secondary hover:bg-surface-2/70 focus:bg-accent-muted focus:outline-none"
              >
                <td className="max-w-[180px] truncate px-3 py-1.5 text-primary">{game.white}</td>
                <td className="px-2 py-1.5 text-right tabular">{game.whiteRating ?? ''}</td>
                <td className="max-w-[180px] truncate px-3 py-1.5 text-primary">{game.black}</td>
                <td className="px-2 py-1.5 text-right tabular">{game.blackRating ?? ''}</td>
                <td className="px-2 py-1.5 tabular">
                  {game.result === '1/2-1/2' ? '½' : game.result}
                </td>
                <td className="px-2 py-1.5 tabular">{game.eco ?? ''}</td>
                <td className="max-w-[220px] truncate px-3 py-1.5">{game.event ?? ''}</td>
                <td className="px-3 py-1.5 text-right tabular">{game.date ?? game.year ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > shown ? (
        <div className="border-t border-line-subtle px-3 py-2 text-center">
          <Button size="sm" onClick={() => setShown((count) => count + GAME_PAGE)}>
            Show {Math.min(GAME_PAGE, sorted.length - shown)} more of{' '}
            {sorted.length.toLocaleString()}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// --- style -------------------------------------------------------------------

function StyleView({ style }: { readonly style: StyleReport }) {
  if (style.overall.games === 0) {
    return <EmptyState title="Nothing to report." description="No games in the selected set." />;
  }
  return (
    <div className="grid gap-8 lg:grid-cols-2" data-style-report>
      <section>
        <h3 className="text-xs font-semibold text-primary">
          Style report{' '}
          <span className="font-normal text-tertiary tabular">
            {style.overall.games.toLocaleString()} games
          </span>
        </h3>
        <h4 className="mt-3 text-[11px] font-semibold text-tertiary">Observations</h4>
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {style.observations.map((entry) => (
            <li key={entry.id} className="flex gap-2 text-[12.5px] leading-snug text-secondary">
              <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-tertiary" />
              {entry.text}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-snug text-tertiary">
          Counted from the games above, with no grade attached: an adjective needs a population to
          be measured against, and Kingfisher does not have one it could name.
        </p>
      </section>

      <section>
        <h4 className="text-[11px] font-semibold text-tertiary">Measures</h4>
        <dl className="mt-2 flex flex-col gap-2.5">
          {style.measures.map((measure) => (
            <div
              key={measure.id}
              className="grid grid-cols-[140px_minmax(0,1fr)_92px] items-center gap-3"
              title={measure.definition}
            >
              <dt className="truncate text-xs text-secondary">{measure.label}</dt>
              <dd className="flex gap-[3px]" aria-hidden>
                {[0, 1, 2, 3, 4].map((segment) => {
                  const fill = Math.max(0, Math.min(1, measure.value / 20 - segment));
                  return (
                    <span
                      key={segment}
                      className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"
                    >
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-accent"
                        style={{ width: `${fill * 100}%` }}
                      />
                    </span>
                  );
                })}
              </dd>
              <dd className="text-right text-[11px] text-tertiary tabular">
                <span className="font-medium text-primary">{measure.value}%</span> of {measure.of}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
