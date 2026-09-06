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
    'Black plays 3...Nf6 immediately, ignoring the threat to the knight.',
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
    'Black defends the knight with ...d6.',
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
    'Black gets a solid, symmetrical structure with no weaknesses and aims to develop the bad bishop via ...b6 or ...c5.',
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
    'Black plays ...Bf5 after the knight trade on e4.',
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
    'White plays 4.Bd3 after exchanging on d5.',
    'White plays a minority attack with b4-b5 against the queenside.',
    'Black develops easily and counters in the centre or on the kingside.',
  ),
  B(
    ['Caro-Kann Defense', 'Karpov Variation'],
    'Black recaptures with 4...Nd7 rather than 4...Bf5 or 4...Nf6.',
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
    'Black plays 2...Nf6 and 3...Bg4, offering the pawn back for development.',
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
    'White wins the centre with cxd5 and e4 while gaining time.',
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
