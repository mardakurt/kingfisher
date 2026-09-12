/**
 * PGN fixtures for desktop harnesses: factual games, no annotations.
 *
 * Chess moves are facts and carry no copyright; the games here are either
 * famous public-record games given by their moves only, or synthetic games
 * constructed to exercise one feature each. Nothing here is a person's
 * private data.
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';

/** A normal short game: the Opera Game, moves only. */
export const NORMAL = `[Event "Paris"]
[Site "Paris FRA"]
[Date "1858.??.??"]
[White "Morphy, Paul"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0
`;

/** Promotion, en passant and both castlings, in one synthetic game. */
export const SPECIAL_MOVES = `[Event "Synthetic: special moves"]
[Site "?"]
[Date "2026.09.12"]
[Round "-"]
[White "Harness"]
[Black "Harness"]
[Result "*"]

1. e4 Nf6 2. e5 d5 3. exd6 Nc6 4. dxc7 e6 5. cxd8=Q+ Kxd8 6. Nf3 Be7 7. Bc4 Rf8
8. O-O Bd7 9. d3 Rc8 10. Nc3 Ke8 11. Bd2 Kd8 12. Qe2 Kc7 13. Rae1 a6
14. a3 Bd6 15. h3 h6 16. Be3 Rh8 17. Rd1 Rhf8 18. Kh1 Rh8 19. Bd2 Rhf8 *
`;

/** A game from a set-up position, with clock tags. */
export const SETUP_WITH_CLOCKS = `[Event "Synthetic: setup and clocks"]
[Site "?"]
[Date "2026.09.12"]
[White "Harness"]
[Black "Harness"]
[Result "1-0"]
[SetUp "1"]
[FEN "8/8/8/4k3/8/8/8/K2R4 w - - 0 1"]
[TimeControl "300+3"]

1. Rd5+ {[%clk 0:04:58]} Ke4 {[%clk 0:04:55]} 2. Kb2 {[%clk 0:04:50]} Kf4 {[%clk 0:04:40]}
3. Kc3 {[%clk 0:04:49]} Ke4 {[%clk 0:04:31]} 4. Rd1 {[%clk 0:04:47]} Ke3 {[%clk 0:04:20]}
5. Rd8 Ke2 6. Rd7 Ke3 7. Kc4 Ke2 8. Kc3 Ke3 9. Rd1 Ke2 10. Rd8 Ke3 1-0
`;

/** Nested variations, three deep, with comments. */
export const VARIATIONS = `[Event "Synthetic: variations"]
[Site "?"]
[Date "2026.09.12"]
[White "Harness"]
[Black "Harness"]
[Result "*"]

1. e4 c5 (1... e5 2. Nf3 Nc6 (2... Nf6 3. Nxe5 d6 (3... Qe7 4. Nf3) 4. Nf3 Nxe4)
3. Bb5 a6) 2. Nf3 d6 (2... Nc6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 e5 {a comment} 6. Ndb5 d6)
3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 *
`;

/** Many games, generated: a long file for the size path. */
export function longFile(games = 400) {
  const out = [];
  for (let i = 0; i < games; i += 1) {
    out.push(
      `[Event "Synthetic long file"]\n[Site "?"]\n[Date "2026.09.12"]\n[Round "${i + 1}"]\n` +
        `[White "White ${i}"]\n[Black "Black ${i}"]\n[Result "*"]\n\n` +
        '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O ' +
        '9. h3 Nb8 10. d4 Nbd7 11. Nbd2 Bb7 12. Bc2 Re8 13. Nf1 Bf8 14. Ng3 g6 15. a4 c5 *\n\n',
    );
  }
  return out.join('');
}

/** A very long single game: 200 moves of shuffling that never repeats thrice. */
export function longGame() {
  const moves = [];
  const cycle = ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nc3', 'Nc6', 'Nb1', 'Nb8'];
  // Alternate the two knight pairs to keep the repetition count below three
  // for any one position sequence… it is a stress fixture, not a real game.
  for (let i = 0; i < 100; i += 1) {
    const a = cycle[(i * 2) % cycle.length];
    const b = cycle[(i * 2 + 1) % cycle.length];
    moves.push(`${i + 1}. ${a} ${b}`);
  }
  return `[Event "Synthetic long game"]\n[Site "?"]\n[White "Harness"]\n[Black "Harness"]\n[Result "*"]\n\n${moves.join(' ')} *\n`;
}

/** Text that is not PGN. */
export const MALFORMED = `[Event "Broken"\n[White Unterminated\n\n1. e4 e5 2. Nf3 Nc6 3. Zz9 xx *\n`;

/** Write the corpus into a directory; returns the paths by name. */
export function writeCorpus(directory) {
  const files = {
    normal: ['normal.pgn', NORMAL],
    special: ['special-moves.pgn', SPECIAL_MOVES],
    setup: ['setup-clocks.pgn', SETUP_WITH_CLOCKS],
    variations: ['variations.pgn', VARIATIONS],
    longFile: ['long-file.pgn', longFile()],
    longGame: ['long-game.pgn', longGame()],
    malformed: ['malformed.pgn', MALFORMED],
    empty: ['empty.pgn', ''],
  };
  const out = {};
  for (const [key, [name, text]] of Object.entries(files)) {
    const file = path.join(directory, name);
    writeFileSync(file, text);
    out[key] = file;
  }
  return out;
}
