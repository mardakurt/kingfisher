import { describe, expect, it } from 'vitest';

import { START_FEN } from './fen';
import { STRATEGIC_THEMES, strategicThemes, THEME_VERSION, themeById } from './themes';

/**
 * Every theme gets a position it holds in and a near miss it does not, because
 * a definition only earns its place if it can be wrong. The near misses are
 * the interesting half: "one bishop each on the same colour" is not opposite
 * bishops, and a d-pawn with a friendly c-pawn beside it is not isolated.
 */

const has = (fen: string, id: string) => strategicThemes(fen).includes(id);

describe('the theme catalogue', () => {
  it('is versioned, so a stored match cannot be silently reinterpreted', () => {
    expect(THEME_VERSION).toMatch(/^t\d+$/);
  });

  it('gives every theme a unique id, a name and a definition', () => {
    const ids = STRATEGIC_THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const theme of STRATEGIC_THEMES) {
      expect(theme.name.length, theme.id).toBeGreaterThan(0);
      expect(theme.definition.length, theme.id).toBeGreaterThan(20);
    }
  });

  /**
   * The rule this catalogue exists under: a theme is admitted only if it can
   * be decided by counting. These words describe judgements, and a definition
   * containing one would be describing something the board cannot settle.
   */
  it('defines every theme without appealing to a judgement', () => {
    for (const theme of STRATEGIC_THEMES) {
      const definition = theme.definition.toLowerCase();
      for (const word of ['good', 'bad', 'strong', 'weak', 'better', 'advantage', 'initiative']) {
        expect(definition, `${theme.id} definition uses "${word}"`).not.toContain(word);
      }
    }
  });

  it('finds a theme by id and reports nothing for an unknown one', () => {
    expect(themeById('rook-ending')?.name).toBe('Rook ending');
    expect(themeById('nonexistent-theme')).toBeUndefined();
  });

  it('returns nothing for an unparseable position rather than guessing', () => {
    expect(strategicThemes('not a fen')).toEqual([]);
  });
});

describe('bishop themes', () => {
  it('matches opposite-coloured bishops', () => {
    // White bishop on a light square, Black bishop on a dark one.
    expect(has('4k3/8/8/8/8/8/4B3/4K1b1 w - - 0 1', 'opposite-coloured-bishops')).toBe(true);
  });

  it('does not call two bishops on the same colour opposite', () => {
    const fen = '4k3/8/2b5/8/8/8/4B3/4K3 w - - 0 1';
    expect(has(fen, 'opposite-coloured-bishops')).toBe(false);
    expect(has(fen, 'same-coloured-bishops')).toBe(true);
  });

  it('needs exactly one bishop each — two against one is not the theme', () => {
    expect(has('4k3/8/2b5/8/8/8/4BB2/4K3 w - - 0 1', 'opposite-coloured-bishops')).toBe(false);
    expect(has('4k3/8/2b5/8/8/8/4BB2/4K3 w - - 0 1', 'same-coloured-bishops')).toBe(false);
  });

  it('matches bishop against knight, in either direction', () => {
    expect(has('4k3/8/5n2/8/8/8/4B3/4K3 w - - 0 1', 'bishop-versus-knight')).toBe(true);
    expect(has('4k3/8/5b2/8/8/8/4N3/4K3 w - - 0 1', 'bishop-versus-knight')).toBe(true);
  });

  it('does not call bishop against bishop a bishop against knight', () => {
    expect(has('4k3/8/5b2/8/8/8/4B3/4K3 w - - 0 1', 'bishop-versus-knight')).toBe(false);
  });

  it('matches the bishop pair only when the two bishops differ in colour', () => {
    // b1 is a dark square, c1 light: a genuine pair.
    expect(has('4k3/8/5n2/8/8/8/8/1BB1K3 w - - 0 1', 'bishop-pair')).toBe(true);
    // b1 and d1 are both dark: two bishops, but not the pair.
    expect(has('4k3/8/5n2/8/8/8/8/1B1BK3 w - - 0 1', 'bishop-pair')).toBe(false);
  });
});

describe('material themes', () => {
  it('matches a rook ending', () => {
    expect(has('4k3/pp6/8/8/8/8/PP6/R3K2r w - - 0 1', 'rook-ending')).toBe(true);
  });

  it('does not call a position with a knight a rook ending', () => {
    expect(has('4k3/pp6/5n2/8/8/8/PP6/R3K3 w - - 0 1', 'rook-ending')).toBe(false);
  });

  it('does not call a position with a queen a rook ending', () => {
    expect(has('4k3/pp6/8/8/8/8/PP6/R2QK3 w - - 0 1', 'rook-ending')).toBe(false);
  });

  it('matches a minor-piece ending', () => {
    expect(has('4k3/pp6/5n2/8/8/8/PP6/4K1B1 w - - 0 1', 'minor-piece-ending')).toBe(true);
  });

  it('does not call a rook ending a minor-piece ending', () => {
    expect(has('4k3/pp6/8/8/8/8/PP6/R3K3 w - - 0 1', 'minor-piece-ending')).toBe(false);
  });

  it('matches rook against a minor piece', () => {
    expect(has('4k3/pp6/5n2/8/8/8/PP6/R3K3 w - - 0 1', 'rook-versus-minor')).toBe(true);
  });

  it('matches a queenless middlegame, and not an endgame', () => {
    const middlegame = 'r1b1k2r/pppp1ppp/2n2n2/8/8/2N2N2/PPPP1PPP/R1B1K2R w KQkq - 0 1';
    expect(has(middlegame, 'queenless-middlegame')).toBe(true);
    // Two pieces a side is not a middlegame under this definition.
    expect(has('4k3/pp6/5n2/8/8/8/PP6/R3K3 w - - 0 1', 'queenless-middlegame')).toBe(false);
  });

  it('does not call the starting position a queenless middlegame', () => {
    expect(has(START_FEN, 'queenless-middlegame')).toBe(false);
  });
});

describe('pawn-structure themes', () => {
  it('matches an isolated queen’s pawn on the fourth rank', () => {
    // White d4 pawn, no c- or e-pawn.
    expect(has('4k3/pp3ppp/8/8/3P4/8/PP3PPP/4K3 w - - 0 1', 'isolated-queen-pawn')).toBe(true);
  });

  it('does not call a supported d-pawn isolated', () => {
    expect(has('4k3/pp3ppp/8/8/2PP4/8/PP3PPP/4K3 w - - 0 1', 'isolated-queen-pawn')).toBe(false);
  });

  it('does not call a d-pawn on the third rank an isolated queen’s pawn', () => {
    // Isolated, but not on the fourth rank — the definition says fourth.
    expect(has('4k3/pp3ppp/8/8/8/3P4/PP3PPP/4K3 w - - 0 1', 'isolated-queen-pawn')).toBe(false);
  });

  it('matches hanging pawns on c4 and d4', () => {
    expect(has('4k3/p4ppp/8/8/2PP4/8/P4PPP/4K3 w - - 0 1', 'hanging-pawns')).toBe(true);
  });

  it('does not call c4/d4 hanging when a b-pawn supports them', () => {
    expect(has('4k3/p4ppp/8/8/2PP4/8/PP3PPP/4K3 w - - 0 1', 'hanging-pawns')).toBe(false);
  });

  it('matches the Carlsbad skeleton by square, not by opening name', () => {
    const carlsbad = 'r1bqk2r/pp3ppp/2p1pn2/3p4/3P4/2P1PN2/PP3PPP/R1BQK2R w KQkq - 0 1';
    expect(has(carlsbad, 'carlsbad')).toBe(true);
  });

  it('does not call an ordinary d4/d5 position Carlsbad', () => {
    expect(has('rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 1', 'carlsbad')).toBe(
      false,
    );
  });

  it('calls the starting position symmetrical, and stops when a pawn moves', () => {
    expect(has(START_FEN, 'symmetrical-pawns')).toBe(true);
    expect(
      has('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', 'symmetrical-pawns'),
    ).toBe(false);
  });

  it('matches an open central file', () => {
    // Both d-pawns gone.
    expect(has('4k3/ppp1pppp/8/8/8/8/PPP1PPPP/4K3 w - - 0 1', 'open-central-file')).toBe(true);
    expect(has(START_FEN, 'open-central-file')).toBe(false);
  });

  it('matches a queenside majority and a kingside majority independently', () => {
    // White has three queenside pawns to Black's one; Black has more on the kingside.
    const fen = '4k3/5ppp/8/8/8/8/PPP5/4K3 w - - 0 1';
    expect(has(fen, 'queenside-majority')).toBe(true);
    expect(has(fen, 'kingside-majority')).toBe(true);
    expect(has(START_FEN, 'queenside-majority')).toBe(false);
    expect(has(START_FEN, 'kingside-majority')).toBe(false);
  });
});

describe('king themes', () => {
  it('matches opposite-side castling', () => {
    expect(has('2kr3r/pppppppp/8/8/8/8/PPPPPPPP/R4RK1 w - - 0 1', 'opposite-side-castling')).toBe(
      true,
    );
  });

  it('does not call same-side castling opposite', () => {
    expect(has('r4rk1/pppppppp/8/8/8/8/PPPPPPPP/R4RK1 w - - 0 1', 'opposite-side-castling')).toBe(
      false,
    );
  });

  it('does not call two central kings opposite-side castling', () => {
    expect(has(START_FEN, 'opposite-side-castling')).toBe(false);
  });
});

describe('strategicThemes as a whole', () => {
  it('reports several themes at once when several hold', () => {
    const themes = strategicThemes('4k3/pp6/8/8/8/8/PP6/R3K2r w - - 0 1');
    expect(themes).toContain('rook-ending');
    expect(themes).toContain('open-central-file');
  });

  it('reports an empty list for a position matching nothing, rather than failing', () => {
    // Bare kings: no bishops, no material themes, no pawns.
    expect(strategicThemes('4k3/8/8/8/8/8/8/4K3 w - - 0 1')).toEqual([]);
  });
});
