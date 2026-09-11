/**
 * What the player's own review history adds up to.
 *
 * Counting, and nothing else. Every number here is the size of a set the user
 * can open, which is the property that separates a useful summary from
 * decorative analytics: "Trade decisions · 11" is worth showing only because
 * clicking it produces those eleven positions.
 *
 * Deliberately absent: any single figure describing the player. No accuracy,
 * no rating estimate, no "chess IQ", no trend line fitted through four data
 * points. Those are the numbers that feel like progress and measure nothing,
 * and a workstation that prints one is teaching the wrong lesson about
 * evidence.
 */

import type { DecisionRecord, ReviewItemRecord, TrainingItemRecord } from '@/persistence/domain';
import { themeLabel } from '@/persistence/domain';

export interface ThemeCount {
  readonly theme: string;
  readonly label: string;
  readonly count: number;
}

export interface PeriodDefinition {
  readonly id: string;
  readonly label: string;
  /** Milliseconds back from `now`; `null` means all time. */
  readonly windowMs: number | null;
}

export const PERIODS: readonly PeriodDefinition[] = [
  { id: '30d', label: 'Last 30 days', windowMs: 30 * 86_400_000 },
  { id: '90d', label: 'Last 90 days', windowMs: 90 * 86_400_000 },
  { id: 'all', label: 'All time', windowMs: null },
];

export const periodStart = (period: PeriodDefinition, now: number): number =>
  period.windowMs === null ? 0 : now - period.windowMs;

/** Review items the player has actually dealt with, newest first. */
export function reviewedItems(
  items: readonly ReviewItemRecord[],
  since = 0,
): readonly ReviewItemRecord[] {
  return items
    .filter(
      (item) =>
        (item.status === 'reviewed' || item.status === 'converted') &&
        (item.reviewedAt ?? item.createdAt) >= since,
    )
    .sort((a, b) => (b.reviewedAt ?? b.createdAt) - (a.reviewedAt ?? a.createdAt));
}

/**
 * How often each theme appears, most frequent first.
 *
 * A position tagged with three themes counts once against each of them, which
 * is what the player means by tagging it three times — the total across
 * themes is therefore larger than the number of positions, and the caller is
 * expected to label it as such rather than presenting it as a percentage.
 */
export function countThemes(
  records: readonly { readonly themes: readonly string[] }[],
): readonly ThemeCount[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    for (const theme of record.themes) counts.set(theme, (counts.get(theme) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([theme, count]) => ({ theme, label: themeLabel(theme), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export interface ThemeTrend {
  readonly theme: string;
  readonly label: string;
  /** Counts per period, in the order the periods were given. */
  readonly counts: readonly number[];
}

/**
 * The same themes counted over several windows.
 *
 * No direction, no arrow, no "improving". Two windows of a handful of reviewed
 * positions cannot support a claim about a trend, and the honest presentation
 * is the two counts side by side so the reader can see how thin the evidence
 * is.
 */
export function themeTrends(
  records: readonly { readonly themes: readonly string[]; readonly at: number }[],
  windows: readonly { readonly from: number; readonly to: number }[],
): readonly ThemeTrend[] {
  const themes = new Set<string>();
  for (const record of records) for (const theme of record.themes) themes.add(theme);

  return [...themes]
    .map((theme) => ({
      theme,
      label: themeLabel(theme),
      counts: windows.map(
        (window) =>
          records.filter(
            (record) =>
              record.at >= window.from && record.at < window.to && record.themes.includes(theme),
          ).length,
      ),
    }))
    .sort(
      (a, b) =>
        b.counts.reduce((sum, value) => sum + value, 0) -
          a.counts.reduce((sum, value) => sum + value, 0) || a.label.localeCompare(b.label),
    );
}

export interface ImprovementReportInput {
  readonly reviewItems: readonly ReviewItemRecord[];
  readonly decisions: readonly DecisionRecord[];
  readonly trainingItems: readonly TrainingItemRecord[];
  readonly from: number;
  readonly to: number;
}

export interface ReportFigure {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  /** What clicking it should open, when it leads anywhere. */
  readonly drillTo?: 'reviewed' | 'unreviewed' | 'decisions' | 'training' | 'deviations';
  readonly detail?: string;
}

export interface ImprovementReport {
  readonly figures: readonly ReportFigure[];
  readonly themes: readonly ThemeCount[];
  /** Positions reviewed, grouped by the game they came from. */
  readonly gamesReviewed: number;
  readonly structures: readonly ThemeCount[];
}

export function improvementReport(input: ImprovementReportInput): ImprovementReport {
  const inWindow = <T extends { readonly at: number }>(records: readonly T[]) =>
    records.filter((record) => record.at >= input.from && record.at < input.to);

  const reviewed = inWindow(
    input.reviewItems
      .filter((item) => item.status === 'reviewed' || item.status === 'converted')
      .map((item) => ({ ...item, at: item.reviewedAt ?? item.createdAt })),
  );
  const unreviewed = input.reviewItems.filter((item) => item.status === 'unreviewed');
  const decisions = inWindow(
    input.decisions.map((decision) => ({ ...decision, at: decision.createdAt })),
  );
  const training = inWindow(input.trainingItems.map((item) => ({ ...item, at: item.createdAt })));
  const deviations = reviewed.filter((item) =>
    item.signals.some((signal) => signal.kind === 'repertoire-deviation'),
  );
  /*
   * "Critical moments" counts the positions tagged with a king-safety
   * theme, which is the single most common critical-moment category in
   * Phase 42's review data and the closest thing the report has to an
   * answer for "how many positions did your king get into trouble?". It
   * is a count of tagged positions, not a claim about safety.
   */
  const kingSafety = reviewed.filter((item) => item.themes.includes('king-safety'));
  /*
   * "Tablebase WDL losses" is the count of positions where the player
   * played into a known-loss tablebase verdict. A signal of kind
   * `tablebase-change` is the canonical marker; a theme of `tablebase`
   * captures the case where the player tagged the position after the
   * fact. Both must agree before the count is real.
   */
  const tablebaseLosses = reviewed.filter(
    (item) =>
      item.themes.includes('tablebase') ||
      item.signals.some((signal) => signal.kind === 'tablebase-change'),
  );
  const games = new Set(
    reviewed.map((item) => item.gameId).filter((id): id is string => id !== undefined),
  );

  const figures: readonly ReportFigure[] = [
    {
      id: 'games-reviewed',
      label: 'Games reviewed',
      value: games.size,
      detail: 'Distinct games with at least one reviewed position.',
    },
    {
      id: 'positions-reviewed',
      label: 'Positions reviewed',
      value: reviewed.length,
      drillTo: 'reviewed',
    },
    {
      id: 'positions-waiting',
      label: 'Positions waiting',
      value: unreviewed.length,
      drillTo: 'unreviewed',
      detail: 'Not limited to this period: a queue is a queue.',
    },
    {
      id: 'decisions-recorded',
      label: 'Decisions recorded',
      value: decisions.length,
      drillTo: 'decisions',
      detail: 'Answers written before the evidence was revealed.',
    },
    {
      id: 'training-created',
      label: 'Training positions created',
      value: training.length,
      drillTo: 'training',
    },
    {
      id: 'repertoire-deviations',
      label: 'Repertoire deviations reviewed',
      value: deviations.length,
      drillTo: 'deviations',
    },
    {
      id: 'king-safety-moments',
      label: 'King-safety critical moments',
      value: kingSafety.length,
      drillTo: 'reviewed',
      detail: 'Reviewed positions tagged for king safety.',
    },
    {
      id: 'tablebase-wdl-losses',
      label: 'Tablebase WDL losses',
      value: tablebaseLosses.length,
      drillTo: 'reviewed',
      detail: 'Reviewed positions where the verdict was a known loss.',
    },
  ];

  return {
    figures,
    themes: countThemes(reviewed),
    gamesReviewed: games.size,
    // Structures are counted from the tags the player applied, not guessed.
    structures: countThemes(
      reviewed.map((item) => ({
        themes: item.themes.filter((theme) => theme.startsWith('structure:')),
      })),
    ),
  };
}

/**
 * Reviewed positions carrying a theme, for the drill-down.
 *
 * The list, not the count: the whole justification for showing "11" is that
 * this function returns the eleven.
 */
export function itemsWithTheme(
  items: readonly ReviewItemRecord[],
  theme: string,
  since = 0,
): readonly ReviewItemRecord[] {
  return reviewedItems(items, since).filter((item) => item.themes.includes(theme));
}
