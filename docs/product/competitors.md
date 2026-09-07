# Where Kingfisher stands, strictly

Checked September 2026, and re-checked in Phases 18 and 19. The rule for this file is the one in `AGENTS.md`:
**do not claim Kingfisher has more data.** It does not, and the honest
comparison is more useful than a flattering one.

## The four things it is measured against

|                  | What it is                                                                                                                                                         | Cost                        | Where it runs                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ----------------------------------------- |
| **ChessBase**    | The professional standard. Mega Database 2026 is **11.7 million games, 1475–2025**; Opening Encyclopaedia 2026 adds 1,586 authored articles and 100 video lessons. | Paid, per year, per product | Windows first                             |
| **Lichess**      | The best free explorer on the web, over an enormous online corpus plus a Masters database.                                                                         | Free                        | Browser only                              |
| **En Croissant** | Free and open source, SQLite with custom indexing, engines and repertoire training. Ships with **no games** — you bring your own.                                  | Free                        | Windows, macOS, Linux                     |
| **ChessMonitor** | Analytics over _your own_ Lichess and Chess.com games.                                                                                                             | Freemium                    | Browser                                   |
| **Kingfisher**   | Browser workstation with an optional local companion for native engines and SQLite. Ships with data.                                                               | Free                        | Browser; companion on macOS/Linux/Windows |

## The comparison

Ratings are **strict**: ✅ genuinely competitive, ◐ real but narrower, ✗ absent.

|                                 |         ChessBase         |      Lichess       |   En Croissant   | ChessMonitor |                              **Kingfisher**                              |
| ------------------------------- | :-----------------------: | :----------------: | :--------------: | :----------: | :----------------------------------------------------------------------: |
| Database breadth                |     ✅ 11.7M, to 1475     | ✅ online; Masters | ✗ bring your own | ◐ your games |                   ◐ **507k across three packs, 2020–**                   |
| Historical coverage             |       ✅ 550 years        |     ◐ Masters      |        ✗         |      ✗       |               ◐ **none shipped; Masters online to ~1952**                |
| Opening book / theory           | ✅ authored encyclopaedia |    ◐ names only    |   ◐ names only   |      ✗       |            ◐ **3,810 named positions, browsable, 157 briefs**            |
| Opening explorer                |            ✅             |         ✅         |        ✅        |      ◐       |                       ✅ **0.1 ms local, offline**                       |
| Several populations at once     |             ◐             |         ✗          |        ✗         |      ✗       |                     ✅ **up to four, never merged**                      |
| Where a number came from        |             ◐             |         ◐          |        ✗         |      ◐       |                ✅ **source and licence on every figure**                 |
| One-click reference data        |          ✅ paid          |        n/a         |        ✗         |     n/a      |                ✅ **three packs, free, verified digests**                |
| Works with nothing installed    |             ✗             |         ✅         |        ✗         |      ✅      |                                    ✅                                    |
| Offline                         |            ✅             |         ✗          |        ✅        |      ✗       |                     ✅ **book, explorer and engine**                     |
| Player encyclopedia             |            ✅             |         ◐          |        ◐         |      ◐       |        ◐ **12,589 searchable; browse sets always lead to games**         |
| Preparation against an opponent |            ✅             |         ◐          |        ◐         |      ◐       |                                    ✅                                    |
| Engine management               |            ✅             |         ✗          |        ✅        |      ✗       | ✅ **seven on Apple Silicon, verified by interrogation; one built here** |
| Repertoire + training           |            ✅             |         ◐          |        ✅        |      ✗       |                                    ✅                                    |
| Desktop application             |     ✅ Windows-first      |         ✗          |   ✅ all three   |      ✗       | ◐ **macOS driven; Windows and Linux built, untested; not distributable** |
| Local tablebases                |            ✅             |   ◐ remote only    |        ✅        |      ✗       |           ✅ **local Syzygy, inside the packaged application**           |
| Neural engine                   |            ✅             |         ✗          |        ✅        |      ✗       |        ✅ **Lc0, metal backend, inside the packaged application**        |
| Ease of setup                   |    ✗ install, licence     |         ✅         |    ◐ install     |      ✅      |                  ✅ **open a page, or install the app**                  |
| Open source                     |             ✗             |         ✅         |        ✅        |      ✗       |                                    ✅                                    |

## What Kingfisher is genuinely better at

Three things, and they are all consequences of the same decision — that a
number must be traceable to the games behind it.

**Populations are never merged.** Kingfisher will show the same position in
Elite OTB, Recent Theory and 2400+ online side by side, each with its own game
count and licence, and refuses to compute a combined figure. Measured on the
Najdorf at move 5: 6.Bg5 is 17.1% over the board and 26.6% online. No other
tool here will put that difference in front of you; most will show you one
population and let you assume it is the population.

**The data is there and it is free.** A new user gets 172,376 games, 3,810
named opening positions, 157 variation briefs, a 12,589-player library and a
working engine, without installing anything or paying for anything. En
Croissant ships no games; ChessBase ships more than anyone, for a fee.

**Every figure carries its provenance.** Source, licence and population are on
the row before you install a pack and beside the number afterwards.

## The desktop row, stated exactly

Kingfisher is now a Mac application: one launch, no terminal, the companion
started and paired by the shell, native engines and SQLite collections of any
size, a PGN opened from a file dialog, and nothing left running when it quits.
That is a real change of category and it earns a ◐ rather than a ✅ for one
reason: **the bundle is signed but not distributable.** It has a valid
signature and the hardened runtime; Gatekeeper still rejects it, because
notarised distribution needs a Developer ID Application certificate. Until
that exists, En Croissant and ChessBase ship something a stranger can install
and Kingfisher does not.

Where it is already ahead of En Croissant on the desktop: the application is
the same one the browser runs, so there is no second renderer to keep in step,
and the shell owns the companion's lifetime with a shutdown contract tested
against real processes. Where it is behind: three platforms are configured and
only macOS has been built and driven.

## What it is worse at, plainly

**Historical chess.** Kingfisher has nothing before 2020. ChessBase goes back
to 1475. This is not a gap that engineering closes — it is a licensing
question, and `docs/data/historical-games-audit.md` records the sources
audited and why none of them could be used.

**Breadth.** 507,000 games across three packs against 11.7 million. Kingfisher
handles a large imported collection well — 60,469 games at 0.012 ms per
explorer query — but it does not supply one.

**Authored opening theory.** The Opening Encyclopaedia is 1,586 articles by
grandmasters. Kingfisher has 157 variation briefs of two to five sentences,
written to state only what every reference agrees on. That is a deliberate
floor, not a claim to compete.

## The workflow gaps this comparison found

Written down in Phase 17 rather than fixed, because each looked like a phase of
its own. Two are now closed and one turned out to have been half-built already.

1. **~~No engine-annotated game pass.~~** This one was wrong when it was
   written: the background analysis queue already ran an engine over a whole
   game and stored the evidence, and `suggestReviewCandidates` already turned
   that into critical positions with reasons rather than labels. What it had
   was a real defect — MultiPV was requested and only the first line was
   stored, so the rule the brief calls "the played move leaves the top-N
   candidate set" had nothing to run on. Fixed in `a6714a1`.

   Kingfisher still does not, and will not, produce "Blunder!" or an accuracy
   percentage. A position is suggested with the facts that suggested it.

2. **~~No published opening report.~~** Closed in `f48068a` and `b367ca5`. The
   report is a dock tool beside the Theory Book: what the opening is called and
   how far past the last named position the board is, the variation brief, the
   branches worth the time with the numbers that put them in that order, and
   one row per installed population with its own game count.

   The plan sections — where the pieces go, which pawns advance — need the
   continuations of the games that reached a position, and only a SQLite
   collection through the companion still has them; a reference pack aggregated
   its games into per-position counts before Kingfisher ever saw them. So they
   appear when a collection can answer and are dropped, rather than shown
   empty, when none can. `66c6251` is the commit where they started appearing at
   all: the panel had been looking for that source among the reference packs.

   It is wider than ChessBase's in the way that matters most: every section
   states its basis, and there is no combined figure anywhere in it.

3. **~~No spaced repetition over the repertoire tree.~~** Closed in `4106d34`.
   A repertoire becomes a queue of prompts, one per position however many move
   orders reach it, scheduled by the same SM-2 derivative the training queue
   uses rather than by a second system.

## What this comparison still finds against Kingfisher

Unchanged by Phase 18, and worth restating so the closures above are not read
as more than they are.

**Historical chess.** Nothing ships before 2020 and, on the audit, nothing can.
Phase 18 narrowed the claim rather than the gap: master games are researchable
back to about 1952 through the Lichess Masters explorer with a connected
account, which covers Fischer–Spassky 1972. Before that — Morphy, Steinitz,
Capablanca — there is still nothing. `docs/data/historical-games-audit.md`.

**Breadth.** 507,000 shipped games against 11.7 million. Kingfisher handles a
large imported collection well and does not supply one.

**Authored opening theory.** 1,586 grandmaster articles against 157 briefs of
two to five sentences. A deliberate floor, not a claim to compete.

**Chess960.** ChessBase and Lichess both support it. Kingfisher does not, and
ADR 0048 records the audit behind that: no maintained permissively licensed
JavaScript library has correct Chess960 rules, and the one that does is GPL.
