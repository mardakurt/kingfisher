import { describe, expect, it } from 'vitest';

import { parseFen } from './fen';
import { describeRefusals, parsePgn, parseSingleGame } from './pgn/parse';
import { Position } from './position';

/**
 * Kingfisher plays standard chess, and this file is where that is written down.
 *
 * The contract is not "Chess960 is unimplemented" — that would be a note in a
 * document. It is the stronger claim that matters to a player: Kingfisher will
 * never offer a castling move it cannot legally make, and will refuse a
 * position that claims one, rather than guessing.
 *
 * The reason it needs a test is a real defect, found in Phase 16. A castling
 * right is a claim about where two pieces stand, and nothing was checking the
 * claim. Given `4k3/8/8/8/8/8/8/R4K1R w KQ - 0 1` — a white king on f1, rooks
 * on a1 and h1, and both rights set — the rules engine offered `O-O-O`, played
 * it by sliding the king from f1 to d1, and **left both rooks where they
 * were**. An illegal move, presented as legal, in a position the position
 * setup dialog can build and a PGN `[FEN]` tag can carry.
 *
 * The fix is in Kingfisher's own FEN parser rather than in whatever the rules
 * engine tolerates this year. See ADR 0047.
 */

/** Castling moves offered in a position, described so a failure is readable. */
function castlesIn(fen: string): readonly string[] {
  const position = Position.fromFen(fen);
  if (!position.ok) throw new Error(`expected ${fen} to load: ${position.error.message}`);
  return position.value
    .legalMoves()
    .filter((move) => move.san.startsWith('O-O'))
    .map((move) => `${move.san} ${move.from}->${move.to}`);
}

const rejection = (fen: string): string => {
  const parsed = parseFen(fen);
  expect(parsed.ok, `${fen} should be rejected`).toBe(false);
  expect(Position.fromFen(fen).ok, `${fen} should be rejected by Position too`).toBe(false);
  return parsed.ok ? '' : parsed.error.message;
};

describe('the standard-chess contract', () => {
  it('castles normally when the pieces are where standard chess puts them', () => {
    // The control. Without this, every assertion below could pass because
    // castling generation is broken outright rather than correctly declined.
    expect(castlesIn('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1')).toEqual(['O-O e1->g1', 'O-O-O e1->c1']);
  });

  it('refuses a castling right whose rook is not on its home square', () => {
    expect(rejection('4k3/8/8/8/8/8/8/1R2K3 w Q - 0 1')).toMatch(/rook on a1/);
    expect(rejection('4k3/8/8/8/8/8/8/4K1R1 w K - 0 1')).toMatch(/rook on h1/);
    expect(rejection('1r2k3/8/8/8/8/8/8/4K3 b q - 0 1')).toMatch(/rook on a8/);
  });

  it('refuses a castling right whose king is not on its home square', () => {
    /*
      The exact shape of the defect. Before the fix this position loaded and
      offered O-O-O, moving the king f1->d1 and leaving both rooks in place.
    */
    expect(rejection('4k3/8/8/8/8/8/8/R4K1R w KQ - 0 1')).toMatch(/king on e1/);
    expect(rejection('4k3/8/8/8/8/8/8/R2K3R w KQ - 0 1')).toMatch(/king on e1/);
    expect(rejection('r4k1r/8/8/8/8/8/8/4K3 b kq - 0 1')).toMatch(/king on e8/);
  });

  it('refuses a Chess960 starting array that claims standard castling rights', () => {
    // Position 001 of the 960: king on g1, rooks on f1 and h1. A Chess960
    // engine castles here; Kingfisher must not pretend it can.
    expect(rejection('bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w KQkq - 0 1')).toMatch(
      /king on e1/,
    );
  });

  it('rejects Shredder-FEN castling rights rather than misreading them', () => {
    /*
      "HFhf" names the rook files, which is how Chess960 castling rights are
      written. Accepting it and quietly treating it as KQkq would be the
      dangerous outcome: the position would load and then be played under the
      wrong rules.
    */
    expect(rejection('bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w HFhf - 0 1')).toMatch(
      /Castling field/,
    );
  });

  it('loads a Chess960 array with no castling rights claimed, and offers none', () => {
    // Without the impossible claim there is nothing wrong with the position;
    // it is simply a legal arrangement of pieces. It must load, and it must
    // not acquire castling from anywhere.
    const sp001 = 'bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w - - 0 1';
    expect(castlesIn(sp001)).toEqual([]);
    expect(castlesIn('bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNN1KR w - - 0 1')).toEqual([]);
  });

  it('does not import a game that starts from an impossible castling position', () => {
    /*
      The reachable path. A PGN carrying such a position in its FEN tag is the
      one way a user gets one without typing it — the position setup dialog has
      always refused to build one. Until 1.4.3 the importer replayed the moves
      from the standard start instead, which is a different game wearing this
      one's tags; it is now refused, and says why.
    */
    const pgn = '[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/8/R4K1R w KQ - 0 1"]\n\n1. Kf2 Ke7 *';
    const single = parseSingleGame(pgn);
    expect(single.ok).toBe(false);
    if (!single.ok) expect(single.error.message).toMatch(/king on e1/);
    const parsed = parsePgn(pgn);
    expect(parsed.games).toHaveLength(0);
    expect(parsed.refused.map((refusal) => refusal.reason)).toEqual(['start-position']);
  });

  it('refuses a Chess960 game from a Lichess export rather than replaying it from RNBQKBNR', () => {
    // The tags and the first moves of a real Lichess Chess960 export
    // (lichess.org/2vUNiLP8). Its first four moves are also legal from the
    // standard start, which is exactly how it used to be stored as an A00.
    const chess960 = [
      '[Event "Chess960 Titled Arena"]',
      '[White "DrNykterstein"]',
      '[Black "Vladimirovich9000"]',
      '[Result "1-0"]',
      '[Variant "Chess960"]',
      '[FEN "rkbnrnqb/pppppppp/8/8/8/8/PPPPPPPP/RKBNRNQB w KQkq - 0 1"]',
      '[SetUp "1"]',
      '',
      '1. a4 g6 2. a5 f5 3. g4 a6 4. g5 Nc6 5. Bxc6 dxc6 1-0',
    ].join('\n');
    const standard =
      '[Event "Standard"]\n[White "A"]\n[Black "B"]\n[Result "1-0"]\n[Variant "Standard"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0';
    // A standard game set up from a position: Lichess writes "From Position".
    const fromPosition =
      '[Event "Study"]\n[Result "*"]\n[Variant "From Position"]\n[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 *';
    const parsed = parsePgn([standard, chess960, fromPosition].join('\n\n'));
    expect(parsed.games.map((game) => game.tree.headers.Event)).toEqual(['Standard', 'Study']);
    expect(parsed.refused).toEqual([
      expect.objectContaining({
        reason: 'variant',
        variant: 'Chess960',
        game: 'DrNykterstein – Vladimirovich9000',
      }),
    ]);
    expect(describeRefusals(parsed.refused)).toBe(
      '1 Chess960 game not imported: Kingfisher plays standard chess only, from a position it can read.',
    );
    // A Chess960 game whose arrangement happens to be legal for the FEN parser
    // (no castling rights claimed) is still not standard chess.
    const noCastling = parsePgn(
      '[Variant "Chess960"]\n[FEN "bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w - - 0 1"]\n\n1. e4 *',
    );
    expect(noCastling.games).toHaveLength(0);
    expect(noCastling.issues[0]?.message).toMatch(/No standard chess games found.*1 Chess960 game/);
  });

  it('still plays a normal game of chess', () => {
    // The other half of the contract: declining all of the above must not have
    // cost anything. A Ruy Lopez, with both sides castling.
    const moves = [
      'e4',
      'e5',
      'Nf3',
      'Nc6',
      'Bb5',
      'a6',
      'Ba4',
      'Nf6',
      'O-O',
      'Be7',
      'Re1',
      'b5',
      'Bb3',
      'O-O',
    ];
    let position = Position.initial();
    for (const san of moves) {
      const advanced = position.advanceSan(san);
      expect(advanced.ok, san).toBe(true);
      if (!advanced.ok) return;
      position = advanced.value.next;
    }
    // White castled and then played Re1, so the rook that castled is on e1.
    expect(position.fen).toBe(
      'r1bq1rk1/2ppbppp/p1n2n2/1p2p3/4P3/1B3N2/PPPP1PPP/RNBQR1K1 w - - 2 8',
    );
  });
});
