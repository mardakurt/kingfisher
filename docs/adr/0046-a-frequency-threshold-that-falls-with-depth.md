# 0046. A frequency threshold that falls with depth

Status: Accepted

## Context

A reference pack cannot keep every position it sees. Games are eighty plies
long and mostly unique after twenty, so an unpruned aggregate of 400,000 games
is tens of millions of rows that are each one game with a 100% score.

Kingfisher pruned with a single number: keep a position if at least _n_ games
reached it. Three for the bundled pack, two for the downloaded one.

That number is doing nothing at the start of the game and everything at move
twelve. After 1.e4 c5 there are tens of thousands of games and no threshold
matters. By move ten the tree has fanned out faster than any archive fills it,
and the same threshold is the reason the explorer goes blank — at exactly the
depth where somebody stops browsing and starts preparing.

Measured on the bundled pack's 172,376 games, a flat three-game rule kept
150,128 positions and answered 58.1% of the depth benchmark's lines at twenty
plies. The most-played continuation could be followed for 35 plies before the
pack had nothing.

## Decision

A pack states two thresholds and the depth that separates them: `minGames`
below `deepFromPly`, and `deepMinGames` at and beyond it. A position that
several move orders reach is judged at the shallowest depth it was seen.

The shipped settings, and what each cost:

| Pack          | Shallow | From ply | Deep | Positions |     Size |
| ------------- | ------- | -------- | ---- | --------: | -------: |
| Starter       | 3       | 18       | 2    |   246,870 |  12.3 MB |
| Recent Theory | 2       | 18       | 1    |   918,069 |  33.8 MB |
| Elite OTB     | 2       | 28       | 1    | 5,438,808 | 339.3 MB |

## Consequences

**The bundled pack grew 64% for 2.8 MB** and its twenty-ply answer rate went
from 58.1% to 64.5%. A one-game deep tier was measured too and rejected on size
rather than on principle: 2,755,981 positions and 79.5 MB is not something to
put in a repository people clone.

**The downloaded packs take the expensive end**, because at move eighteen the
single elite game that reached a position _is_ the evidence a professional
wants, and the pack carries that game's full score so it can be opened. This is
where Elite's advantage over Starter at twenty and thirty plies comes from.

**A deep row is a small sample and is shown as one.** The explorer prints the
game count next to every move, so "1 game, 100%" is legible as what it is.
Nothing here changes how a number is presented; it changes whether the row
exists at all.

**Thresholds are reduce-time, and the scan cache now knows that.** Fingerprinting
the scan on limits it does not apply meant that trying a different threshold
re-parsed 3 GB of archives to produce byte-identical rows. Splitting them is
what made the table above affordable to measure rather than guess.

**The rules are stated per pack and published.** `scripts/reference/packs.mjs`
holds them, `docs/data/reference-packs.md` records what each one cost, and
`npm run bench:explorer-depth` re-measures the result. A pruning rule nobody can
re-derive is a pruning rule nobody can argue with.
