/**
 * One position, everything Kingfisher already knows about it, in one place.
 *
 * The evidence in this report is not new: reference statistics, repertoire
 * decisions, model games, the player's own games, journal entries and stored
 * engine lines each already have a panel. What did not exist was the answer
 * to "what do I know about *this position*" without visiting six of them and
 * remembering what the seventh said.
 *
 * Two rules shape every section, and both are about not lying:
 *
 * §38 — every section names where its evidence came from. "Mega 2026 ·
 * 18,431 games" is a citation; "the database says" is a rumour. A section
 * with no provenance is a section that cannot be checked.
 *
 * §39 — a move is never highlighted as "best". It is highlighted as "most
 * played" or "highest scoring among moves with at least 100 games", which
 * are facts about the sample with a stated threshold. Engine opinion is
 * separate evidence and stays in its own section, attributed to the engine
 * and the depth that produced it.
 *
 * This module is pure. It takes evidence that has already been fetched and
 * arranges it; it performs no queries, so the arrangement rules and the
 * highlight criteria can be tested without a database or a network.
 */

import type { DatabaseMove, ExplorerResult } from '@/database/types';
import type {
  DecisionRecord,
  ModelGameLinkRecord,
  PinnedLineRecord,
  RepertoirePositionRecord,
  ReviewItemRecord,
} from '@/persistence/domain';
import type { GameSummary } from '@/persistence/types';

/**
 * How many games a move needs before its score is quoted.
 *
 * A move played three times with three wins is not a 100% scoring move, it
 * is three games. Any threshold is arbitrary, so the number is stated in the
 * label rather than hidden in this constant.
 */
export const SCORE_SAMPLE_THRESHOLD = 100;

export interface ReportEntry {
  readonly primary: string;
  readonly secondary?: string;
  /** Why this entry is being pointed at, in factual terms. Never "best". */
  readonly criterion?: string;
}

export interface ReportSection {
  readonly id: string;
  readonly title: string;
  /** Where this section's evidence came from. Absent only when there is none. */
  readonly provenance: string | null;
  readonly entries: readonly ReportEntry[];
  /** Why the section is empty, when it is. Never left silently blank. */
  readonly emptyReason: string | null;
}

export interface PositionReport {
  readonly fen: string;
  readonly generatedAt: number;
  readonly sections: readonly ReportSection[];
}

export interface PositionReportInput {
  readonly fen: string;
  readonly explorer?: ExplorerResult | null;
  /** Why the reference lookup produced nothing, when it did not run or failed. */
  readonly explorerUnavailable?: string;
  readonly repertoire?: readonly RepertoirePositionRecord[];
  readonly repertoireNames?: Readonly<Record<string, string>>;
  readonly modelGames?: readonly ModelGameLinkRecord[];
  readonly personalGames?: readonly GameSummary[];
  /**
   * How many local games reached this position, when the count is known but
   * the summaries have not been fetched. The position index can answer "how
   * many" far more cheaply than "which", and a count with no list is still a
   * fact worth reporting — as a count, not as an empty list.
   */
  readonly personalGameCount?: number;
  readonly personalGamesSource?: string;
  readonly decisions?: readonly DecisionRecord[];
  readonly reviewItems?: readonly ReviewItemRecord[];
  readonly pinnedLines?: readonly PinnedLineRecord[];
  readonly tablebase?: {
    readonly category: string;
    readonly dtz?: number;
    readonly source: string;
  };
  readonly structure?: { readonly claims: readonly string[]; readonly definitionVersion: string };
  /**
   * Strategic themes that hold here, each with the rule that decided it.
   *
   * The definition travels with the theme rather than living only in the
   * catalogue, because a label the reader cannot check is a label they have to
   * take on trust — which is the same failure as an uncited statistic.
   */
  readonly themes?: readonly { readonly name: string; readonly definition: string }[];
  readonly themeVersion?: string;
  readonly now?: number;
}

export function buildPositionReport(input: PositionReportInput): PositionReport {
  return {
    fen: input.fen,
    generatedAt: input.now ?? Date.now(),
    sections: [
      openingSection(input),
      referenceSection(input),
      notableMovesSection(input),
      tablebaseSection(input),
      repertoireSection(input),
      modelGamesSection(input),
      personalGamesSection(input),
      themesSection(input),
      structureSection(input),
      engineSection(input),
      journalSection(input),
    ],
  };
}

const empty = (id: string, title: string, reason: string): ReportSection => ({
  id,
  title,
  provenance: null,
  entries: [],
  emptyReason: reason,
});

function openingSection(input: PositionReportInput): ReportSection {
  const opening = input.explorer?.opening;
  if (!opening) {
    return empty(
      'opening',
      'Opening',
      'No reference source named this position, so no ECO code is claimed for it.',
    );
  }
  return {
    id: 'opening',
    title: 'Opening',
    provenance: sourceLabel(input.explorer),
    entries: [
      {
        primary: opening.eco ? `${opening.eco} · ${opening.name}` : opening.name,
        ...(opening.variation ? { secondary: opening.variation } : {}),
      },
    ],
    emptyReason: null,
  };
}

function referenceSection(input: PositionReportInput): ReportSection {
  if (!input.explorer) {
    return empty(
      'reference',
      'Reference statistics',
      input.explorerUnavailable ?? 'No reference source answered for this position.',
    );
  }
  const { totalGames, white, draws, black } = input.explorer;
  if (totalGames === 0) {
    return {
      id: 'reference',
      title: 'Reference statistics',
      provenance: sourceLabel(input.explorer),
      entries: [],
      emptyReason: 'This source holds no games at this position.',
    };
  }

  return {
    id: 'reference',
    title: 'Reference statistics',
    provenance: sourceLabel(input.explorer),
    entries: [
      {
        primary: `${totalGames.toLocaleString()} games`,
        secondary: `White ${percent(white, totalGames)} · Draw ${percent(draws, totalGames)} · Black ${percent(black, totalGames)}`,
      },
    ],
    emptyReason: null,
  };
}

/**
 * The moves worth pointing at, each with the rule that selected it.
 *
 * Never a recommendation. "Most played" and "highest scoring among moves
 * with at least N games" are properties of the sample; which one matters is
 * the player's judgement, and stating the criterion is what lets them make
 * it.
 */
function notableMovesSection(input: PositionReportInput): ReportSection {
  const moves = input.explorer?.moves ?? [];
  if (moves.length === 0) {
    return empty(
      'moves',
      'Most frequent moves',
      input.explorer
        ? 'No moves are recorded at this position in this source.'
        : (input.explorerUnavailable ?? 'No reference source answered for this position.'),
    );
  }

  const entries: ReportEntry[] = [];
  const byGames = [...moves].sort((a, b) => b.games - a.games);
  const mostPlayed = byGames[0] as DatabaseMove;
  entries.push({
    primary: mostPlayed.san,
    secondary: `${mostPlayed.games.toLocaleString()} games · scores ${percent(scoreFor(mostPlayed), mostPlayed.games)}`,
    criterion: 'Most played',
  });

  const eligible = moves.filter((move) => move.games >= SCORE_SAMPLE_THRESHOLD);
  const bestScoring = [...eligible].sort(
    (a, b) => scoreFor(b) / b.games - scoreFor(a) / a.games,
  )[0];
  if (bestScoring && bestScoring.san !== mostPlayed.san) {
    entries.push({
      primary: bestScoring.san,
      secondary: `${bestScoring.games.toLocaleString()} games · scores ${percent(scoreFor(bestScoring), bestScoring.games)}`,
      criterion: `Highest scoring among moves with at least ${SCORE_SAMPLE_THRESHOLD} games`,
    });
  }

  const recent = [...moves]
    .filter((move) => move.lastPlayedYear !== undefined)
    .sort((a, b) => (b.lastPlayedYear ?? 0) - (a.lastPlayedYear ?? 0))[0];
  if (recent?.lastPlayedYear !== undefined && !entries.some((e) => e.primary === recent.san)) {
    entries.push({
      primary: recent.san,
      secondary: `Last played ${recent.lastPlayedYear}`,
      criterion: 'Most recently played',
    });
  }

  return {
    id: 'moves',
    title: 'Most frequent moves',
    provenance: sourceLabel(input.explorer),
    entries,
    emptyReason: null,
  };
}

function tablebaseSection(input: PositionReportInput): ReportSection {
  if (!input.tablebase) {
    return empty(
      'tablebase',
      'Tablebase',
      'Not eligible, or no tablebase provider answered. Positions with more than seven pieces have no tablebase truth.',
    );
  }
  return {
    id: 'tablebase',
    title: 'Tablebase',
    provenance: input.tablebase.source,
    entries: [
      {
        primary: input.tablebase.category,
        ...(input.tablebase.dtz !== undefined ? { secondary: `DTZ ${input.tablebase.dtz}` } : {}),
      },
    ],
    emptyReason: null,
  };
}

function repertoireSection(input: PositionReportInput): ReportSection {
  const positions = input.repertoire ?? [];
  if (positions.length === 0) {
    return empty('repertoire', 'Repertoire', 'No repertoire covers this position.');
  }
  const entries = positions.flatMap((position) =>
    position.moves.map((move) => ({
      primary: `${move.san} — ${move.role}`,
      secondary: input.repertoireNames?.[position.repertoireId] ?? 'Repertoire',
      ...(move.note ? { criterion: move.note } : {}),
    })),
  );
  return {
    id: 'repertoire',
    title: 'Repertoire',
    provenance: `Your repertoires · ${positions.length} covering entr${positions.length === 1 ? 'y' : 'ies'}`,
    entries,
    emptyReason: entries.length === 0 ? 'Covered, but with no move recorded yet.' : null,
  };
}

function modelGamesSection(input: PositionReportInput): ReportSection {
  const links = input.modelGames ?? [];
  if (links.length === 0) {
    return empty('model-games', 'Model games', 'No model game is linked to this position.');
  }
  return {
    id: 'model-games',
    title: 'Model games',
    provenance: `Your linked model games · ${links.length}`,
    entries: links.map((link) => ({
      primary: link.note?.trim() || 'Linked model game',
      secondary: link.kinds.join(', '),
    })),
    emptyReason: null,
  };
}

function personalGamesSection(input: PositionReportInput): ReportSection {
  const games = input.personalGames ?? [];
  const count = input.personalGameCount ?? 0;

  if (games.length === 0 && count > 0) {
    // Counted from the position index without reading the games themselves.
    return {
      id: 'personal',
      title: 'Your games',
      provenance: input.personalGamesSource ?? 'Local collection',
      entries: [
        {
          primary: `${count.toLocaleString()} game${count === 1 ? '' : 's'} reached this position`,
          secondary: 'Open the Database panel to list them',
        },
      ],
      emptyReason: null,
    };
  }

  if (games.length === 0) {
    return empty(
      'personal',
      'Your games',
      'You have no game in the local collection that reached this position.',
    );
  }
  const score = games.reduce((sum, game) => sum + resultPoints(game.result), 0);
  return {
    id: 'personal',
    title: 'Your games',
    provenance: input.personalGamesSource ?? 'Local collection',
    entries: [
      {
        primary: `${games.length} game${games.length === 1 ? '' : 's'} reached this position`,
        secondary: `Scoring ${percent(score, games.length)} across them`,
      },
      ...games.slice(0, 5).map((game) => ({
        primary: `${game.white} – ${game.black}`,
        secondary: [game.event, game.year].filter(Boolean).join(', ') || game.result,
      })),
    ],
    emptyReason: null,
  };
}

/**
 * Strategic themes, each printed with the rule that matched it.
 *
 * "Opposite-coloured bishops" is a claim about the board and is checkable;
 * printing it without its definition would turn a countable fact into a label
 * the reader has to trust. So the definition is the criterion.
 */
function themesSection(input: PositionReportInput): ReportSection {
  const themes = input.themes ?? [];
  if (themes.length === 0) {
    return empty(
      'themes',
      'Strategic themes',
      'No defined strategic theme holds in this position. Themes are decided by counting, so an absence here means the rules did not match — not that the position is featureless.',
    );
  }
  return {
    id: 'themes',
    title: 'Strategic themes',
    provenance: `Deterministic theme rules · ${input.themeVersion ?? 'unversioned'}`,
    entries: themes.map((theme) => ({ primary: theme.name, criterion: theme.definition })),
    emptyReason: null,
  };
}

function structureSection(input: PositionReportInput): ReportSection {
  const claims = input.structure?.claims ?? [];
  if (claims.length === 0) {
    return empty(
      'structure',
      'Structural themes',
      'No deterministic structural claim holds in this position.',
    );
  }
  return {
    id: 'structure',
    title: 'Structural themes',
    provenance: `Deterministic structure rules · ${input.structure?.definitionVersion ?? 'unversioned'}`,
    entries: claims.map((claim) => ({ primary: claim })),
    emptyReason: null,
  };
}

/**
 * Engine evidence, kept separate from database evidence on purpose.
 *
 * A pinned line is a measurement with provenance — which engine, how deep,
 * when. Mixing it into "most played" would blur a claim about what people
 * have done with a claim about what an engine calculated.
 */
function engineSection(input: PositionReportInput): ReportSection {
  const lines = input.pinnedLines ?? [];
  if (lines.length === 0) {
    return empty(
      'engine',
      'Stored engine evidence',
      'No engine line has been pinned at this position.',
    );
  }
  return {
    id: 'engine',
    title: 'Stored engine evidence',
    provenance: `Pinned lines · ${lines.length}`,
    entries: lines.map((line) => ({
      primary: line.pvSan.slice(0, 6).join(' '),
      secondary: `${line.engineName} · depth ${line.depth}`,
      criterion: `Pinned ${new Date(line.createdAt).toISOString().slice(0, 10)}`,
    })),
    emptyReason: null,
  };
}

function journalSection(input: PositionReportInput): ReportSection {
  const decisions = input.decisions ?? [];
  const reviews = input.reviewItems ?? [];
  if (decisions.length === 0 && reviews.length === 0) {
    return empty(
      'journal',
      'Your history here',
      'You have not recorded a decision or a review at this position.',
    );
  }
  return {
    id: 'journal',
    title: 'Your history here',
    provenance: `Decision journal and review queue · ${decisions.length + reviews.length} entr${decisions.length + reviews.length === 1 ? 'y' : 'ies'}`,
    entries: [
      ...decisions.map((decision) => ({
        // What the player decided, in their own terms: the move they would
        // play and the plan behind it, never a re-description of the position.
        primary: decision.chosenSan
          ? `You chose ${decision.chosenSan}`
          : 'Recorded decision (no move chosen)',
        secondary: [decision.plan?.trim(), new Date(decision.createdAt).toISOString().slice(0, 10)]
          .filter(Boolean)
          .join(' · '),
      })),
      ...reviews.map((item) => ({
        primary: `Review: ${item.status}`,
        secondary: new Date(item.createdAt).toISOString().slice(0, 10),
      })),
    ],
    emptyReason: null,
  };
}

const sourceLabel = (explorer: ExplorerResult | null | undefined): string | null =>
  explorer ? `${explorer.source.name} · ${explorer.totalGames.toLocaleString()} games` : null;

const scoreFor = (move: DatabaseMove): number => move.white + move.draws / 2;

const resultPoints = (result: string): number =>
  result === '1-0' ? 1 : result === '1/2-1/2' ? 0.5 : 0;

const percent = (part: number, whole: number): string =>
  whole === 0 ? '—' : `${((part / whole) * 100).toFixed(1)}%`;

/**
 * The report as Markdown, for pasting into a study, an email or a notebook.
 *
 * Provenance travels with it. A report pasted somewhere else without its
 * sources is exactly the "database says" claim §38 forbids, so every section
 * carries its citation into the text.
 */
/**
 * The report as a note to store beside a position, rather than to read now.
 *
 * The difference from `reportToMarkdown` is one paragraph, and it is the whole
 * point of having a second function: a report copied to a clipboard is read
 * within a minute of being made, and a report saved into a study is read in six
 * months. What was a live measurement then has to still look like one now.
 *
 * So the stored form says when it was taken and that its figures were
 * measurements at that moment. Anything else turns a snapshot of an explorer
 * into a standing claim about the position, which is exactly the failure ADR
 * 0037 exists to prevent.
 */
export function reportToStoredNote(report: PositionReport, context?: string): string {
  const when = new Date(report.generatedAt);
  return [
    `# Position report — recorded ${when.toISOString().slice(0, 16).replace('T', ' ')}`,
    '',
    context ? `Taken from: ${context}` : '',
    '',
    'These figures were measured when this note was written. Reference counts,',
    'engine evidence and online statistics change; nothing below is a standing',
    'fact about the position, and every section names where it came from.',
    '',
    reportToMarkdown(report).replace(/^# Position report\n/, ''),
  ]
    .filter((line, index, all) => !(line === '' && all[index - 1] === ''))
    .join('\n');
}

export function reportToMarkdown(report: PositionReport): string {
  const lines: string[] = [
    '# Position report',
    '',
    `FEN: \`${report.fen}\``,
    `Generated: ${new Date(report.generatedAt).toISOString()}`,
    '',
  ];

  for (const section of report.sections) {
    lines.push(`## ${section.title}`);
    if (section.provenance) lines.push(`_Source: ${section.provenance}_`, '');
    if (section.entries.length === 0) {
      lines.push(section.emptyReason ?? 'No evidence.', '');
      continue;
    }
    for (const entry of section.entries) {
      const criterion = entry.criterion ? ` — _${entry.criterion}_` : '';
      const secondary = entry.secondary ? ` (${entry.secondary})` : '';
      lines.push(`- **${entry.primary}**${secondary}${criterion}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
