# Where Kingfisher stands, strictly

Checked September 2026. The rule for this file is the one in `AGENTS.md`:
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

|                                 |         ChessBase         |      Lichess       |   En Croissant   | ChessMonitor |                      **Kingfisher**                       |
| ------------------------------- | :-----------------------: | :----------------: | :--------------: | :----------: | :-------------------------------------------------------: |
| Database breadth                |     ✅ 11.7M, to 1475     | ✅ online; Masters | ✗ bring your own | ◐ your games |           ◐ **507k across three packs, 2020–**            |
| Historical coverage             |       ✅ 550 years        |     ◐ Masters      |        ✗         |      ✗       |                  ✗ **none before 2020**                   |
| Opening book / theory           | ✅ authored encyclopaedia |    ◐ names only    |   ◐ names only   |      ✗       |    ◐ **3,810 named positions, browsable, 135 briefs**     |
| Opening explorer                |            ✅             |         ✅         |        ✅        |      ◐       |               ✅ **0.1 ms local, offline**                |
| Several populations at once     |             ◐             |         ✗          |        ✗         |      ✗       |              ✅ **up to four, never merged**              |
| Where a number came from        |             ◐             |         ◐          |        ✗         |      ◐       |         ✅ **source and licence on every figure**         |
| One-click reference data        |          ✅ paid          |        n/a         |        ✗         |     n/a      |        ✅ **three packs, free, verified digests**         |
| Works with nothing installed    |             ✗             |         ✅         |        ✗         |      ✅      |                            ✅                             |
| Offline                         |            ✅             |         ✗          |        ✅        |      ✗       |             ✅ **book, explorer and engine**              |
| Player encyclopedia             |            ✅             |         ◐          |        ◐         |      ◐       | ◐ **12,589 searchable; browse sets always lead to games** |
| Preparation against an opponent |            ✅             |         ◐          |        ◐         |      ◐       |                            ✅                             |
| Engine management               |            ✅             |         ✗          |        ✅        |      ✗       |      ✅ **six verified by interrogation, incl. Lc0**      |
| Repertoire + training           |            ✅             |         ◐          |        ✅        |      ✗       |                            ✅                             |
| Ease of setup                   |    ✗ install, licence     |         ✅         |    ◐ install     |      ✅      |                    ✅ **open a page**                     |
| Open source                     |             ✗             |         ✅         |        ✅        |      ✗       |                            ✅                             |

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
named opening positions, 135 variation briefs, a 12,589-player library and a
working engine, without installing anything or paying for anything. En
Croissant ships no games; ChessBase ships more than anyone, for a fee.

**Every figure carries its provenance.** Source, licence and population are on
the row before you install a pack and beside the number afterwards.

## What it is worse at, plainly

**Historical chess.** Kingfisher has nothing before 2020. ChessBase goes back
to 1475. This is not a gap that engineering closes — it is a licensing
question, and `docs/data/historical-games-audit.md` records the sources
audited and why none of them could be used.

**Breadth.** 507,000 games across three packs against 11.7 million. Kingfisher
handles a large imported collection well — 60,469 games at 0.012 ms per
explorer query — but it does not supply one.

**Authored opening theory.** The Opening Encyclopaedia is 1,586 articles by
grandmasters. Kingfisher has 135 variation briefs of two to five sentences,
written to state only what every reference agrees on. That is a deliberate
floor, not a claim to compete.

## The workflow gaps this comparison found

Written down rather than fixed, because each is a phase of its own.

1. **No engine-annotated game pass.** ChessBase will analyse a whole game and
   mark the mistakes. Kingfisher analyses positions.
2. **No published opening report.** ChessBase's opening report summarises a
   variation's plans from the games themselves; Kingfisher's briefs are
   authored and its statistics are separate.
3. **No spaced repetition over the repertoire tree.** En Croissant has it;
   Kingfisher has training but not scheduled review of a whole repertoire.
