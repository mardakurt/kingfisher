'use client';

/**
 * The opponent, as evidence rather than as a dashboard.
 *
 * Four questions in one column: what do they play, what has changed, what
 * move orders they use, and how their last twenty games read. Every number
 * is followed by the sample it came from, because the alternative — a clean
 * percentage with no denominator — is exactly how preparation gets built on
 * four games.
 */

import { useMemo, useState } from 'react';

import { Segmented } from '@/components/ui/Tabs';
import type { GameRecord } from '@/persistence/types';
import {
  buildDossier,
  comparePeriods,
  moveOrderFingerprints,
  recentForm,
  type DossierChoice,
  type RecentForm,
} from '@/preparation/dossier';

type Section = 'plays' | 'changed' | 'move-orders' | 'recent-form';

const SECTIONS: readonly { id: Section; label: string }[] = [
  { id: 'plays', label: 'Plays' },
  { id: 'changed', label: 'Changed' },
  { id: 'move-orders', label: 'Move orders' },
  { id: 'recent-form', label: 'Recent form' },
];

export function DossierPanel({
  name,
  aliases = [],
  games,
  color,
  onOpenGames,
}: {
  readonly name: string;
  /** Every spelling the games carry this player under. */
  readonly aliases?: readonly string[];
  readonly games: readonly GameRecord[];
  /** Which colour the opponent has; the user's colour is the other one. */
  readonly color: 'w' | 'b';
  readonly onOpenGames?: (gameIds: readonly string[], label: string) => void;
}) {
  const [section, setSection] = useState<Section>('plays');
  const recentFromYear = new Date().getFullYear() - 2;

  const names = useMemo(() => [name, ...aliases], [name, aliases]);
  const dossier = useMemo(
    () => buildDossier(name, games, { recentFromYear, aliases }),
    [name, aliases, games, recentFromYear],
  );
  const periods = useMemo(
    () => comparePeriods(games, names, color, recentFromYear),
    [games, names, color, recentFromYear],
  );
  const fingerprints = useMemo(
    () => moveOrderFingerprints(games, names, color, recentFromYear),
    [games, names, color, recentFromYear],
  );
  const form = useMemo(() => recentForm(games, names, color, 20), [games, names, color]);

  if (dossier.games === 0) {
    return (
      <section className="border-t border-line-subtle px-3 py-3">
        <h3 className="text-[10px] font-semibold text-tertiary">Opponent dossier</h3>
        <p className="mt-1 text-[10.5px] leading-relaxed text-tertiary">
          No games by this player in the selected set. Widen the filters or import more games.
        </p>
      </section>
    );
  }

  const side = color === 'w' ? dossier.white : dossier.black;

  return (
    <section className="border-t border-line-subtle px-3 py-3">
      <h3 className="text-[10px] font-semibold text-tertiary">Opponent dossier</h3>
      {/* The sample, before anything derived from it. */}
      <p className="mt-1 text-[10px] leading-relaxed text-tertiary tabular">
        {dossier.games} games · {side.games} as {color === 'w' ? 'White' : 'Black'}
        {dossier.ratingRange
          ? ` · Elo ${dossier.ratingRange.low}–${dossier.ratingRange.high}`
          : ' · Elo —'}
        {dossier.dateRange ? ` · ${dossier.dateRange.from}–${dossier.dateRange.to}` : ''}
      </p>

      <div className="mt-2 overflow-x-auto">
        <Segmented items={SECTIONS} value={section} onChange={setSection} />
      </div>

      {section === 'plays' ? (
        <div className="mt-2 flex flex-col gap-3">
          <ChoiceList
            title={`First move as ${color === 'w' ? 'White' : 'Black'}`}
            choices={side.firstMoves}
            total={side.games}
          />
          <ChoiceList title="Opening families" choices={side.openings} total={side.games} />
        </div>
      ) : null}

      {section === 'changed' ? (
        <div className="mt-2">
          <p className="text-[10px] leading-relaxed text-tertiary">
            Observed change in the selected games: {periods.historicalTotal} up to{' '}
            {periods.historicalWindow.to}, {periods.recentTotal} from {periods.recentWindow.from}.
          </p>
          {periods.thin ? (
            <p className="mt-1 rounded-[var(--radius-control)] bg-surface-2 px-2 py-1.5 text-[10px] leading-relaxed text-caution">
              Too few games in one window for these shares to mean much. Read the counts, not the
              percentages.
            </p>
          ) : null}
          <table className="mt-2 w-full text-[10.5px] tabular">
            <thead>
              <tr className="text-[9.5px] text-tertiary">
                <th className="pb-1 text-left font-medium">Opening</th>
                <th className="pb-1 text-right font-medium">≤{periods.historicalWindow.to}</th>
                <th className="pb-1 text-right font-medium">{periods.recentWindow.from}+</th>
                <th className="pb-1 text-right font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {periods.rows.slice(0, 8).map((row) => (
                <tr key={row.label} className="border-t border-line-subtle">
                  <td className="truncate py-1 pr-2 text-primary">{row.label}</td>
                  <td className="py-1 text-right text-tertiary">
                    {row.historicalFrequency}%{' '}
                    <span className="text-[9px]">({row.historicalGames})</span>
                  </td>
                  <td className="py-1 text-right text-secondary">
                    {row.recentFrequency}% <span className="text-[9px]">({row.recentGames})</span>
                  </td>
                  <td
                    className={
                      row.change > 0
                        ? 'py-1 text-right text-positive'
                        : row.change < 0
                          ? 'py-1 text-right text-negative'
                          : 'py-1 text-right text-tertiary'
                    }
                  >
                    {row.change > 0 ? '+' : ''}
                    {row.change}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {periods.rows.length === 0 ? (
            <p className="mt-2 text-[10px] text-tertiary">
              No opening names in these games to compare.
            </p>
          ) : null}
        </div>
      ) : null}

      {section === 'move-orders' ? (
        <div className="mt-2 flex flex-col gap-1.5">
          <p className="text-[10px] leading-relaxed text-tertiary">
            Move orders present in these games. Each opens the games it was seen in.
          </p>
          {fingerprints.length === 0 ? (
            <p className="text-[10px] text-tertiary">
              None of the tracked move orders appear in this set.
            </p>
          ) : null}
          {fingerprints.map((print) => (
            <button
              key={print.id}
              type="button"
              className="flex items-baseline gap-2 rounded-[var(--radius-control)] px-1.5 py-1 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
              onClick={() => onOpenGames?.(print.gameIds, print.label)}
            >
              <span className="min-w-0 flex-1 truncate text-[11px] text-primary">
                {print.label}
              </span>
              <span className="shrink-0 text-[10px] text-tertiary tabular">
                {print.frequency}% · {print.games} game{print.games === 1 ? '' : 's'}
                {print.recentGames > 0 ? ` · ${print.recentGames} recent` : ''}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {section === 'recent-form' ? <RecentFormSection form={form} /> : null}
    </section>
  );
}

function ChoiceList({
  title,
  choices,
  total,
}: {
  readonly title: string;
  readonly choices: readonly DossierChoice[];
  readonly total: number;
}) {
  if (choices.length === 0) {
    return (
      <div>
        <h4 className="text-[9.5px] text-tertiary">{title}</h4>
        <p className="mt-1 text-[10px] text-tertiary">Not recorded in these games.</p>
      </div>
    );
  }
  /*
    A table the width of what it says, not of the page: at 1440px the label
    sat at the left edge and its figures 1,100px away at the right (Phase 87).
    Their score beside the share, with the results it is made of — the same
    games, from the opponent's side of the board.
  */
  return (
    <div className="max-w-2xl">
      <table className="w-full table-fixed text-[11px] tabular" data-dossier-choices={title}>
        <caption className="pb-1 text-left text-[9.5px] text-tertiary">{title}</caption>
        {/* Fixed columns, so the first-move and family tables line up. */}
        <colgroup>
          <col />
          <col className="w-14" />
          <col className="w-24" />
          <col className="w-24" />
          <col className="w-24" />
        </colgroup>
        <thead>
          <tr className="text-[9.5px] text-tertiary">
            <th className="pb-1 text-left font-medium">
              <span className="sr-only">Choice</span>
            </th>
            <th className="pb-1 text-right font-medium" colSpan={2}>
              Share of {total}
            </th>
            <th className="pb-1 pl-4 text-right font-medium">Their score</th>
            <th className="pb-1 pl-2 text-right font-medium">
              <abbr title="Wins, draws, losses — theirs" className="no-underline">
                +W =D −L
              </abbr>
            </th>
          </tr>
        </thead>
        <tbody>
          {choices.map((choice) => (
            <tr key={choice.label} className="border-t border-line-subtle">
              <td className="truncate py-1 pr-3 text-primary" title={choice.label}>
                {choice.label}
              </td>
              <td className="w-14 py-1">
                {/* A bar, not a chart: proportion at a glance, number beside it. */}
                <span className="block h-1 w-12 rounded-full bg-surface-3">
                  <span
                    className="block h-1 rounded-full bg-accent"
                    style={{ width: `${Math.min(100, choice.frequency)}%` }}
                  />
                </span>
              </td>
              <td className="py-1 text-right text-secondary">
                {choice.frequency}%{' '}
                <span className="text-[9.5px] text-tertiary">({choice.games})</span>
              </td>
              <td className="py-1 pl-4 text-right text-secondary">{choice.score}%</td>
              <td className="py-1 pl-2 text-right text-[10px] text-tertiary">
                +{choice.wins} ={choice.draws} −{choice.losses}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/*
 * Recent form: the last 20 games, newest on the left, as a strip of W / D / L
 * with a one-line tally under it. A line of Ws followed by Ls is an
 * observation, never a verdict — the section is the dossier's view of the
 * opponent's recent past, not a prediction of the next game.
 */
function RecentFormSection({ form }: { readonly form: RecentForm }) {
  if (form.games.length === 0) {
    return (
      <p className="mt-2 text-[10px] text-tertiary">
        No games by this player on the selected colour. Widen the filters or change the colour.
      </p>
    );
  }
  return (
    <div className="mt-2">
      <p className="text-[10px] leading-relaxed text-tertiary">
        Last {form.games.length} game{form.games.length === 1 ? '' : 's'} as{' '}
        {form.games[0]?.outcome === form.games.at(-1)?.outcome ? 'one run' : 'mixed form'} ·{' '}
        <span className="text-positive tabular">{form.wins}W</span>{' '}
        <span className="text-tertiary tabular">{form.draws}D</span>{' '}
        <span className="text-negative tabular">{form.losses}L</span>
      </p>
      {/* The strip — each game is one tile, the colour carries the outcome. */}
      <div className="mt-2 flex flex-wrap gap-px overflow-hidden rounded-[var(--radius-control)]">
        {form.games.map((game) => (
          <span
            key={game.id}
            title={`${game.outcome}${game.year !== undefined ? ` · ${game.year}` : ''}`}
            aria-label={`${game.outcome}${game.year !== undefined ? ` ${game.year}` : ''}`}
            className={tileClass(game.outcome)}
          >
            {game.outcome}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[9.5px] leading-relaxed text-tertiary">
        Newest on the left. A run of Ws is an observation, not a verdict — the row above shows it as
        one sentence and the strip below it as one tile each.
      </p>
    </div>
  );
}

function tileClass(outcome: 'W' | 'D' | 'L'): string {
  const base = 'inline-flex h-5 w-5 items-center justify-center font-mono text-[9.5px]';
  if (outcome === 'W') return `${base} bg-positive/15 text-positive`;
  if (outcome === 'D') return `${base} bg-surface-3 text-tertiary`;
  return `${base} bg-negative/15 text-negative`;
}
