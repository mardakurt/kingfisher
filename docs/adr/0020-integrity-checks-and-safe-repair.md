# 0020. What the integrity checker may say, and what it may fix

Status: Accepted

## Context

Kingfisher spreads one game across three stores — a summary, its moves, and a
row per position it reached — and links studies, repertoires, training items
and model games to those records by id. IndexedDB has no foreign keys, so every
one of those links is a place where an interrupted import, a failed delete or
an evicted transaction can leave a reference to something that is not there.

Nothing could detect that, and the failure is quiet: an explorer counting games
that cannot be opened, a study chapter reachable from nowhere, a training item
citing a game that was deleted last month.

The easy version of this feature is worse than nothing. A checker that reports
"your database may be damaged" tells the user only that they should be worried,
and a repair that deletes whatever it cannot resolve turns a cosmetic
inconsistency into permanent data loss.

## Decision

**Every rule describes a relationship the schema guarantees.** A violation is
then a fact, not a suspicion, and the report can name the records and the
relationship: "3 position index entries point at deleted games", not "possible
corruption". Anything that cannot be stated that precisely does not go in.

**The rules are a pure function of the rows.** Reading the database and judging
it are separate, so the whole rule set is tested against deliberately broken
fixtures without an IndexedDB — including the cases that must produce _no_
finding, because a scan that cries wolf on a healthy database is one people
learn to ignore.

**Repair only removes a pointer to something that provably no longer exists.**
Orphaned move records, index entries for deleted games, repertoire decisions
whose repertoire is gone, reviews for deleted training items, model-game links
to missing targets. Chapter ordering is also repaired, by renumbering while
preserving the existing sequence, so what the user sees does not move.

**Four things are reported and deliberately not repaired:**

- _A game summary with no moves._ The summary is the last evidence that the
  game was ever imported. Deleting it to satisfy a foreign key destroys that
  evidence, and no tree can honestly be invented to replace it.
- _A chapter whose study is gone._ It still holds the user's analysis. Deleting
  work to tidy a pointer is not a repair.
- _A game missing from the position index._ Rebuilding it is safe and derives
  nothing new, but it means replaying chess, which is the importer's job rather
  than a repair pass's.
- _A draft pointing at a deleted chapter._ The draft holds the tree that was on
  screen — precisely the work it exists to protect.

**Repairs run in one transaction** over every store they touch, so a failure
part-way leaves the database exactly as it was rather than half-tidied, and the
result reports what was removed. A repair the user cannot see is a repair they
cannot trust.

## Consequences

`Settings → Diagnostics` can answer "is my data intact?" with a list of facts,
and can fix the subset that is unambiguous. The scan runs on request rather
than on open, because it reads every record and a diagnostics tab that stalls
on a large collection is one people stop opening.

The checker is not a schema validator and does not replace `validation.ts`,
which rejects malformed records at read time. It answers a different question:
whether records that are individually valid still agree with each other.

New relationships will not be checked until somebody adds a rule for them.
That is the accepted cost of refusing to guess: a generic "walk everything and
delete what does not resolve" pass would cover more and would eventually delete
something it should not have.
