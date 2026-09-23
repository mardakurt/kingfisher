'use client';

/**
 * The five sections of a season, in the order `season.md` lists them.
 *
 * Every section shows its denominator in words: `X of your Y games this
 * season`. Every section carries a "First seen" line when the player has
 * earlier seasons in the log for the same URL, and `First season for this
 * set` when the log is empty.
 *
 * No invented score, no "you've improved" headline. The reader counts and
 * the player reads; that is the design.
 */

import { useMemo } from 'react';
import Link from 'next/link';

import { Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { formatThink } from '@/round/clock';
import type { SeasonReport, SeasonSection } from '@/season/season';
import { useSeasonLog } from '@/stores/season-log-store';

const PHASE_LABEL = {
  opening: 'Opening',
  middlegame: 'Middlegame',
  endgame: 'Endgame',
} as const;

interface SeasonSectionsProps {
  readonly report: SeasonReport;
  readonly url: string;
}

export function SeasonSections({ report, url }: SeasonSectionsProps) {
  const logEntry = useSeasonLog((state) => state.firstSeen(url));
  return (
    <div className="flex flex-col gap-3" data-season-sections="true">
      {report.sections.map((section, index) => (
        <SectionBlock
          key={`${section.source.source}-${index}`}
          section={section}
          auditLines={Array.from({ length: 5 }, (_, sectionIndex) =>
            auditLine(logEntry, index * 5 + sectionIndex),
          )}
        />
      ))}
    </div>
  );
}

interface SectionBlockProps {
  readonly section: SeasonSection;
  readonly auditLines: readonly string[];
}

function SectionBlock({ section, auditLines }: SectionBlockProps) {
  const gamesCount = section.source.games.length;
  const gamesLabel = gamesCount === 1 ? '1 game' : `${gamesCount} games`;
  const sourceLabel = section.source.sourceLabel;

  return (
    <Panel>
      <PanelHeader>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-primary">
            {sourceLabel} · {gamesLabel} this season
          </h2>
        </div>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-4">
        <PhaseSection section={section} audit={auditLines[0] ?? 'First season for this set'} />
        <PerMoveSection section={section} audit={auditLines[1] ?? 'First season for this set'} />
        <LongestPositionsSection
          section={section}
          audit={auditLines[2] ?? 'First season for this set'}
        />
        <TimeTroubleSection
          section={section}
          audit={auditLines[3] ?? 'First season for this set'}
        />
        <SlowestOpeningsSection
          section={section}
          audit={auditLines[4] ?? 'First season for this set'}
        />
      </PanelBody>
    </Panel>
  );
}

function auditLine(
  entry: ReturnType<typeof useSeasonLog.getState>['entries'][number] | null,
  index: number,
): string {
  if (!entry || entry.firstSeenAt === entry.lastSeenAt) return 'First season for this set';
  const timestamp = entry.sectionFirstSeenAt[index];
  if (timestamp === undefined) return 'First season for this set';
  return `This reading dates from ${new Date(timestamp).toLocaleDateString()}`;
}

function SectionHeading({
  children,
  audit,
}: {
  readonly children: string;
  readonly audit: string;
}) {
  return (
    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold text-primary">{children}</h3>
      <span className="text-xs text-secondary">{audit}</span>
    </div>
  );
}

function ClockDenominator({ section }: { readonly section: SeasonSection }) {
  const missing = section.totalGames - section.gamesWithClock;
  return (
    <p className="mb-1.5 text-xs text-secondary">
      Clock data in {section.gamesWithClock} of {section.totalGames}{' '}
      {section.totalGames === 1 ? 'game' : 'games'} in this named set
      {missing > 0 ? ` · ${missing} without clocks` : ''}.
    </p>
  );
}

function PhaseSection({
  section,
  audit,
}: {
  readonly section: SeasonSection;
  readonly audit: string;
}) {
  return (
    <section>
      <SectionHeading audit={audit}>Per phase</SectionHeading>
      <ClockDenominator section={section} />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-secondary">
            <th className="py-1">Phase</th>
            <th className="py-1 text-right">Total thinking</th>
            <th className="py-1 text-right">Moves</th>
            <th className="py-1 text-right">Average per move</th>
          </tr>
        </thead>
        <tbody>
          {section.phases.map((row) => (
            <tr key={row.phase} className="border-t border-line-subtle">
              <td className="py-1">{PHASE_LABEL[row.phase]}</td>
              <td className="py-1 text-right tabular-nums">{formatThink(row.totalSeconds)}</td>
              <td className="py-1 text-right tabular-nums">{row.moves}</td>
              <td className="py-1 text-right tabular-nums">{formatThink(row.averageSeconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PerMoveSection({
  section,
  audit,
}: {
  readonly section: SeasonSection;
  readonly audit: string;
}) {
  const maxAvg = useMemo(
    () => Math.max(1, ...section.perMoveNumber.map((row) => row.averageSeconds)),
    [section.perMoveNumber],
  );
  if (section.perMoveNumber.length === 0) return null;
  return (
    <section>
      <SectionHeading audit={audit}>Per move number</SectionHeading>
      <ClockDenominator section={section} />
      <p className="mb-2 text-xs text-secondary">
        Bars highlighted: at least one game was under the time-trouble threshold on this move.
      </p>
      <div className="flex h-16 items-end gap-0.5">
        {section.perMoveNumber.map((row) => (
          <div
            key={row.moveNumber}
            className="flex flex-1 flex-col items-center justify-end gap-0.5"
            title={`Move ${row.moveNumber} · ${formatThink(row.averageSeconds)} avg · ${row.gamesCounted} game(s)${row.anyInTimeTrouble ? ' · in time trouble' : ''}`}
          >
            <div
              className="w-full rounded-sm"
              style={{
                height: `${Math.max(2, (row.averageSeconds / maxAvg) * 100)}%`,
                background: row.anyInTimeTrouble ? 'var(--accent)' : 'var(--border-strong)',
              }}
            />
            <span className="text-[10px] text-secondary">{row.moveNumber}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function LongestPositionsSection({
  section,
  audit,
}: {
  readonly section: SeasonSection;
  readonly audit: string;
}) {
  if (section.longestPositions.length === 0) {
    return (
      <section>
        <SectionHeading audit={audit}>Positions you spent longest on</SectionHeading>
        <ClockDenominator section={section} />
        <p className="text-sm text-secondary">No clocks to read in the named set.</p>
      </section>
    );
  }
  return (
    <section>
      <SectionHeading audit={audit}>Positions you spent longest on</SectionHeading>
      <ClockDenominator section={section} />
      <ul className="flex flex-col gap-2">
        {section.longestPositions.map((row) => (
          <li
            key={row.positionKey}
            className="rounded-md border border-line-subtle bg-surface-1 p-2"
          >
            <div className="flex items-baseline justify-between gap-2">
              <Link
                href={`/position?fen=${encodeURIComponent(row.fen)}`}
                className="text-sm font-semibold text-accent hover:underline"
              >
                {row.firstSeenMoveNumber === row.lastSeenMoveNumber
                  ? `Position at move ${row.firstSeenMoveNumber}`
                  : `Position at moves ${row.firstSeenMoveNumber}–${row.lastSeenMoveNumber}`}
              </Link>
              <span className="text-xs text-secondary">
                {formatThink(row.totalSeconds)} across {row.gameCount}{' '}
                {row.gameCount === 1 ? 'game' : 'games'}
              </span>
            </div>
            <ul className="mt-1 text-xs text-secondary">
              {row.games.slice(0, 5).map((g) => (
                <li key={`${g.gameId}-${g.moveNumber}`} className="flex justify-between gap-2">
                  <span>
                    Move {g.moveNumber} · played {g.followUpSan}
                    {g.evaluationChange ? ` · ${g.evaluationChange}` : ''}
                  </span>
                  <span className="tabular-nums">
                    {formatThink(g.seconds)} · {g.result ?? '?'}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TimeTroubleSection({
  section,
  audit,
}: {
  readonly section: SeasonSection;
  readonly audit: string;
}) {
  return (
    <section>
      <SectionHeading audit={audit}>Time trouble per move</SectionHeading>
      <ClockDenominator section={section} />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-secondary">
            <th className="py-1">Move</th>
            <th className="py-1 text-right">In trouble</th>
            <th className="py-1 text-right">Games in this set with clocks</th>
          </tr>
        </thead>
        <tbody>
          {section.timeTrouble.map((row) => (
            <tr key={row.moveNumber} className="border-t border-line-subtle">
              <td className="py-1">Move {row.moveNumber}</td>
              <td className="py-1 text-right tabular-nums">{row.gamesInTrouble}</td>
              <td className="py-1 text-right tabular-nums">{row.totalGames}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SlowestOpeningsSection({
  section,
  audit,
}: {
  readonly section: SeasonSection;
  readonly audit: string;
}) {
  if (section.slowestOpenings.length === 0) {
    return (
      <section>
        <SectionHeading audit={audit}>Slowest openings</SectionHeading>
        <ClockDenominator section={section} />
        <p className="text-sm text-secondary">
          Not enough clock data after move 15 to rank openings. Try a longer named set.
        </p>
      </section>
    );
  }
  return (
    <section>
      <SectionHeading audit={audit}>Slowest openings</SectionHeading>
      <ClockDenominator section={section} />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-secondary">
            <th className="py-1">Opening (ECO)</th>
            <th className="py-1 text-right">Average remaining after move 15</th>
            <th className="py-1 text-right">W / L / D</th>
            <th className="py-1 text-right">Games</th>
          </tr>
        </thead>
        <tbody>
          {section.slowestOpenings.map((row) => (
            <tr key={row.opening} className="border-t border-line-subtle">
              <td className="py-1">
                <Link
                  href={`/preparation?player=${encodeURIComponent(row.player)}&side=${row.color}&eco=${encodeURIComponent(row.opening)}`}
                  className="text-accent hover:underline"
                >
                  {row.opening} · {row.color === 'w' ? 'White' : 'Black'}
                </Link>
              </td>
              <td className="py-1 text-right tabular-nums">
                {formatThink(row.averageRemainingSeconds)}
              </td>
              <td className="py-1 text-right tabular-nums">
                {row.wins} / {row.losses} / {row.draws}
              </td>
              <td className="py-1 text-right tabular-nums">{row.games}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
