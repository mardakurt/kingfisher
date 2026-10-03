'use client';

/**
 * Costly moves — ChessBase's "Blunder report", counted rather than graded
 * (`src/preparation/costly-moves.ts`, run by `stores/costly-moves-store.ts`).
 */

import { useMemo, useState } from 'react';

import { formatScore } from '@/chess/evaluation';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Tabs';
import { plural } from '@/lib/plural';
import type { GameRecord } from '@/persistence/types';
import {
  opponentMoves,
  PHASES,
  summarise,
  OPENING_MOVES,
  type Phase,
} from '@/preparation/costly-moves';
import { ENDGAME_PIECES } from '@/preparation/style';
import { COST_THRESHOLDS, type CostThreshold } from '@/review/annotate';
import { useCostlyMoves } from '@/stores/costly-moves-store';
import { usePreferences } from '@/stores/preferences-store';

const GAME_COUNTS = [10, 20, 40] as const;
const TIMES = [
  { id: '150', label: 'Quick (0.15 s)', ms: 150 },
  { id: '500', label: 'Careful (0.5 s)', ms: 500 },
] as const;
const PHASE_LABEL: Record<Phase, string> = {
  opening: 'Opening',
  middlegame: 'Middlegame',
  endgame: 'Endgame',
};

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

const percent = (part: number, whole: number) =>
  whole === 0 ? '—' : `${Math.round((part / whole) * 1000) / 10}%`;

export function CostlyMovesView({
  name,
  games,
  aliases,
  onOpen,
}: {
  readonly name: string;
  readonly games: readonly GameRecord[];
  readonly aliases: readonly string[];
  readonly onOpen: (game: GameRecord, nodeId?: string) => void;
}) {
  const engineId = usePreferences((state) => state.primaryEngineId);
  const costly = useCostlyMoves();
  const [count, setCount] = useState<(typeof GAME_COUNTS)[number]>(20);
  const [time, setTime] = useState<(typeof TIMES)[number]['id']>('150');
  const [threshold, setThreshold] = useState<CostThreshold>('serious');

  const theirs = useMemo(
    () => games.filter((game) => opponentMoves(game, aliases) !== null).length,
    [games, aliases],
  );
  const run = costly.run && costly.run.subject === name ? costly.run : null;
  const report = useMemo(
    () =>
      run
        ? summarise(run.entries, {
            threshold,
            games: run.gamesDone,
            unanswered: run.unanswered,
          })
        : null,
    [run, threshold],
  );
  const running = costly.status === 'running' && run !== null;
  const byId = useMemo(() => new Map(games.map((game) => [game.id, game])), [games]);
  const ms = TIMES.find((entry) => entry.id === time)?.ms ?? 150;
  const planned = Math.min(count, theirs);

  return (
    <section className="space-y-4" data-costly-moves>
      <div>
        <h2 className="text-sm font-semibold text-primary">Costly moves</h2>
        <p className="mt-1 max-w-[760px] text-[11.5px] leading-snug text-tertiary">
          Where {name}’s own moves gave the game away, by the engine’s scores before and after each
          one. ChessBase calls this a blunder report; here a move is counted, not named: it is
          costly when the mover gave up at least the chosen share of win chance. Phases are rules:
          the opening is moves 1–{OPENING_MOVES}, an endgame has at most {ENDGAME_PIECES} pieces
          besides kings and pawns.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="text-[11px] text-tertiary">
          <p className="mb-1">Newest games</p>
          <Segmented
            items={GAME_COUNTS.map((value) => ({ id: String(value), label: String(value) }))}
            value={String(count)}
            onChange={(next) => setCount(Number(next) as (typeof GAME_COUNTS)[number])}
          />
        </div>
        <div className="text-[11px] text-tertiary">
          <p className="mb-1">Engine time per position</p>
          <Segmented
            items={TIMES.map((entry) => ({ id: entry.id, label: entry.label }))}
            value={time}
            onChange={(next) => setTime(next as (typeof TIMES)[number]['id'])}
          />
        </div>
        {running ? (
          <Button onClick={() => costly.stop()} data-costly-stop>
            Stop
          </Button>
        ) : (
          <Button
            variant="accent"
            disabled={theirs === 0}
            onClick={() =>
              void costly.start({
                subject: name,
                games,
                aliases,
                engineId,
                maxGames: count,
                msPerPosition: ms,
              })
            }
            data-costly-run
          >
            {run ? 'Run again' : 'Run the engine'}
          </Button>
        )}
      </div>
      <p className="text-[11px] text-tertiary">
        {theirs === 0
          ? `None of the games on screen has ${name} as a player under these filters.`
          : `${plural(planned, 'game')} of ${theirs}, newest first: about ${plural(
              Math.max(1, Math.round((planned * 90 * ms) / 60_000)),
              'minute',
            )} at this setting, for a 45-move game. The engine runs in this window; Stop keeps what has been read.`}
      </p>

      {costly.status === 'error' && costly.message ? (
        <p role="alert" className="text-xs text-caution">
          {costly.message}
        </p>
      ) : null}

      {run && report ? (
        <>
          <p className="text-[11px] text-tertiary" data-costly-progress>
            {running
              ? `Reading game ${run.gamesDone + 1} of ${run.gamesPlanned}…`
              : costly.status === 'stopped' && run.subject === name
                ? `Stopped after ${plural(run.gamesDone, 'game')} of ${run.gamesPlanned}.`
                : `${plural(run.gamesDone, 'game')} read.`}{' '}
            {run.engineName}, {run.msPerPosition} ms a position
            {run.depths.length > 0 ? `, median depth ${median(run.depths)}` : ''}.
            {report.unanswered
              ? ` ${plural(report.unanswered, 'move')} the engine did not answer for are not counted.`
              : ''}
          </p>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-tertiary">
            Costly means at least
            <Segmented
              items={(Object.keys(COST_THRESHOLDS) as CostThreshold[]).map((key) => ({
                id: key,
                label: `${Math.round(COST_THRESHOLDS[key] * 100)}%`,
              }))}
              value={threshold}
              onChange={(next) => setThreshold(next as CostThreshold)}
            />
            of win chance given up in one move.
          </div>

          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-costly-summary>
            <Tile
              label="Their moves read"
              value={report.moves.toLocaleString()}
              note={plural(report.games, 'game')}
            />
            <Tile
              label="Costly moves"
              value={report.costly.length.toLocaleString()}
              note={`${percent(report.costly.length, report.moves)} of their moves`}
            />
            <Tile
              label="Games with one"
              value={report.gamesWithCostly.toLocaleString()}
              note={`of ${report.games}`}
            />
            <Tile
              label="As White / as Black"
              value={`${report.byColour.w.costly} / ${report.byColour.b.costly}`}
              note={`${percent(report.byColour.w.costly, report.byColour.w.moves)} / ${percent(report.byColour.b.costly, report.byColour.b.moves)}`}
            />
          </dl>

          <table className="w-full max-w-[520px] border-collapse text-[11.5px]" data-costly-phases>
            <thead>
              <tr className="border-b border-line-subtle text-left text-[10.5px] text-tertiary">
                <th className="py-1.5 pr-2 font-medium">Phase</th>
                <th className="px-2 py-1.5 text-right font-medium">Their moves</th>
                <th className="px-2 py-1.5 text-right font-medium">Costly</th>
                <th className="py-1.5 pl-2 text-right font-medium">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {PHASES.map((phase) => (
                <tr key={phase} data-costly-phase={phase}>
                  <td className="py-1.5 pr-2 text-secondary">{PHASE_LABEL[phase]}</td>
                  <td className="px-2 py-1.5 text-right tabular text-secondary">
                    {report.byPhase[phase].moves}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular text-primary">
                    {report.byPhase[phase].costly}
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular text-tertiary">
                    {percent(report.byPhase[phase].costly, report.byPhase[phase].moves)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {report.costly.length > 0 ? (
            <div className="overflow-x-auto rounded-[var(--radius-control)] border border-line-subtle">
              <table className="w-full border-collapse text-[11.5px]" data-costly-list>
                <thead>
                  <tr className="border-b border-line-subtle text-left text-[10.5px] text-tertiary">
                    <th className="px-2 py-1.5 font-medium">Game</th>
                    <th className="px-2 py-1.5 font-medium">Move</th>
                    <th className="px-2 py-1.5 font-medium">Engine preferred</th>
                    <th className="px-2 py-1.5 text-right font-medium">Before → after</th>
                    <th className="px-2 py-1.5 text-right font-medium">Win chance lost</th>
                    <th className="px-2 py-1.5 font-medium">Phase</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {report.costly.slice(0, 60).map((entry) => {
                    const game = byId.get(entry.gameId);
                    return (
                      <tr key={`${entry.gameId}-${entry.ply}`} data-costly-row>
                        <td className="max-w-[260px] truncate px-2 py-1.5 text-secondary">
                          {entry.white} – {entry.black}
                          {entry.date ? (
                            <span className="text-tertiary"> · {entry.date.slice(0, 4)}</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            disabled={!game}
                            onClick={() => game && onOpen(game, entry.nodeId)}
                            className="font-medium text-primary hover:text-accent-ink"
                            title="Open the game at the position before this move"
                          >
                            {entry.label}
                            {entry.playedSan}
                          </button>
                        </td>
                        <td className="px-2 py-1.5 text-secondary">{entry.bestSan ?? '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular text-secondary">
                          {formatScore(entry.before)} → {formatScore(entry.after)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular text-primary">
                          {Math.round(entry.cost * 100)}%
                        </td>
                        <td className="px-2 py-1.5 text-tertiary">{PHASE_LABEL[entry.phase]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : run.gamesDone > 0 ? (
            <p className="text-xs text-tertiary">
              No move in these games gave up {Math.round(COST_THRESHOLDS[threshold] * 100)}% of win
              chance or more at this engine time.
            </p>
          ) : null}
          <p className="text-[10.5px] text-tertiary">
            Scores are from White’s side. A short search can miss a deep resource, so a move listed
            here is a place to look, not a verdict; Careful gives the engine more time. A timed
            search is not exactly repeatable, so a second run can differ by a point or two.
          </p>
        </>
      ) : null}
    </section>
  );
}

function Tile({
  label,
  value,
  note,
}: {
  readonly label: string;
  readonly value: string;
  readonly note: string;
}) {
  return (
    <div className="rounded-[var(--radius-control)] border border-line-subtle bg-surface-2 px-3 py-2">
      <dt className="text-[10.5px] text-tertiary">{label}</dt>
      <dd className="text-lg font-semibold tabular text-primary">{value}</dd>
      <dd className="text-[10.5px] text-tertiary">{note}</dd>
    </div>
  );
}
