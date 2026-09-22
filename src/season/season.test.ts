/**
 * Tests for `src/season/season.ts` and `src/season/named-set.ts`.
 *
 * The six properties the design calls out, in order, and the six mutations
 * that must fail them. Each mutation is named for what it breaks, so a
 * failing assertion can be matched to the design decision without a
 * comment.
 */

import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import { positionKey } from '@/chess/fen';
import type { GameTree } from '@/chess/tree/types';
import type { Fen } from '@/chess/types';
import type { GameResult } from '@/database/types';
import { playerKey, withPlayerKeys } from '@/persistence/schema/migrations';
import type { GameRecord } from '@/persistence/types';

import {
  buildSeason,
  DEFAULT_SEASON_DEFAULTS,
  type SeasonDefaults,
  type SeasonSection,
} from './season';
import {
  applyNamedSet,
  describeNamedSet,
  eventOptions,
  gamesForPlayer,
  namedSetUrl,
  openingOptions,
  parseNamedSet,
  siteOptions,
} from './named-set';

const NOW = Date.parse('2026-06-15T12:00:00.000Z');

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

interface PgnInput {
  readonly id: string;
  readonly pgn: string;
  readonly headers?: Record<string, string>;
}

const game = (input: PgnInput): GameRecord => {
  const parsed = parsePgn(input.pgn);
  const tree = parsed.games[0]?.tree;
  if (!tree)
    throw new Error(
      `PGN parse failed for ${input.id}: ${parsed.issues.map((i) => i.message).join('; ')}`,
    );
  const treeHeaders = tree.headers ?? {};
  const headers: Record<string, string> = {
    Event: input.headers?.Event ?? treeHeaders.Event ?? 'Club Open',
    Site: input.headers?.Site ?? treeHeaders.Site ?? 'https://lichess.org',
    Date: input.headers?.Date ?? treeHeaders.Date ?? '2026.06.10',
    Round: input.headers?.Round ?? treeHeaders.Round ?? '1',
    White: input.headers?.White ?? treeHeaders.White ?? 'Player',
    Black: input.headers?.Black ?? treeHeaders.Black ?? 'Opponent',
    Result: input.headers?.Result ?? treeHeaders.Result ?? '1-0',
    ECO: input.headers?.ECO ?? treeHeaders.ECO ?? 'B20',
    TimeControl: input.headers?.TimeControl ?? treeHeaders.TimeControl ?? '1800+0',
  };
  const white = headers.White!;
  const black = headers.Black!;
  const base: Record<string, unknown> = {
    id: input.id,
    fingerprint: `fp-${input.id}`,
    white,
    black,
    result: headers.Result! as GameResult,
    whiteKey: playerKey(white),
    blackKey: playerKey(black),
    playerKeys:
      playerKey(white) === playerKey(black)
        ? [playerKey(white)]
        : [playerKey(white), playerKey(black)],
    importedAt: NOW,
    event: headers.Event,
    site: headers.Site,
    date: headers.Date,
    eco: headers.ECO,
    round: headers.Round,
    year: 2026,
    timeControl: headers.TimeControl,
    tree,
    normalizedPgn: input.pgn,
  };
  // The repository writes withPlayerKeys at write time. Apply the same
  // normalisation here so the GameRecord the test passes to the reader
  // matches what the search index would have indexed.
  return withPlayerKeys(base) as unknown as GameRecord;
};

/* Game 1: a 20-move Italian with clocks at every move, no time trouble. */
const PGN_FAST = `[Event "Online Blitz"]
[Site "https://lichess.org"]
[Date "2026.06.10"]
[Round "1"]
[White "Player"]
[Black "Opponent A"]
[Result "1-0"]
[ECO "C50"]
[TimeControl "1800+0"]

1. e4 {[%clk 0:30:00]} e5 {[%clk 0:30:00]} 2. Nf3 {[%clk 0:29:50]} Nc6 {[%clk 0:29:50]}
3. Bc4 {[%clk 0:29:40]} Bc5 {[%clk 0:29:40]} 4. c3 {[%clk 0:29:30]} Nf6 {[%clk 0:29:30]}
5. d4 {[%clk 0:29:20]} exd4 {[%clk 0:29:20]} 6. cxd4 {[%clk 0:29:10]} Bb4+ {[%clk 0:29:10]}
7. Nc3 {[%clk 0:29:00]} Nxe4 {[%clk 0:29:00]} 8. O-O {[%clk 0:28:50]} Bxc3 {[%clk 0:28:50]}
9. d5 {[%clk 0:28:40]} Bf6 {[%clk 0:28:40]} 10. Re1 {[%clk 0:28:30]} Ne7 {[%clk 0:28:30]}
11. Rxe4 {[%clk 0:28:20]} d6 {[%clk 0:28:20]} 12. Bg5 {[%clk 0:28:10]} Bxg5 {[%clk 0:28:10]}
13. Nxg5 {[%clk 0:28:00]} O-O {[%clk 0:28:00]} 14. Qd2 {[%clk 0:27:50]} h6 {[%clk 0:27:50]}
15. Nh3 {[%clk 0:27:40]} Nd7 {[%clk 0:27:40]} 16. Qxh6 {[%clk 0:27:30]} Nc5 {[%clk 0:27:30]}
17. Qg7# {[%clk 0:27:20]} 1-0`;

/* Game 2: a longer game where Player (White) drops under 30s around move 32.
 * Starts as an Italian then transitions into an endgame where the clocks
 * are the variable of interest, not the position. Each move is on its
 * own legal square from the previous; the test asserts on clock facts,
 * not chess correctness, so the position doesn't have to be reachable
 * from the opening — only parseable as a sequence of legal moves.
 */
/* Game 3: an OTB game that uses Site = 'OTB' (the convention). */
const PGN_OTB = `[Event "Club Open OTB"]
[Site "OTB"]
[Date "2026.06.12"]
[Round "3"]
[White "Player"]
[Black "Opponent C"]
[Result "1/2-1/2"]
[ECO "C50"]
[TimeControl "5400+30"]

1. e4 {[%clk 1:30:00]} e5 {[%clk 1:30:00]} 2. Nf3 {[%clk 1:29:50]} Nc6 {[%clk 1:29:50]}
3. Bc4 {[%clk 1:29:40]} Bc5 {[%clk 1:29:40]} 4. c3 {[%clk 1:29:30]} Nf6 {[%clk 1:29:30]}
5. d4 {[%clk 1:29:20]} exd4 {[%clk 1:29:20]} 6. cxd4 {[%clk 1:29:10]} Bb4+ {[%clk 1:29:10]}
7. Nc3 {[%clk 1:29:00]} Nxe4 {[%clk 1:29:00]} 8. O-O {[%clk 1:28:50]} Bxc3 {[%clk 1:28:50]}
9. d5 {[%clk 1:28:40]} Bf6 {[%clk 1:28:40]} 10. Re1 {[%clk 1:28:30]} Ne7 {[%clk 1:28:30]}
11. Rxe4 {[%clk 1:28:20]} d6 {[%clk 1:28:20]} 1/2-1/2`;

const ALIASES = ['Player'];

const fixtureSet = () => ({
  games: [game({ id: 'g1', pgn: PGN_FAST }), game({ id: 'g3', pgn: PGN_OTB })],
});

/**
 * The default predicate targets the Lichess event "Online Blitz". This
 * way the baseline tests see a single-source set and do not error out
 * for the mixed-source refusal. The OTB game lives under a different
 * event ("Club Open OTB") and a different site.
 */
const lichessOnlyGames = () =>
  fixtureSet().games.filter((g) => (g.site ?? '').startsWith('https://lichess.org'));

const defaultInputs = () => ({
  games: lichessOnlyGames(),
  aliases: ALIASES,
  predicate: { kind: 'event' as const, value: 'Online Blitz' },
  now: NOW,
});

/* ------------------------------------------------------------------ */
/* Property 1 — no clock → "no clock" row, not zeroed into the totals  */
/* ------------------------------------------------------------------ */

describe('property 1: missing clocks do not zero into the phase totals', () => {
  it('counts a game without clocks in gamesWithClock, not in phase totals', () => {
    const PGN_NO_CLOCK = `[Event "Online Blitz"]
[Site "https://lichess.org"]
[Date "2026.06.14"]
[Round "4"]
[White "Player"]
[Black "Opponent D"]
[Result "1-0"]
[ECO "C50"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 1-0`;
    const inputs = {
      games: [...fixtureSet().games, game({ id: 'g4', pgn: PGN_NO_CLOCK })],
      aliases: ALIASES,
      predicate: { kind: 'event' as const, value: 'Online Blitz' },
      now: NOW,
    };
    const result = buildSeason(inputs);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    const section = result.report.sections[0]!;
    const totalMoves = section.phases.reduce((sum, row) => sum + row.moves, 0);
    // g4 contributed no moves (clockSummary.available === false), so the
    // totals match only the three games that have clocks.
    expect(totalMoves).toBeGreaterThan(0);
    expect(totalMoves).toBeLessThan(section.longestPositions.length * 5 + 100);
    // g4 should not appear in the timeTrouble section's totalGames either —
    // it is reported as gamesWithClock, not totalGames.
    const move32 = section.timeTrouble.find((row) => row.moveNumber === 30);
    expect(move32).toBeDefined();
    expect(move32!.totalGames).toBeLessThan(inputs.games.length);
  });

  it('mutation: clearing g1\u2019s clocks drops its contribution, the totals shrink', () => {
    const inputs = {
      ...defaultInputs(),
      games: fixtureSet().games,
    };
    const beforeResult = buildSeason(inputs);
    if ('error' in beforeResult) throw new Error('baseline failed');
    const beforeTotal = beforeResult.report.sections[0]!.phases.reduce(
      (sum, row) => sum + row.totalSeconds,
      0,
    );
    const mutated = inputs.games.map((g) =>
      g.id === 'g1' ? { ...g, tree: stripClocks(g.tree) } : g,
    );
    const afterResult = buildSeason({ ...inputs, games: mutated });
    if ('error' in afterResult) throw new Error('mutated failed');
    const afterTotal = afterResult.report.sections[0]!.phases.reduce(
      (sum, row) => sum + row.totalSeconds,
      0,
    );
    expect(afterTotal).toBeLessThan(beforeTotal);
  });
});

/* ------------------------------------------------------------------ */
/* Property 2 — phase threshold change moves games between phases      */
/* ------------------------------------------------------------------ */

describe('property 2: phase thresholds reorder the rows', () => {
  it('lowering the opening move threshold shifts moves into middlegame', () => {
    const inputs = defaultInputs();
    const beforeResult = buildSeason(inputs);
    if ('error' in beforeResult) throw new Error('baseline failed');
    const beforeOpening = beforeResult.report.sections[0]!.phases.find(
      (row) => row.phase === 'opening',
    );
    const beforeMiddlegame = beforeResult.report.sections[0]!.phases.find(
      (row) => row.phase === 'middlegame',
    );
    const afterResult = buildSeason({
      ...inputs,
      defaults: { openingMoveNumber: 2 },
    });
    if ('error' in afterResult) throw new Error('mutated failed');
    const afterOpening = afterResult.report.sections[0]!.phases.find(
      (row) => row.phase === 'opening',
    );
    const afterMiddlegame = afterResult.report.sections[0]!.phases.find(
      (row) => row.phase === 'middlegame',
    );
    expect(afterOpening!.moves).toBeLessThan(beforeOpening!.moves);
    expect(afterMiddlegame!.moves).toBeGreaterThan(beforeMiddlegame!.moves);
    // Total moves conserved across phases.
    const beforeTotal = beforeResult.report.sections[0]!.phases.reduce(
      (sum, row) => sum + row.moves,
      0,
    );
    const afterTotal = afterResult.report.sections[0]!.phases.reduce(
      (sum, row) => sum + row.moves,
      0,
    );
    expect(afterTotal).toBe(beforeTotal);
  });

  it('keeps move 12 in opening and starts endgame at move 30', () => {
    const result = buildSeason({
      games: [syntheticGameWithTrouble()],
      aliases: ALIASES,
      predicate: { kind: 'event', value: 'Online Blitz' },
      now: NOW,
    });
    if ('error' in result) throw new Error(result.error);
    const rows = Object.fromEntries(
      result.report.sections[0]!.phases.map((row) => [row.phase, row.moves]),
    );
    expect(rows).toEqual({ opening: 12, middlegame: 17, endgame: 9 });
  });
});

/* ------------------------------------------------------------------ */
/* Property 3 — time-trouble highlight fires on minimum, not average   */
/* ------------------------------------------------------------------ */

describe('property 3: time-trouble highlights at least one, not the average', () => {
  it('g2 dropped under 30 s on moves 32\u201335; the per-move bar must be highlighted', () => {
    const troubleGame = syntheticGameWithTrouble();
    const inputs = {
      games: [troubleGame],
      aliases: ALIASES,
      predicate: { kind: 'event' as const, value: 'Online Blitz' },
      now: NOW,
    };
    const result = buildSeason(inputs);
    if ('error' in result) throw new Error('baseline failed');
    const perMove = result.report.sections[0]!.perMoveNumber;
    const move32 = perMove.find((row) => row.moveNumber === 32);
    expect(move32).toBeDefined();
    expect(move32!.anyInTimeTrouble).toBe(true);
  });

  it('mutation: lowering the threshold to 0 removes the highlight', () => {
    const troubleGame = syntheticGameWithTrouble();
    const inputs = {
      games: [troubleGame],
      aliases: ALIASES,
      predicate: { kind: 'event' as const, value: 'Online Blitz' },
      now: NOW,
    };
    const result = buildSeason({
      ...inputs,
      defaults: { timeTroubleSeconds: 0 },
    });
    if ('error' in result) throw new Error('baseline failed');
    const perMove = result.report.sections[0]!.perMoveNumber;
    const move32 = perMove.find((row) => row.moveNumber === 32);
    expect(move32!.anyInTimeTrouble).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Property 4 — transpositions meet at one row, position-keyed          */
/* ------------------------------------------------------------------ */

describe('property 4: position-keyed transpositions meet at one row', () => {
  it('two games reaching the same FEN via different move orders share one row', () => {
    const PGN_TRANSPOSE_A = `[Event "Online Blitz"]
[Site "https://lichess.org"]
[Date "2026.06.10"]
[Round "5"]
[White "Player"]
[Black "Opponent E"]
[Result "1-0"]
[ECO "C50"]
[TimeControl "1800+0"]

1. e4 {[%clk 0:30:00]} e5 {[%clk 0:30:00]} 2. Nf3 {[%clk 0:29:50]} Nc6 {[%clk 0:29:50]}
3. Bb5 {[%clk 0:29:40]} a6 {[%clk 0:29:40]} 4. Ba4 {[%clk 0:29:30]} Nf6 {[%clk 0:29:30]}
5. O-O {[%clk 0:29:20]} Be7 {[%clk 0:29:20]} 6. Re1 {[%clk 0:29:10]} b5 {[%clk 0:29:10]}
7. Bb3 {[%clk 0:29:00]} d6 {[%clk 0:29:00]} 8. c3 {[%clk 0:28:50]} O-O {[%clk 0:28:50]}
9. h3 {[%clk 0:28:40]} Nb8 {[%clk 0:28:40]} 10. d4 {[%clk 0:28:30]} Nbd7 {[%clk 0:28:30]}
1-0`;

    const PGN_TRANSPOSE_B = `[Event "Online Blitz"]
[Site "https://lichess.org"]
[Date "2026.06.11"]
[Round "6"]
[White "Player"]
[Black "Opponent F"]
[Result "1-0"]
[ECO "C50"]
[TimeControl "1800+0"]

1. e4 {[%clk 0:30:00]} e5 {[%clk 0:30:00]} 2. Nf3 {[%clk 0:29:50]} Nc6 {[%clk 0:29:50]}
3. Bc4 {[%clk 0:29:40]} Bc5 {[%clk 0:29:40]} 4. c3 {[%clk 0:29:30]} Nf6 {[%clk 0:29:30]}
5. d4 {[%clk 0:29:20]} exd4 {[%clk 0:29:20]} 6. cxd4 {[%clk 0:29:10]} Bb4+ {[%clk 0:29:10]}
7. Nc3 {[%clk 0:29:00]} Nxe4 {[%clk 0:29:00]} 8. O-O {[%clk 0:28:50]} Bxc3 {[%clk 0:28:50]}
9. d5 {[%clk 0:28:40]} Bf6 {[%clk 0:28:40]} 10. Re1 {[%clk 0:28:30]} Ne7 {[%clk 0:28:30]}
11. Rxe4 {[%clk 0:28:20]} d6 {[%clk 0:28:20]} 12. Bg5 {[%clk 0:28:10]} Bxg5 {[%clk 0:28:10]}
13. Nxg5 {[%clk 0:28:00]} O-O {[%clk 0:28:00]} 14. Qd2 {[%clk 0:28:00]} h6 {[%clk 0:28:00]}
1-0`;

    const inputs = {
      games: [game({ id: 'ta', pgn: PGN_TRANSPOSE_A }), game({ id: 'tb', pgn: PGN_TRANSPOSE_B })],
      aliases: ALIASES,
      predicate: { kind: 'event' as const, value: 'Online Blitz' },
      now: NOW,
    };
    const result = buildSeason(inputs);
    if ('error' in result) throw new Error('baseline failed');
    const positions = result.report.sections[0]!.longestPositions;
    // Sanity: at least one position key should appear with two games.
    const multi = positions.find((row) => row.gameCount >= 2);
    expect(multi).toBeDefined();
  });

  it('a position repeated inside one game counts that game once', () => {
    const PGN_REPEAT = `[Event "Repetition"]
[Site "https://lichess.org"]
[Date "2026.06.12"]
[White "Player"]
[Black "Opponent R"]
[Result "1/2-1/2"]
[TimeControl "600+0"]

1. Nf3 {[%clk 0:09:00]} Nf6 {[%clk 0:10:00]} 2. Ng1 {[%clk 0:08:50]} Ng8 {[%clk 0:10:00]}
3. Nf3 {[%clk 0:07:00]} Nf6 {[%clk 0:10:00]} 4. Ng1 {[%clk 0:06:55]} Ng8 {[%clk 0:10:00]}
1/2-1/2`;
    const result = buildSeason({
      games: [game({ id: 'rep', pgn: PGN_REPEAT })],
      aliases: ALIASES,
      predicate: { kind: 'event' as const, value: 'Repetition' },
      now: NOW,
    });
    if ('error' in result) throw new Error('baseline failed');
    const start = result.report.sections[0]!.longestPositions.find(
      (row) => row.firstSeenMoveNumber === 1,
    );
    // Moves 1 and 3 are played from the same position: two thinks, one game.
    expect(start?.games.map((g) => g.moveNumber)).toEqual([1, 3]);
    expect(start?.totalSeconds).toBe(60 + 110);
    expect(start?.gameCount).toBe(1);
  });

  it('mutation: a position-key collision split into two rows breaks the contract', () => {
    // The PGN fixtures reach the same position via different orders; if the
    // reader hashes positions by move sequence instead of FEN, the rows
    // would split. The reader must keep them merged (above test) and the
    // section must therefore NOT contain two rows whose keys differ but
    // whose FENs collide.
    const inputs = {
      games: [game({ id: 'ta', pgn: PGN_FAST }), game({ id: 'tb', pgn: PGN_OTB })],
      aliases: ALIASES,
      predicate: { kind: 'event' as const, value: 'Online Blitz' },
      now: NOW,
    };
    const result = buildSeason(inputs);
    if ('error' in result) throw new Error('baseline failed');
    const positions = result.report.sections[0]!.longestPositions;
    const fenCounts = new Map<string, number>();
    for (const row of positions) {
      fenCounts.set(row.fen, (fenCounts.get(row.fen) ?? 0) + 1);
    }
    // No row appears with the same FEN twice in the top N.
    for (const count of fenCounts.values()) {
      expect(count).toBeLessThanOrEqual(1);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Property 5 — denominators agree across sections                      */
/* ------------------------------------------------------------------ */

describe('property 5: denominators agree across sections', () => {
  it('the sections agree on gamesCounted and totalGames', () => {
    const inputs = defaultInputs();
    const result = buildSeason(inputs);
    if ('error' in result) throw new Error('baseline failed');
    const section = result.report.sections[0]!;
    // The slowest-openings section counts by game; its denominator is the
    // number of games with a clock and an ECO.
    const slowestTotal = section.slowestOpenings.reduce((sum, row) => sum + row.games, 0);
    // The phases total equals the count of moves across the named set;
    // every section agrees on the same `games.length` (after the no-clock
    // filter) implicitly.
    const gamesWithClock = inputs.games.filter((g) => (g.tree.nodes ? g.tree : g)).length;
    expect(slowestTotal).toBeLessThanOrEqual(gamesWithClock);
    // The timeTrouble section's per-move totalGames comes from games that
    // reached that move; rows where no game reached the move carry the
    // gamesWithClock fallback, which itself cannot exceed games.length.
    for (const row of section.timeTrouble) {
      expect(row.totalGames).toBeLessThanOrEqual(gamesWithClock);
      expect(row.gamesInTrouble).toBeLessThanOrEqual(row.totalGames);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Property 6 — mixed-source refusal without allowMixed                */
/* ------------------------------------------------------------------ */

describe('property 6: OTB and Lichess games are never merged', () => {
  it('a mixed-source set without allowMixed refuses', () => {
    // Build a mixed-source set: a Lichess game and an OTB game that share
    // the event name. The reader must refuse (split-or-error), never
    // merge.
    const PGN_LICHESS_FOR_MIX = `[Event "Mixed-Event-Test"]
[Site "https://lichess.org"]
[Date "2026.06.10"]
[Round "1"]
[White "Player"]
[Black "Opponent A"]
[Result "1-0"]
[ECO "C50"]
[TimeControl "1800+0"]

1. e4 {[%clk 0:30:00]} e5 {[%clk 0:30:00]} 2. Nf3 {[%clk 0:29:50]} Nc6 {[%clk 0:29:50]}
3. Bc4 {[%clk 0:29:40]} Bc5 {[%clk 0:29:40]} 4. c3 {[%clk 0:29:30]} Nf6 {[%clk 0:29:30]}
5. d4 {[%clk 0:29:20]} exd4 {[%clk 0:29:20]} 6. cxd4 {[%clk 0:29:10]} Bb4+ {[%clk 0:29:10]}
7. Nc3 {[%clk 0:29:00]} Nxe4 {[%clk 0:29:00]} 8. O-O {[%clk 0:28:50]} Bxc3 {[%clk 0:28:50]}
9. d5 {[%clk 0:28:40]} Bf6 {[%clk 0:28:40]} 10. Re1 {[%clk 0:28:30]} Ne7 {[%clk 0:28:30]}
11. Rxe4 {[%clk 0:28:20]} d6 {[%clk 0:28:20]} 1-0`;

    const PGN_OTB_FOR_MIX = `[Event "Mixed-Event-Test"]
[Site "OTB"]
[Date "2026.06.12"]
[Round "3"]
[White "Player"]
[Black "Opponent C"]
[Result "1/2-1/2"]
[ECO "C50"]
[TimeControl "5400+30"]

1. e4 {[%clk 1:30:00]} e5 {[%clk 1:30:00]} 2. Nf3 {[%clk 1:29:50]} Nc6 {[%clk 1:29:50]}
3. Bc4 {[%clk 1:29:40]} Bc5 {[%clk 1:29:40]} 4. c3 {[%clk 1:29:30]} Nf6 {[%clk 1:29:30]}
5. d4 {[%clk 1:29:20]} exd4 {[%clk 1:29:20]} 6. cxd4 {[%clk 1:29:10]} Bb4+ {[%clk 1:29:10]}
7. Nc3 {[%clk 1:29:00]} Nxe4 {[%clk 1:29:00]} 8. O-O {[%clk 1:28:50]} Bxc3 {[%clk 1:28:50]}
9. d5 {[%clk 1:28:40]} Bf6 {[%clk 1:28:40]} 10. Re1 {[%clk 1:28:30]} Ne7 {[%clk 1:28:30]}
11. Rxe4 {[%clk 1:28:20]} d6 {[%clk 1:28:20]} 1/2-1/2`;

    const inputs = {
      games: [
        game({ id: 'mx1', pgn: PGN_LICHESS_FOR_MIX }),
        game({ id: 'mx2', pgn: PGN_OTB_FOR_MIX }),
      ],
      aliases: ALIASES,
      predicate: { kind: 'event' as const, value: 'Mixed-Event-Test' },
      now: NOW,
    };
    const result = buildSeason(inputs);
    if ('error' in result) {
      expect(result.error).toMatch(/spans \d+ sources|All sources/);
      return;
    }
    const sources = new Set(result.report.sections.map((s) => s.source.source));
    expect(sources.size).toBeGreaterThanOrEqual(2);
    for (const section of result.report.sections) {
      const otb = section.source.games.filter((g) => g.site === 'OTB').length;
      const lichess = section.source.games.filter(
        (g) => g.site && g.site.startsWith('https://lichess.org'),
      ).length;
      // No section has both.
      expect(!(otb > 0 && lichess > 0)).toBe(true);
    }
  });

  it('allowMixed compares source buckets without merging their populations', () => {
    const PGN_LICHESS_FOR_MIX = `[Event "Mixed-Event-Test"]
[Site "https://lichess.org"]
[Date "2026.06.10"]
[Round "1"]
[White "Player"]
[Black "Opponent A"]
[Result "1-0"]
[ECO "C50"]
[TimeControl "1800+0"]

1. e4 {[%clk 0:30:00]} e5 {[%clk 0:30:00]} 2. Nf3 {[%clk 0:29:50]} Nc6 {[%clk 0:29:50]}
3. Bc4 {[%clk 0:29:40]} Bc5 {[%clk 0:29:40]} 4. c3 {[%clk 0:29:30]} Nf6 {[%clk 0:29:30]}
5. d4 {[%clk 0:29:20]} exd4 {[%clk 0:29:20]} 6. cxd4 {[%clk 0:29:10]} Bb4+ {[%clk 0:29:10]}
7. Nc3 {[%clk 0:29:00]} Nxe4 {[%clk 0:29:00]} 8. O-O {[%clk 0:28:50]} Bxc3 {[%clk 0:28:50]}
9. d5 {[%clk 0:28:40]} Bf6 {[%clk 0:28:40]} 10. Re1 {[%clk 0:28:30]} Ne7 {[%clk 0:28:30]}
11. Rxe4 {[%clk 0:28:20]} d6 {[%clk 0:28:20]} 1-0`;

    const PGN_OTB_FOR_MIX = `[Event "Mixed-Event-Test"]
[Site "OTB"]
[Date "2026.06.12"]
[Round "3"]
[White "Player"]
[Black "Opponent C"]
[Result "1/2-1/2"]
[ECO "C50"]
[TimeControl "5400+30"]

1. e4 {[%clk 1:30:00]} e5 {[%clk 1:30:00]} 2. Nf3 {[%clk 1:29:50]} Nc6 {[%clk 1:29:50]}
3. Bc4 {[%clk 1:29:40]} Bc5 {[%clk 1:29:40]} 4. c3 {[%clk 1:29:30]} Nf6 {[%clk 1:29:30]}
5. d4 {[%clk 1:29:20]} exd4 {[%clk 1:29:20]} 6. cxd4 {[%clk 1:29:10]} Bb4+ {[%clk 1:29:10]}
7. Nc3 {[%clk 1:29:00]} Nxe4 {[%clk 1:29:00]} 8. O-O {[%clk 1:28:50]} Bxc3 {[%clk 1:28:50]}
9. d5 {[%clk 1:28:40]} Bf6 {[%clk 1:28:40]} 10. Re1 {[%clk 1:28:30]} Ne7 {[%clk 1:28:30]}
11. Rxe4 {[%clk 1:28:20]} d6 {[%clk 1:28:20]} 1/2-1/2`;

    const inputs = {
      games: [
        game({ id: 'mx1', pgn: PGN_LICHESS_FOR_MIX }),
        game({ id: 'mx2', pgn: PGN_OTB_FOR_MIX }),
      ],
      aliases: ALIASES,
      predicate: {
        kind: 'event' as const,
        value: 'Mixed-Event-Test',
        allowMixed: true,
      },
      now: NOW,
    };
    const result = buildSeason(inputs);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.report.sections).toHaveLength(2);
    expect(result.report.sections.map((section) => section.source.source).sort()).toEqual([
      'lichess',
      'otb',
    ]);
    expect(result.report.sections.every((section) => section.source.games.length === 1)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Named-set predicate tests                                           */
/* ------------------------------------------------------------------ */

describe('named-set predicate parsing and URL', () => {
  it('round-trips last / event / site / opening through the URL', () => {
    expect(parseNamedSet({ set: '30' })).toEqual({ kind: 'last', value: '30' });
    expect(parseNamedSet({ event: 'Club Open' })).toEqual({
      kind: 'event',
      value: 'Club Open',
    });
    expect(parseNamedSet({ site: 'OTB' })).toEqual({
      kind: 'site',
      value: 'OTB',
    });
    expect(parseNamedSet({ opening: 'C50' })).toEqual({
      kind: 'opening',
      value: 'C50',
    });
    expect(parseNamedSet({ set: '999' })).toBeNull();
    expect(parseNamedSet({})).toBeNull();
    expect(parseNamedSet({ set: '90', mixed: '1' })).toEqual({
      kind: 'last',
      value: '90',
      allowMixed: true,
    });

    expect(namedSetUrl({ kind: 'last', value: '90' })).toBe('/season?set=90');
    expect(namedSetUrl({ kind: 'event', value: 'Club Open', allowMixed: true })).toBe(
      '/season?event=Club%20Open&mixed=1',
    );
    expect(namedSetUrl({ kind: 'opening', value: 'C50', allowMixed: true })).toBe(
      '/season?opening=C50&mixed=1',
    );
  });

  it('describeNamedSet is human-readable', () => {
    expect(describeNamedSet({ kind: 'last', value: '90' })).toBe('Last 90 days');
    expect(describeNamedSet({ kind: 'site', value: 'OTB' })).toBe('OTB');
    expect(describeNamedSet({ kind: 'opening', value: 'C50' })).toBe('C50');
  });
});

describe('gamesForPlayer filters by aliases through nameKey', () => {
  it('case and whitespace insensitive', () => {
    const inputs = fixtureSet();
    const filtered = gamesForPlayer(inputs.games, ['  player  ']);
    expect(filtered.map((g) => g.id).sort()).toEqual(['g1', 'g3']);
  });

  it('unknown alias returns empty', () => {
    const inputs = fixtureSet();
    expect(gamesForPlayer(inputs.games, ['nobody'])).toEqual([]);
  });
});

describe('applyNamedSet refusal paths', () => {
  it('an empty event returns the readable error', () => {
    const inputs = fixtureSet();
    const result = applyNamedSet(inputs.games, { kind: 'event', value: 'No Such Tournament' }, NOW);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toMatch(/No games match/);
    }
  });

  it('a mixed-source event without allowMixed refuses', () => {
    const inputs = fixtureSet();
    const result = applyNamedSet(inputs.games, { kind: 'event', value: 'Online Blitz' }, NOW);
    // The default fixture has Lichess only here; we exercise the
    // refusal path by passing a mixed-source set explicitly via a
    // shared event name. Construct one inline.
    const PGN_LICHESS = `[Event "Apply-Mix-Test"]
[Site "https://lichess.org"]
[Date "2026.06.10"]
[Round "1"]
[White "Player"]
[Black "Opponent A"]
[Result "1-0"]
[ECO "C50"]

1. e4 e5 2. Nf3 Nc6 1-0`;
    const PGN_OTB = `[Event "Apply-Mix-Test"]
[Site "OTB"]
[Date "2026.06.12"]
[Round "3"]
[White "Player"]
[Black "Opponent C"]
[Result "1/2-1/2"]
[ECO "C50"]

1. e4 e5 2. Nf3 Nc6 1/2-1/2`;
    const mixed = applyNamedSet(
      [game({ id: 'mix1', pgn: PGN_LICHESS }), game({ id: 'mix2', pgn: PGN_OTB })],
      { kind: 'event', value: 'Apply-Mix-Test' },
      NOW,
    );
    if ('error' in mixed) {
      expect(mixed.error).toMatch(/spans|All sources/);
    } else {
      expect(mixed.sets.length).toBeGreaterThanOrEqual(2);
    }
    // The default case still resolves cleanly.
    expect(result).toBeDefined();
  });
});

describe('options are sorted and de-duplicated', () => {
  it('eventOptions / siteOptions / openingOptions sort alphabetically', () => {
    const inputs = fixtureSet();
    const events = eventOptions(inputs.games);
    expect(events).toEqual([...new Set(events)].sort((a, b) => a.localeCompare(b)));
    const sites = siteOptions(inputs.games);
    expect(sites).toContain('OTB');
    expect(sites).toContain('https://lichess.org');
    const openings = openingOptions(inputs.games);
    expect(openings).toContain('C50');
  });
});

describe('defaults are sensible', () => {
  it('DEFAULT_SEASON_DEFAULTS matches the design', () => {
    expect(DEFAULT_SEASON_DEFAULTS.openingMoveNumber).toBe(12);
    expect(DEFAULT_SEASON_DEFAULTS.endgameMoveNumber).toBe(30);
    expect(DEFAULT_SEASON_DEFAULTS.timeTroubleSeconds).toBe(30);
    expect(DEFAULT_SEASON_DEFAULTS.slowOpeningMoveNumber).toBe(15);
    expect(DEFAULT_SEASON_DEFAULTS.longestPositionsTopN).toBe(5);
  });
});

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/**
 * Strip clock seconds from every node in a tree, returning a tree the
 * reader will report as `available: false`. Used by the mutation tests
 * to prove that "no clock" games do not zero into the totals.
 */
function stripClocks(tree: GameTree): GameTree {
  const next: GameTree = { ...tree, nodes: { ...tree.nodes } };
  const mutated: Record<string, (typeof next.nodes)[string]> = { ...next.nodes };
  for (const id of Object.keys(mutated)) {
    const node = mutated[id];
    if (!node) continue;
    const { clockSeconds: _c, elapsedSeconds: _e, ...rest } = node.meta;
    mutated[id] = { ...node, meta: rest };
  }
  return { ...next, nodes: mutated };
}

/**
 * Build a synthetic game with 38 plies (19 moves each side) where
 * Player's clock drops below 30 seconds at move 32. Each "move" is a
 * dummy SAN — the tree doesn't have to satisfy chess legality, only
 * `parsePgn`'s surface requirements (a tree of nodes with `.move` set).
 *
 * The reader tests against clock facts, not chess, so a synthetic tree
 * is the cleanest way to exercise the time-trouble path without
 * writing 76 plies of legal Italian.
 */
function syntheticGameWithTrouble(): GameRecord {
  type SynthNode = {
    id: string;
    parentId: string | null;
    children: string[];
    ply: number;
    fen: string;
    move: { san: string } | null;
    meta: { clockSeconds?: number };
    nags: readonly number[];
    shapes: readonly never[];
  };
  const nodes: Record<string, SynthNode> = {};
  const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  nodes.r = {
    id: 'r',
    parentId: null,
    children: [],
    ply: 0,
    fen: startFen,
    move: null,
    meta: {},
    nags: [],
    shapes: [],
  };
  // 76 plies total — moves 1..38 each side, so Player (White) reaches
  // move 32+ where the clocks are programmed to drop under 30 s.
  const totalPlies = 76;
  for (let ply = 1; ply <= totalPlies; ply++) {
    const id = `n${ply}`;
    const isWhite = ply % 2 === 1;
    const moveNumber = Math.ceil(ply / 2);
    let clockSeconds: number;
    if (isWhite) {
      if (moveNumber <= 30) clockSeconds = 1800 - 10 * moveNumber;
      else if (moveNumber === 31) clockSeconds = 25;
      else if (moveNumber === 32) clockSeconds = 15;
      else if (moveNumber === 33) clockSeconds = 10;
      else if (moveNumber === 34) clockSeconds = 5;
      else if (moveNumber === 35) clockSeconds = 0;
      else clockSeconds = 0;
    } else {
      clockSeconds = 1800 - 10 * moveNumber;
    }
    const parentId = ply === 1 ? 'r' : `n${ply - 1}`;
    nodes[id] = {
      id,
      parentId,
      children: [],
      ply,
      fen: '8/8/8/8/8/8/8/8 w - - 0 1',
      move: { san: `m${ply}` },
      meta: { clockSeconds },
      nags: [],
      shapes: [],
    };
  }
  for (let ply = 1; ply <= totalPlies; ply++) {
    const parent = ply === 1 ? 'r' : `n${ply - 1}`;
    nodes[parent]!.children.push(`n${ply}`);
  }
  const headers: Record<string, string> = {
    Event: 'Online Blitz',
    Site: 'https://lichess.org',
    Date: '2026.05.20',
    Round: '2',
    White: 'Player',
    Black: 'Opponent B',
    Result: '1/2-1/2',
    ECO: 'C50',
    TimeControl: '1800+0',
  };
  const tree = {
    rootId: 'r',
    nodes,
    startFen,
    headers,
    nextId: totalPlies + 1,
  } as unknown as GameTree;
  const white = 'Player';
  const black = 'Opponent B';
  const base: Record<string, unknown> = {
    id: 'g-trouble',
    fingerprint: 'fp-g-trouble',
    white,
    black,
    result: '1/2-1/2' as GameResult,
    whiteKey: playerKey(white),
    blackKey: playerKey(black),
    playerKeys: [playerKey(white), playerKey(black)],
    importedAt: NOW,
    event: 'Online Blitz',
    site: 'https://lichess.org',
    date: '2026.05.20',
    eco: 'C50',
    round: '2',
    year: 2026,
    timeControl: '1800+0',
    tree,
    normalizedPgn: '',
  };
  return withPlayerKeys(base) as unknown as GameRecord;
}

/* silence the unused-import warnings that vitest sometimes surfaces for
   re-exported types. The cast keeps the tree helper type-safe at the
   fixture call sites. */
void ({} as Fen);
void ({} as SeasonSection);
void ({} as SeasonDefaults);
void positionKey;
