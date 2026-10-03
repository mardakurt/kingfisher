'use client';

/**
 * An engine match in the engine panel: two engines play a short match from
 * the board's position, colours alternating, and the panel reports the score,
 * the Elo difference with its 95% interval, and how many results were
 * adjudicated (`src/engine/match.ts`). The games are kept until the person
 * saves them as a study or copies them as PGN.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { Fen } from '@/chess/types';
import { Button } from '@/components/ui/Button';
import { matchStatistics } from '@/engine/match';
import { DEFAULT_ENGINE_ID } from '@/engine/registry';
import { useVisibleEngineDefinitions } from '@/engine/use-engines';
import { useEngine } from '@/stores/engine-store';
import { useMatch } from '@/stores/match-store';
import { useUi } from '@/stores/ui-store';

const COUNTS = [2, 4, 10, 20, 50, 100] as const;
const MILLISECONDS = [50, 100, 250, 500, 1000, 2000] as const;
const MAX_PLIES = 300;

const SELECT =
  'h-6 max-w-[11rem] rounded-[var(--radius-control)] border border-line bg-surface-inset px-1 text-[10.5px] text-primary';

const signed = (value: number | null): string =>
  value === null ? '∞' : `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value)}`;

export function MatchSection({ fen }: { readonly fen: Fen }) {
  const match = useMatch();
  const notify = useUi((state) => state.notify);
  const router = useRouter();
  const engines = useVisibleEngineDefinitions();
  const primary = useEngine((state) => state.primary.engineId) ?? DEFAULT_ENGINE_ID;
  const [open, setOpen] = useState(false);
  const [engineA, setEngineA] = useState<string | null>(null);
  const [engineB, setEngineB] = useState<string | null>(null);
  const [games, setGames] = useState<number>(10);
  const [ms, setMs] = useState<number>(250);
  const a = engineA ?? primary;
  const b = engineB ?? primary;
  const stats = matchStatistics(match.games);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(match.pgn());
      notify({ tone: 'success', message: `${match.games.length} match games copied as PGN.` });
    } catch {
      notify({ tone: 'error', message: 'The clipboard refused the games.' });
    }
  };
  const save = async () => {
    try {
      const id = await match.saveAsStudy();
      notify({ tone: 'success', message: 'Match saved as a study, one chapter per game.' });
      router.push(`/studies?study=${encodeURIComponent(id)}`);
    } catch (error) {
      notify({ tone: 'error', message: error instanceof Error ? error.message : 'Not saved.' });
    }
  };

  const engineSelect = (label: string, value: string, onChange: (id: string) => void) => (
    <label className="flex items-center gap-1">
      {label}
      <select
        aria-label={`Engine ${label}`}
        className={SELECT}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {engines.map((engine) => (
          <option key={engine.id} value={engine.id}>
            {engine.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section
      className="border-t border-line-subtle px-2.5 py-1.5 text-[10.5px]"
      aria-label="Engine match"
      data-match={match.status}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-tertiary">Engine match</span>
        {match.status === 'running' ? (
          <Button size="sm" variant="ghost" onClick={match.stop} data-match-stop>
            Stop · {match.games.length} played
          </Button>
        ) : match.status === 'idle' ? (
          <Button size="sm" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            Match…
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={match.reset}>
            Discard
          </Button>
        )}
      </div>

      {match.status === 'idle' && open ? (
        <div className="mt-1.5 space-y-1.5 text-tertiary" data-match-form>
          <div className="flex flex-wrap items-center gap-2">
            {engineSelect('A', a, setEngineA)}
            {engineSelect('B', b, setEngineB)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label>
              Games{' '}
              <select
                aria-label="Match games"
                className={SELECT}
                value={games}
                onChange={(event) => setGames(Number(event.target.value))}
              >
                {COUNTS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Per move{' '}
              <select
                aria-label="Match time per move"
                className={SELECT}
                value={ms}
                onChange={(event) => setMs(Number(event.target.value))}
              >
                {MILLISECONDS.map((value) => (
                  <option key={value} value={value}>
                    {value} ms
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p>
            From this position, colours alternating game by game, both engines with one thread and
            the same time a move. A game ends by the rules; one still going after {MAX_PLIES} plies
            is scored as a draw and counted as adjudicated. Choosing the same engine twice plays two
            separate sessions of it.
          </p>
          <Button
            size="sm"
            variant="accent"
            data-match-start
            onClick={() => {
              setOpen(false);
              void match.start(fen, a, b, { games, msPerMove: ms, maxPlies: MAX_PLIES });
            }}
          >
            Start {games} games
          </Button>
        </div>
      ) : null}

      {match.status !== 'idle' && match.names ? (
        <div className="mt-1 space-y-0.5" data-match-report>
          <p className="text-secondary tabular">
            {match.names.a} v {match.names.b}: {stats.wins}–{stats.draws}–{stats.losses}
            {match.status === 'running'
              ? ` · game ${match.games.length + 1}, ply ${match.plies}`
              : ''}
          </p>
          {stats.games > 0 ? (
            <p className="text-tertiary tabular" data-match-stats>
              A scored {(stats.score * 100).toFixed(1)}% over {stats.games}{' '}
              {stats.games === 1 ? 'game' : 'games'} · Elo{' '}
              {stats.elo === null ? 'unbounded' : signed(stats.elo)} (95%:{' '}
              {signed(stats.eloLow === null ? null : stats.eloLow)} to {signed(stats.eloHigh)})
              {stats.los === null ? '' : ` · LOS ${(stats.los * 100).toFixed(0)}%`}
              {stats.unfinished ? ` · ${stats.unfinished} adjudicated at the ply limit` : ''}
            </p>
          ) : null}
          {match.stopped ? (
            <p className="text-caution">Stopped; the game in progress was not counted.</p>
          ) : null}
          {match.status === 'error' ? (
            <p className="text-negative" role="alert">
              {match.error}
            </p>
          ) : null}
          {match.status !== 'running' && match.games.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <Button size="sm" onClick={() => void copy()} data-match-copy>
                Copy PGN
              </Button>
              <Button size="sm" onClick={() => void save()} data-match-save>
                Save as study
              </Button>
            </div>
          ) : null}
          {stats.games > 0 && stats.games < 40 ? (
            <p className="text-tertiary">
              {stats.games} games cannot separate engines closer than a few hundred Elo; the
              interval says how far the result can be trusted.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
