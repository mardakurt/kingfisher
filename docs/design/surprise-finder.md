# The surprise finder

_Design, 2026-09-22 (Phase 76). The second item of "Later — leading" in
`docs/product/market-research.md` §6: "the surprise finder (repertoire ×
opponent × where the population leaves theory)". The record of what shipped is
at the end._

## Why this one

§5 of the research names the moat: everything a player makes in Kingfisher is
keyed by position and lives in one store, which is why joining two of them
took one phase where a competitor would need an integration. This joins
**three** populations that nobody else holds together:

- **your repertoire** — what you intend to play;
- **your opponent's own games** — what this person actually plays;
- **a named reference population** — what everybody plays.

Each already exists, each is already keyed by `positionKey`, and each already
refuses to be merged with the others. The question none of them answers alone
is the one a player asks the night before a round: **what might they play that
I have not prepared, and that nobody would have warned me about?**

That is the definition used here, and it is deliberately narrow.

## What a surprise is

A move is a surprise when all three are true at one position:

1. **Your repertoire has no answer to it.** The position after it is not in
   your repertoire, so you would be out of book on their move, not on yours.
2. **They have played it.** Not "they might"; their own games show it, with a
   count.
3. **The population rarely plays it.** Under a named source's share
   threshold — so a line you did not prepare because everybody plays it is
   not a surprise, it is a gap, and Kingfisher already has a word and a
   panel for that.

A move that fails any of the three is not listed. A move that fails only the
third is a **gap**, which `compareWithRepertoire` already reports, and the
panel says so rather than re-listing it here under a more exciting name.

## What it is not

**Not a prediction.** Nothing here says what the opponent _will_ play. Every
row is three counts with three denominators, each labelled with the
population it came from, and a player draws their own conclusion. §3.5 of the
research is explicit about why: a tool that invents a "style" profiles
opponents, and a tool that shows facts from named games does not.

**Not merged.** The opponent's count and the population's share are never
combined into one number. They are two columns because they disagree, and the
disagreement is the finding.

**Not a claim about an unrated source.** A pack serves its own population
whatever filter is asked of it (`remote-reference.ts` ignores `filters`), so
the share is stated as "of the N games this source has here", with the source
named, and never as "of master practice".

## Model

```
Surprise
  positionKey, fen        where it happens
  line                    the moves that reach it, from the repertoire's root
  san, uci                the move they played that you have no answer to
  theirGames              how many of their games played it
  theirTotal              how many of their games reached the position
  sourceGames             how many games the named source has at the position
  sourceShare             this move's share there, or null when the source
                          has nothing at the position at all
  sourceName              the source those two numbers came from
  lastPlayed              the most recent year they played it, when known
```

`sourceShare === null` is not zero. A source with no games at a position has
not said the move is rare; it has said nothing, and the row says "this source
has nothing here" instead of printing a share.

## Ranking

Deterministic, and by how much of the opponent's own play it accounts for:
their count first, then the inverse of the population share (rarer first),
then the depth of the position (shallower first, because it is met sooner),
then the move for stability. No weights, no score.

## Interface

A tool in the Preparation workspace, beside the dossier that already holds the
opponent's games. It needs a repertoire and an opponent; with either missing
it says which. Each row opens the position on the board, with the move played
as a variation, so the next click is preparation rather than note-taking.

## Record

Shipped in Phase 76. `src/preparation/surprises.ts` is the join (8 unit
tests); the panel is in the Preparation workspace beside the dossier, and asks
the chosen explorer source about at most sixty repertoire positions the
opponent actually reached.

The source lookup is **per move**, not per position: that is the shape every
explorer provider answers in, and a per-position lookup would have made the
caller un-sum it — the first draft did exactly that, in two passes, and it
showed.

Driving it produced the wording fix that matters. A source with games at a
position and none of them playing the move was rendered "0.0%", which reads
as the source having said nothing — the one thing this panel must never blur.
It now says "none of 35,220 in Kingfisher Starter Reference", and "has
nothing at this position" stays for the case where the source was silent.
Two mutations were made to fail: the rarity threshold, and the rule that a
silent source is not evidence of rarity.
