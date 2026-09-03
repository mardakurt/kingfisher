'use client';

/**
 * The opponent, as evidence rather than as a dashboard.
 *
 * Three questions in one column: what do they play, what has changed, and
 * which move orders do they use. Every number is followed by the sample it
 * came from, because the alternative — a clean percentage with no denominator
 * — is exactly how preparation gets built on four games.
 */

import { useMemo, useState } from 'react';

import { Segmented } from '@/components/ui/Tabs';
import type { GameRecord } from '@/persistence/types';
import {
  buildDossier,
  comparePeriods,
  moveOrderFingerprints,
  type DossierChoice,
} from '@/preparation/dossier';

type Section = 'plays' | 'changed' | 'move-orders';

const SECTIONS: readonly { id: Section; label: string }[] = [
  { id: 'plays', label: 'Plays' },
  { id: 'changed', label: 'Changed' },
  { id: 'move-orders', label: 'Move orders' },
];

export function DossierPanel({
  name,
  games,
  color,
  onOpenGames,
}: {
  readonly name: string;
  readonly games: readonly GameRecord[];
  /** Which colour the opponent has; the user's colour is the other one. */
  readonly color: 'w' | 'b';
  readonly onOpenGames?: (gameIds: readonly string[], label: string) => void;
}) {
  const [section, setSection] = useState<Section>('plays');
  const recentFromYear = new Date().getFullYear() - 2;

  const dossier = useMemo(
    () => buildDossier(name, games, { recentFromYear }),
    [name, games, recentFromYear],
  );
  const periods = useMemo(
    () => comparePeriods(games, name, color, recentFromYear),
    [games, name, color, recentFromYear],
  );
  const fingerprints = useMemo(
    () => moveOrderFingerprints(games, name, color, recentFromYear),
    [games, name, color, recentFromYear],
  );

  if (dossier.games === 0) {
    return (
      <section className="border-t border-line-subtle px-3 py-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
          Opponent dossier
        </h3>
        <p className="mt-1 text-[10.5px] leading-relaxed text-tertiary">
          No games by this player in the selected set. Widen the filters or import more games.
        </p>
      </section>
    );
  }

  const side = color === 'w' ? dossier.white : dossier.black;

  return (
    <section className="border-t border-line-subtle px-3 py-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
        Opponent dossier
      </h3>
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
            <p className="mt-1 rounded-[4px] bg-surface-2 px-2 py-1.5 text-[10px] leading-relaxed text-caution">
              Too few games in one window for these shares to mean much. Read the counts, not the
              percentages.
            </p>
          ) : null}
          <table className="mt-2 w-full text-[10.5px] tabular">
            <thead>
              <tr className="text-[9.5px] uppercase tracking-wide text-tertiary">
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
              className="flex items-baseline gap-2 rounded-[4px] px-1.5 py-1 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
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
        <h4 className="text-[9.5px] uppercase tracking-wide text-tertiary">{title}</h4>
        <p className="mt-1 text-[10px] text-tertiary">Not recorded in these games.</p>
      </div>
    );
  }
  return (
    <div>
      <h4 className="text-[9.5px] uppercase tracking-wide text-tertiary">{title}</h4>
      <ul className="mt-1 flex flex-col gap-0.5">
        {choices.map((choice) => (
          <li key={choice.label} className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[11px] text-primary">{choice.label}</span>
            {/* A bar, not a chart: proportion at a glance, number beside it. */}
            <span className="h-1 w-12 shrink-0 rounded-full bg-surface-3">
              <span
                className="block h-1 rounded-full bg-accent"
                style={{ width: `${Math.min(100, choice.frequency)}%` }}
              />
            </span>
            <span className="shrink-0 text-[10px] text-tertiary tabular">
              {choice.frequency}% <span className="text-[9px]">({choice.games}</span>
              <span className="text-[9px]">/{total})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
