# 0024. Structural position identity: a pawn skeleton key and a signature

Status: Accepted

## Context

Kingfisher could already answer "where else did this exact position occur",
because a canonical position key (ADR 0009) makes that an index lookup. It
could not answer either of the two questions a strong player actually asks
while studying:

> Where else have I had this pawn structure?

> Show me games with an isolated d-pawn and an open c-file.

Both need positions that are _not_ identical to be found together. The obvious
modern answer — embed the position and search by nearest neighbour — is the
wrong one here for a specific reason: Kingfisher's whole claim is that every
statement it makes can be traced to a fact. A result that appeared because two
vectors were 0.91 apart cannot be explained to the person reading it, cannot be
reproduced after a model change, and cannot be indexed by SQLite or IndexedDB.

The deterministic feature extractor already existed and was already tested
(isolated, doubled, passed, backward pawns; islands; open and semi-open files;
bishop pair; material imbalance; castling; king shelter). What was missing was
_identity_ built from it: something comparable for equality and cheap to index.

## Decision

**Two identities, deliberately separate, because they answer different
questions.**

**The pawn skeleton key is the pawns and nothing else.** `p1:` followed by
eight file groups, each listing the ranks of White's pawns on that file, a
`|`, then Black's. Side to move, castling rights, en passant and every piece
are absent by construction. Two positions share a skeleton if and only if
their pawns stand on the same squares — which is what a player means by "the
same structure", and is exactly why the pieces must be excluded rather than
merely down-weighted.

**The structure signature is a coarser grouping.** A single string over the
files that matter (isolated, passed, open, semi-open), the bishop pairs, the
material profile and which third of the board each king stands in. It is
deliberately coarser than the full fact record: it drops the counts that
change every move, so two positions sharing a signature are the same
structural _type_. It never claims they are the same position, and the result
row says which kind of match it was.

**Both carry a format version in the key itself** (`p1:`, `s1:`). A stored key
computed under an older definition must never be compared for equality against
a new one, and must never be silently treated as a miss either. The prefix
makes a format change detectable, so a collection can be reindexed rather than
quietly answering the wrong question.

**Both are pure functions of the FEN**, computed identically in the browser,
in the import Worker and in the companion. A key written at import still
matches a key computed live months later because there is only one definition
of it.

**Nothing here scores, ranks or interprets.** `structureOverlap` returns a
count of shared claims and the totals on each side — not a similarity score.
The caller decides what "close enough" means, and the result table shows the
count so the reader can decide too.

## Consequences

Structure search is an indexed equality lookup, not a scan: `pawn_skeleton` and
`structure_signature` are stored on the position row in both providers, with
partial indexes in SQLite. Measured on 100,000 games with a million indexed
positions, a same-skeleton search over a skeleton every game reaches runs at
33 ms median.

The claims are stored as a JSON string array and matched with `LIKE` over the
quoted complete claim, which is why `open:c` cannot accidentally match
`semi-open:c`. It is not a proper array index, and a claim search is
correspondingly the slowest of the four modes. It is bounded by the same
partial-index filtering as the rest, and a claim query is a research action
rather than something that runs on every move.

Games imported before this index existed carry no structure columns and
therefore match nothing. The empty state says so, and says that re-importing
adds the facts without duplicating the games — rather than silently returning
fewer results than the collection contains.

The skeleton ignores the side to move, so a search finds the structure in both
colours' hands. That is intended, and the result row shows the move number and
the game so the reader can see which.
