/**
 * The plan evidence is arithmetic over recorded games, so these tests are
 * written the way the arithmetic can be checked by hand: small populations of
 * real lines, with the expected count stated rather than derived from the same
 * code that produces it.
 *
 * The cases that matter are the ones where "which piece is this" is not
 * obvious — castling, en passant, promotion, and a piece that returns to a
 * square it has already visited.
 */

import { describe, expect, it } from 'vitest';

import { START_FEN } from '../chess/fen';

import {
  DEFAULT_WINDOW,
  planEvidence,
  principalDestinations,
  significantAdvances,
} from './opening-plans';

/** 1.e4 e5 2.Nf3 Nc6 3.Bb5, as UCI. */
const RUY = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'];
/** 1.d4 d5 2.c4 e6 3.Nc3 Nf6. */
const QGD = ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6'];

const find = <T extends { from: string; to: string }>(
  rows: readonly T[],
  from: string,
  to: string,
): T | undefined => rows.find((row) => row.from === from && row.to === to);

describe('replaying a population from a position', () => {
  it('attributes a move to the piece that made it, by the square it came from', () => {
    const evidence = planEvidence(START_FEN, [RUY, RUY], { minimumGames: 1 });
    expect(evidence).not.toBeNull();
    const knight = find(evidence!.destinations, 'g1', 'f3');
    expect(knight).toMatchObject({ color: 'w', piece: 'n', games: 2, denominator: 2 });
    const bishop = find(evidence!.destinations, 'f1', 'b5');
    expect(bishop).toMatchObject({ color: 'w', piece: 'b', games: 2 });
  });

  it('reports a pawn move as an advance and not as a destination', () => {
    const evidence = planEvidence(START_FEN, [RUY], { minimumGames: 1 })!;
    expect(find(evidence.destinations, 'e2', 'e4')).toBeUndefined();
    expect(find(evidence.advances, 'e2', 'e4')).toMatchObject({
      color: 'w',
      capture: false,
      games: 1,
      denominator: 1,
    });
  });

  it('counts a piece once per game however often it revisits a square', () => {
    // Ng1-f3-g1-f3: the knight reaches f3 twice in one game, and one game is
    // one game. Counting arrivals rather than games would say two.
    const shuffle = ['g1f3', 'b8c6', 'f3g1', 'c6b8', 'g1f3'];
    const evidence = planEvidence(START_FEN, [shuffle], { minimumGames: 1 })!;
    expect(find(evidence.destinations, 'g1', 'f3')).toMatchObject({
      games: 1,
      denominator: 1,
      medianPly: 0,
    });
  });

  it('gives every row the same denominator, which is the games replayed', () => {
    const evidence = planEvidence(START_FEN, [RUY, QGD], { minimumGames: 1 })!;
    expect(evidence.games).toBe(2);
    for (const row of [...evidence.destinations, ...evidence.advances]) {
      expect(row.denominator).toBe(2);
    }
    // Both games are in the denominator; only one played each of these.
    expect(find(evidence.destinations, 'g1', 'f3')!.games).toBe(1);
    expect(find(evidence.destinations, 'b1', 'c3')!.games).toBe(1);
  });

  it('reports the median ply at which a piece first arrived', () => {
    // 1.e4 e5 2.Nf3: the knight move is the third ply of the line, which is
    // index 2 counting from the report position at zero.
    const evidence = planEvidence(START_FEN, [RUY], { minimumGames: 1 })!;
    expect(find(evidence.destinations, 'g1', 'f3')!.medianPly).toBe(2);
    // ...and Black's reply is the ply after it.
    expect(find(evidence.destinations, 'b8', 'c6')!.medianPly).toBe(3);
  });
});

describe('the moves where the piece is not the one on the destination square', () => {
  it('moves the rook with the king when the king castles', () => {
    // 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.O-O — the rook that was on h1 is now on f1
    // and must still be countable as "the rook from h1".
    const castled = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1g1'];
    const evidence = planEvidence(START_FEN, [castled], { minimumGames: 1 })!;
    expect(find(evidence.destinations, 'e1', 'g1')).toMatchObject({ piece: 'k' });
    expect(find(evidence.destinations, 'h1', 'f1')).toMatchObject({ piece: 'r', games: 1 });
  });

  it('moves the queenside rook to d1 when the king castles long', () => {
    const long = ['d2d4', 'd7d5', 'b1c3', 'g8f6', 'c1f4', 'c8f5', 'd1d2', 'e7e6', 'e1c1'];
    const evidence = planEvidence(START_FEN, [long], { minimumGames: 1 })!;
    expect(find(evidence.destinations, 'e1', 'c1')).toMatchObject({ piece: 'k' });
    expect(find(evidence.destinations, 'a1', 'd1')).toMatchObject({ piece: 'r' });
  });

  it('removes the pawn en passant takes, which is not on the destination square', () => {
    /*
      The square the captured pawn stood on is not the square the capturing
      pawn lands on, so a tracker that only clears the destination leaves a
      phantom pawn behind and attributes every later move onto that square to
      a capture that never happened.

      Black plays ...d7-d5 and White takes en passant with exd6. The first of
      these two games then plays ...d5-d4, which is a move no piece can make
      because d5 is empty. It must abandon the game. A tracker with a phantom
      pawn on d5 replays it happily and counts a game that does not exist.
    */
    const fen = '4k3/3p4/8/Q3P3/8/8/8/4K3 b - - 0 1';
    const evidence = planEvidence(
      fen,
      [
        ['d7d5', 'e5d6', 'd5d4'],
        ['d7d5', 'e5d6', 'e8e7'],
      ],
      { minimumGames: 1 },
    )!;
    expect(evidence.games).toBe(1);
    expect(evidence.abandoned).toBe(1);
    expect(find(evidence.advances, 'd7', 'd5')).toMatchObject({ capture: false });
    expect(find(evidence.advances, 'e5', 'd6')).toMatchObject({ capture: true });
  });

  it('credits a promotion to the pawn that walked there, and says what it became', () => {
    const fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
    const evidence = planEvidence(fen, [['a7a8q']], { minimumGames: 1 })!;
    // The report is that the a7 pawn reached a8 and queened, not that a queen
    // appeared out of nowhere on a square it never started on.
    expect(find(evidence.advances, 'a7', 'a8')).toMatchObject({
      games: 1,
      promotedTo: 'q',
    });
    expect(find(evidence.destinations, 'a7', 'a8')).toBeUndefined();
  });

  it('tracks a promoted piece as what it became, for the rest of the game', () => {
    // The a7 pawn queens and the new queen then travels to h8. A tracker that
    // recorded the promotion in the arrival but left a pawn on the board would
    // report a pawn moving seven files sideways.
    const fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
    const evidence = planEvidence(fen, [['a7a8q', 'e8e7', 'a8h8']], { minimumGames: 1 })!;
    expect(find(evidence.advances, 'a7', 'h8')).toMatchObject({ promotedTo: 'q' });
  });

  it('reads the report position for what a piece is, not the starting rank', () => {
    // A middlegame position where a rook stands on d2 and a pawn on d4. Rank
    // is no guide to piece here, and a tracker that assumed ranks 2 and 7 hold
    // pawns would file the rook's move as a pawn advance.
    const fen = '4k3/8/8/8/3P4/8/3R4/4K3 w - - 0 1';
    const evidence = planEvidence(fen, [['d2d3', 'e8e7', 'd4d5']], { minimumGames: 1 })!;
    expect(find(evidence.destinations, 'd2', 'd3')).toMatchObject({ piece: 'r' });
    expect(find(evidence.advances, 'd2', 'd3')).toBeUndefined();
    expect(find(evidence.advances, 'd4', 'd5')).toMatchObject({ capture: false });
  });
});

describe('populations that cannot be counted', () => {
  it('returns null for a position it cannot parse', () => {
    expect(planEvidence('not a fen', [RUY])).toBeNull();
  });

  it('abandons a game whose line does not start from this position, rather than guessing', () => {
    // h3h4: there is no piece on h3 in the starting position. The honest
    // outcome is that this game contributes nothing, and says so.
    const evidence = planEvidence(START_FEN, [RUY, ['h3h4']], { minimumGames: 1 })!;
    expect(evidence.games).toBe(1);
    expect(evidence.abandoned).toBe(1);
    expect(find(evidence.destinations, 'g1', 'f3')!.denominator).toBe(1);
  });

  it('returns null when no game could be replayed at all', () => {
    expect(planEvidence(START_FEN, [['h3h4'], ['a6a5']])).toBeNull();
  });

  it('ignores a malformed move rather than treating it as a square', () => {
    expect(planEvidence(START_FEN, [['e2e9']], { minimumGames: 1 })).toBeNull();
    expect(planEvidence(START_FEN, [['e2e4x']], { minimumGames: 1 })).toBeNull();
  });
});

describe('the floor under a reported plan', () => {
  it('does not report a destination one game reached', () => {
    // AGENTS.md and the brief: a move is not a plan because it happened once.
    const evidence = planEvidence(START_FEN, [RUY, QGD, QGD], { minimumGames: 2 })!;
    expect(find(evidence.destinations, 'g1', 'f3')).toBeUndefined();
    expect(find(evidence.destinations, 'b1', 'c3')).toMatchObject({ games: 2 });
  });

  it('stops replaying at the window, so a plan is an opening plan', () => {
    const long = [...RUY, ...Array.from({ length: 40 }, () => 'x')];
    const evidence = planEvidence(START_FEN, [long], { window: 5, minimumGames: 1 })!;
    // Five plies is exactly the Ruy line; the nonsense after it is never read.
    expect(evidence.window).toBe(5);
    expect(find(evidence.destinations, 'f1', 'b5')).toMatchObject({ games: 1 });
  });

  it('uses a thirty-ply window unless told otherwise', () => {
    expect(planEvidence(START_FEN, [RUY], { minimumGames: 1 })!.window).toBe(DEFAULT_WINDOW);
  });
});

describe('reducing the evidence to what a report has room for', () => {
  it('keeps one destination per piece, the one it reached most often', () => {
    // The knight goes to f3 in all three games and on to e5 in one.
    const games = [
      ['g1f3', 'd7d5', 'f3e5'],
      ['g1f3', 'd7d5', 'd2d4'],
      ['g1f3', 'd7d5', 'd2d4'],
    ];
    const evidence = planEvidence(START_FEN, games, { minimumGames: 1 })!;
    const principal = principalDestinations(evidence);
    const knight = principal.filter((row) => row.from === 'g1');
    expect(knight).toHaveLength(1);
    expect(knight[0]).toMatchObject({ to: 'f3', games: 3, denominator: 3 });
  });

  it('drops a destination too few games reached to be worth a sentence', () => {
    const games = [
      ['g1f3', 'd7d5', 'f3e5'],
      ['g1f3', 'd7d5', 'd2d4'],
      ['g1f3', 'd7d5', 'd2d4'],
      ['g1f3', 'd7d5', 'd2d4'],
    ];
    const evidence = planEvidence(START_FEN, games, { minimumGames: 1 })!;
    // e5 is one game in four; at a floor of half, it is not a destination
    // anybody should be told about.
    expect(principalDestinations(evidence, { minimumShare: 0.5 }).some((r) => r.to === 'e5')).toBe(
      false,
    );
  });

  it('reports a pawn advance that travelled, and not one that shuffled', () => {
    const games = [
      ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4'],
      ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4'],
    ];
    const evidence = planEvidence(START_FEN, games, { minimumGames: 1 })!;
    const advances = significantAdvances(evidence);
    // ...c7-c5 travelled two ranks and is reported; ...d7-d6 moved one rank
    // and stayed at home, and is not.
    expect(advances.some((row) => row.from === 'c7' && row.to === 'c5')).toBe(true);
    expect(advances.some((row) => row.from === 'd7' && row.to === 'd6')).toBe(false);
  });

  it('does not call a capture an advance', () => {
    const games = [
      ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4'],
      ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4'],
    ];
    const evidence = planEvidence(START_FEN, games, { minimumGames: 1 })!;
    expect(find(evidence.advances, 'c7', 'd4')).toMatchObject({ capture: true });
    const significant = significantAdvances(evidence);
    // ...cxd4 is a capture and is excluded; White's own d2-d4 also lands on d4
    // and is a push, so the row that survives is the one that pushed.
    expect(significant.some((row) => row.from === 'c7' && row.to === 'd4')).toBe(false);
    expect(significant.some((row) => row.from === 'd2' && row.to === 'd4')).toBe(true);
  });
});
