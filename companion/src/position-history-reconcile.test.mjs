/**
 * The Opening Report's collection figures must reconcile with the games
 * behind them.
 *
 * This is item 1's acceptance criterion, and it is a different claim from "the
 * query returns something". A report can be internally consistent, correctly
 * capped, honestly labelled and still be *wrong* about a collection — if the
 * index double-counts a transposition, counts one game three times because it
 * passed through the position twice, drops a game whose headers are half
 * missing, or files a game's result in no column without saying so.
 *
 * So the expectations here are written out by hand from the PGNs below and
 * compared against what the companion returns through its index. The expected
 * numbers are not recomputed with the same algorithm the implementation uses;
 * they are the answer a reader would work out from the games, which is the
 * whole point of reconciling.
 *
 * The corpus is chosen to contain the four things that break an aggregate:
 *
 * - a **transposition**: the same position reached by two different move
 *   orders, so a collection that is not keyed on canonical position identity
 *   counts it twice;
 * - a **repetition**: one game that passes through the position three times,
 *   so a report that counts occurrences counts it three times;
 * - **incomplete headers**: no date, no rating at all, and only one of the
 *   two rating tags — the relays and unfinished games a real archive is full of;
 * - an **unfinished result**: `*`, which is in no outcome column and must be
 *   reported as a count rather than quietly becoming a Black win.
 *
 * Note on the transposition: `positionKey` is the first four FEN fields, the
 * en-passant square among them. Both move orders therefore have to end on a
 * move that leaves no ep square, or the two positions would not be the same
 * position at all. `1. e4 e5 2. Nf3 Nc6` and `1. Nf3 Nc6 2. e4 e5` both do.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as kit from '../../src/companion-kit/import-kit.ts';
import { positionKey } from '../../src/chess/fen';
import { parseSingleGame } from '../../src/chess/pgn';

import { GameDatabase } from './database.mjs';

/**
 * After 2...Nc6 / 2...e5, in the four fields `positionKey` is: Black's b8
 * knight on c6 and e-pawn on e5, White's g1 knight on f3 and e-pawn on e4,
 * the b1 knight still home, every castling right intact, White to move, and no
 * en-passant square. Both move orders end on a move that leaves no ep square,
 * which is what makes them the same position rather than two similar ones.
 */
const TARGET = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -';

const A_ORDER = '1. e4 e5 2. Nf3 Nc6';
const B_ORDER = '1. Nf3 Nc6 2. e4 e5';

const CORPUS = `
[Event "Reconcile A"]
[Site "?"]
[Date "2019.03.01"]
[Round "1"]
[White "Alpha, Ann"]
[Black "Bravo, Bob"]
[WhiteElo "2450"]
[BlackElo "2400"]
[Result "1-0"]

${A_ORDER} 3. Bb5 a6 1-0

[Event "Reconcile B"]
[Site "?"]
[Date "2021.06.12"]
[Round "1"]
[White "Cesar, Cy"]
[Black "Delta, Di"]
[WhiteElo "2500"]
[BlackElo "2300"]
[Result "0-1"]

${B_ORDER} 3. Bb5 a6 0-1

[Event "Reconcile no date"]
[Site "?"]
[Date "????.??.??"]
[Round "1"]
[White "Echo, Ev"]
[Black "Foxtrot, Fr"]
[WhiteElo "2600"]
[BlackElo "2550"]
[Result "1/2-1/2"]

${A_ORDER} 3. Bb5 a6 1/2-1/2

[Event "Reconcile no rating"]
[Site "?"]
[Date "2022.01.01"]
[Round "1"]
[White "Golf, Go"]
[Black "Hotel, Ho"]
[Result "1-0"]

${A_ORDER} 3. Bb5 a6 1-0

[Event "Reconcile one rating"]
[Site "?"]
[Date "2023.01.01"]
[Round "1"]
[White "India, In"]
[Black "Juliett, Ju"]
[WhiteElo "2300"]
[Result "*"]

${A_ORDER} 3. Bb5 a6 *

[Event "Reconcile repeats"]
[Site "?"]
[Date "2020.01.01"]
[Round "1"]
[White "Kilo, Ki"]
[Black "Lima, Li"]
[WhiteElo "2400"]
[BlackElo "2350"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Ng1 Nb8 4. Nf3 Nc6 5. Ng1 Nb8 6. Nf3 Nc6 1-0

[Event "Reconcile elsewhere"]
[Site "?"]
[Date "2018.01.01"]
[Round "1"]
[White "Mike, Mi"]
[Black "November, No"]
[WhiteElo "2700"]
[BlackElo "2650"]
[Result "1-0"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 1-0
`;

const imported = Date.UTC(2026, 0, 1);

/**
 * How many times a game's movetext passes through one position, repetitions
 * included. Parsed from the PGN with the application's own parser rather than
 * read off the import payload, so the count is a fact about the game text and
 * not about what the indexer happened to keep.
 */
function countVisits(pgn, key) {
  const parsed = parseSingleGame(pgn);
  if (!parsed.ok) throw new Error(`the fixture must parse: ${parsed.value}`);
  let seen = 0;
  for (const node of Object.values(parsed.value.tree.nodes)) {
    if (node.fen && positionKey(node.fen) === key) seen += 1;
  }
  return seen;
}

describe('a collection’s report figures reconcile with its games', () => {
  let directory;
  let database;
  let prepared;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-reconcile-'));
    database = new GameDatabase(path.join(directory, 'games.sqlite'));
    prepared = kit.preparePgnBatch(CORPUS, null, true, imported);
    expect(prepared.rejected, 'the corpus must import in full to be a fixture').toBe(0);
    // Seven games: six that reach the target position, one that does not.
    expect(prepared.payloads).toHaveLength(7);
    database.insertGames([...prepared.payloads]);
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('imports a corpus that really does contain the cases it claims', () => {
    // A fixture that quietly stopped testing the thing is worse than no
    // fixture, so the preconditions are asserted rather than assumed. The
    // first of them is this one: `TARGET` is written out by hand above, and a
    // hand-written FEN is exactly the kind of constant that can be wrong while
    // every other assertion still passes — the original draft of this file
    // named the Ruy Lopez position, and six of the seven tests passed happily
    // against a collection that did not contain it.
    const keys = new Set(
      prepared.payloads.flatMap((game) => game.positions.map((p) => p.positionKey)),
    );
    expect(keys.has(TARGET), 'the corpus must actually reach TARGET').toBe(true);

    const atTarget = prepared.payloads.filter((game) =>
      game.positions.some((position) => position.positionKey === TARGET),
    );
    // Six: the two transposed orders, the undated, the unrated, the one-rated
    // and the game that passes through three times. Not seven — the
    // "elsewhere" game never reaches it.
    expect(atTarget).toHaveLength(6);

    /*
      The repetition case, stated the way the system actually works.

      The first draft of this test asserted that the repeating game reached the
      target three times *in the index*, and it does not: the indexer keeps one
      row per game-position pair, so the movetext passing through the same
      position three times is already collapsed at write time. That is the
      stronger place for the defence — it costs a row per game, not per
      occurrence — and the report's `DISTINCT` is the second line rather than
      the only one. So the property worth pinning is that the index collapsed
      it, and separately that the report counted the game once.
    */
    const repeating = atTarget.find((game) => /Reconcile repeats/.test(game.game.event));
    expect(repeating, 'the corpus must contain the repeating game').toBeTruthy();
    const visits = countVisits(repeating.pgn, TARGET);
    expect(visits, 'its movetext must pass through the position three times').toBe(3);
    expect(
      repeating.positions.filter((p) => p.positionKey === TARGET),
      'and the index must keep exactly one row for it',
    ).toHaveLength(1);

    const orders = atTarget.filter(
      (game) => /e4 e5 2\. Nf3 Nc6/.test(game.pgn) || /Nf3 Nc6 2\. e4 e5/.test(game.pgn),
    );
    expect(orders.length, 'both move orders must reach the one position').toBeGreaterThanOrEqual(2);
  });

  it('counts each game once, however many times it reached the position', () => {
    const history = database.positionHistory(TARGET);
    expect(history.sampledGames).toBe(6);
    expect(history.hasMore).toBe(false);
    /*
      Worth knowing where this is actually defended, because it was measured
      rather than assumed: removing the `DISTINCT` from the query leaves this
      suite green. The indexer already keeps one row per game-position pair, so
      the collapse happens at write time and the query's `DISTINCT` is a second
      line rather than the only one. A corpus of duplicate rows would therefore
      test something the importer cannot currently produce — and if that ever
      changes, this is the assertion that would need to notice.
    */
  });

  it('tallies the years the games actually state, and names the ones they do not', () => {
    const history = database.positionHistory(TARGET);
    // Five dated games, one with no date at all.
    expect(history.undated).toBe(1);
    const years = Object.fromEntries(
      history.byYear.map((row) => [row.year, [row.games, row.white, row.draws, row.black]]),
    );
    expect(years).toEqual({
      2019: [1, 1, 0, 0], // A, 1-0
      2020: [1, 1, 0, 0], // repeats, 1-0
      2021: [1, 0, 0, 1], // B, 0-1
      2022: [1, 1, 0, 0], // no rating, 1-0
      2023: [1, 0, 0, 0], // one rating, result `*` — in no outcome column
    });
  });

  it('files a game under the lower rating it states, and counts no rating as none', () => {
    const history = database.positionHistory(TARGET);
    // The unrated game is in no class at all.
    expect(history.unrated).toBe(1);
    const bands = Object.fromEntries(
      history.byBand.map((row) => [row.band, [row.games, row.white, row.draws, row.black]]),
    );
    expect(bands).toEqual({
      // A min(2450,2400)=2400 · undated min(2600,2550)=2550
      2400: [2, 1, 1, 0],
      // B min(2500,2300)=2300 · one-rated min(2300)=2300 · repeats min(2400,2350)=2350
      2200: [3, 1, 0, 1],
    });
  });

  it('counts a game with no recorded result instead of filing it as a win', () => {
    const history = database.positionHistory(TARGET);
    expect(history.undecided).toBe(1);
    // The difference between the games and the three outcome columns is
    // exactly the number reported as undecided — which is the only reason a
    // reader can reconcile the line.
    const games = history.byYear.reduce((sum, row) => sum + row.games, 0);
    const named = history.byYear.reduce((sum, row) => sum + row.white + row.draws + row.black, 0);
    expect(games - named).toBe(history.undecided);
  });

  it('names the earliest games it can date, oldest first', () => {
    const history = database.positionHistory(TARGET);
    expect(history.first.map((game) => [game.year, game.event])).toEqual([
      [2019, 'Reconcile A'],
      [2020, 'Reconcile repeats'],
      [2021, 'Reconcile B'],
    ]);
  });

  it('answers the same for the postings layout, game for game', () => {
    // Both layouts index position occurrences; a report that disagreed between
    // them would depend on which storage the player happened to choose.
    const postingsFile = path.join(directory, 'postings.sqlite');
    const postings = new GameDatabase(postingsFile, { layout: 'postings' });
    try {
      postings.insertGames([...prepared.payloads]);
      expect(postings.positionHistory(TARGET)).toEqual(database.positionHistory(TARGET));
    } finally {
      postings.close();
    }
  });
});
