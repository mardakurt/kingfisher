# 0050 — Chess960: a candidate now exists, and it is still not taken

**Status:** accepted (Phase 19). Extends
[ADR 0048](0048-chess960-needs-a-rules-decision-first.md), which stands.

## Why this is being asked again

ADR 0048 concluded that there is **no maintained, permissively licensed
JavaScript library with Chess960 support**, and the owner's decision on that
basis was not to ship Chess960. Phase 19 was asked to re-audit the ecosystem
once rather than inherit that table, and the re-audit found something the
previous one had missed.

## What the ecosystem looks like now

Checked on 2026-09-06 against the registry and by installing and running each
candidate, rather than by reading a feature list.

| Library               |               Licence | Chess960 | Last published | Verdict                           |
| --------------------- | --------------------: | -------- | -------------- | --------------------------------- |
| `chess.js` 1.4.0      |          BSD-2-Clause | **no**   | in use         | cannot provide it                 |
| `chessops` 0.15.1     |      GPL-3.0-or-later | yes      | 2026-07-12     | capable; licence conflict         |
| `chess.ts` 0.16.2     |          BSD-2-Clause | no       | —              | cannot provide it                 |
| `@rumenx/chess` 1.0.2 |                   MIT | no       | —              | cannot provide it                 |
| **`kokopu` 4.13.4**   | **LGPL-3.0-or-later** | **yes**  | **2026-07-18** | **capable; a real candidate**     |
| `chess960`            |        does not exist | —        | —              | the 2018 package is gone from npm |

**`kokopu` is new to this audit and it is a genuine candidate.** It was
installed and driven, not read about:

- It parses a Chess960 array and converts `KQkq` to the file-based Shredder
  form — `bbqnnrkr/… w KQkq` came back as `… w FHfh`, which is the correct
  representation and the thing chess.js cannot do.
- It castles correctly by the Chess960 rule. From `rkr5/…/RKR5 w ACac`, with
  the king on b1 and rooks on a1 and c1, it offers `O-O` and produces
  `R4RK1` — king to g1, rook to f1, from squares neither piece started on.
- It is maintained: published within two months of this audit.

So ADR 0048's central claim — that no library exists — is no longer the
reason. The reason has changed, and it is worth stating precisely.

## What the re-audit also found about chess.js

Worth recording separately, because it is the hazard rather than the
opportunity. **chess.js 1.4.0 accepts a Chess960 starting array that claims
standard castling rights** and generates twenty legal moves for it. It has no
Chess960 rules, so those rights mean king-to-g1-via-e1 castling in a position
where the king is not on e1 — an illegal move offered as a legal one, which is
exactly the class of defect
[ADR 0047](0047-standard-chess-only-and-the-castling-claim.md) exists for.

Kingfisher does not have that defect, because its own FEN parser refuses the
position before chess.js sees it, and `src/chess/variant-contract.test.ts`
holds that with two named tests: one that refuses a Chess960 array claiming
standard rights, and one that rejects Shredder-FEN rather than misreading it.
This is the second time that boundary has earned its cost.

## Decision

**Chess960 remains NOT SUPPORTED.**

Not because nothing could provide it, but because of what adopting `kokopu`
would actually mean:

1. **It replaces the rules engine, not augments it.** `src/chess/position.ts`
   is the only module allowed to import a rules library, deliberately, and it
   is the boundary the project's most valuable code sits behind. A second
   provider beside chess.js means two rules implementations that must agree on
   standard chess for ever, and the phase history already contains one castling
   correctness bug found in the single implementation.
2. **LGPL is not permissive, it is conditional.** Kingfisher declares no
   licence — there is no `LICENSE` file and no `license` field in
   `package.json` — so it is proprietary by default. LGPL-3.0 permits exactly
   that combination, and §4 attaches a condition: a user must be able to
   relink the application against a modified `kokopu`. For a minified,
   tree-shaken Next.js bundle _and_ a signed, notarised `.app`, satisfying
   that is a distribution mechanism to design, not a dependency to add. It is
   a real obligation and it is the owner's to accept.
3. **Nothing in the product is waiting on it.** Kingfisher refuses positions it
   cannot play rather than guessing, which is a complete and honest behaviour,
   and `src/chess/chess960.ts` already records all 960 arrangements under
   Scharnagl numbering as a fact about the game with no rules claim attached.

The brief's own instruction stands and is the tiebreak: correct standard chess
is more important, and partial support is worse than none.

## What would change this

A decision by the owner to accept the LGPL relinking obligation for both
distributions, plus a phase whose scope is _only_ the rules boundary: adopting
`kokopu` behind `position.ts`, running the existing standard-chess suites
against it unchanged, and keeping chess.js until they agree. That is a phase,
not a task, and it should not be attempted alongside anything else.
