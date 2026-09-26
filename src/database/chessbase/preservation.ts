/**
 * What survives a ChessBase database, field by field (Phase 86, P0.4).
 *
 * Read: a CBH/CBV database imported into Kingfisher (`database.ts`,
 * `annotations.ts`). Write: a new CBH database made from Kingfisher games
 * (`write.ts`, `encode.ts`). Each row says what happens and names the test
 * that shows it; `preservation.test.ts` checks every named test exists. What
 * is left behind on import is counted per type in the import's loss report
 * (`lossReport`), never dropped silently.
 *
 * Not claimed here: that ChessBase opens the written files. They are read
 * back by Kingfisher's reader and reproduce ChessBase's own movetext bytes
 * for its fixtures; no ChessBase licence was available to open them in it.
 */

export type Preservation =
  | 'kept'
  | 'partly'
  /** Counted per type in the loss report and left out. */
  | 'reported'
  /** Deliberately not a game: skipped and counted. */
  | 'skipped'
  | 'not-written'
  /** Implemented from the layout, never checked against a file ChessBase wrote. */
  | 'unverified';

export interface PreservationRow {
  readonly field: string;
  readonly read: Preservation;
  readonly write: Preservation;
  readonly detail: string;
  /** Repository paths of the tests that show it. */
  readonly evidence: readonly string[];
}

const MOVES = 'src/database/chessbase/moves.test.ts';
const DATABASE = 'src/database/chessbase/database.test.ts';
const WRITE = 'src/database/chessbase/write.test.ts';
const ARCHIVE = 'src/database/chessbase/archive.test.ts';
const ENTITIES = 'src/database/chessbase/entities.test.ts';
const ANNOTATIONS = 'src/database/chessbase/annotations.test.ts';

export const CHESSBASE_PRESERVATION: readonly PreservationRow[] = [
  {
    field: 'Main line',
    read: 'kept',
    write: 'kept',
    detail:
      'Every move replayed through Kingfisher’s rules; the writer reproduces ChessBase’s bytes for its fixtures, and 8,895 archive games match the publisher’s PGN.',
    evidence: [MOVES, WRITE, ARCHIVE],
  },
  {
    field: 'Variations, nested',
    read: 'kept',
    write: 'kept',
    detail: 'Opened and closed in the movetext stream; any depth.',
    evidence: [MOVES, WRITE],
  },
  {
    field: 'Comments before and after a move',
    read: 'kept',
    write: 'kept',
    detail: 'Every language is read; written as one text, language unset (ChessBase: “any”).',
    evidence: [DATABASE, WRITE],
  },
  {
    field: 'Annotation symbols (NAGs)',
    read: 'kept',
    write: 'partly',
    detail: 'ChessBase holds three per move; a fourth is counted in the write report.',
    evidence: [DATABASE, WRITE],
  },
  {
    field: 'Coloured squares and arrows',
    read: 'partly',
    write: 'partly',
    detail:
      'Green, yellow and red both ways; another ChessBase colour is read as green, and Kingfisher’s blue is counted in the write report and left out.',
    evidence: [DATABASE, WRITE],
  },
  {
    field: 'Clock times and time spent',
    read: 'kept',
    write: 'kept',
    detail: 'As PGN [%clk] and [%emt] on the move.',
    evidence: [DATABASE, WRITE],
  },
  {
    field:
      'Engine evaluations, medals, training questions, multimedia, critical-position and other annotation types',
    read: 'reported',
    write: 'not-written',
    detail:
      'Kingfisher has no field they could become without inventing one; each is counted by its type byte in the loss report.',
    evidence: [ANNOTATIONS],
  },
  {
    field: 'Players, Elo, result, ECO, date, round and subround',
    read: 'kept',
    write: 'kept',
    detail:
      'Unknown date parts stay unknown (????.??.??); names are cut to their ChessBase field width on write, counted.',
    evidence: [DATABASE, WRITE],
  },
  {
    field: 'Tournament',
    read: 'partly',
    write: 'partly',
    detail:
      'Title and place become Event and Site; type, category, nation and round count are not kept.',
    evidence: [ENTITIES, WRITE],
  },
  {
    field: 'Annotator and source',
    read: 'partly',
    write: 'partly',
    detail:
      'Their names become the Annotator and Source tags; a source’s publisher, date and quality are not kept.',
    evidence: [ENTITIES, DATABASE, WRITE],
  },
  {
    field: 'Teams',
    read: 'unverified',
    write: 'not-written',
    detail:
      'Read into WhiteTeam and BlackTeam from the team file and the extended header (.cbe, .cbj). No database ChessBase wrote with teams in it was available, so this is unverified; the writer makes no team file.',
    evidence: [],
  },
  {
    field: 'Set-up start position',
    read: 'kept',
    write: 'kept',
    detail: 'As SetUp and FEN; the position is checked by Kingfisher’s own FEN parser.',
    evidence: [MOVES, WRITE],
  },
  {
    field: 'ChessBase player and tournament ids, search-booster and key files (.cbk)',
    read: 'reported',
    write: 'not-written',
    detail: 'Games carry names, not ChessBase’s record numbers; keys are not read.',
    evidence: [DATABASE],
  },
  {
    field: 'Deleted games, guiding texts and Chess960 games',
    read: 'skipped',
    write: 'not-written',
    detail:
      'Deleted games and texts are not games; Chess960 is refused with the reason. All are counted.',
    evidence: [DATABASE],
  },
  {
    field: 'Damaged records',
    read: 'skipped',
    write: 'not-written',
    detail:
      'A game whose movetext does not decode, or plays an illegal move, is refused with its number and the reason.',
    evidence: [MOVES, DATABASE],
  },
];

export interface LossReport {
  readonly kind: 'kingfisher-chessbase-import-loss-report';
  readonly version: 1;
  readonly source: string;
  readonly generatedAt: string;
  readonly examined: number;
  readonly imported: number;
  readonly duplicates: number;
  readonly refused: number;
  /** What the import left behind: how many games had it, and how many items in all. */
  readonly leftBehind: readonly {
    readonly what: string;
    readonly games: number;
    readonly items: number;
  }[];
  /** The first refused games, with reasons. */
  readonly refusedGames: readonly string[];
  readonly matrix: readonly PreservationRow[];
}

/**
 * Fold one game's issue ("3 annotation(s) of type 0x22 have no place in a
 * PGN") into the running tally: the count in front is the number of items in
 * that game, and the game counts once.
 */
export function tallyIssue(
  tally: Map<string, { games: number; items: number }>,
  issue: string,
): void {
  const match = /^(\d+) (.*)$/.exec(issue);
  const what = match ? match[2]! : issue;
  const items = match ? Number(match[1]) : 1;
  const current = tally.get(what) ?? { games: 0, items: 0 };
  tally.set(what, { games: current.games + 1, items: current.items + items });
}

export function lossReport(input: {
  readonly source: string;
  readonly examined: number;
  readonly imported: number;
  readonly duplicates: number;
  readonly refused: number;
  readonly tally: ReadonlyMap<string, { games: number; items: number }>;
  readonly refusedGames: readonly string[];
  readonly now?: number;
}): LossReport {
  return {
    kind: 'kingfisher-chessbase-import-loss-report',
    version: 1,
    source: input.source,
    generatedAt: new Date(input.now ?? Date.now()).toISOString(),
    examined: input.examined,
    imported: input.imported,
    duplicates: input.duplicates,
    refused: input.refused,
    leftBehind: [...input.tally.entries()]
      .map(([what, counts]) => ({ what, ...counts }))
      .sort((a, b) => b.games - a.games || (a.what < b.what ? -1 : 1)),
    refusedGames: input.refusedGames,
    matrix: CHESSBASE_PRESERVATION,
  };
}
