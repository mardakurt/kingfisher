/**
 * Short, sourced explanations of what a named opening variation actually is.
 *
 * The opening index says *which* variation a position belongs to. It says
 * nothing about *why* anybody plays it, and a name on its own — "Sicilian
 * Defense: Najdorf Variation, English Attack" — is only useful to a reader who
 * already knows what those words mean. This module supplies the missing
 * sentence or three.
 *
 * Three rules govern what may appear here, and they are the whole design:
 *
 *  - **Authored once, at build time, never generated at runtime.** Every brief
 *    below is a fixed constant that a person wrote and a reviewer can check
 *    against a book. Nothing on this path asks a language model for chess
 *    theory while the user is reading, and nothing interpolates prose from
 *    statistics. A brief is either in this file or the panel says there is not
 *    one.
 *  - **Only settled, checkable claims.** Each brief states the move or
 *    structure that defines the variation and what each side is playing for.
 *    Those are the parts of opening theory that every reference agrees on.
 *    Evaluations, novelties, repertoire advice and "best move" claims are
 *    deliberately absent: they date, they are contested, and Kingfisher has an
 *    engine and an explorer for exactly that job.
 *  - **The defining move sequence is not authored at all.** It comes from
 *    `OPENING_LINES` in the generated index — the CC0 dataset's own shortest
 *    line to the position, replayed through this application's rules code. So
 *    the one factual claim a reader is most likely to check is the one nobody
 *    typed by hand. See `docs/data/variation-briefs.md` for provenance.
 *
 * Coverage is deliberately partial and always will be. The dataset names 3,810
 * positions across 149 families; explaining every one of them would be a book,
 * and a bad one. What is covered is the openings a player actually meets, and
 * everything deeper inherits from its nearest named ancestor — which is right,
 * because that is what the variation *is*.
 */

/** Where a brief's wording came from. One value today; the field is the point. */
export type BriefSource = 'kingfisher';

export interface VariationBrief {
  /**
   * The lineage this brief describes, family first.
   *
   * Matched as a prefix, so `['Sicilian Defense', 'Najdorf Variation']` also
   * answers for every deeper Najdorf line that has no brief of its own.
   */
  readonly lineage: readonly string[];
  /** The move or structural feature that makes this variation that variation. */
  readonly defining: string;
  /** What White is playing for. */
  readonly white: string;
  /** What Black is playing for. */
  readonly black: string;
  /** Where the wording came from. */
  readonly source: BriefSource;
}

/**
 * A brief, plus how it was reached.
 *
 * `inherited` is the honest part. A reader at move thirty in a Najdorf is
 * being shown the Najdorf's brief, not a description of the position in front
 * of them, and the panel has to be able to say so.
 */
export interface ResolvedBrief {
  readonly brief: VariationBrief;
  /** The lineage prefix that actually matched. */
  readonly matched: readonly string[];
  /** True when the brief describes an ancestor of the asked-for variation. */
  readonly inherited: boolean;
}

const B = (
  lineage: readonly string[],
  defining: string,
  white: string,
  black: string,
): VariationBrief => ({ lineage, defining, white, black, source: 'kingfisher' });

/*
  Ordered by family for reading, not for lookup — the index below is a map, so
  order here has no effect on what is found.
*/
export const VARIATION_BRIEFS: readonly VariationBrief[] = [
  // --- 1.e4 c5 ---------------------------------------------------------------
  B(
    ['Sicilian Defense'],
    'Black answers 1.e4 with 1...c5, refusing a symmetrical centre.',
    'White opens the position with an early d4, taking a lead in development and the half-open d-file, and usually plays on the kingside.',
    'Black trades a wing pawn for a centre pawn, leaving a central majority and the half-open c-file, and plays for counterplay rather than equality.',
  ),
  B(
    ['Sicilian Defense', 'Najdorf Variation'],
    'Defined by 5...a6, which takes b5 away from both the bishop and the knight.',
    'White chooses a setup first: 6.Be3, 6.Bg5, 6.Bc4 and 6.Be2 lead to quite different games.',
    'Black keeps the choice between ...e5 and ...e6 open and prepares ...b5 with queenside expansion.',
  ),
  B(
    ['Sicilian Defense', 'Najdorf Variation', 'English Attack'],
    'White develops Be3, Qd2 and f3, then castles queenside and advances g4.',
    'White attacks on the kingside with the pawns, having removed the king from that side.',
    'Black counterattacks on the queenside with ...b5-b4 against the castled king; it is a race, and tempo matters more than material.',
  ),
  B(
    ['Sicilian Defense', 'Dragon Variation'],
    'Black plays ...g6 and ...Bg7, aiming the bishop down the long diagonal at d4 and b2.',
    'White must deal with the bishop, usually by Be3 and Qd2 with the option of trading it off by Bh6.',
    "Black's counterplay runs down the half-open c-file, often including an exchange sacrifice on c3.",
  ),
  B(
    ['Sicilian Defense', 'Dragon Variation', 'Yugoslav Attack'],
    'White plays Be3, Qd2, Bc4 and f3, castles queenside and pushes h4-h5.',
    'White opens the h-file and trades the dragon bishop, aiming for mate.',
    'Black plays ...Rc8, ...Ne5 and ...Rxc3, giving up the exchange to strip the king of its cover.',
  ),
  B(
    ['Sicilian Defense', 'Accelerated Dragon'],
    'Black plays ...g6 before ...d6, so the d-pawn can go to d5 in one move.',
    'White plays the Maróczy Bind with c4, taking d5 away permanently and squeezing.',
    'Black wants ...d5 in a single move; if White prevents it, Black plays for ...b5 or ...f5 instead.',
  ),
  B(
    ['Sicilian Defense', 'Scheveningen Variation'],
    'Black builds a small centre with pawns on d6 and e6.',
    'White has more space and the Keres Attack, 6.g4, is the sharpest way to use it.',
    'Black is solid and flexible, waiting to break with ...d5 or ...b5 once developed.',
  ),
  B(
    ['Sicilian Defense', 'Classical Variation'],
    'Black develops both knights naturally, ...Nc6 and ...Nf6, with ...d6.',
    'White usually plays the Richter-Rauzer with 6.Bg5, pinning and preparing to castle long.',
    'Black gets rapid development and pressure on d4, at the cost of committing the pieces early.',
  ),
  B(
    ['Sicilian Defense', 'Richter-Rauzer Variation'],
    'White meets the Classical Sicilian with 6.Bg5.',
    'White trades on f6 to damage the structure, castles queenside and attacks with the f- and g-pawns.',
    'Black accepts doubled pawns or spends time avoiding them, then counterattacks down the c-file.',
  ),
  B(
    ['Sicilian Defense', 'Lasker-Pelikan Variation'],
    'Black plays 5...e5, hitting the knight on d4 — the move order behind the Sveshnikov.',
    'White occupies d5 and plays against the backward d-pawn and the hole in front of it.',
    'Black accepts the weakness in exchange for the bishop pair, active pieces and the ...f5 break.',
  ),
  B(
    ['Sicilian Defense', 'Nyezhmetdinov-Rossolimo Attack'],
    'White plays 3.Bb5 against 2...Nc6, declining the Open Sicilian.',
    'White often trades on c6 and plays a slower positional game against the doubled pawns.',
    'Black keeps the bishop pair and a solid structure, and plays for the centre with ...e5 or ...d5.',
  ),
  B(
    ['Sicilian Defense', 'Alapin Variation'],
    'White plays 2.c3, preparing to answer ...d5 or build a full centre with d4.',
    'White wants a large pawn centre and an opening Black cannot meet with prepared Najdorf theory.',
    'Black challenges immediately with 2...d5 or 2...Nf6, aiming to prove c3 took a square from the knight.',
  ),
  B(
    ['Sicilian Defense', 'Kan Variation'],
    'Black plays ...e6 and ...a6 early, committing neither knight.',
    'White can take space with c4 (the Maróczy) or develop quickly and attack.',
    'Black keeps every setup available and chooses the structure after seeing White commit.',
  ),
  B(
    ['Sicilian Defense', 'Taimanov Variation'],
    'Black plays ...e6 and ...Nc6, usually with ...Qc7.',
    'White has the usual space and often castles queenside.',
    'Black develops flexibly, keeps ...Bb4 and ...d5 in reserve, and pressures e4 and d4 with pieces.',
  ),
  B(
    ['Sicilian Defense', 'Closed'],
    'White develops with Nc3 and g3 and never plays d4.',
    'White keeps the centre closed and builds a kingside attack with f4 and f5.',
    'Black takes queenside space with ...b5 and plays on the half-open c-file.',
  ),
  B(
    ['Sicilian Defense', "O'Kelly Variation"],
    'Black plays 2...a6, deliberately discouraging 3.d4.',
    'White does best to avoid the Open Sicilian here and play 3.c3 or 3.c4.',
    'Black is inviting 3.d4, after which ...e5 gains a tempo on the knight.',
  ),
  B(
    ['Sicilian Defense', 'Smith-Morra Gambit Accepted'],
    'White gives a pawn with 3.c3 dxc3 4.Nxc3.',
    'White gets the open c- and d-files, quick development and pressure on f7 and d6.',
    'Black is a pawn up and aims to complete development and trade into an endgame.',
  ),
  B(
    ['Sicilian Defense', 'Wing Gambit'],
    'White offers the b-pawn with 2.b4 to deflect the c-pawn.',
    'White wants ...cxb4 so that d4 builds an unopposed centre.',
    'Black can accept and give the pawn back at a good moment, or decline with ...d5 or ...e5.',
  ),

  // --- 1.e4 e5: Ruy Lopez ----------------------------------------------------
  B(
    ['Ruy Lopez'],
    'White plays 3.Bb5, attacking the knight that defends e5.',
    'White builds slowly with c3 and d4 and plays for a lasting space advantage.',
    'Black must resolve the pressure, almost always with ...a6, and then fight for the centre with ...d6 and ...b5 or ...d5.',
  ),
  B(
    ['Ruy Lopez', 'Morphy Defense'],
    'Black plays 3...a6, asking the bishop what it intends.',
    'White retreats to a4 to keep the pin, or trades on c6 for a structural game.',
    'Black gains the option of ...b5 and the tempo it can win, at the cost of a small weakening.',
  ),
  B(
    ['Ruy Lopez', 'Closed'],
    'Black keeps the centre closed with ...d6 and ...Be7 after ...b5.',
    'White regroups the knight Nb1-d2-f1-g3 and prepares d4 at the right moment.',
    'Black manoeuvres too — ...Na5 hitting the bishop, or ...Nb8-d7 — and breaks with ...c5 or ...d5.',
  ),
  B(
    ['Ruy Lopez', 'Open'],
    'Black takes on e4 with 5...Nxe4 rather than defending the pawn.',
    'White regains the pawn with d4 and plays against the slightly loose black pieces.',
    'Black accepts an unbalanced structure for free piece play and the two bishops.',
  ),
  B(
    ['Ruy Lopez', 'Berlin Defense'],
    'Black plays 3...Nf6 at once, counterattacking e4 instead of asking the bishop with ...a6.',
    'White can take on c6 and force the famous queenless middlegame, where the pawn structure is better.',
    "Black's compensation is the bishop pair and a position with no targets, which is why it has an unbeatable reputation.",
  ),
  B(
    ['Ruy Lopez', 'Exchange Variation'],
    'White plays Bxc6, doubling the pawns at once.',
    "White has a healthy kingside majority and plays for an endgame where Black's doubled pawns cannot make a passer.",
    'Black has the bishop pair and open lines, and must avoid trades that reach that endgame.',
  ),
  B(
    ['Ruy Lopez', 'Marshall Attack'],
    'Black sacrifices a pawn with ...d5 in the Closed Ruy Lopez.',
    'White is a pawn up and must survive a long attack to prove it.',
    'Black gets a lasting kingside initiative with ...Bd6, ...Qh4 and the rook lift, and is not required to win material back quickly.',
  ),
  B(
    ['Ruy Lopez', 'Schliemann Defense'],
    'Black plays 3...f5, a counter-gambit striking at e4 at once.',
    'White should challenge in the centre, usually with 4.Nc3 or 4.d3, rather than grabbing material.',
    'Black opens the f-file and plays for an attack, accepting a loose king.',
  ),
  B(
    ['Ruy Lopez', 'Steinitz Defense'],
    'Black defends the e5 pawn with 3...d6.',
    'White gains a free hand in the centre with d4.',
    'Black is solid but cramped, and must find time for ...Be7, ...O-O and a later ...exd4.',
  ),

  // --- 1.e4 e5: Italian and friends -----------------------------------------
  B(
    ['Italian Game'],
    'White plays 3.Bc4, pointing the bishop at f7.',
    'Modern play is slow: d3 and c3, then a queenside expansion or a central d4 once pieces are ready.',
    'Black develops symmetrically and fights for d5 or plays ...Na5 to trade the strong bishop.',
  ),
  B(
    ['Italian Game', 'Giuoco Piano'],
    'Black replies 3...Bc5 and White plays c3 with an early d4.',
    'White builds a broad pawn centre and opens the position while ahead in development.',
    'Black hits back with ...Nf6 and ...d5, or holds the centre and completes development.',
  ),
  B(
    ['Italian Game', 'Giuoco Pianissimo'],
    'White plays d3 instead of d4, keeping the centre closed.',
    'White manoeuvres Nbd2-f1-g3 in Ruy Lopez style and prepares a late d4 or a kingside attack.',
    'Black mirrors the plan and has time to choose between ...a6/...b5 and a central break.',
  ),
  B(
    ['Italian Game', 'Two Knights Defense'],
    'Black plays 3...Nf6, allowing 4.Ng5 with a direct hit on f7.',
    'White can grab a pawn with 4.Ng5, or play the quieter 4.d3.',
    'Black usually gives a pawn with ...d5 for a big lead in development and open lines.',
  ),
  B(
    ['Italian Game', 'Evans Gambit'],
    'White plays 4.b4, offering a pawn to deflect the bishop.',
    'White gains the tempo needed for c3 and d4 and a full centre with the initiative.',
    'Black can accept and hold the extra pawn with careful play, or decline with ...Bb6.',
  ),
  B(
    ['Italian Game', 'Hungarian Defense'],
    'Black retreats the bishop to e7 rather than contesting the a2-g8 diagonal.',
    'White takes the centre with d4 and has an easy space advantage.',
    'Black plays for a solid, passive position and a later ...d5 or ...exd4 with ...d5.',
  ),
  B(
    ["Petrov's Defense"],
    'Black answers 2.Nf3 with 2...Nf6, counterattacking instead of defending e5.',
    'White must work for an advantage; the most testing tries are 3.Nxe5 and 3.d4.',
    'Black equalises material and structure quickly, which is why the opening has a drawish reputation.',
  ),
  B(
    ["Petrov's Defense", 'Classical Attack'],
    'White plays 3.Nxe5 d6 4.Nf3 Nxe4 5.d4 d5 6.Bd3.',
    'White has a small space edge and pressure against the knight on e4.',
    'Black holds the knight with ...Bd6 and ...O-O and aims to trade into a level ending.',
  ),
  B(
    ["Petrov's Defense", 'Cochrane Gambit'],
    'White plays 4.Nxf7, giving a knight for two pawns.',
    'White drags the king out and plays for a direct attack before Black consolidates.',
    'Black is a piece up and only has to survive; the king walks back to safety behind the pawns.',
  ),
  B(
    ['Scotch Game'],
    'White plays 3.d4 immediately, opening the centre.',
    'White frees the position early and plays against the knight on c6 and the d-file.',
    'Black gets an open game and quick development, usually with ...Nf6 or ...Bc5.',
  ),
  B(
    ['Scotch Game', 'Scotch Gambit'],
    'White plays 4.Bc4 rather than recapturing on d4 at once.',
    'White plays for development and the f7 square, treating the pawn as a temporary investment.',
    'Black must either return the pawn at a good moment or accept a sharp attacking position.',
  ),
  B(
    ['Scotch Game', 'Göring Gambit'],
    'White offers a pawn — sometimes two — with 4.c3.',
    'White gets open lines and a big lead in development.',
    'Black can accept, decline with ...d5, or return the pawn for a comfortable game.',
  ),
  B(
    ['Four Knights Game'],
    'Both sides develop both knights before anything else.',
    'White plays for a small edge with 4.Bb5 or the sharper Scotch Four Knights with d4.',
    'Black gets a symmetrical, sound position and equalises without difficulty in most lines.',
  ),
  B(
    ['Vienna Game'],
    'White plays 2.Nc3, keeping the f-pawn free to advance.',
    'White can play f4 in gambit style or transpose to a quiet Bishop’s Opening.',
    'Black usually strikes with ...Nf6 and, at the right moment, ...d5.',
  ),
  B(
    ["Bishop's Opening"],
    'White plays 2.Bc4 before developing a knight.',
    'White keeps the option of f4 and avoids the Petrov entirely.',
    'Black plays ...Nf6 hitting e4, and the game usually transposes to an Italian or a Vienna.',
  ),
  B(
    ['Philidor Defense'],
    'Black defends e5 with 2...d6.',
    'White takes space with d4 and has a comfortable, easy game.',
    'Black is solid but passive, and must find counterplay with ...c6 and ...d5 or ...exd4 and ...c6.',
  ),
  B(
    ["King's Gambit Accepted"],
    'White gives the f-pawn with 2.f4 and Black takes it.',
    'White gets the full centre with d4 and the half-open f-file to attack down.',
    'Black is a pawn up and tries to hold f4 with ...g5, or return it for development.',
  ),
  B(
    ["King's Gambit Declined"],
    'Black refuses the pawn, usually with 2...Bc5 or 2...d5.',
    'White still has the f-file and central ambitions, but without the initiative the gambit buys.',
    'Black keeps a sound structure and plays against the weakened kingside and the a7-g1 diagonal.',
  ),
  B(
    ['Center Game'],
    'White plays 2.d4 exd4 3.Qxd4, developing the queen early.',
    'White castles queenside quickly and plays for an attack, accepting that ...Nc6 gains a tempo.',
    'Black develops with tempo against the queen and plays for the centre with ...d5.',
  ),
  B(
    ['Danish Gambit'],
    'White offers one or two pawns with 3.c3 and 4.Bc4.',
    'White gets two raking bishops on the long diagonals and a huge lead in development.',
    'Black can return material with ...d5 to blunt the bishops and reach a good endgame.',
  ),
  B(
    ['Ponziani Opening'],
    'White plays 3.c3, preparing d4 a move earlier than the Ruy Lopez does.',
    'White wants a broad centre without spending time on Bb5 and its retreat.',
    'Black hits back at once with 3...d5 or 3...Nf6, using the square c3 has taken from the knight.',
  ),

  // --- 1.e4, other replies ---------------------------------------------------
  B(
    ['French Defense'],
    'Black plays 1...e6 and follows with ...d5.',
    'White gains space, usually with e5 or by keeping the tension, and plays on the kingside.',
    'Black accepts a passive light-squared bishop for a solid chain and attacks its base with ...c5 and ...f6.',
  ),
  B(
    ['French Defense', 'Winawer Variation'],
    'Black pins with 3...Bb4 and usually trades on c3.',
    'White gets the bishop pair and a broad centre, and attacks on the kingside.',
    "Black plays against the doubled c-pawns and White's dark squares, often with ...Qc7 and ...Qa5.",
  ),
  B(
    ['French Defense', 'Tarrasch Variation'],
    'White plays 3.Nd2, avoiding the pin at the cost of blocking the c1-bishop.',
    'White keeps a sound structure and plays for a small, safe edge.',
    'Black chooses between ...c5 with an isolated-pawn game and ...Nf6 with a space-conceding but solid setup.',
  ),
  B(
    ['French Defense', 'Advance Variation'],
    'White plays 3.e5, fixing the chain immediately.',
    'White has a space advantage and attacking chances against h7, and defends d4 with c3 and Nf3.',
    'Black attacks the base of the chain with ...c5, ...Qb6 and ...Nc6, and sometimes ...f6.',
  ),
  B(
    ['French Defense', 'Classical Variation'],
    'Black plays 3...Nf6, adding a second attacker to e4.',
    'White advances with 4.e5 or pins with 4.Bg5, both aiming for kingside space.',
    'Black develops naturally and breaks with ...c5 in the centre.',
  ),
  B(
    ['French Defense', 'Rubinstein Variation'],
    'Black releases the tension at once with 3...dxe4.',
    'White has a free hand in the centre and a lasting space advantage.',
    'Black gets a solid structure with no weaknesses and aims to develop the c8-bishop via ...b6 or to free the game with ...c5.',
  ),
  B(
    ['French Defense', 'Exchange Variation'],
    'White plays 3.exd5 exd5, removing the tension.',
    'White has a symmetrical position and must play for a small initiative rather than an advantage.',
    "Black's problem bishop is freed at once, which is why the line has a drawish reputation.",
  ),
  B(
    ['French Defense', 'McCutcheon Variation'],
    'Black answers 4.Bg5 with 4...Bb4 rather than 4...Be7.',
    'White plays 5.e5 h6 6.Bd2 and gets the bishop pair with a space advantage.',
    'Black avoids the passive defence and plays sharply against c3 and e5.',
  ),
  B(
    ['Caro-Kann Defense'],
    'Black prepares ...d5 with 1...c6 rather than 1...e6.',
    'White has the same space advantage as against the French, and must work harder for an attack.',
    "Black gets the French's solidity without shutting in the light-squared bishop, and aims for a good endgame.",
  ),
  B(
    ['Caro-Kann Defense', 'Advance Variation'],
    'White plays 3.e5 and Black usually develops the bishop with 3...Bf5.',
    'White gains space and harries the bishop with g4 and Nh4, or plays a restrained c3 and Be2.',
    'Black gets the good bishop outside the chain first, then plays ...e6 and ...c5.',
  ),
  B(
    ['Caro-Kann Defense', 'Classical Variation'],
    'Black plays 4...Bf5 after 3.Nc3 dxe4 4.Nxe4, hitting the knight and developing the bishop outside the chain.',
    'White chases the bishop with h4-h5 and plays for the dark squares.',
    'Black trades light-squared bishops, plays ...e6, ...Nd7 and ...Qc7, and often castles queenside.',
  ),
  B(
    ['Caro-Kann Defense', 'Panov Attack'],
    'White plays 4.c4, taking on an isolated queen’s pawn.',
    'White gets free piece play, the d5 square and attacking chances on the kingside.',
    'Black blockades d5, trades pieces, and plays for the endgame where the isolated pawn is weak.',
  ),
  B(
    ['Caro-Kann Defense', 'Exchange Variation'],
    'White plays 3.exd5 cxd5 4.Bd3, a Queen’s Gambit Exchange structure with colours reversed.',
    'White develops with c3, Bf4 and Nf3 and plays for the kingside or an e5 outpost; the extra tempo is the whole advantage.',
    'Black has the minority attack, ...Rc8 and ...b5-b4 against c3, and develops the c8-bishop to g4 or f5 before playing ...e6.',
  ),
  B(
    ['Caro-Kann Defense', 'Karpov Variation'],
    'Black plays 4...Nd7 rather than 4...Bf5 or 4...Nf6, preparing ...Ngf6 so that a knight trade cannot double the pawns.',
    'White has space and can play the sharp Ng5 lines against the slightly slow setup.',
    'Black keeps the pawn structure perfectly intact and develops ...Ngf6 without allowing doubled pawns.',
  ),
  B(
    ['Pirc Defense'],
    'Black plays ...d6, ...Nf6 and ...g6, letting White build a big centre.',
    'White takes the space and must decide between a direct attack and holding the centre.',
    'Black attacks the centre from a distance with ...c5 or ...e5 once the fianchetto is complete.',
  ),
  B(
    ['Pirc Defense', 'Austrian Attack'],
    'White plays 4.f4, taking the maximum amount of space.',
    'White plays for e5 and a direct kingside attack, accepting some looseness.',
    'Black strikes at the centre quickly with ...c5 or ...e5 before White is coordinated.',
  ),
  B(
    ['Pirc Defense', 'Classical Variation'],
    'White develops modestly with 4.Nf3.',
    'White keeps a small space advantage and avoids weakening the position.',
    'Black gets a normal Pirc with the usual ...c6/...b5 or ...e5 plans.',
  ),
  B(
    ['Pirc Defense', '150 Attack'],
    'White sets up Be3, Qd2 and f3, intending Bh6 and h4-h5.',
    'White trades the fianchettoed bishop and mates down the h-file — a plan simple enough to play without theory.',
    'Black must generate queenside counterplay quickly or prevent Bh6 with ...c6 and ...b5.',
  ),
  B(
    ['Modern Defense'],
    'Black plays 1...g6 and 2...Bg7 without committing the knight.',
    'White can take the whole centre; the question is whether it can be held.',
    'Black keeps maximum flexibility and invites White to overextend, then hits back with ...c5, ...e5 or ...a6/...b5.',
  ),
  B(
    ['Scandinavian Defense'],
    'Black challenges the e-pawn at once with 1...d5.',
    'White gains time attacking the queen after 2.exd5 Qxd5 3.Nc3 and develops with tempo.',
    'Black gets a clear, simple structure with no weaknesses and usually plays ...c6, ...Bf5 and ...e6.',
  ),
  B(
    ['Scandinavian Defense', 'Portuguese Gambit'],
    'Black plays 2...Nf6 and, after 3.d4, 3...Bg4 — leaving the d5 pawn to White for a lead in development.',
    'White can hold the extra pawn with careful play but must survive an early initiative.',
    'Black develops rapidly, pressures d4 and f3, and regains the pawn in most lines.',
  ),
  B(
    ['Scandinavian Defense', 'Modern Variation'],
    'Black recaptures with the knight after 2...Nf6.',
    'White keeps the extra pawn briefly with c4 or gives it back for a space advantage.',
    'Black avoids the early queen sortie and plays for quick, natural development.',
  ),
  B(
    ['Alekhine Defense'],
    'Black plays 1...Nf6, inviting the pawns forward.',
    'White takes the space with c4, d4 and e5 and tries to prove it is a centre rather than a target.',
    'Black provokes the advance and then attacks it with ...d6, ...c5 and ...Nc6.',
  ),
  B(
    ['Alekhine Defense', 'Four Pawns Attack'],
    'White takes everything: pawns on c4, d4, e5 and f4.',
    'White plays for a crushing space advantage and a direct attack.',
    'Black hits the centre immediately with ...c5 and ...Nc6 and plays for its collapse.',
  ),
  B(
    ['Nimzowitsch Defense'],
    'Black plays 1...Nc6, blocking the c-pawn on purpose.',
    'White should take the centre with d4 and play for a normal space advantage.',
    'Black plays provocatively for ...d5 or ...e5 and an unbalanced game outside main theory.',
  ),

  // --- 1.d4 d5 ---------------------------------------------------------------
  B(
    ["Queen's Gambit Declined"],
    'Black holds d5 with 2...e6 rather than taking on c4.',
    'White has a small, lasting space advantage and the minority attack or a central e4 break.',
    'Black gets the soundest structure in chess at the price of a passive c8-bishop, and works to free it.',
  ),
  B(
    ["Queen's Gambit Declined", 'Orthodox Defense'],
    'Black develops ...Nf6, ...Be7, ...O-O and ...Nbd7 against Bg5.',
    'White plays Rc1 and the classical Qc2/Bd3 setup with pressure down the c-file.',
    'Black aims to free the position with ...dxc4 and ...c5, or ...Ne4 to trade pieces.',
  ),
  B(
    ["Queen's Gambit Declined", 'Exchange Variation'],
    'White resolves the tension with cxd5 exd5.',
    'White plays the minority attack: b4-b5 to leave Black with a weak c-pawn.',
    'Black counters in the centre with ...Ne4 and ...f5, or on the kingside, before the queenside cracks.',
  ),
  B(
    ["Queen's Gambit Declined", 'Lasker Defense'],
    'Black plays ...Ne4, offering to trade pieces.',
    'White keeps a nominal space edge but has little to attack once the minor pieces come off.',
    'Black relieves the cramp by trading and then equalises with ...c5 or ...c6 and ...dxc4.',
  ),
  B(
    ["Queen's Gambit Declined", 'Tartakower Defense'],
    'Black plays ...b6 and ...Bb7, solving the bad-bishop problem directly.',
    'White plays against the slightly loosened queenside and for the d5 break.',
    'Black gets the problem bishop onto the long diagonal and a fully playable game.',
  ),
  B(
    ["Queen's Gambit Declined", 'Cambridge Springs Defense'],
    'Black plays ...Qa5, hitting c3 and the bishop on g5 at once.',
    'White must spend time meeting the threats, usually with cxd5 or Nd2.',
    'Black creates immediate tactical pressure rather than defending passively.',
  ),
  B(
    ["Queen's Gambit Declined", 'Semi-Tarrasch Defense'],
    'Black plays ...c5 with the knight already on f6, recapturing on d5 with the knight.',
    'White gets a mobile centre and often hanging pawns on c3 and d4 with active pieces.',
    'Black has free development and no structural weakness, and plays against the centre.',
  ),
  B(
    ["Queen's Gambit Declined", 'Chigorin Defense'],
    'Black plays 2...Nc6, developing rather than supporting d5 with a pawn.',
    'White should take the centre and play against the loose black pieces.',
    'Black plays for piece activity and the two knights against the two bishops.',
  ),
  B(
    ["Queen's Gambit Declined", 'Albin Countergambit'],
    'Black plays 2...e5, giving a pawn for the wedge on d4.',
    'White is a pawn up and must untangle carefully; the pawn on d4 is genuinely awkward.',
    'Black gets a lead in development and tricks around ...Nge7 and the d3 push.',
  ),
  B(
    ["Queen's Gambit Accepted"],
    'Black takes the pawn with 2...dxc4 and does not try to keep it.',
    'White takes the centre with e4 and gains time chasing the pawn with e3 and Bxc4.',
    'Black gives up the centre for time, then breaks with ...c5 or ...e5 to free the position.',
  ),
  B(
    ['Slav Defense'],
    'Black supports d5 with 2...c6 instead of ...e6.',
    'White has the usual space and plays for e4 or a queenside squeeze.',
    "Black keeps the c8-bishop's diagonal open — the whole point — and can take on c4 and hold the pawn with ...b5.",
  ),
  B(
    ['Slav Defense', 'Czech Variation'],
    'Black plays ...dxc4 and develops the bishop to f5 before ...e6.',
    'White regains the pawn with e3 and Bxc4 and plays for a central break.',
    'Black solves the bad-bishop problem first and then builds a solid ...e6 chain behind it.',
  ),
  B(
    ['Slav Defense', 'Exchange Variation'],
    'White plays cxd5 cxd5, leaving a symmetrical structure.',
    'White has only the extra tempo and the half-open c-file to work with.',
    'Black is completely solid; the line is the standard way to steer a Slav towards a draw.',
  ),
  B(
    ['Semi-Slav Defense'],
    'Black plays both ...e6 and ...c6, defending d5 twice.',
    'White must choose between the sharp 5.Bg5 and the solid 5.e3, which are almost different openings.',
    'Black accepts a temporarily bad bishop for a rock-solid centre, then plays ...dxc4 and ...b5 for the queenside.',
  ),
  B(
    ['Semi-Slav Defense', 'Meran Variation'],
    'Black plays ...dxc4 and ...b5 after White commits with e3.',
    'White breaks in the centre with e4 and d5 before the queenside expansion tells.',
    'Black takes queenside space and prepares ...c5 with a strong pawn mass.',
  ),
  B(
    ['Semi-Slav Defense', 'Botvinnik Variation'],
    'Black grabs on c4 and holds it with ...b5 after 5.Bg5 dxc4 6.e4 b5.',
    'White sacrifices a piece for pawns and a huge initiative with e5 and the g- and h-pawns.',
    'Black is material up and holds a wrecked structure together — one of the sharpest lines in chess.',
  ),
  B(
    ['Semi-Slav Defense', 'Noteboom Variation'],
    'Black takes on c4 and holds with ...b5, conceding the centre.',
    'White gets a mobile centre and pressure on the long diagonal.',
    'Black gets connected passed pawns on the queenside, which decide the game if it reaches an endgame.',
  ),
  B(
    ['Tarrasch Defense'],
    'Black plays ...c5 against the Queen’s Gambit and accepts an isolated d-pawn.',
    'White blockades d5, trades pieces and plays for the endgame.',
    'Black gets free piece play, open lines and the e4 outpost while the middlegame lasts.',
  ),
  B(
    ['Catalan Opening'],
    'White combines d4 and c4 with g3 and Bg2.',
    'White aims the bishop down the long diagonal at the queenside and often gives a pawn for lasting pressure.',
    'Black either returns the c4-pawn quickly for freedom, or holds it with ...b5 and endures the pressure.',
  ),

  // --- 1.d4 Nf6 --------------------------------------------------------------
  B(
    ['Nimzo-Indian Defense'],
    'Black pins the knight with 3...Bb4, fighting for e4 with a piece.',
    'White plays for the bishop pair and a big centre, usually accepting doubled c-pawns to get it.',
    'Black trades on c3 and plays against the doubled pawns, blockading with ...c5, ...b6 and ...Ne4.',
  ),
  B(
    ['Nimzo-Indian Defense', 'Rubinstein System'],
    'White plays the modest 4.e3.',
    'White develops soundly and keeps every structure available, which is why it is the most played line.',
    'Black chooses the structure: ...c5 and ...d5, ...b6 and ...Ne4, or ...O-O and ...d5.',
  ),
  B(
    ['Nimzo-Indian Defense', 'Classical Variation'],
    'White plays 4.Qc2, planning to recapture on c3 with the queen.',
    'White keeps the pawn structure intact and gets the bishop pair for free.',
    'Black must justify the tempo spent, usually with ...d5 or ...c5 and rapid central play.',
  ),
  B(
    ['Nimzo-Indian Defense', 'Sämisch Variation'],
    'White plays 4.a3, forcing the exchange at once.',
    'White takes the bishop pair and builds a huge centre with f3 and e4.',
    'Black plays immediately against the doubled c-pawns with ...c5, ...b6 and ...Na5.',
  ),
  B(
    ["Queen's Indian Defense"],
    'Black plays 3...b6 and ...Bb7, controlling e4 by fianchetto.',
    'White fights for e4 with g3 or a3 and plays for a space advantage.',
    'Black gets an extremely solid position and pressure on the long diagonal.',
  ),
  B(
    ["Queen's Indian Defense", 'Fianchetto Variation'],
    'White answers the fianchetto with one of its own, 4.g3.',
    'White contests the long diagonal directly and plays for d5 or e4 later.',
    'Black can trade bishops with ...Ba6 hitting c4, or play ...Bb7 and ...Ne4.',
  ),
  B(
    ["Queen's Indian Defense", 'Kasparov-Petrosian Variation'],
    'White plays 4.a3, spending a tempo to guarantee Nc3 without a pin.',
    'White gets to build the ideal centre with Nc3 and e4 unopposed.',
    'Black must use the free tempo, usually with ...d5 striking at once.',
  ),
  B(
    ['Bogo-Indian Defense'],
    'Black checks with 3...Bb4+ rather than fianchettoing.',
    'White blocks with Bd2 or Nbd2 and keeps a small, safe space advantage.',
    'Black gets a solid game with few theoretical demands, often trading the bishop and playing ...d6 and ...e5.',
  ),
  B(
    ["King's Indian Defense"],
    'Black fianchettoes and plays ...d6 and ...O-O, giving White the centre.',
    'White takes the space and expands on the queenside with c5 and b4.',
    'Black closes the centre with ...e5 and attacks the king with ...f5, ...g5 and ...f4 — a race in opposite directions.',
  ),
  B(
    ["King's Indian Defense", 'Fianchetto Variation'],
    'White plays g3 and Bg2 instead of a broad pawn front.',
    "White's king is far safer, which takes the sting out of the standard kingside attack.",
    'Black must play more in the centre — ...c6 and ...d5, or ...Nbd7 and ...e5 — rather than attacking automatically.',
  ),
  B(
    ["King's Indian Defense", 'Orthodox Variation'],
    'White plays Be2 and castles, meeting ...e5 with d5.',
    'White plays c5 and b4 on the queenside and defends the king with Ne1 and f3.',
    'Black plays ...Ne7, ...f5 and ...f4, then throws the g- and h-pawns forward.',
  ),
  B(
    ["King's Indian Defense", 'Sämisch Variation'],
    'White plays 5.f3, supporting e4 with a pawn.',
    'White has a rock-solid centre, can castle queenside and attack with h4-h5.',
    'Black plays ...c5 or ...a6/...b5 on the queenside instead of the usual kingside storm.',
  ),
  B(
    ["King's Indian Defense", 'Averbakh Variation'],
    'White plays Be2 and Bg5, taking the ...e5 break away for a moment.',
    'White keeps the centre fluid and prevents the standard plan.',
    'Black plays ...c5 instead, heading for Benoni structures, or spends a move on ...h6.',
  ),
  B(
    ["King's Indian Defense", 'Four Pawns Attack'],
    'White plays c4, d4, e4 and f4.',
    'White takes the maximum space and plays for e5 before Black is ready.',
    'Black hits back immediately with ...c5 and ...e6, using the loose centre as a target.',
  ),
  B(
    ['Grünfeld Defense'],
    'Black plays 3...d5, striking at the centre after the fianchetto.',
    'White builds an ideal pawn centre with e4 and tries to make it roll.',
    'Black attacks the centre from the flank with ...Bg7, ...c5 and ...Nc6, playing for its collapse rather than blockading it.',
  ),
  B(
    ['Grünfeld Defense', 'Exchange Variation'],
    'White takes on d5 and builds the centre with e4.',
    'White has the ideal pawn duo on d4 and e4 and plays to advance it.',
    'Black hammers d4 with ...c5, ...Bg7, ...Nc6 and ...Qa5 — the critical test of the whole opening.',
  ),
  B(
    ['Grünfeld Defense', 'Russian Variation'],
    'White plays 5.Qb3, hitting d5 before Black has castled.',
    'White takes back on c4 with the queen after 5...dxc4 and builds the centre with e4, keeping the c-pawn structure intact.',
    'Black takes on c4 with tempo and plays ...Bg7, ...O-O and ...c5 against the big centre.',
  ),
  B(
    ['Benoni Defense'],
    'Black plays ...c5 against d4 and, after d5, gets a queenside majority.',
    'White has a space advantage, the e4-e5 break and play down the half-open e-file.',
    'Black plays ...b5 and ...a6 for the queenside majority and pressure down the half-open e-file on e4.',
  ),
  B(
    ['Benoni Defense', 'Classical Variation'],
    'White develops Nf3 and Be2 and castles.',
    'White prepares a well-supported e5 break or a queenside clamp with a4.',
    'Black plays ...a6, ...b5 and ...Re8, aiming to get the majority moving.',
  ),
  B(
    ['Benoni Defense', 'Four Pawns Attack'],
    'White plays f4 as well as c4, d5 and e4.',
    'White plays for a direct e5 break and a crushing attack.',
    'Black counters with ...Bg4 and ...Re8, targeting the overextended centre.',
  ),
  B(
    ['Benko Gambit'],
    'Black gives a pawn with ...b5 to open the queenside files.',
    'White is a pawn up and must find something to do with it before the pressure tells.',
    'Black gets permanent pressure down the half-open a- and b-files against a2 and b2, and often does not need to regain the pawn at all.',
  ),
  B(
    ['Old Indian Defense'],
    'Black plays ...d6 and ...e5 without fianchettoing.',
    'White has an easy space advantage and free development.',
    'Black gets a solid, low-theory position, at the cost of the dark-squared bishop being passive.',
  ),
  B(
    ['Dutch Defense'],
    'Black plays 1...f5, fighting for e4 with a pawn.',
    'White plays g3 and Bg2 against the weakened light squares, or gambits at once with e4.',
    'Black plays for a kingside attack and control of e4, accepting a permanently loosened king.',
  ),
  B(
    ['Dutch Defense', 'Leningrad Variation'],
    'Black fianchettoes with ...g6 and ...Bg7 behind the f-pawn.',
    'White plays in the centre with d5 and against the e6 and e5 squares.',
    'Black plays ...d6 and ...e5, combining a King’s Indian structure with the f5 pawn.',
  ),
  B(
    ['Dutch Defense', 'Stonewall Variation'],
    'Black builds pawns on d5, e6 and f5.',
    'White plays for the e5 square and against the bad light-squared bishop, often with Ba3 to trade dark-squared bishops.',
    'Black has an unbreakable grip on e4 and attacks with ...Qe8-h5 and ...Ne4.',
  ),
  B(
    ['Dutch Defense', 'Classical Variation'],
    'Black plays ...e6 and ...d6 with ...Be7.',
    'White takes the centre and plays against the kingside weaknesses.',
    'Black keeps ...e5 available and plays a slower attacking build-up than the Stonewall.',
  ),
  B(
    ['Dutch Defense', 'Staunton Gambit'],
    'White offers a pawn immediately with 2.e4.',
    'White opens lines against the weakened kingside while Black is undeveloped.',
    'Black can accept and give the pawn back, or decline with ...d5 and a normal Dutch.',
  ),
  B(
    ['Trompowsky Attack'],
    'White plays 2.Bg5 before committing the c-pawn.',
    'White sidesteps the Indian defences entirely and often trades on f6 for structural play.',
    'Black can accept doubled pawns for the bishop pair, or avoid them with ...Ne4 or ...c5.',
  ),
  B(
    ['London System'],
    'White plays d4 and Bf4 with e3, c3 and Nbd2, almost regardless of the reply.',
    'White gets a solid, low-maintenance setup aiming at the b8-h2 diagonal, with Ne5 and a later e4.',
    'Black should challenge early — ...c5 with ...Qb6 hitting b2 is the standard test.',
  ),
  B(
    ['Colle System'],
    'White plays d4, Nf3, e3, Bd3 and c3.',
    'White prepares a single central break with e4 and a kingside attack behind it.',
    'Black should stop e4 or develop the c8-bishop outside the chain before ...e6.',
  ),
  B(
    ['Torre Attack'],
    'White plays Nf3 and Bg5 with e3.',
    'White develops quickly, keeps a flexible centre and plays for e4 or a kingside build-up.',
    'Black challenges with ...c5 and ...Qb6, or takes the sting out with ...h6 and ...g5.',
  ),
  B(
    ['Richter-Veresov Attack'],
    'White plays Nc3 and Bg5 against a d5 pawn.',
    'White plays for a quick f3 and e4, or trades on f6 to play against the structure.',
    'Black gets a good game with ...Bf5 or ...c6 and ...Qb6, hitting the loose b2 pawn.',
  ),
  B(
    ['Blackmar-Diemer Gambit'],
    'White gives the e-pawn with 2.e4 and follows with f3.',
    'White opens the f-file and the centre for a fast attack on f7.',
    'Black can accept and return the pawn for development, or decline entirely with ...e6 or ...c6.',
  ),

  // --- Flank openings --------------------------------------------------------
  B(
    ['English Opening'],
    'White plays 1.c4, contesting d5 from the flank.',
    'White keeps every structure available and often transposes into Queen’s-pawn positions on favourable terms.',
    'Black chooses the game: 1...e5 for a reversed Sicilian, 1...c5 for symmetry, or 1...Nf6 and ...e6 heading for an Indian.',
  ),
  B(
    ['English Opening', "King's English Variation"],
    'Black replies 1...e5, making it a Sicilian with colours reversed.',
    'White has the extra tempo and plays g3 and Bg2 against the centre.',
    'Black takes the space that a Sicilian White player normally has and plays for ...d5 or ...f5.',
  ),
  B(
    ['English Opening', 'Symmetrical Variation'],
    'Black replies 1...c5, mirroring.',
    'White plays for d4 at a good moment or a Maróczy-style bind with e4.',
    'Black keeps the symmetry until White commits, then breaks with ...d5 or ...b5.',
  ),
  B(
    ['English Opening', 'Anglo-Indian Defense'],
    'Black replies 1...Nf6, keeping every transposition open.',
    'White can play d4 for an Indian, or stay in the English with Nc3 and g3.',
    'Black waits to see the centre before choosing between a Nimzo, a King’s Indian and a Slav structure.',
  ),
  B(
    ['Réti Opening'],
    'White plays 1.Nf3 with c4 and a fianchetto, and no early central pawn.',
    'White attacks the centre from the flank and transposes to whichever structure Black makes worst.',
    'Black can occupy the centre with ...d5 and ...c6 or ...e6, or mirror with a fianchetto of its own.',
  ),
  B(
    ["King's Indian Attack"],
    'White plays Nf3, g3, Bg2, O-O, d3 and e4 — a King’s Indian with colours reversed.',
    'White plays a standard kingside attack with e5, Nf1-h2 and f4-f5, with an extra tempo.',
    'Black should take queenside space and open lines there before the attack arrives.',
  ),
  B(
    ['Bird Opening'],
    'White plays 1.f4, a Dutch Defence with colours reversed.',
    'White fights for e5 and plays for a kingside attack, often with a Stonewall or Leningrad structure.',
    'Black can play the From Gambit with 1...e5, or simply ...d5 and ...Nf6 with a good game.',
  ),
  B(
    ['Nimzo-Larsen Attack'],
    'White plays 1.b3 and fianchettoes the queen’s bishop.',
    'White pressures e5 down the long diagonal and keeps the centre flexible.',
    'Black should take the centre with ...e5 and ...d5 and challenge the bishop.',
  ),
  B(
    ['Polish Opening'],
    'White plays 1.b4, taking queenside space immediately.',
    'White fianchettoes and plays on the queenside, with b4-b5 gaining ground.',
    'Black takes the centre and can hit the pawn at once with ...a5 or ...e5 and ...Bxb4.',
  ),
  B(
    ['Grob Opening'],
    'White plays 1.g4.',
    'White plays for Bg2 pressure on the long diagonal and an early h3/g5 space grab.',
    'Black takes the centre with ...d5 and can punish the weakening directly with ...e5 and ...Bxg4 ideas.',
  ),

  // --- Families the dataset names, that a player still meets ------------------
  //
  // Added in Phase 17. Each of these is a family the classification dataset
  // uses as a heading and that a player actually runs into, and each was
  // uncovered — so a position inside it inherited nothing and the panel had
  // nothing to say. The generic containers the dataset also uses as headings
  // ("King's Pawn Game", "Queen's Pawn Game") are deliberately still
  // uncovered: they name a position rather than an idea, and a brief for them
  // could only restate the moves.
  B(
    ["Queen's Gambit"],
    'White offers the c-pawn on move two to pull the black d-pawn away from the centre.',
    'White wants a pawn on d4 unopposed by one on d5, and the central space and piece play that follow; the pawn is usually recovered rather than sacrificed.',
    'Black chooses between declining and keeping the centre closed, accepting and giving the centre up for time, or countering in the middle with ...c5 or ...e5.',
  ),
  B(
    ["King's Gambit"],
    'White offers the f-pawn on move two to deflect the black e-pawn and open the f-file.',
    "White plays for a big centre with d4 and rapid development against Black's weakened kingside, using the half-open f-file.",
    'Black either holds the extra pawn and completes development, or gives it back to finish developing and use the a7–g1 diagonal and the open king.',
  ),
  B(
    ['Indian Defense'],
    'Black answers 1.d4 with 1...Nf6, declining to commit a centre pawn immediately.',
    'White builds a broad pawn centre and tries to keep it, since Black has not yet contested it with a pawn.',
    'Black attacks that centre from a distance with pieces and a later ...c5, ...e5 or ...d5, choosing the structure once White has committed.',
  ),
  B(
    ['Benko Gambit Accepted'],
    'Black gives a queenside pawn with ...b5 to open the a- and b-files.',
    'White is a pawn up and must find time to develop the kingside while the queenside files are under pressure.',
    'Black plays ...Ba6, ...Bg7, ...Ra8-b8 and presses down two open files; the compensation is long-lasting rather than immediate.',
  ),
  B(
    ['Three Knights Opening'],
    'Three knights come out before either side commits the fourth.',
    'White keeps the option of d4 or Bb5 and often transposes into a Four Knights or a Scotch.',
    'Black avoids the symmetry of the Four Knights, usually with ...Bb4 or ...g6.',
  ),
  B(
    ['Latvian Gambit'],
    "Black answers 2.Nf3 with 2...f5, a mirror of the King's Gambit a tempo down.",
    'White can take on e5 or on f5, or ignore the pawn and develop; the extra tempo matters and the black king is the weaker one.',
    'Black plays for open lines and a quick attack, accepting that the position is sharper for both sides than it is sound.',
  ),
  B(
    ['Englund Gambit'],
    'Black gives the e-pawn on move one to open lines immediately.',
    'White holds the pawn and completes development; the extra pawn is real and the position is not difficult to play.',
    'Black tries to regain the pawn with pressure on b2 and the e-file before White consolidates.',
  ),
  B(
    ['Owen Defense'],
    "Black plays 1...b6, fianchettoing the queen's bishop against e4 without a pawn in the centre.",
    'White takes the centre with d4 and c4 and gains space; Bd3 answers the pressure on the long diagonal.',
    'Black plays against e4 from a distance and strikes with ...f5 or ...c5 once developed.',
  ),
  B(
    ['Blackmar-Diemer Gambit Accepted'],
    'White gives a centre pawn for open lines and rapid development.',
    'White develops with Nc3, f3, Bc4 and Qe2, aiming at f7 down the half-open f-file before Black consolidates.',
    'Black returns the pawn at a good moment or holds it and completes development; the extra pawn is the compensation for the discomfort.',
  ),
  /*
    --- The families a strong player still meets ------------------------------

    Chosen by measurement rather than by filling a quota. Eighty-four of the
    dataset's families had no brief, and together they account for 489 of
    3,810 named positions — most of them openings nobody plays, and two of them
    the dataset's own catch-all labels for a 1.d4 or 1.e4 position that has not
    become a named opening yet.

    These are the ones a prepared player can actually be handed over the board,
    plus those two catch-alls, which are the largest by a distance and give a
    reader in an unnamed position something true rather than nothing.
  */
  B(
    ["Queen's Pawn Game"],
    "The dataset's name for a 1.d4 position that has not yet become a named opening.",
    'White has claimed the centre with a pawn a piece defends, and usually follows with c4 or a quiet setup of Nf3, Bf4 or Bg5 and e3.',
    'Black decides the character of the game by choosing between ...d5, ...Nf6 and ...f5, and by whether to allow c4 at all.',
  ),
  B(
    ["King's Pawn Game"],
    "The dataset's name for a 1.e4 position that has not yet become a named opening.",
    'White opens lines for the queen and the light-squared bishop and can castle quickly; the pawn on e4 is not defended, which is what makes the position sharp.',
    'Black either contests e4 directly with ...e5 or ...d5, or leaves it alone and undermines it later with ...c5, ...c6 or ...Nf6.',
  ),
  B(
    ['Zukertort Opening'],
    'White plays 1.Nf3, developing before committing a centre pawn.',
    "White keeps every structure available and can transpose into a Queen's Gambit, a Réti or a King's Indian Attack once Black has shown a plan.",
    'Black can seize the centre with ...d5 and ...c5 while White is still flexible, or mirror the flexibility and wait.',
  ),
  B(
    ['Neo-Grünfeld Defense'],
    'Black meets a fianchetto setup with ...d5, a Grünfeld where White has already played g3.',
    'White supports the centre with a bishop on g2 rather than with pieces on the queenside, and plays for a slow squeeze rather than a big centre.',
    'Black trades on c4 or holds the tension, then hits the centre with ...c5 and uses the long diagonal the fianchetto contests.',
  ),
  B(
    ['English Defense'],
    'Black answers a queen-pawn opening with ...b6 and an early ...Bb7.',
    'White takes the space that is offered — often e4 and d4 together — and must then prove it is not overextended.',
    'Black plays against the big centre from the flank with ...Bb7, ...f5 and sometimes ...Bb4, accepting an unusual position to leave preparation behind.',
  ),
  B(
    ['Rapport-Jobava System'],
    'White plays an early Nc3 and Bf4 against a queen-pawn defence.',
    'White aims for e4 or a quick Nb5, and keeps the option of castling on either side; the point is to avoid the main theoretical roads entirely.',
    "Black's most testing answers take the centre before White is coordinated, with ...c5 or an early ...a6 to take b5 away from the knight.",
  ),
  B(
    ['Benko Gambit Declined'],
    'White refuses the b5 pawn rather than taking it.',
    "White keeps the queenside closed or returns the pawn on its own terms, denying Black the open a- and b-files that are the gambit's whole point.",
    'Black has not spent a pawn, and plays a Benoni-shaped position where the queenside pressure has to be created rather than inherited.',
  ),
  B(
    ['Blumenfeld Countergambit'],
    'Black answers a Benoni setup with ...b5, offering a wing pawn for the centre.',
    'White does best to decline with e4 rather than take, since capturing hands Black exactly the centre the gambit is played for.',
    'Black takes on d5 with a pawn and builds a broad centre of pawns on d5 and e6, playing for ...e5 and a rolling mass.',
  ),
  /*
    Keyed on the family and not on `['Vienna Gambit', 'with Max Lange Defense']`.
    The dataset writes that variation as one label with a comma in it, and
    `briefForLineage` strips such a clause back to the family — so a brief on
    the family covers every Vienna Gambit line, and a brief on the two-part
    lineage covered none of them. The same rule as "London System, with Bd3".
  */
  B(
    ['Vienna Gambit'],
    "White plays an early f4 in the Vienna, a King's Gambit with Nc3 thrown in.",
    'White opens the f-file and plays against the black king before it is safe, and the knight on c3 already guards e4 and covers d5.',
    'Black holds the centre with ...d5 rather than grabbing on f4, and returns material at the right moment to finish development.',
  ),
  B(
    ['Danish Gambit Accepted'],
    'White gives two pawns for two bishops raking the kingside.',
    'White develops Bc4 and Bb2 and plays for a direct attack on f7 and g7 before Black can consolidate.',
    'Black gives one pawn back — usually with ...d5 — to blunt the bishops and reach an ending a pawn up.',
  ),
  B(
    ['Latvian Gambit Accepted'],
    "Black answers 2.Nf3 with ...f5, a mirror of the King's Gambit a tempo down.",
    "White's soundest replies take the f5 pawn or hit f7 at once; the extra tempo is what makes the difference from the King's Gambit.",
    'Black plays for open lines against the white king and accepts that the position is objectively worse in exchange for it being unfamiliar.',
  ),
  B(
    ['Elephant Gambit'],
    'Black answers 2.Nf3 with ...d5, offering a pawn to open the centre immediately.',
    'White accepts and returns the pawn only for a concrete gain; holding it while completing development is the whole test.',
    'Black gets rapid piece play and the e-file, and needs it, because the pawn is not coming back by force.',
  ),
  B(
    ['Blackmar-Diemer Gambit Declined'],
    'Black refuses the f3 pawn rather than taking it.',
    'White has spent a tempo on f3 and must show it was useful, usually by building the centre with e4 anyway.',
    'Black avoids the open lines the gambit is played for and keeps a sound structure; declining is the practical answer to a gambit whose value is surprise.',
  ),

  /*
    --- Added after the first hundred users ------------------------------------

    The variations a strong player meets in a season and was still being told
    "no brief". Each defining move sequence below was read from the dataset's
    own shortest line to the position before the sentence was written, so the
    one factual claim a reader is most likely to check agrees with the moves
    the panel shows.
  */
  // Sicilian
  B(
    ['Sicilian Defense', 'Open'],
    'White plays 3.d4 against 2...Nc6 and opens the centre at once.',
    'White trades the d-pawn for the c-pawn, gets a lead in development and a half-open d-file, and usually plays on the kingside.',
    'Black has a central majority and the half-open c-file, and chooses the system next move: ...e5, ...g6, ...Nf6 or ...Qc7.',
  ),
  B(
    ['Sicilian Defense', 'Old Sicilian'],
    'Black plays 2...Nc6, developing the knight before choosing a pawn structure.',
    'White can open with 3.d4 or avoid it with 3.Bb5, the Rossolimo, which is the main reason 2...Nc6 is a real decision.',
    'Black keeps the Sveshnikov, Accelerated Dragon and Taimanov all available, at the cost of allowing 3.Bb5.',
  ),
  B(
    ['Sicilian Defense', 'Modern Variations'],
    'Black plays 2...d6, the move order of the Najdorf and the Dragon.',
    'White opens with 3.d4 or plays 3.Bb5+, the Moscow, to avoid the theory 2...d6 invites.',
    'Black keeps e5 and the ...a6 or ...g6 systems in reserve and decides only after seeing White’s third move.',
  ),
  B(
    ['Sicilian Defense', 'French Variation'],
    'Black plays 2...e6, keeping both ...d5 and the Taimanov and Kan structures available.',
    'White opens with 3.d4 or plays 3.c3 or 3.b3, knowing the ...d5 break is Black’s natural reply to a slow setup.',
    'Black prepares ...d5 as the central answer and can transpose to the Taimanov with ...Nc6 or the Kan with ...a6.',
  ),
  B(
    ['Sicilian Defense', 'Nimzowitsch Variation'],
    'Black plays 2...Nf6, attacking e4 immediately in Alekhine style.',
    'White advances 3.e5, gaining space with tempo, and chases the knight with c4 or d4 while Black is undeveloped.',
    'Black provokes the pawn forward and undermines it with ...d6 or ...Nc6 and ...d5; an unusual choice, and a real gamble.',
  ),
  B(
    ['Sicilian Defense', 'Hyperaccelerated Dragon'],
    'Black plays 2...g6 before anything else, the fastest route to the fianchetto.',
    'White can play 3.d4 cxd4 4.Qxd4, the queen recapture the early ...g6 permits, or clamp with c4 for a Maróczy Bind.',
    'Black avoids the Rossolimo and keeps ...d5 in one move available, and must handle 4.Qxd4 with ...Nf6 and ...Nc6.',
  ),
  B(
    ['Sicilian Defense', 'Four Knights Variation'],
    'Black develops both knights early, ...Nc6 and ...Nf6, with ...e6 and without ...d6.',
    'White plays 6.Ndb5 to attack d6, or 6.Nxc6 bxc6 7.e5 to force the play open while Black is uncastled.',
    'Black plays ...Bb4 or ...d6 and aims for quick development and the ...d5 break; it often transposes to the Sveshnikov.',
  ),
  B(
    ['Sicilian Defense', 'Sozin Attack'],
    'White plays Bc4 against a Scheveningen-style ...e6 and ...d6, pointing the bishop at e6 and f7.',
    'White prepares f4-f5 against the e6 pawn and often castles queenside for a direct attack.',
    'Black blunts the bishop with ...a6 and ...b5 with tempo, then plays ...Bd7, ...Nxd4 and ...Bc6 or the ...Na5 exchange.',
  ),
  B(
    ['Sicilian Defense', 'Moscow Variation'],
    'White plays 3.Bb5+ against 2...d6, checking before Black can build a Najdorf.',
    'White trades the bishop for a knight or bishop and plays a calmer game, often with c3 and d4 or a Maróczy-style c4.',
    'Black blocks with ...Bd7 for a quiet game, ...Nd7 to keep pieces on, or ...Nc6 to head towards a Rossolimo.',
  ),
  B(
    ['Sicilian Defense', 'Kalashnikov Variation'],
    'Black plays 4...e5 and 5...d6 against the knight on b5, a Sveshnikov without ...Nf6.',
    'White occupies d5 with pieces and plays against the backward d6 pawn and the d5 hole.',
    'Black gets active pieces and the ...f5 break, and keeps the knight flexible so that Bg5 has nothing to pin.',
  ),
  B(
    ['Sicilian Defense', 'Löwenthal Variation'],
    'Black plays 4...e5, hitting the knight on d4 before developing the king’s knight.',
    'White retreats 5.Nb5 and threatens Nd6+, forcing Black to spend a tempo on ...d6 or ...a6.',
    'Black gains space in the centre at once and heads for a Kalashnikov after ...d6, or gambits with ...a6 and ...b5.',
  ),
  B(
    ['Sicilian Defense', 'Boleslavsky Variation'],
    'Black plays ...e5 in the Classical Sicilian after 6.Be2, accepting a backward d6 pawn.',
    'White plays Nb3, Bg5 and pressure on d5 and d6, the structure’s permanent weaknesses.',
    'Black gets a strong centre, the ...Be6 and ...d5 break, and a position Boleslavsky showed is sound despite the hole.',
  ),
  B(
    ['Sicilian Defense', 'Pin Variation'],
    'Black pins the knight with 5...Bb4 in the Four Knights move order.',
    'White plays 6.e5, hitting the knight, and the tactics around Qg4 and the pinned bishop are the whole test.',
    'Black wins the c3 knight for the bishop or forces concessions, but must survive the sharp 6.e5 first.',
  ),
  B(
    ['Sicilian Defense', 'Delayed Alapin Variation'],
    'White plays c3 only after 2...e6, avoiding the ...Nf6 replies the immediate Alapin allows.',
    'White builds the centre with d4 and meets ...d5 with exd5 and a symmetrical, isolated-pawn game.',
    'Black plays ...d5 at once and develops naturally; the position is closer to a French or a Caro-Kann than a Sicilian.',
  ),
  B(
    ['Sicilian Defense', 'McDonnell Attack'],
    'White plays 2.f4 immediately, taking kingside space before developing.',
    'White wants Nf3, Bb5 or Bc4 and a Grand Prix-style attack with f5 and Qe1-h4.',
    'Black answers in the centre with ...d5 at once, the classical response to a flank move, or with ...Nc6 and ...g6.',
  ),
  B(
    ['Sicilian Defense', 'Grand Prix Attack'],
    'White plays 2.Nc3 and 3.f4 against ...Nc6, declining the Open Sicilian for a direct attack.',
    'White plays Nf3, Bb5 or Bc4, O-O, Qe1-h4 and f5, a kingside attack that needs little theory.',
    'Black plays ...g6, ...Bg7, ...e6 and ...Nge7, then ...d5 in one go, and answers Bc4 with ...e6 and ...a6.',
  ),
  B(
    ['Sicilian Defense', 'Smith-Morra Gambit Declined'],
    'Black refuses the c3 pawn rather than taking it.',
    'White recaptures on d4 and gets a normal open centre, or plays for a c3-d4 pawn duo at the cost of the tempo spent.',
    'Black declines with ...d5, ...Nf6 or ...d3 — returning the pawn — to reach a game where the gambit’s open lines never appear.',
  ),
  B(
    ['Sicilian Defense', 'Flohr Variation'],
    'Black plays 4...Qc7, developing the queen to the c-file before either knight.',
    'White develops with Nc3 and Be3 and plays against the early queen with Ndb5 or Nd5 ideas.',
    'Black keeps every pawn structure available and prevents Nb5 from hitting c7 in the Taimanov-style positions to come.',
  ),
  // Ruy Lopez
  B(
    ['Ruy Lopez', 'Classical Variation'],
    'Black develops the bishop to c5 on move three, ignoring the pin on the c6 knight.',
    'White plays c3 and d4 to hit the bishop with tempo, or 4.O-O and 5.Nxe5 to test the loose e5 pawn.',
    'Black gets the bishop to its best diagonal at once and plays ...Nd4 or ...Nge7 to answer the pressure on c6 and e5.',
  ),
  B(
    ['Ruy Lopez', 'Classical Defense'],
    'Black plays 3...Bc5 and, after 4.c3, defends with 4...Qe7 or 4...Nf6.',
    'White prepares d4 with c3 and gains space in the centre, using the tempo the bishop’s retreat will give.',
    'Black holds e5 with the queen or the knight and plays ...a6 and ...Ba7 to keep the bishop on the diagonal.',
  ),
  B(
    ['Ruy Lopez', 'Cozio Defense'],
    'Black plays 3...Nge7, defending c6 with the knight and keeping the f-pawn free.',
    'White plays c3 and d4 for the centre, or O-O and Re1; the knight on e7 blocks the bishop, which is the drawback.',
    'Black plans ...g6 and ...Bg7 with the knight supporting c6, an unusual structure that avoids the main theory.',
  ),
  B(
    ['Ruy Lopez', 'Bird Variation'],
    'Black plays 3...Nd4, offering to trade the knight rather than defend it.',
    'White takes on d4, leaves Black with a pawn on d4, and plays against it with c3 and d3.',
    'Black gets a pawn on d4 that cramps White, the bishop pair after ...c6, and a game far from the main lines.',
  ),
  B(
    ['Ruy Lopez', 'Fianchetto Defense'],
    'Black plays 3...g6, developing the bishop to g7 rather than e7 or c5.',
    'White plays c3 and d4 to open the centre while the black king is still on e8.',
    'Black plays ...Bg7 and ...Nge7 for a King’s Indian-style structure, and answers d4 with ...exd4 and ...a6.',
  ),
  B(
    ['Ruy Lopez', 'Closed Berlin Defense'],
    'Black plays 3...Nf6 and 4...d6, declining the pawn on e4 in the Berlin move order.',
    'White plays d4 with the bishop still on b5 and gains space against the Steinitz-style structure.',
    'Black plays ...Bd7, ...Be7 and ...O-O and keeps the position closed; it is the Steinitz Defence a move later.',
  ),
  B(
    ['Ruy Lopez', 'Open Berlin Defense'],
    'Black takes on e4 with 4...Nxe4 after 4.O-O.',
    'White plays 5.d4 and either 5...Nd6 6.Bxc6 for the Berlin endgame or 5.Re1 to regain the pawn with a normal middlegame.',
    'Black returns the pawn and heads for the queenless endgame with the bishop pair, or keeps queens on after 5.Re1 Nd6.',
  ),
  // Italian
  B(
    ['Italian Game', 'Classical Variation'],
    'Black plays 3...Bc5 and White answers 4.c3, preparing d4.',
    'White builds the centre with d4, and chooses between the sharp 5.d4 and the slower d3 systems.',
    'Black plays 4...Nf6 to hit e4 and meets d4 with ...exd4 and ...Bb4+, or plays ...Qe7 to keep e5.',
  ),
  B(
    ['Italian Game', 'Scotch Gambit'],
    'White plays 4.d4 against 3...Nf6 and, after 4...exd4, castles rather than recapturing.',
    'White gives a pawn for development, the e-file and pressure on f7, and answers ...Nxe4 with Re1 and the Max Lange ideas.',
    'Black can hold the pawn with ...Bc5 and ...d5 or return it for a quiet game; the tactics around e4 and f7 are well mapped.',
  ),
  B(
    ['Italian Game', 'Evans Gambit Declined'],
    'Black retreats 4...Bb6 rather than taking the b-pawn.',
    'White has spent a tempo on b4 and plays a4 and b5 to gain queenside space, or transposes to a normal Italian.',
    'Black keeps the bishop on its diagonal and avoids the gambit’s open lines; 4...Bb6 is sound and a little passive.',
  ),
  B(
    ['Italian Game', 'Anti-Fried Liver Defense'],
    'Black plays 3...h6, stopping Ng5 before it can happen.',
    'White develops with d3, c3 and O-O and treats the tempo Black spent as a small gain.',
    'Black avoids every Ng5 line and plays ...Nf6, ...Bc5 and ...d6 a move slower; a practical choice rather than a theoretical one.',
  ),
  // French
  B(
    ['French Defense', 'Steinitz Variation'],
    'White plays 4.e5 against 3...Nf6, closing the centre and driving the knight to d7.',
    'White supports e5 and d4 with f4, Nf3 and Be3, and plays against the ...c5 break with Qd2 and O-O-O.',
    'Black attacks the chain with ...c5, ...Nc6 and ...Qb6, and later ...f6, aiming to open the f-file and the a7-g1 diagonal.',
  ),
  B(
    ['French Defense', 'Alekhine-Chatard Attack'],
    'White plays 6.h4 after 4.Bg5 Be7 5.e5 Nfd7, offering the g5 bishop.',
    'White opens the h-file if the bishop is taken and otherwise gains kingside space with the pawn already on h4.',
    'Black declines with ...a6, ...c5 or ...f6, or takes and returns the piece at the right moment; taking and holding is the test.',
  ),
  B(
    ['French Defense', "King's Indian Attack"],
    'White plays 2.d3 against the French, keeping the e-pawn on e4 and heading for a King’s Indian setup.',
    'White plays Nd2, Ngf3, g3, Bg2 and O-O, then e5 and a kingside attack with Re1, Nf1 and h4.',
    'Black takes the queenside with ...c5, ...Nc6, ...b5 and ...b4 and plays for the open c-file before the attack lands.',
  ),
  // Caro-Kann
  B(
    ['Caro-Kann Defense', 'Main Line'],
    'Black takes on e4 after 3.Nd2 and White recaptures with the knight.',
    'White keeps the c-pawn free for c4 or c3 and develops with Nf3, Bd3 and O-O; the same positions arise after 3.Nc3.',
    'Black chooses between 4...Bf5, 4...Nd7 and 4...Nf6, the three systems of the Classical Caro-Kann.',
  ),
  B(
    ['Caro-Kann Defense', 'Modern Variation'],
    'White plays 3.Nd2 rather than 3.Nc3, so that ...Bb4 is never possible.',
    'White keeps the same structure as the main lines and avoids the pin, at the cost of a slightly slower development.',
    'Black plays 3...dxe4 for the Classical positions, or 3...g6 and ...Bg7 while the knight blocks the queen’s bishop.',
  ),
  B(
    ['Caro-Kann Defense', 'Two Knights Attack'],
    'White plays 2.Nc3 and 3.Nf3, developing both knights before touching the d-pawn.',
    'White meets 3...Bg4 with h3 and Qxf3 and plays for the bishop pair and a fast attack, or d4 for a normal centre.',
    'Black plays 3...Bg4 to pin, or 3...dxe4 and ...Nf6; White’s delayed d4 means ...e5 ideas become available.',
  ),
  B(
    ['Caro-Kann Defense', 'Accelerated Panov Attack'],
    'White plays 2.c4 immediately, before d4.',
    'White heads for the Panov structures with an isolated or hanging d-pawn, or a symmetrical exchange after 2...d5 3.exd5 cxd5 4.cxd5.',
    'Black plays 2...d5 and, after 3.exd5, chooses ...cxd5 for a Panov or ...Nf6 for a Scandinavian-style recapture.',
  ),
  B(
    ['Caro-Kann Defense', 'Tartakower Variation'],
    'Black recaptures 5...exf6 after 4...Nf6 5.Nxf6+, accepting doubled pawns for the open e-file.',
    'White plays c3, Bd3 and Ne2, and has the better structure for any endgame.',
    'Black gets quick development, the half-open e-file and control of e4 and d5, and plays for the middlegame.',
  ),
  B(
    ['Caro-Kann Defense', 'Breyer Variation'],
    'White plays 2.d3, keeping the e-pawn on e4 and avoiding the main lines entirely.',
    'White sets up Nd2, Ngf3, g3 and Bg2, a King’s Indian Attack against the Caro-Kann structure.',
    'Black plays ...d5, ...Nf6 and ...Bg4 or ...e5, taking the centre White has declined to contest.',
  ),
  // Scandinavian and other 1.e4 replies
  B(
    ['Scandinavian Defense', 'Mieses-Kotroc Variation'],
    'Black recaptures 2...Qxd5 at once, bringing the queen out on move two.',
    'White plays 3.Nc3 with tempo and develops with d4, Nf3 and Bc4 or Bd2, using the time the queen costs.',
    'Black retreats the queen to a5, d6 or d8 and sets up ...c6, ...Bf5 and ...e6 — solid, and simple to play.',
  ),
  B(
    ['Scandinavian Defense', 'Main Line'],
    'Black plays 3...Qa5 after 3.Nc3, the classical square for the queen.',
    'White plays d4, Nf3 and Bc4 or Bd2, and prepares Nd5 or Ne5 to exploit the queen’s position.',
    'Black plays ...Nf6, ...c6 and ...Bf5 or ...Bg4, castles queenside or kingside, and relies on a structure without weaknesses.',
  ),
  B(
    ['Scandinavian Defense', 'Classical Variation'],
    'Black sets up ...Qa5, ...Nf6 and ...Bf5 against d4 and Nf3.',
    'White plays Bc4, Bd2 and Qe2 or Ne5 and g4 to harass the bishop, and gains space with the extra tempo.',
    'Black plays ...e6, ...c6 and ...Bb4 or ...Nbd7, with the bishop already outside the pawn chain.',
  ),
  B(
    ['Scandinavian Defense', 'Valencian Variation'],
    'Black retreats the queen all the way home with 3...Qd8.',
    'White has gained time and develops freely with d4, Nf3 and Bc4, taking a lead in development.',
    'Black keeps the queen out of harm’s way and plays ...Nf6, ...c6 and ...Bf5, conceding the time for a safe setup.',
  ),
  B(
    ['Scandinavian Defense', 'Schiller-Pytel Variation'],
    'Black retreats 3...Qd6 and follows with ...c6, keeping the queen central.',
    'White plays d4, Nf3 and often g3 and Bg2 or Ne5 and Bf4 to hit the queen again.',
    'Black plays ...Nf6, ...Bg4 or ...Bf5 and ...e6, with the queen on d6 supporting ...e5 or ...c5 later.',
  ),
  B(
    ['Scandinavian Defense', 'Marshall Variation'],
    'Black recaptures 3...Nxd5 after 2...Nf6 3.d4, the knight rather than the queen taking on d5.',
    'White plays c4 to hit the knight and gain space, or Nf3 and Be2 for a quiet edge.',
    'Black plays ...g6 and ...Bg7 or ...Bf5, an Alekhine-style position where the knight is chased but the structure is sound.',
  ),
  B(
    ['Alekhine Defense', 'Modern Variation'],
    'White plays 4.Nf3, the restrained main line, rather than pushing more pawns.',
    'White keeps the centre with d4 and e5 supported by pieces and develops with Be2 and O-O.',
    'Black plays 4...Bg4, 4...g6 or 4...dxe5 and undermines e5 with ...c5 or ...Nc6 in due course.',
  ),
  B(
    ['Alekhine Defense', 'Exchange Variation'],
    'White plays 5.exd6 after 4.c4 Nb6, trading the advanced pawn.',
    'White keeps a space advantage with c4 and d4 and plays a calm game against the knight on b6.',
    'Black recaptures ...exd6 for solidity or ...cxd6 for the half-open c-file and pressure on d4.',
  ),
  B(
    ['Alekhine Defense', 'Scandinavian Variation'],
    'White plays 2.Nc3 and Black answers 2...d5, striking at e4 with a pawn.',
    'White can play 3.e5 for a French-like structure or 3.exd5 Nxd5 for a symmetrical game.',
    'Black takes the centre at once and reaches Scandinavian or Vienna-like positions with an extra tempo.',
  ),
  B(
    ['Nimzowitsch Defense', 'Kennedy Variation'],
    'Black plays 2...e5 against 2.d4, hitting the centre with a pawn after all.',
    'White plays 3.dxe5 or 3.d5 and gains space; 3.Nf3 transposes to a Scotch.',
    'Black uses the knight on c6 to support e5 and plays ...Nxe5 or ...Nce7 depending on White’s choice.',
  ),
  B(
    ['Nimzowitsch Defense', 'Scandinavian Variation'],
    'Black plays 2...d5 against 2.d4, challenging e4 with the knight already on c6.',
    'White plays 3.Nc3 dxe4 4.d5 or 3.e5 for space, or 3.exd5 Qxd5 4.Nf3 for a lead in development.',
    'Black plays ...Bg4, ...e6 and ...Nf6 with piece pressure on d4, accepting an unusual structure.',
  ),
  B(
    ['Philidor Defense', 'Hanham Variation'],
    'Black plays 3...Nd7, supporting e5 with the knight rather than trading on d4.',
    'White plays Bc4 and O-O and prepares dxe5 or a4, playing against the cramped position.',
    'Black plays ...Ngf6, ...Be7, ...c6 and ...O-O and keeps the centre closed, a solid setup with few forcing lines.',
  ),
  B(
    ['Philidor Defense', 'Lion Variation'],
    'Black reaches the Hanham setup through 3...Nf6 4.Nc3 Nbd7, avoiding the early Bc4 tricks.',
    'White plays Bc4, O-O and a4 or the sharper g4, aiming to break before Black has castled.',
    'Black plays ...Be7, ...c6, ...O-O and ...Qc7, and answers d5 with ...Nc5 or ...b5; the Lion is a system, not a line.',
  ),
  B(
    ['Philidor Defense', 'Exchange Variation'],
    'Black takes on d4 with 3...exd4, giving up the centre.',
    'White recaptures Nxd4 or Qxd4 and has more space, a freer game and the e4 pawn against d6.',
    'Black plays ...Nf6, ...Be7 and ...O-O, then ...Re8 and ...Bf8, aiming for a Sicilian-like ...d5 or ...c5 break.',
  ),
  B(
    ['Philidor Defense', 'Nimzowitsch Variation'],
    'Black plays 3...Nf6, hitting e4 rather than defending e5.',
    'White plays 4.Nc3 for the main lines or 4.dxe5 Nxe4 5.Qd5 to win the pawn back with tempo.',
    'Black keeps the tension and, after 4.Nc3, plays ...Nbd7 for the Lion or ...exd4 for the Exchange.',
  ),
  B(
    ['Philidor Defense', 'Philidor Countergambit'],
    'Black plays 3...f5, striking at e4 in the manner Philidor himself favoured.',
    'White plays 4.Nc3 or 4.dxe5 and opens the position against the weakened king before Black develops.',
    'Black plays for ...fxe4 and ...e4, gaining the centre; the king is the price, and it is a high one.',
  ),
  // Petrov, Scotch, Vienna, Bishop's, Four Knights, King's Gambit
  B(
    ["Petrov's Defense", 'Modern Attack'],
    'White plays 3.d4 rather than 3.Nxe5, opening the centre at once.',
    'White plays for a lead in development after 3...Nxe4 4.Bd3 d5 5.Nxe5, with pressure on the e4 knight.',
    'Black takes on e4 and plays ...d5, ...Nd7 or ...Bd6 and ...O-O, equalising in the symmetrical structure that results.',
  ),
  B(
    ["Petrov's Defense", 'Stafford Gambit'],
    'Black plays 3...Nc6, giving a pawn after 4.Nxc6 dxc6 for open lines.',
    'White is a pawn up and should return it with d3, Be2 and O-O rather than grabbing more.',
    'Black plays ...Bc5, ...Ng4 and ...Qh4 for a quick attack; sound only against a careless opponent.',
  ),
  B(
    ["Petrov's Defense", 'Three Knights Game'],
    'White plays 3.Nc3, defending e4 rather than taking on e5.',
    'White develops naturally and usually reaches a Four Knights after 3...Nc6.',
    'Black plays 3...Nc6 for the Four Knights, or 3...Bb4 to pin and keep the game unusual.',
  ),
  B(
    ["Petrov's Defense", 'Italian Variation'],
    'White plays 3.Bc4, developing the bishop and inviting 3...Nxe4.',
    'White answers 3...Nxe4 with 4.Nc3, the Boden-Kieseritzky Gambit, or plays quietly with d3.',
    'Black takes on e4 or plays ...Nc6, and after 4.Nc3 must know ...Nxc3 5.dxc3 f6 holds the extra pawn.',
  ),
  B(
    ['Scotch Game', 'Classical Variation'],
    'Black plays 4...Bc5, attacking the knight on d4 and developing with tempo.',
    'White plays 5.Be3 with c3 to keep the knight, or 5.Nxc6 and 5.Nb3 to remove it.',
    'Black plays ...Qf6 and ...Nge7 to keep the pressure on d4, and keeps the bishop on the diagonal after ...Bb6.',
  ),
  B(
    ['Scotch Game', 'Schmidt Variation'],
    'Black plays 4...Nf6, hitting e4 rather than the knight on d4.',
    'White plays 5.Nxc6 bxc6 6.e5 for the Mieses, or 5.Nc3 for a Scotch Four Knights.',
    'Black gets quick development and, after 5.Nxc6, the doubled pawns come with the bishop pair and the open b-file.',
  ),
  B(
    ['Scotch Game', 'Mieses Variation'],
    'White plays 5.Nxc6 bxc6 6.e5, driving the knight and gaining space at once.',
    'White plays Qe2, c4 and Nd2 against the knight on d5 and the doubled c-pawns, with an endgame edge in view.',
    'Black plays ...Qe7, ...Nd5 and ...Ba6 to hit c4, and uses the open lines and the bishop pair for the middlegame.',
  ),
  B(
    ['Scotch Game', 'Steinitz Variation'],
    'Black plays 4...Qh4, attacking e4 and provoking weaknesses.',
    'White plays 5.Nc3 and Nb5 or 5.Nb5, and later g3 to chase the queen with tempo.',
    'Black plays ...Bb4 and ...Nf6 and wins the e4 pawn in some lines, at the cost of a long queen excursion.',
  ),
  B(
    ['Scotch Game', 'Potter Variation'],
    'White retreats 5.Nb3 against 4...Bc5, keeping the knight rather than trading it.',
    'White plays a3, Nc3 and Qe2, and later Be3 to trade the active bishop.',
    'Black retreats ...Bb6 and plays ...Nf6, ...d6 and ...O-O for a normal open game.',
  ),
  B(
    ['Vienna Game', 'Vienna Gambit'],
    'White plays 3.f4 against 2...Nf6, a King’s Gambit with the knight already on c3.',
    'White opens the f-file after 3...d5 4.fxe5 Nxe4 and plays Qf3 or Nf3 and d3 for the initiative.',
    'Black must play 3...d5, the counter in the centre; taking on f4 lets 4.e5 drive the knight and open lines.',
  ),
  B(
    ['Vienna Game', 'Max Lange Defense'],
    'Black plays 2...Nc6, the flexible reply that keeps ...Nf6 and ...Bc5 in reserve.',
    'White chooses between 3.f4, 3.Bc4 and 3.g3, each a different opening from here.',
    'Black answers 3.f4 with ...exf4 or ...Bc5, and 3.Bc4 or 3.g3 with ...Nf6 and normal development.',
  ),
  B(
    ['Vienna Game', 'Stanley Variation'],
    'White plays 3.Bc4 against 2...Nf6, pointing the bishop at f7 with the knight already on c3.',
    'White meets 3...Nxe4 with 4.Qh5, the Frankenstein-Dracula lines, or plays d3 and f4 for a slower attack.',
    'Black plays 3...Nxe4 and must know 4.Qh5 Nd6, or 3...Nc6 and ...Bc5 for an Italian-like game.',
  ),
  B(
    ['Vienna Game', 'Mieses Variation'],
    'White plays 3.g3 against 2...Nf6, fianchettoing rather than pushing f4.',
    'White plays Bg2, Nge2 and O-O and prepares f4 or d4 with the king already safe.',
    'Black plays 3...d5 to strike at once, or ...Bc5 and ...d6 for a slower game.',
  ),
  B(
    ['Vienna Game', 'Paulsen Variation'],
    'White plays 3.g3 against 2...Nc6, a fianchetto setup without an early f4.',
    'White plays Bg2, Nge2, d3 and f4 in due course, a reversed Closed Sicilian.',
    'Black plays ...Bc5 and ...d6, or ...Nf6 and ...d5, using the extra tempo the closed system allows.',
  ),
  B(
    ['Vienna Game', 'Anderssen Defense'],
    'Black plays 2...Bc5, developing the bishop before the knight.',
    'White plays 3.Nf3 for a Three Knights or 3.Bc4, or 3.Na4 to trade off the bishop at once.',
    'Black keeps ...Nf6 and ...d6 in reserve and, after 3.Na4, plays ...Bxf2+ or retreats and lets the knight lose time.',
  ),
  B(
    ["Bishop's Opening", 'Berlin Defense'],
    'Black plays 2...Nf6, attacking e4 immediately.',
    'White plays 3.d3 for a slow game, or 3.d4 for the Urusov and Ponziani gambits.',
    'Black plays ...c6 and ...d5 or ...Nc6 and ...Bc5, and usually transposes to an Italian or a Vienna.',
  ),
  B(
    ["Bishop's Opening", 'Vienna Hybrid'],
    'White plays 3.d3 and 4.Nc3, a Vienna reached through 2.Bc4.',
    'White plays f4 or Nge2 and O-O, keeping the Vienna’s f-pawn free while the bishop already sits on c4.',
    'Black plays ...Bc5 or ...Bb4 and ...d5, and can answer f4 with ...d5 in the centre.',
  ),
  B(
    ["Bishop's Opening", 'Urusov Gambit'],
    'White plays 3.d4 exd4 4.Nf3, offering the d-pawn for development.',
    'White plays for the initiative with e5 and Qxd4 and a lead in development against the e-file.',
    'Black plays ...Nxe4 or ...Nc6 transposing to a Two Knights; ...d5 returns the pawn for a good game.',
  ),
  B(
    ["Bishop's Opening", 'Philidor Variation'],
    'Black plays 2...Bc5 and White answers 3.c3, preparing d4 as in the Giuoco Piano.',
    'White builds the centre with d4 and gains time on the bishop; the knight stays on g1 for the moment.',
    'Black plays ...Nf6 or ...d5 at once, exploiting that White has not yet developed the king’s knight.',
  ),
  B(
    ['Four Knights Game', 'Spanish Variation'],
    'White plays 4.Bb5, a Ruy Lopez with both knights already developed.',
    'White plays O-O, d3 and Bg5 or Bxc6 and d4, a solid game with a small edge.',
    'Black plays 4...Bb4 for the symmetrical main line, or 4...Nd4, the Rubinstein, to unbalance it at once.',
  ),
  B(
    ['Four Knights Game', 'Scotch Variation'],
    'White plays 4.d4, opening the centre with all four knights out.',
    'White plays 5.Nxd4 and Nxc6 or Bg5, and gains space with e5 in some lines.',
    'Black plays 4...exd4 and ...Bb4, pinning the knight and equalising in the open position.',
  ),
  B(
    ['Four Knights Game', 'Halloween Gambit'],
    'White gives a knight with 4.Nxe5 for two central pawns and the initiative.',
    'White plays d4, e5 and d5 to drive both black knights back and grab space with tempo.',
    'Black keeps the piece, retreats the knights carefully and returns a pawn to complete development; the gambit is unsound.',
  ),
  B(
    ["King's Gambit Accepted", "Bishop's Gambit"],
    'White plays 3.Bc4 rather than 3.Nf3, allowing 3...Qh4+.',
    'White answers the check with Kf1 and argues the queen will be chased with tempo by Nf3.',
    'Black checks on h4 or plays 3...Nf6 and 3...d5, and aims to hold f4 or return it for development.',
  ),
  B(
    ["King's Gambit Accepted", 'Kieseritzky Gambit'],
    'White plays 3.Nf3 g5 4.h4 g4 5.Ne5, the classical main line.',
    'White regains f4 or plays d4 and Bxf4, and uses the h-file and the loose g4 pawn for the attack.',
    'Black plays ...Nf6 and ...d6 to drive the knight, or ...Qe7 and ...d6; the extra pawn is real if the king survives.',
  ),
  B(
    ["King's Gambit Accepted", 'Kieseritzky'],
    'White plays 3.Nf3 g5 4.h4 g4 5.Ne5, the classical main line.',
    'White regains f4 or plays d4 and Bxf4, and uses the h-file and the loose g4 pawn for the attack.',
    'Black plays ...Nf6 and ...d6 to drive the knight, or ...Qe7 and ...d6; the extra pawn is real if the king survives.',
  ),
  B(
    ["King's Gambit Accepted", 'Fischer Defense'],
    'Black plays 3...d6, preparing ...g5 without allowing Ne5.',
    'White plays d4 and Bxf4 to regain the pawn, or Bc4 and h4 to break the g5 chain.',
    'Black holds f4 with ...g5 and ...h6 and develops ...Bg7 and ...Nc6; Fischer’s recommendation against the gambit.',
  ),
  B(
    ["King's Gambit Accepted", 'Schallopp Defense'],
    'Black plays 3...Nf6, developing rather than holding the pawn with ...g5.',
    'White plays 4.e5 to drive the knight, then d4 and Bxf4 to regain the pawn with space.',
    'Black plays ...Nh5 to hold f4 and ...d6 to undermine e5, accepting an awkwardly placed knight for the pawn.',
  ),
  B(
    ["King's Gambit Accepted", 'Allgaier'],
    'White plays 5.Ng5 rather than 5.Ne5 and follows with Nxf7, giving the knight for the king.',
    'White drags the king out with Nxf7 and Bc4+ and plays for a direct mating attack with d4 and Bxf4.',
    'Black takes the knight and walks the king to g7, keeping the extra piece; the line is unsound with accurate defence.',
  ),
  B(
    ["King's Gambit Accepted", 'Double Muzio Gambit'],
    'White gives a knight with O-O and a bishop with Bxf7+ for an attack on the exposed king.',
    'White has queen, rook and pawns against the king with every line open, and needs to mate or perpetual.',
    'Black is two pieces up and defends with ...Qf6 and ...Kxf7; one slip loses, and there are many to make.',
  ),
  B(
    ["King's Gambit Declined", 'Falkbeer Countergambit'],
    'Black plays 2...d5, answering the gambit with a pawn offer in the centre.',
    'White takes on d5 and meets 3...e4 with d3, undermining the advanced pawn, or plays 3...c6 lines quietly.',
    'Black plays ...e4 to cramp White and develop with tempo, or ...c6 to return the pawn for an open game.',
  ),
  B(
    ["King's Gambit Declined", 'Classical'],
    'Black plays 2...Bc5, the bishop stopping White from castling while the gambit is on offer.',
    'White plays Nf3, c3 and d4 to drive the bishop and complete the centre, and cannot castle until it moves.',
    'Black plays ...d6 and ...Nf6 and keeps the bishop on the diagonal; ...exf4 is often good once White has spent time.',
  ),
  B(
    ["King's Gambit Declined", 'Classical Variation'],
    'Black plays 2...Bc5, the bishop stopping White from castling while the gambit is on offer.',
    'White plays Nf3, c3 and d4 to drive the bishop and complete the centre, and cannot castle until it moves.',
    'Black plays ...d6 and ...Nf6 and keeps the bishop on the diagonal; ...exf4 is often good once White has spent time.',
  ),
  B(
    ['Latvian Gambit', 'Mayet Attack'],
    'White plays 3.Bc4 against 2...f5, developing and hitting the weakened a2-g8 diagonal.',
    'White answers 3...fxe4 with Nxe5 and threats against f7 and h5, the sharpest way to punish the gambit.',
    'Black plays ...fxe4 and ...Qg5 or ...d5, and needs accuracy: the king has few defenders and White’s pieces arrive fast.',
  ),
  // Modern, Pirc, KIA
  B(
    ['Modern Defense', 'Standard Defense'],
    'Black plays ...g6, ...Bg7 and ...d6 against e4, d4 and Nc3, a Pirc without the early ...Nf6.',
    'White plays Be3 and Qd2, f4, or Nf3 and Be2, choosing between an attack and a positional squeeze.',
    'Black keeps the knight home so that ...c6, ...b5 or ...e5 come first, and chooses where to put the king late.',
  ),
  B(
    ['Modern Defense', 'Pseudo-Austrian Attack'],
    'White plays 4.f4 against the Modern, an Austrian Attack without ...Nf6 to hit.',
    'White plays Nf3, Bd3 and O-O and pushes e5 or f5 for a kingside attack.',
    'Black strikes with ...c5 or ...Nc6 and ...e5 before the pawns roll, and delays ...Nf6 so that e5 hits nothing.',
  ),
  B(
    ['Modern Defense', 'Two Knights Variation'],
    'White develops 4.Nf3 with the knight already on c3, a calm setup against the Modern.',
    'White plays Be2 or Bc4 and O-O and keeps the centre, ready to meet ...c5 with d5 or dxc5.',
    'Black plays ...a6 and ...b5, ...Nd7 and ...e5, or ...Bg4 to trade the bishop, avoiding an early ...Nf6.',
  ),
  B(
    ['Modern Defense', 'Averbakh System'],
    'Black meets 1.d4 with ...g6 and ...Bg7 and lets White play c4, Nc3 and e4.',
    'White has the whole centre and plays Be3, Nf3 and Be2 or f4, choosing between a clamp and an attack.',
    'Black plays ...d6 and ...e5 or ...c5, and ...Nc6 with ...e5 against d5, a King’s Indian with the knight held back.',
  ),
  B(
    ['Modern Defense', 'Gurgenidze Defense'],
    'Black plays ...c6 and ...d5 against e4, d4, Nc3 and f4, then ...h5 after e5 to fix the kingside.',
    'White has space and the e5 pawn, and plays Nf3, Be3 and Qd2 or g4 to open lines.',
    'Black keeps the position closed, puts the knight on h6 and f5, and plays ...Bf5 and ...e6 for a fortress-like structure.',
  ),
  B(
    ['Pirc Defense', 'Byrne Variation'],
    'White plays 4.Bg5 against the Pirc, developing the bishop before Nf3 or f4.',
    'White plays Qd2, f4 and O-O-O or Nf3, keeping the option of Bxf6 to remove a defender.',
    'Black plays ...Bg7, ...c6 and ...b5 or ...h6 and ...g5 to question the bishop, and castles once the queenside plan is set.',
  ),
  B(
    ['Pirc Defense', 'Sveshnikov System'],
    'White plays 4.g3 and Bg2 against the Pirc, a fianchetto setup rather than an attack.',
    'White plays Nge2, O-O and h3 or f4, and plays for the centre with a safe king.',
    'Black plays ...Bg7, ...O-O and ...e5 or ...c5, reaching a King’s Indian-like game with the extra tempo of ...d6 already spent.',
  ),
  B(
    ["King's Indian Attack", 'French Variation'],
    'Black sets up ...d5, ...c5 and ...Nc6 against Nf3, g3 and Bg2, a French-style centre.',
    'White plays O-O, d3, Nbd2 and e4, then e5, Re1 and Nf1-h2 with a kingside attack.',
    'Black plays ...e6, ...Nf6 and ...Be7, then ...b5 and ...b4 on the queenside before the attack arrives.',
  ),
  B(
    ["King's Indian Attack", 'Yugoslav Variation'],
    'Black plays ...d5, ...c6 and ...Bg4, developing the bishop outside the chain against the fianchetto.',
    'White plays d3, Nbd2 and e4, or h3 to ask the bishop, and c4 to challenge d5.',
    'Black plays ...Nbd7, ...e6 and ...Be7 for a solid, Slav-like structure with the bad bishop already out.',
  ),
  B(
    ["King's Indian Attack", 'Symmetrical Defense'],
    'Black mirrors with ...Nf6 and ...g6 against Nf3 and g3.',
    'White plays Bg2, O-O, d3 and e4 or c4, choosing between a King’s Indian Attack and an English.',
    'Black plays ...Bg7, ...O-O and ...d5 or ...c5, and can copy White for several moves without harm.',
  ),
  // 1.d4: Indian defences, Grünfeld, QID, Nimzo, KID, Old Indian, Trompowsky
  B(
    ['Indian Defense', 'Budapest Gambit Accepted'],
    'Black plays 2...e5 and White takes it, 3.dxe5.',
    'White holds the pawn briefly and returns it for a better structure, or keeps it with Bf4 and e3 and accepts pressure.',
    'Black plays 3...Ng4 to regain the pawn with ...Nc6 and ...Ngxe5, or 3...Ne4, the Fajarowicz, for tricks.',
  ),
  B(
    ['Indian Defense', 'Anti-Grünfeld'],
    'White plays 3.d5 against ...g6, taking the ...d5 break away before it can be played.',
    'White gains space and heads for a Benoni-like game with c4, d5 and e4, without a Grünfeld to face.',
    'Black plays ...Bg7, ...d6 and ...e6 or ...c6 to undermine d5, or gambits with ...b5.',
  ),
  B(
    ['Grünfeld Defense', 'Three Knights Variation'],
    'White plays 4.Nf3, developing rather than taking on d5.',
    'White plays Bf4, Bg5 or Qb3 next and keeps the Exchange Variation in reserve.',
    'Black plays ...Bg7 and ...O-O and meets each White system with ...c5 or ...dxc4 and ...c5.',
  ),
  B(
    ['Grünfeld Defense', 'Brinckmann Attack'],
    'White plays 4.Bf4, developing the bishop and eyeing c7.',
    'White plays Rc1 and e3 and prepares cxd5 with pressure on c7, or the Grünfeld Gambit with Qb3.',
    'Black plays ...Bg7, ...O-O and ...c5, and after cxd5 Nxd5 the ...Nxc3 and ...Qa5 ideas equalise.',
  ),
  B(
    ['Grünfeld Defense', 'Smyslov Defense'],
    'Black plays ...Bg4 in a Grünfeld reached through the Slav move order, developing the bishop before ...c5.',
    'White plays h3 and Qb3 or Nbd2 and plays against the bishop pair with the centre intact.',
    'Black trades on f3 when useful and plays ...e6 and ...Nbd7, a solid line with less theory than the main Grünfeld.',
  ),
  B(
    ['Grünfeld Defense', 'Counterthrust Variation'],
    'Black plays ...d5 against a g3 setup, a Grünfeld where White has fianchettoed.',
    'White plays cxd5 Nxd5 and e4 or Nf3 and O-O, and uses the g2 bishop against the queenside.',
    'Black plays ...Nb6 or ...Nxc3 and ...c5, and puts the bishop on the long diagonal to answer White’s.',
  ),
  B(
    ['Grünfeld Defense', 'Botvinnik Variation'],
    'White plays 5.e3 and 6.Qb3 and Black answers ...e6, supporting d5 with a pawn.',
    'White keeps the centre intact and plays Bd2 or Be2 and O-O, with c5 or cxd5 to fix the structure.',
    'Black keeps d5 solid at the cost of a passive bishop on c8, and frees the game with ...c5 or ...b6 and ...Bb7.',
  ),
  B(
    ["Queen's Indian Defense", 'Classical Variation'],
    'Both sides fianchetto — 4.g3 Bb7 5.Bg2 — and Black develops ...Be7 and castles.',
    'White plays Nc3 and Qc2 or d5 to fight for e4 and the long diagonal.',
    'Black plays ...Ne4 and ...f5 or ...d5, and trades the knights on c3 to keep the diagonal.',
  ),
  B(
    ["Queen's Indian Defense", 'Traditional Variation'],
    'Both sides fianchetto and Black develops ...Be7, the standard Queen’s Indian setup.',
    'White plays O-O and Nc3, then Qc2 or d5 to challenge the long diagonal.',
    'Black plays ...O-O and ...Ne4 or ...d5, a solid game with pressure on e4 and c4.',
  ),
  B(
    ["Queen's Indian Defense", 'Kasparov Variation'],
    'White plays 4.Nc3, developing the knight and allowing ...Bb4.',
    'White plays e4 if allowed and a3 or Qc2 to answer the pin, keeping the centre for later.',
    'Black plays 4...Bb4 for a Nimzo-Queen’s Indian hybrid or 4...Bb7 5.a3 d5, striking in the centre at once.',
  ),
  B(
    ["Queen's Indian Defense", 'Petrosian Variation'],
    'White plays 4.a3, preventing ...Bb4 before playing Nc3.',
    'White plays Nc3 and d5 or e4 with the pin ruled out, a slower plan that keeps the centre.',
    'Black plays ...Bb7 and ...d5 at once, or ...Ba6 to hit c4 while White has spent a tempo.',
  ),
  B(
    ["Queen's Indian Defense", 'Spassky System3'],
    'White plays 4.e3, developing modestly and keeping the bishop for d3.',
    'White plays Bd3, O-O, b3 and Bb2 with a solid centre and the e4 break in mind.',
    'Black plays ...Bb7, ...c5 and ...Be7, and ...d5 or ...cxd4 to open the c-file; a quiet, sound line.',
  ),
  B(
    ["Queen's Indian Defense", 'Opocensky Variation'],
    'Black plays ...Ne4 in the fianchetto line and White answers Bd2, keeping the c3 knight.',
    'White plays Qc2 and trades on e4, keeping the structure and the g2 bishop’s diagonal.',
    'Black trades on c3 or d2 and plays ...d5 or ...f5, using the knight on e4 to blunt the bishop.',
  ),
  B(
    ['Nimzo-Indian Defense', 'Normal Variation'],
    'White plays 4.e3 and Black castles, the most common start to the Rubinstein.',
    'White plays Bd3, Nf3 and O-O and decides later between a3 for the bishop pair and Ne2 to keep the structure.',
    'Black plays ...d5 and ...c5, or ...b6 and ...Bb7, and keeps the option of ...Bxc3 and ...Ne4 in hand.',
  ),
  B(
    ['Nimzo-Indian Defense', 'Ragozin Defense'],
    'Black plays ...d5 and ...Nc6 against 4.e3, hitting d4 with pieces before castling.',
    'White plays Bd3, Nf3 and O-O and answers ...dxc4 with Bxc4 and ...Bd6 with e4 or a3.',
    'Black plays ...dxc4 and ...Bd6 or ...e5, freeing the game while White’s bishop is still on c1.',
  ),
  B(
    ['Nimzo-Indian Defense', 'Ragozin Variation'],
    'Black plays ...d5 and ...Nc6 against 4.e3 and takes on c4 after castling.',
    'White recaptures Bxc4 and plays a3 or Qe2 and e4, using the bishop pair and the centre.',
    'Black plays ...Bd6 and ...e5, freeing the position while the c1 bishop is still at home.',
  ),
  B(
    ['Nimzo-Indian Defense', 'Spielmann Variation'],
    'White plays 4.Qb3, hitting the bishop and avoiding doubled pawns.',
    'White wants ...Bxc3 answered by Qxc3 and a centre with e3 and Nf3, keeping the structure intact.',
    'Black plays ...c5 or ...Nc6 with ...a5, using the tempo the queen costs, and keeps the bishop for a moment.',
  ),
  B(
    ['Nimzo-Indian Defense', 'Leningrad Variation'],
    'White plays 4.Bg5, pinning the knight rather than answering the pin on c3.',
    'White plays e3, Nf3 or Nge2 and Bd3, and keeps the bishop pair in mind after ...h6 and ...g5.',
    'Black plays ...h6 and ...g5, or ...c5 and ...Qa5, striking at c3 before White is ready.',
  ),
  B(
    ['Nimzo-Indian Defense', 'Three Knights Variation'],
    'White plays 4.Nf3, developing rather than committing the centre or the queen.',
    'White plays e3 or g3 next and keeps a3 in reserve, avoiding the sharpest theory.',
    'Black plays ...c5, ...b6 or ...d5, choosing the structure before White has shown the plan.',
  ),
  B(
    ['Nimzo-Indian Defense', 'Kmoch Variation'],
    'White plays 4.f3, preparing e4 immediately.',
    'White builds e4 and d4 with the bishop pair after ...Bxc3, a Sämisch without a3.',
    'Black strikes at once with ...d5 or ...c5, opening the game before the centre is built.',
  ),
  B(
    ['Nimzo-Indian Defense', 'Mikenas Attack'],
    'White plays 4.Qd3, defending c3 and preparing e4 with the queen.',
    'White plays e4 and Nf3 and keeps the structure intact, at the cost of the queen’s early exposure.',
    'Black plays ...d5 or ...c5 with tempo on the queen and develops quickly to punish the loss of time.',
  ),
  B(
    ["King's Indian Defense", 'Normal Variation'],
    'White plays c4, Nc3 and e4 against the fianchetto, the classical centre.',
    'White chooses the system with the next move: Nf3 and Be2, f3, f4, h3 or Be3.',
    'Black plays ...d6 and ...O-O and prepares ...e5 or ...c5, waiting for White to commit.',
  ),
  B(
    ["King's Indian Defense", 'Petrosian Variation'],
    'White plays 7.d5 after ...e5, closing the centre before Black can.',
    'White plays Bg5 and Nd2, then b4 and c5 on the queenside, with the kingside attack slowed by the early d5.',
    'Black plays ...a5 and ...Na6, then ...h6, ...Nh7 and ...f5, working around the pin on the f6 knight.',
  ),
  B(
    ["King's Indian Defense", 'Makogonov Variation'],
    'White plays 5.h3, preparing Be3 and g4 without allowing ...Ng4.',
    'White plays Be3, Nf3 or Nge2 and g4, gaining kingside space and keeping the position flexible.',
    'Black plays ...e5 and ...Na6 or ...c5, and chooses between a King’s Indian and a Benoni structure.',
  ),
  B(
    ["King's Indian Defense", 'Exchange Variation'],
    'White plays 7.dxe5 dxe5, trading queens or heading for a quiet middlegame.',
    'White plays Qxd8 and Bg5, or Be3 and Nd5, playing for a small endgame edge and the d-file.',
    'Black plays ...Rxd8 and ...Nbd7 or ...Na6 and ...c6, and the game is level with careful play.',
  ),
  B(
    ["King's Indian Defense", 'Kazakh Variation'],
    'Black plays ...Na6 after 6.Be2, developing the knight to the rim before ...e5.',
    'White plays O-O and Be3 or Re1, and meets ...e5 with d5 or dxe5 as usual.',
    'Black plays ...e5 and ...c6 or ...Nc5, and the knight supports ...c5 or lands on c5 after d5.',
  ),
  B(
    ["King's Indian Defense", 'Smyslov Variation'],
    'White plays Nf3 and Bg5 against the fianchetto, without an early e4.',
    'White plays e3, Be2 and O-O, and keeps Qd2 and Bh6 in reserve for a slower game.',
    'Black plays ...O-O and ...c5 or ...h6 and ...g5, questioning the bishop before it settles.',
  ),
  B(
    ["King's Indian Defense", 'Semi-Classical Variation'],
    'White plays Nf3, e3 and Be2, a restrained system without e4.',
    'White plays O-O and b4 or d5, playing on the queenside with a solid centre.',
    'Black plays ...e5 or ...c5 and ...Nc6, taking the space White has declined.',
  ),
  B(
    ["King's Indian Defense", 'Larsen Variation'],
    'White plays 6.Be3 after Nf3, developing the bishop before Be2.',
    'White plays h3 and Be2 or Nd2 and keeps the centre, with Qd2 and Bh6 in mind.',
    'Black plays ...Ng4 to hit the bishop, or ...e5 and ...Ng4 at the right moment, before White consolidates.',
  ),
  B(
    ['Old Indian Defense', 'Janowski Variation'],
    'Black plays ...Bf5 in the Old Indian, developing the bishop before ...e5.',
    'White plays f3 and e4 to drive the bishop, or g3 and Bg2 for a quiet game.',
    'Black plays ...e5 or ...Nbd7 and ...e5, with the bishop already outside the chain.',
  ),
  B(
    ['Trompowsky Attack', 'Classical Defense'],
    'Black plays 2...e6, letting Bxf6 be answered by ...Qxf6.',
    'White plays e4 or Nd2 and c3, and takes on f6 only when the structure or the queen’s position rewards it.',
    'Black plays ...h6 and ...c5 or ...d5, and after Bxf6 Qxf6 has the bishop pair with an undamaged structure.',
  ),
  B(
    ['Trompowsky Attack', 'Raptor Variation'],
    'White plays 3.h4 after 2...Ne4, keeping the bishop and threatening f3.',
    'White plays f3 to drive the knight and Nd2, and uses the h-pawn for a later attack.',
    'Black plays ...c5 or ...d5 and ...Qb6, hitting b2 while the knight on e4 is still active.',
  ),
  B(
    ['Trompowsky Attack', 'Edge Variation'],
    'White plays 3.Bh4 after 2...Ne4, keeping the bishop on the diagonal.',
    'White plays f3 and e4 to drive the knight and build the centre.',
    'Black plays ...c5 or ...d5, and ...g5 to trap or trade the bishop after f3.',
  ),
  // Queen's Gambit family
  B(
    ["Queen's Gambit Declined", 'Ragozin Defense'],
    'Black pins with ...Bb4 after 4.Nc3, a Nimzo-Indian with the d-pawn already on d5.',
    'White plays Bg5, cxd5 or Qa4+ and plays for the bishop pair and a central e4 break.',
    'Black plays ...O-O, ...dxc4 and ...c5, or ...Nbd7 and ...c5, with active pieces and no bad bishop.',
  ),
  B(
    ["Queen's Gambit Declined", 'Vienna Variation'],
    'Black plays ...Bb4+ and ...dxc4 against Bg5, grabbing the pawn in a Ragozin structure.',
    'White plays e4 and Bxc4 for a huge centre and lead in development, and keeps the initiative for the pawn.',
    'Black holds c4 with ...b5 or returns it for development; the play is sharp and heavily analysed.',
  ),
  B(
    ["Queen's Gambit Declined", 'Harrwitz Attack'],
    'White develops 4.Bf4 rather than 4.Bg5, keeping the bishop on the h2-b8 diagonal.',
    'White plays e3, Nf3 and Rc1, meets ...c5 with dxc5 and plays against the isolated or hanging pawns.',
    'Black plays ...c5 or ...c6 and ...Nbd7, and uses ...Bd6 to challenge the bishop.',
  ),
  B(
    ["Queen's Gambit Declined", 'Modern Variation'],
    'White plays 4.Bg5 against 3...Nf6, the pin that defines the classical Queen’s Gambit.',
    'White plays e3, Nf3 and Rc1 or Qc2, and chooses between the Exchange and the pressure down the c-file.',
    'Black plays ...Be7 and ...O-O and then ...h6, ...b6 or ...Nbd7, the Orthodox, Tartakower and Lasker systems.',
  ),
  B(
    ["Queen's Gambit Declined", 'Three Knights'],
    'Black takes on c4 with the knights on f3 and c3 developed, heading for a Vienna or an Accepted structure.',
    'White plays e4 or e3 and Bxc4, regaining the pawn with a centre and free development.',
    'Black plays ...Bb4 or ...c5 to open the position before White’s centre settles.',
  ),
  B(
    ["Queen's Gambit Declined", 'Tarrasch Defense'],
    'Black plays ...c5 against the Queen’s Gambit and accepts an isolated d-pawn after cxd5 exd5.',
    'White plays Nf3, g3 and Bg2 against the isolated pawn and blockades d4 and d5.',
    'Black plays ...Nc6, ...Nf6, ...Be7 and ...O-O, and uses the open lines and the e4 square while the middlegame lasts.',
  ),
  B(
    ["Queen's Gambit Declined", 'Baltic Defense'],
    'Black plays 2...Bf5, developing the bishop before ...e6 and defending d5 later.',
    'White plays Qb3 to hit b7 and d5, or cxd5 and Nc3 to exploit the loose bishop.',
    'Black plays ...e6 and ...Nc6 or ...c6, getting the bishop out at the cost of some early pressure.',
  ),
  B(
    ["Queen's Gambit Declined", 'Marshall Defense'],
    'Black plays 2...Nf6, defending d5 with the knight rather than a pawn.',
    'White plays 3.cxd5 Nxd5 4.e4 or 4.Nf3, gaining time and the centre against the knight.',
    'Black recaptures ...Nxd5 and plays ...Nb6 or ...e5, but the loss of time makes the line rare in serious play.',
  ),
  B(
    ["Queen's Gambit Declined", 'Austrian Defense'],
    'Black plays 2...c5, striking at d4 in symmetry.',
    'White plays cxd5 or dxc5 and gains a lead in development against the open centre.',
    'Black plays ...cxd4 and ...Nf6 or ...e6, with an isolated pawn or a symmetrical game depending on White’s choice.',
  ),
  B(
    ["Queen's Gambit Accepted", 'Normal Variation'],
    'White plays 3.Nf3, stopping ...e5 before regaining the pawn.',
    'White plays e3 and Bxc4, then O-O and Qe2 with e4 in mind, the main line of the Accepted.',
    'Black plays ...Nf6, ...e6 and ...c5, or ...a6 and ...b5 to hold the pawn for a while.',
  ),
  B(
    ["Queen's Gambit Accepted", 'Classical Defense'],
    'Black plays ...Nf6, ...e6 and ...c5 after White regains the pawn with Bxc4.',
    'White plays O-O and Qe2, then Rd1 and e4 or dxc5, and plays with an isolated pawn or against the queenside.',
    'Black plays ...a6, ...b5 and ...Bb7, and ...cxd4 at the right moment for equality.',
  ),
  B(
    ["Queen's Gambit Accepted", 'Central Variation'],
    'White plays 3.e4 at once, taking the whole centre while the pawn is still on c4.',
    'White plays Bxc4 and Nf3 or Nc3 and pushes d5 or e5 to gain space and time.',
    'Black plays ...e5 or ...Nc6 and ...e5 to hit d4, or ...Nf6 and ...c5 to break the centre up.',
  ),
  B(
    ["Queen's Gambit Accepted", 'Old Variation'],
    'White plays 3.e3, regaining the pawn simply with Bxc4.',
    'White plays Bxc4, Nf3 and O-O, a calm line that allows ...e5.',
    'Black plays 3...e5 to hit d4 at once, or ...Nf6 and ...c5 for the classical structure.',
  ),
  B(
    ["Queen's Gambit Accepted", 'Alekhine Defense'],
    'Black plays 3...a6, preparing ...b5 to hold the c4 pawn.',
    'White plays e3 or a4 to prevent ...b5, or e4 to take the centre while Black spends time on the queenside.',
    'Black plays ...b5 and ...Bb7, or ...Nf6 and ...e6, and the extra ...a6 helps ...c5 and ...b5 later.',
  ),
  B(
    ['Catalan Opening', 'Closed'],
    'Black keeps d5 with ...Be7 and ...O-O rather than taking on c4.',
    'White plays Qc2, Nbd2 and e4 or b3 and Bb2, and plays for a slow squeeze on the queenside.',
    'Black plays ...c6 and ...b6 or ...dxc4 and ...c5, and frees the c8 bishop with ...b6 and ...Bb7 or ...Ba6.',
  ),
  B(
    ['Catalan Opening', 'Closed Variation'],
    'Black keeps d5 with ...Be7 and ...O-O rather than taking on c4.',
    'White plays Qc2, Nbd2 and e4 or b3 and Bb2, and plays for a slow squeeze on the queenside.',
    'Black plays ...c6 and ...b6 or ...dxc4 and ...c5, and frees the c8 bishop with ...b6 and ...Bb7 or ...Ba6.',
  ),
  B(
    ['Catalan Opening', 'Open Defense'],
    'Black takes on c4 after Bg2, returning the pawn or holding it with ...b5.',
    'White plays Nf3 and Qc2 or Qa4+ to regain the pawn, and uses the bishop on g2 against the queenside.',
    'Black plays ...c5 and ...Nc6 for the Classical line, or ...a6 and ...b5 to hold the pawn and endure the pressure.',
  ),
  B(
    ['Catalan Opening', 'Tarrasch Defense'],
    'Black plays ...c5 and ...Nc6 against the Catalan, a Tarrasch with White’s bishop on g2.',
    'White plays cxd5 and O-O against the isolated pawn, or dxc5 and Qa4 for the c-file.',
    'Black plays ...Be7, ...O-O and ...dxc4 or ...cxd4, and uses the open lines for active pieces.',
  ),
  B(
    ['Slav Defense', 'Modern Line'],
    'White plays 3.Nf3, the flexible move order that keeps Nc3 and e3 both available.',
    'White plays Nc3 and e3 or a4 and Bg5, and chooses the system after Black’s reply.',
    'Black plays ...Nf6 and then ...dxc4, ...a6 or ...e6, the Czech, Chebanenko and Semi-Slav.',
  ),
  B(
    ['Slav Defense', 'Smyslov Variation'],
    'Black plays ...Na6 after 4...dxc4 5.a4, developing the knight to the rim to reach b4 or c5.',
    'White plays e4 or e3 and Bxc4, and plays against the knight with a5 or Bd2.',
    'Black plays ...Bg4 and ...e6 and brings the knight to b4 or c5, an alternative to the Czech ...Bf5.',
  ),
  B(
    ['Slav Defense', 'Chebanenko Variation'],
    'Black plays 4...a6, preparing ...b5 without taking on c4 first.',
    'White plays c5, e3 or a4 to stop ...b5, or Bg5 and e3 for a slower game.',
    'Black plays ...b5, ...Bg4 or ...e6, with a solid structure and a queenside plan already in hand.',
  ),
  B(
    ['Slav Defense', 'Geller Gambit'],
    'White plays 5.e4 after 4...dxc4, offering the pawn for a big centre.',
    'White plays e5 and Bxc4 or a4 and plays for the initiative while Black’s queenside is loose.',
    'Black holds with ...b5 and ...e6, or returns the pawn for development; the gambit is sharp and rare.',
  ),
  B(
    ['Slav Defense', 'Quiet Variation'],
    'White plays 4.e3 after 3...Nf6, keeping the c1 bishop inside the chain.',
    'White plays Nc3, Bd3 and O-O, a Semi-Slav-like game with the bishop pair kept.',
    'Black plays ...Bf5 or ...Bg4 to get the bishop out before ...e6, or ...e6 for a Semi-Slav.',
  ),
  B(
    ['Slav Defense', 'Winawer Countergambit'],
    'Black plays 3...e5 against Nc3, offering a pawn in the centre.',
    'White plays dxe5 d4 and Ne4 or Nf3 and e3, keeping the pawn or returning it for development.',
    'Black plays ...d4 with tempo and ...Nc6, and gets active pieces for the pawn.',
  ),
  B(
    ['Semi-Slav Defense', 'Normal Variation'],
    'Black develops ...Nbd7 against 5.e3, the Meran move order.',
    'White plays Bd3 for the Meran or Qc2 for the Stoltz, and decides where the bishop goes.',
    'Black plays ...dxc4 and ...b5 for the Meran, or ...Bd6 and ...O-O for the Chigorin.',
  ),
  B(
    ['Semi-Slav Defense', 'Stoltz Variation'],
    'White plays 6.Qc2 rather than 6.Bd3, keeping the bishop for d3 after ...dxc4.',
    'White plays Bd3 only after ...dxc4 is answered, and g4, the Shabalov, in the sharpest lines.',
    'Black plays ...Bd6 and ...O-O, or ...b6 and ...Bb7, and delays ...dxc4 so the bishop is not hit with tempo.',
  ),
  B(
    ['Semi-Slav Defense', 'Chigorin Defense'],
    'Black plays ...Bd6 after 6.Bd3, developing before ...dxc4.',
    'White plays O-O and e4 or Qc2 and b3, and keeps the centre with a small edge.',
    'Black plays ...O-O and ...dxc4 or ...e5, and the bishop on d6 supports ...e5 and eyes h2.',
  ),
  B(
    ['Semi-Slav Defense', 'Bogoljubow Variation'],
    'Black plays ...Be7 after 6.Bd3, a more modest bishop than the Chigorin’s ...Bd6.',
    'White plays O-O and e4 or b3 and Bb2, and gains space in the centre.',
    'Black plays ...O-O and ...dxc4 or ...b6, a solid, slightly passive line.',
  ),
  B(
    ['Semi-Slav Defense', 'Moscow Variation'],
    'Black plays 5...h6 against 5.Bg5 and White trades on f6.',
    'White plays e3 and Bd3 or e4 and Nf3, with the better structure and a lead in development.',
    'Black recaptures ...Qxf6 and keeps the bishop pair, playing ...Nd7, ...dxc4 and ...g6 or ...Bd6.',
  ),
  B(
    ['Semi-Slav Defense', 'Marshall Gambit'],
    'White plays 4.e4 against ...e6 and ...c6, giving a pawn for the centre.',
    'White plays e5, Bd2 and Qg4 after ...dxe4 and ...Bb4, and plays against the black king.',
    'Black takes on e4 and plays ...Bb4 and ...Qxd4, holding the pawn; the play is sharp and forcing.',
  ),
  B(
    ['Semi-Slav Defense', 'Accelerated Meran Variation'],
    'Black plays ...a6 before ...Nbd7 against 5.e3, preparing ...b5 or ...dxc4 and ...b5.',
    'White plays Bd3 or b3 and O-O, or c5 to stop ...b5, and plays for the centre.',
    'Black plays ...b5 or ...dxc4 and ...b5 with the extra ...a6 in hand, and develops the c8 bishop to b7.',
  ),
  B(
    ['Tarrasch Defense', 'Classical Variation'],
    'Black plays ...Nc6, ...Nf6, ...Be7 and ...O-O against Nf3, g3 and Bg2, the standard Tarrasch.',
    'White plays Bg5, dxc5 and Rc1, playing against the isolated pawn and for the d4 blockade.',
    'Black plays ...c4 or ...Ne4 and ...Bg4, using the open lines and active pieces while the pawn holds.',
  ),
  // Benoni, Dutch, Old Indian
  B(
    ['Benoni Defense', 'Modern Variation'],
    'Black plays ...c5 and, after d5, ...e6 to exchange the e-pawn for the d-pawn.',
    'White plays Nc3 and e4 with Nf3 and Be2, or f4 and Bb5+, and gains space with the e5 break in mind.',
    'Black plays ...exd5, ...d6 and ...g6 for the Modern Benoni structure with the queenside majority.',
  ),
  B(
    ['Benoni Defense', 'Old Benoni'],
    'Black plays 1...c5 against 1.d4 at once, before ...Nf6.',
    'White plays 2.d5 and c4 or e4 and Nc3, gaining space; 2.dxc5 gives the pawn back for nothing.',
    'Black plays ...e5 for a closed Czech Benoni or ...Nf6 and ...e6 for the Modern.',
  ),
  B(
    ['Benoni Defense', 'Fianchetto Variation'],
    'White plays g3 and Bg2 against the Benoni, a calmer setup than e4.',
    'White plays O-O and Nd2 with a4, and plays on the queenside against the majority.',
    'Black plays ...Bg7, ...O-O and ...Na6 or ...Nbd7, with ...Re8 and ...b5 or ...f5 in mind.',
  ),
  B(
    ['Benoni Defense', "King's Pawn Line"],
    'White plays e4 in the Modern Benoni, the classical centre.',
    'White plays Nf3 and Be2 or f4 and Bd3, and prepares e5 or a queenside clamp with a4.',
    'Black plays ...g6, ...Bg7 and ...O-O, then ...a6, ...b5 and ...Re8 against e4.',
  ),
  B(
    ['Dutch Defense', 'Fianchetto Variation'],
    'White plays g3 and Bg2 against the Dutch, the main line.',
    'White plays Nf3, O-O and c4 with Nc3, and plays d5 or e4 in the centre.',
    'Black plays ...e6 and ...Be7 or ...d5 for the Stonewall, or ...g6 for the Leningrad.',
  ),
  B(
    ['Dutch Defense', 'Nimzo-Dutch Variation'],
    'Black plays ...Bb4+ in the Fianchetto Dutch, trading or blocking with tempo.',
    'White plays Bd2 or Nd2 and O-O, and keeps the bishop pair if Black trades on d2.',
    'Black plays ...Be7 after a block, or ...Bxd2+ and ...d6 or ...d5 with a sound structure.',
  ),
  B(
    ['Dutch Defense', 'Hopton Attack'],
    'White plays 2.Bg5, developing the bishop before Black can play ...Nf6.',
    'White plays e3 and Bd3 or Nc3 and f3, and uses the bishop to prevent ...Nf6 or double the pawns.',
    'Black plays ...h6 and ...g5 to drive the bishop, or ...g6 and ...Bg7, accepting a weakened kingside.',
  ),
  B(
    ['Dutch Defense', 'Krejcik Gambit'],
    'White plays 2.g4, offering the g-pawn to open the kingside.',
    'White plays h3 or e4 after ...fxg4 and plays for the open g-file and the centre.',
    'Black takes and returns the pawn for development, or declines with ...d5 and ...Nf6; the gambit is rare and unsound.',
  ),
  // English, Réti, Bird, Grob
  B(
    ['English Opening', 'Agincourt Defense'],
    'Black plays 1...e6, keeping ...d5 and ...Nf6 both available.',
    'White plays Nf3 and g3 for a Neo-Catalan, or d4 for a Queen’s Gambit.',
    'Black plays ...d5 or ...Nf6 and ...Bb4, and chooses between a Catalan and a Nimzo structure.',
  ),
  B(
    ['English Opening', 'Anglo-Scandinavian Defense'],
    'Black plays 1...d5, striking at c4 with a pawn.',
    'White plays cxd5 Qxd5 and Nc3 with tempo, a Scandinavian with colours reversed and an extra move.',
    'Black recaptures ...Qxd5 or plays ...Nf6, and develops with ...e5 or ...c6 and ...Bf5.',
  ),
  B(
    ['English Opening', 'Neo-Catalan'],
    'White plays c4, Nf3 and g3 against ...e6 and ...d5, a Catalan without d4.',
    'White plays Bg2 and O-O, then d4 or b3 and Bb2, and keeps the long diagonal.',
    'Black plays ...Nf6, ...Be7 and ...O-O, or ...dxc4 and ...c5, and can play ...d4 to close the diagonal.',
  ),
  B(
    ['English Opening', 'Carls-Bremen System'],
    'White plays Nc3 and g3 against 1...e5 and ...Nf6, a reversed Sicilian with the fianchetto.',
    'White plays Bg2, Nf3 or e3 and Nge2, and plays for d4 or a queenside expansion.',
    'Black plays ...d5 for the reversed Dragon, or ...Bb4 and ...Nc6, and takes the centre White has declined.',
  ),
  B(
    ['English Opening', 'Caro-Kann Defensive System'],
    'Black plays 1...c6, preparing ...d5 with a pawn.',
    'White plays e4 for a Caro-Kann, d4 for a Slav, or Nf3 and g3 for a Réti.',
    'Black plays ...d5 and ...Nf6 with a solid structure, and chooses the opening by White’s reply.',
  ),
  B(
    ['English Opening', 'Anglo-Dutch Defense'],
    'Black plays 1...f5 against 1.c4, a Dutch without d4.',
    'White plays g3 and Bg2 or e4, the Dutch’s two main answers, with the c-pawn already on c4.',
    'Black plays ...Nf6, ...e6 and ...Be7 or ...g6, and plays for e4 as in the Dutch.',
  ),
  B(
    ['English Opening', 'Great Snake Variation'],
    'Black plays 1...g6, fianchettoing before committing a centre pawn.',
    'White plays e4 and d4 for a Modern, or Nc3 and g3 for a symmetrical English.',
    'Black plays ...Bg7 and ...c5 or ...e5, and chooses the structure after White commits.',
  ),
  B(
    ['Réti Opening', 'Anglo-Slav Variation'],
    'Black plays ...c6 and ...d5 against c4 and g3, a Slav setup with the c-pawn.',
    'White plays Bg2, b3 and Bb2 and keeps the centre fluid, with d4 or cxd5 later.',
    'Black plays ...Nf6, ...Bf5 or ...Bg4 and ...e6, a solid structure with the bishop out.',
  ),
  B(
    ['Réti Opening', 'Réti Gambit'],
    'Black takes on c4 after 2.c4 and White plays e3, regaining the pawn.',
    'White plays Bxc4 and O-O, and gets a lead in development against the queenside.',
    'Black plays ...Be6 to hold the pawn, or ...c5 and ...Nc6 returning it for a Queen’s Gambit Accepted structure.',
  ),
  B(
    ['Réti Opening', 'Advance Variation'],
    'Black plays 2...d4, advancing the pawn rather than exchanging.',
    'White plays e3 or b4 to undermine the pawn, or g3 and Bg2 to play around it.',
    'Black plays ...c5 and ...Nc6 to support d4, gaining space at the cost of a target.',
  ),
  B(
    ['Bird Opening', "From's Gambit"],
    'Black plays 1...e5 against 1.f4, offering the pawn to open the kingside.',
    'White plays 2.fxe5 d6 3.exd6 Bxd6 and must defend the h2-b8 diagonal, or plays 2.e4 for a King’s Gambit.',
    'Black plays ...d6 and ...Bxd6, then ...Qh4+ or ...Nf6 and ...Ng4, attacking the weakened king.',
  ),
  B(
    ['Bird Opening', 'Dutch Variation'],
    'Black plays 1...d5, the classical answer to 1.f4.',
    'White plays Nf3, e3 and b3 with Bb2, or a Stonewall with d4 and e3, and plays for e5.',
    'Black plays ...Nf6, ...g6 and ...Bg7 or ...c5 and ...Nc6, taking the centre and playing against e5.',
  ),
  B(
    ['Grob Opening', 'Grob Gambit'],
    'White plays 1.g4 d5 2.Bg2, offering the g-pawn for the long diagonal.',
    'White plays c4 or h3 after ...Bxg4, and uses the bishop on g2 against b7 and d5.',
    'Black takes with ...Bxg4 and plays ...c6 to defend, or declines with ...e5; the gambit is unsound but tricky.',
  ),
  B(
    ['Zukertort Opening', 'Wade Defense'],
    'Black plays 1...d6 and 2...Bg4 against Nf3 and e4, pinning the knight early.',
    'White plays h3 and Bxf3, or Be2 and d4, and plays for the bishop pair.',
    'Black plays ...Nd7 and ...e5 or ...c6 and ...Nf6, a Philidor-like structure with the bishop already out.',
  ),
  // Queen's pawn systems
  B(
    ["Queen's Pawn Game", 'London System'],
    'White plays d4, Nf3 and Bf4 against ...d5 and ...Nf6.',
    'White plays e3, c3, Bd3 and Nbd2, with Ne5 and h4 or a queenside push in mind.',
    'Black plays ...c5 and ...Qb6 to hit b2, or ...Bf5 and ...e6 for a solid game.',
  ),
  B(
    ["Queen's Pawn Game", 'Accelerated London System'],
    'White plays 2.Bf4 at once, before Nf3.',
    'White plays e3, Nf3, c3 and Bd3, and keeps Nd2 and c4 in hand.',
    'Black plays ...c5 and ...Qb6, or ...Nf6 and ...Bf5, and the early Bf4 allows ...c5 with tempo.',
  ),
  B(
    ["Queen's Pawn Game", 'Torre Attack'],
    'White plays Nf3 and Bg5 against ...d5 and ...Nf6.',
    'White plays e3, Nbd2 and Bd3, and prepares c3 and e4 or a kingside attack.',
    'Black plays ...e6 and ...c5 or ...Ne4 to hit the bishop, and ...Qb6 against b2.',
  ),
  B(
    ["Queen's Pawn Game", 'Barry Attack'],
    'White plays Nf3, Nc3 and Bf4 against ...Nf6, ...g6 and ...d5, a London against the Grünfeld setup.',
    'White plays e3, Be2 and Ne5 or h4 and h5, a direct plan against the fianchetto.',
    'Black plays ...Bg7 and ...O-O, then ...c5 or ...Bg4 and ...c6, and meets Ne5 with ...Nfd7.',
  ),
];

/** `'A > B > C'` for a lineage, the key everything below is stored under. */
const keyOf = (lineage: readonly string[]): string => lineage.join(' > ');

const INDEX: ReadonlyMap<string, VariationBrief> = new Map(
  VARIATION_BRIEFS.map((brief) => [keyOf(brief.lineage), brief]),
);

/*
  Some dataset family names carry their own comma: "London System, with Bd3"
  and "King's Indian Attack, with e6" are single labels, not a family and a
  qualifier, because the dataset puts no colon in them. Without this they would
  fail to match the family brief and a London player would be told there is no
  explanation for the London. Truncating at the first comma is only ever tried
  after the full name has failed, so it can never override a real entry.
*/
const withoutTrailingClause = (name: string): string | null => {
  const comma = name.indexOf(', ');
  return comma === -1 ? null : name.slice(0, comma);
};

/**
 * The most specific brief that applies to a lineage.
 *
 * Walks from the full lineage back towards the family, so a position deep in
 * "Sicilian Defense: Najdorf Variation, English Attack, Anti-English" is
 * answered by the English Attack brief if one exists, then the Najdorf's, then
 * the Sicilian's — and `inherited` says which of those happened.
 *
 * Returns null rather than inventing anything when no ancestor is covered.
 */
export function briefForLineage(lineage: readonly string[]): ResolvedBrief | null {
  if (lineage.length === 0) return null;
  for (let length = lineage.length; length > 0; length -= 1) {
    const prefix = lineage.slice(0, length);
    const hit = INDEX.get(keyOf(prefix));
    if (hit) return { brief: hit, matched: prefix, inherited: length < lineage.length };
  }

  const family = withoutTrailingClause(lineage[0] as string);
  if (family) {
    const hit = INDEX.get(family);
    if (hit) return { brief: hit, matched: [family], inherited: true };
  }
  return null;
}

/** How many briefs exist. Reported in the UI so coverage is never implied. */
export const VARIATION_BRIEF_COUNT = VARIATION_BRIEFS.length;
