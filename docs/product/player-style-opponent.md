# Player-style sparring opponent — feasibility and plan

> **Status: idea, not implemented.** Phase 72 investigated whether
> Kingfisher can offer, from Preparation, an opponent that plays the way
> a chosen player plays — opening, middlegame and endgame tendencies —
> rather than Stockfish at a rating. This page records what would be
> needed, what the repository already has, and a staged plan. No part
> of the Studio claims this today, and nothing here says a system can
> "become" a player.

## What the repository already has

- **Player corpora with provenance.** The installed reference packs
  (Kingfisher Starter, Elite OTB, Recent Theory, High-Rated Online) are
  aggregated by position and carry per-source game counts; the player
  library knows which players have games in an installed source
  (`src/player/`, `src/reference/`).
- **Preparation** already builds an opening tree for one opponent from
  the installed sources and the person's own games
  (`src/preparation/`), with White/Black split and move frequencies.
- **Play from here** runs a real engine against the person from any
  position (`src/features/play/`), with the engine's strength and time
  under the person's control.
- **Engine candidate lines with scores** (MultiPV) from any engine, and
  a stable position identity (`positionKey`) that makes "have I seen
  this position in this player's games?" a lookup.

## What a credible MVP is

An opponent that, at each move:

1. **In known territory** (a position that occurs in the player's games
   in an installed source), chooses a move by that player's own
   frequency in that position — the opening tree Preparation already
   builds — with a floor so a move played once in 300 games is not the
   whole personality.
2. **Out of book**, asks the engine for its MultiPV candidates and
   re-ranks them with a small, explicit prior: the player's measured
   tendencies (a handful of features — willingness to trade queens,
   pawn-structure choices, king-side vs queen-side play, endgame entry
   rate) estimated from the same games, applied as a bounded bonus to
   the engine's scores so the opponent stays sound.
3. **Says what it did.** Every move is labelled: "played 62% of the time
   in her games here (Elite OTB, 41 games)" or "engine choice, nudged
   toward a queen trade". A move the person cannot trace is a move the
   product should not offer as a style.

That is an honest, limited claim: "the opening you will actually face,
and a middlegame biased the way the record says" — not a model of a
mind.

## What it needs

- **Corpus size.** For a top player the installed packs hold hundreds
  to low thousands of games; enough for the opening tree, thin for
  middlegame features beyond the first few. The feature estimator must
  report its sample size and refuse below a floor.
- **Feature definitions**, each computed by `src/chess/` from positions
  alone, unit-tested, and documented in the product before they are
  used.
- **Compute.** Nothing beyond the engine already running; the re-ranking
  is arithmetic over MultiPV lines.
- **Storage.** Per-player feature vectors are a few hundred bytes; no
  new dataset is committed to the repository.
- **Legal.** Chess moves are facts; the packs' licences (CC BY-SA 4.0,
  CC0) already permit this use. A player's name on the feature is a
  factual description of their games in a named source, and the UI
  keeps the source visible. No likeness, no claim of endorsement.

## Staged plan

1. Opening-only opponent from Preparation's tree, with the move
   frequencies shown. (Small; reuses two existing modules.)
2. Feature estimator with sample sizes, shown in the player's profile
   before any opponent uses them.
3. Engine re-ranking with the prior, bounded and labelled.
4. A "why this move" panel that cites the games.

Each stage is shippable and honest on its own. Stage 1 is the one to
start with; it is also the one Preparation's users ask for most.
