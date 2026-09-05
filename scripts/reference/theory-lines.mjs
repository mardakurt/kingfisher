/**
 * A benchmark corpus of mainstream opening theory, written out by hand.
 *
 * The point of writing these rather than deriving them from a pack is that a
 * corpus taken from the data it measures cannot fail. These are lines a strong
 * player would actually walk down, so a pack that has no answer at move twenty
 * of the Najdorf has to say so.
 *
 * Every line is replayed through Kingfisher's own rules code before it is
 * used, so an illegal or mistyped move fails the benchmark loudly rather than
 * quietly shortening the line it was supposed to measure.
 *
 * `plies` in the report always means half-moves. Twenty full moves is 40.
 */

/** @typedef {{ eco: string, name: string, moves: string }} TheoryLine */

/** @type {readonly TheoryLine[]} */
export const THEORY_LINES = [
  {
    eco: 'C99',
    name: 'Ruy Lopez: Closed, Chigorin',
    moves: `e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Na5 Bc2 c5
            d4 Qc7 Nbd2 cxd4 cxd4 Nc6 Nb3 a5 Be3 a4 Nbd2 Bd7 Rc1 Qb8 a3 Rc8 Bd3 Nd8`,
  },
  {
    eco: 'C67',
    name: 'Ruy Lopez: Berlin Defence, endgame',
    moves: `e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8 h3 Ke8 Nc3 h5
            Bf4 Be7 Rad1 Be6 Ng5 Rh6 Rd3 Bxg5 Bxg5 Rg6 Bh4 Bd5 Rfd1 Kd7 R1d2 f6 exf6 gxf6`,
  },
  {
    eco: 'C88',
    name: 'Ruy Lopez: Anti-Marshall',
    moves: `e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O h3 Bb7 d3 d6 a3 Na5
            Ba2 c5 Nbd2 Nc6 c3 Rb8 Re2 Re8 Nf1 h6 Ng3 Bf8 Bd2 d5 exd5 Nxd5`,
  },
  {
    eco: 'C54',
    name: 'Italian Game: Giuoco Pianissimo',
    moves: `e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 Nbd2 Ba7 h3 h6 Nf1 Be6
            Bxe6 fxe6 Ng3 d5 Qe2 Qd6 a4 Rad8 a5 Kh8 Be3 Bxe3 Qxe3 Ng8`,
  },
  {
    eco: 'C42',
    name: 'Petrov: Classical',
    moves: `e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3 Be7 O-O Nc6 Re1 Bg4 c3 f5 Nbd2 O-O
            Qb3 Kh8 h3 Bh5 Bxe4 fxe4 Rxe4 Bd6 Ne5 Nxe5 dxe5 Be7 Nf3 Bg6 Re2 Qd7 Bf4 Rae8`,
  },
  {
    eco: 'B90',
    name: 'Sicilian: Najdorf, English Attack',
    moves: `e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7
            g4 b5 g5 b4 Ne2 Ne8 f4 a5 f5 a4 Nbd4 exd4 Nxd4 b3 Kb1 bxc2+ Nxc2 Bb3 axb3 axb3`,
  },
  {
    eco: 'B97',
    name: 'Sicilian: Najdorf, Poisoned Pawn',
    moves: `e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4 Qb6 Qd2 Qxb2 Rb1 Qa3 e5 dxe5
            fxe5 Nfd7 Ne4 h6 Bh4 Qxa2 Rd1 Qd5 Qe3 Qxe5 Be2 Bc5 Bg3 Bxd4 Rxd4 Qa5+`,
  },
  {
    eco: 'B33',
    name: 'Sicilian: Sveshnikov',
    moves: `e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5 Bxf6 gxf6 Nd5 f5
            Bd3 Be6 O-O Bxd5 exd5 Ne7 c3 Bg7 Qh5 e4 Bc2 O-O Rae1 f4 f3 Qd7`,
  },
  {
    eco: 'B48',
    name: 'Sicilian: Taimanov, English Attack',
    moves: `e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be3 a6 Qd2 Nf6 O-O-O Bb4 f3 Ne5 Nb3 b5
            Qe1 Be7 f4 Ng6 Qg3 h5 e5 Nd5 Nxd5 exd5 f5 Bf6 Bd4 Bxe5 Bxe5 Qxe5 Qxe5+ Nxe5 Rxd5 Nc6`,
  },
  {
    eco: 'B12',
    name: 'Caro-Kann: Advance, Short System',
    moves: `e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3 Qb6 Nc3 Nc6 O-O cxd4 Nxd4 Nxd4 Bxd4 Bc5
            Bxc5 Qxc5 Na4 Qb4 c3 Qb5 b3 Ne7 a3 Qa5 b4 Qd8`,
  },
  {
    eco: 'B18',
    name: 'Caro-Kann: Classical',
    moves: `e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3 e6
            Bf4 Ngf6 O-O-O Be7 Kb1 O-O c4 c5 Ne4 Nxe4 Qxe4 Nf6`,
  },
  {
    eco: 'C11',
    name: 'French: Classical, Steinitz',
    moves: `e4 e6 d4 d5 Nc3 Nf6 e5 Nfd7 f4 c5 Nf3 Nc6 Be3 cxd4 Nxd4 Bc5 Qd2 O-O O-O-O a6
            Qf2 Nxd4 Bxd4 b5 Bd3 Bxd4 Qxd4 b4 Ne2 Qa5 Kb1 Nb6 Nc1 Bd7 Nb3 Qb5 Qe3 Rac8`,
  },
  {
    eco: 'C02',
    name: 'French: Advance, Milner-Barry',
    moves: `e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 Bd3 cxd4 cxd4 Bd7 O-O Nxd4 Nxd4 Qxd4 Nc3 Qxe5
            Re1 Qb8 Nxd5 Bd6`,
  },
  {
    eco: 'C18',
    name: 'French: Winawer, Poisoned Pawn',
    moves: `e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Qg4 Qc7 Qxg7 Rg8 Qxh7 cxd4 Ne2 Nbc6
            f4 Bd7 Qd3 dxc3 Nxc3 a6 Rb1 O-O-O Rb3 d4 Ne2 Nf5 g4 Nfe7 Nxd4 Nxd4 Qxd4 Nc6 Qf2 Be8`,
  },
  {
    eco: 'B01',
    name: 'Scandinavian: Qa5 main line',
    moves: `e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5 Bd2 e6 Nd5 Qd8 Nxf6+ gxf6 Bb3 Bg6
            Qe2 Nd7 O-O-O Qc7 h4 h6 Ne1 O-O-O Nd3 Bd6`,
  },
  {
    eco: 'B07',
    name: 'Pirc: Classical',
    moves: `e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 O-O Bd3 Na6 O-O c5 d5 Bg4 Be3 Nc7 h3 Bxf3
            Qxf3 b5 a3 Rb8 Rae1 e6 Qf2 exd5 exd5 Re8 Bd2 b4 axb4 cxb4 Na4 Nfxd5`,
  },
  {
    eco: 'D37',
    name: "Queen's Gambit Declined: 5.Bf4",
    moves: `d4 Nf6 c4 e6 Nf3 d5 Nc3 Be7 Bf4 O-O e3 Nbd7 c5 Nh5 Bd3 Nxf4 exf4 b6 b4 a5
            a3 c6 O-O Qc7 g3 Ba6 Bxa6 Rxa6 Qd3 Raa8 Rfe1 Rfe8`,
  },
  {
    eco: 'D85',
    name: 'Grünfeld: Exchange, modern',
    moves: `d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5 Rb1 O-O Be2 cxd4 cxd4 Qa5+
            Bd2 Qxa2 O-O Bg4 Bg5 h6 Be3 Nc6 d5 Bxf3 Bxf3 Ne5 Be2 e6 dxe6 fxe6 Bc4 Rf6 Qe1 Raf8`,
  },
  {
    eco: 'D43',
    name: 'Semi-Slav: Anti-Moscow Gambit',
    moves: `d4 d5 c4 c6 Nf3 Nf6 Nc3 e6 Bg5 h6 Bh4 dxc4 e4 g5 Bg3 b5 Be2 Bb7 O-O Nbd7
            Qc2 Nb6 Rfd1 Qe7 a4 O-O-O axb5 cxb5 d5 Nfxd5 exd5 Nxd5`,
  },
  {
    eco: 'D17',
    name: 'Slav: Czech, Krause',
    moves: `d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 Ne5 Nbd7 Nxc4 Qc7 g3 e5 dxe5 Nxe5 Bf4 Nfd7
            Bg2 g5 Ne3 gxf4 Nxf5 O-O-O Nd6+ Bxd6 Bxc6 bxc6 O-O Rhg8 Qd2 Nc4`,
  },
  {
    eco: 'E21',
    name: 'Nimzo-Indian: Three Knights',
    moves: `d4 Nf6 c4 e6 Nc3 Bb4 Nf3 c5 g3 cxd4 Nxd4 O-O Bg2 d5 cxd5 Nxd5 Qb3 Qa5 Bd2 Nc6
            Nxc6 bxc6 O-O Bxc3 bxc3 Qc5 e4 Nb6 Be3 Qh5 f4 f5 Rae1 Bd7 exf5 Rxf5 Bd4 Raf8`,
  },
  {
    eco: 'E60',
    name: "King's Indian: Fianchetto",
    moves: `d4 Nf6 c4 g6 g3 Bg7 Bg2 O-O Nf3 d6 O-O Nbd7 Nc3 e5 e4 c6 h3 Qb6 Re1 exd4
            Nxd4 Re8 Rb1 Qc7 b3 a5 a4 Nc5 Bf1 Bd7 Qc2 h5`,
  },
  {
    eco: 'E97',
    name: "King's Indian: Mar del Plata",
    moves: `d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7 Ne1 Nd7 Nd3 f5
            Bd2 Nf6 f3 f4 c5 g5 Rc1 Ng6 cxd6 cxd6 Nb5 Rf7 Qc2 Ne8`,
  },
  {
    eco: 'A29',
    name: 'English: Four Knights, reversed Dragon',
    moves: `c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6 O-O Be7 a3 O-O b4 Be6 d3 f6
            Ne4 Qd7 b5 Nd4 Nxd4 exd4 Bb2 c5 bxc6 bxc6`,
  },
  {
    eco: 'A05',
    name: 'Réti: King’s Indian Attack',
    moves: `Nf3 Nf6 g3 d5 Bg2 c6 O-O Bg4 d3 Nbd7 Nbd2 e5 e4 dxe4 dxe4 Bc5 Qe1 O-O h3 Bh5
            Nh4 Re8 Nf5 Bf8 g4 Bg6 Ne3 Qc7 Nf3 Rad8 Nh4 Nh5 Qe2 Nc5`,
  },
  {
    eco: 'E06',
    name: 'Catalan: Closed',
    moves: `d4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O dxc4 Qc2 a6 a4 Bd7 Qxc4 Bc6 Bg5 Bd5
            Qc2 Be4 Qc1 Nbd7 Nbd2 Bd5 e4 Bc6 Qc2 h6`,
  },
  {
    eco: 'A57',
    name: 'Benko Gambit: Accepted',
    moves: `d4 Nf6 c4 c5 d5 b5 cxb5 a6 bxa6 Bxa6 Nc3 d6 e4 Bxf1 Kxf1 g6 g3 Bg7 Kg2 O-O
            Nf3 Nbd7 Re1 Qa5 h3 Rfb8 Re2 Ne8 Bd2 Nc7`,
  },
  {
    eco: 'A88',
    name: 'Dutch: Leningrad',
    moves: `d4 f5 g3 Nf6 Bg2 g6 Nf3 Bg7 O-O O-O c4 d6 Nc3 c6 d5 e5 dxe6 Bxe6 Qb3 Qc7
            Ng5 Bc8 Nf3 Na6 Rd1 Nc5 Qc2 h6 b4 Ne6`,
  },
  {
    eco: 'A61',
    name: 'Benoni: Modern main line',
    moves: `d4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 Nf3 g6 g3 Bg7 Bg2 O-O O-O Re8 Nd2 Na6
            h3 Nc7 a4 b6 Nc4 Ba6 Bf4 Bxc4 Qd3 Bxd3 exd3 Nd7 Rfe1 Rxe1+ Rxe1 Qf8`,
  },
  {
    eco: 'C45',
    name: 'Scotch: Mieses',
    moves: `e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4 Ba6 b3 O-O-O
            g3 Re8 Bb2 f6 Bg2 fxe5 O-O Nb4 Nc3 Rd8 Rad1 Re8 Ne4 Nd5 cxd5 cxd5`,
  },
  {
    eco: 'C65',
    name: 'Ruy Lopez: Berlin, d3 lines',
    moves: `e4 e5 Nf3 Nc6 Bb5 Nf6 d3 Bc5 Bxc6 dxc6 Nbd2 Be6 O-O Bd6 Nc4 Nd7 a4 a5
            b3 O-O Ne3 f6 Nd2 Nc5 Nf5 Bxf5 exf5 Qd7`,
  },
  {
    eco: 'B78',
    name: 'Sicilian: Dragon, Yugoslav Attack 9.Bc4',
    moves: `e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6 Bc4 Bd7 O-O-O Rc8
            Bb3 Ne5 h4 h5 Bg5 Rc5 Kb1 Re8 g4 hxg4 h5 Nxh5 Rdg1 Rc8 fxg4 Nf6 Bh6 Nfxg4`,
  },
  {
    eco: 'B67',
    name: 'Sicilian: Richter-Rauzer, 7...a6',
    moves: `e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6 Bg5 e6 Qd2 a6 O-O-O Bd7 f4 Be7 Nf3 b5
            Bxf6 gxf6 f5 Qb6 fxe6 fxe6 Kb1 O-O-O Bd3 Kb8 Rhf1 Be8`,
  },
  {
    eco: 'B31',
    name: 'Sicilian: Rossolimo, 3...g6',
    moves: `e4 c5 Nf3 Nc6 Bb5 g6 Bxc6 dxc6 d3 Bg7 h3 Nf6 Nc3 Nd7 Be3 e5 O-O b6 Nh2 Qe7
            f4 exf4 Rxf4 Ne5 Qd2 h6 Raf1 g5 Bd4 Be6`,
  },
  {
    eco: 'B22',
    name: 'Sicilian: Alapin, 2...Nf6',
    moves: `e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6 Bc4 Nb6 Bb5 dxe5 Nxe5 Bd7 Nxd7 Qxd7
            Nc3 e6 O-O Be7 Re1 O-O Bf4 Rfd8 Qe2 a6`,
  },
  {
    eco: 'D27',
    name: "Queen's Gambit Accepted: Classical",
    moves: `d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6 Bb3 cxd4 exd4 Nc6 Nc3 Be7 Re1 O-O
            Bf4 Na5 Bc2 b5 Qd3 Bb7 a3 Rc8 Ne5 Nc4 Nxc4 Rxc4`,
  },
  {
    eco: 'E15',
    name: "Queen's Indian: 4.g3 Ba6",
    moves: `d4 Nf6 c4 e6 Nf3 b6 g3 Ba6 b3 Bb4+ Bd2 Be7 Bg2 c6 Bc3 d5 Ne5 Nfd7 Nxd7 Nxd7
            Nd2 O-O O-O Rc8 e4 b5 Re1 dxe4 Nxe4 c5`,
  },
  {
    eco: 'E54',
    name: 'Nimzo-Indian: Rubinstein, Karpov',
    moves: `d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O cxd4 exd4 dxc4 Bxc4 b6 Bg5 Bb7
            Re1 Nbd7 Rc1 Rc8 Bd3 Bxc3 bxc3 Qc7 c4 Bxf3 Qxf3 Qxc4`,
  },
  {
    eco: 'D35',
    name: "Queen's Gambit Declined: Exchange, minority attack",
    moves: `d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 Be7 e3 O-O Bd3 Nbd7 Qc2 Re8 Nge2 Nf8 O-O c6
            Rab1 a5 a3 Ne4 Bxe7 Qxe7 b4 axb4 axb4 Nd6`,
  },
  {
    eco: 'C58',
    name: 'Italian: Two Knights, main line',
    moves: `e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6 Be2 h6 Nf3 e4 Ne5 Bd6
            d4 exd3 Nxd3 Qc7 b3 O-O O-O c5`,
  },
  {
    eco: 'C52',
    name: 'Evans Gambit: Accepted',
    moves: `e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 d6 Qb3 Qd7 dxe5 Bb6 Nbd2 Na5 Qc2 Nxc4
            Nxc4 dxe5 Nxb6 axb6 Nxe5 Qe6 O-O Nf6`,
  },
  {
    eco: 'C39',
    name: "King's Gambit Accepted: Kieseritzky",
    moves: `e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5 Nf6 d4 d6 Nd3 Nxe4 Bxf4 Qe7 Qe2 Bg7 c3 Nf6
            Nd2 O-O O-O-O Re8 Qf2 Na6 Kb1 Nc5`,
  },
  {
    eco: 'B04',
    name: 'Alekhine: Modern, Exchange',
    moves: `e4 Nf6 e5 Nd5 d4 d6 Nf3 dxe5 Nxe5 c6 Be2 Bf5 c4 Nb6 Nc3 N8d7 Nf3 e6 O-O Be7
            b3 O-O Bb2 a5 a4 Bf6 Qd2 Qe7 Rfd1 Rfd8`,
  },
  {
    eco: 'B06',
    name: 'Modern Defence: 150 Attack',
    moves: `e4 g6 d4 Bg7 Nc3 d6 Be3 a6 Qd2 b5 f3 Nd7 h4 h5 Nh3 Ngf6 Nf2 c5 dxc5 dxc5
            O-O-O Qc7 Bg5 Bb7 e5 Nd5 Nxd5 Bxd5`,
  },
  {
    eco: 'D02',
    name: 'London System: 2.Bf4 c5',
    moves: `d4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 Bf5 Ngf3 e6 Ne5 Nd7 Nxd7 Qxd7 Be2 Be7
            O-O O-O Nf3 Rac8 Ne5 Nxe5 Bxe5 f6 Bg3 c4 f4 b5`,
  },
];
