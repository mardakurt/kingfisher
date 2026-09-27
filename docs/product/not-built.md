# What is not built

_2026-09-27, after Phase 87 and Kingfisher 1.3.3 (first written after Phase 86
and 1.3.2). The single list of work the Phase 86 and Phase 87 briefs asked for,
or that those phases left open, which does not exist in the product or was not
done. Each entry says why it is not built, what unblocks it,
and where its design or evidence already lives. The criterion-by-criterion
state is in [`parity-ledger.md`](parity-ledger.md); this file is the short
answer to "what is left"._

Keep it true: when an item is built, delete its entry here and move the
ledger row, in the same commit.

## 1. Blocked on the owner, hardware or a licence

Nothing in the repository can close these; each needs something only the
owner can provide.

| Item                                                              | Why it is blocked                                                                    | What unblocks it                                   | What exists                                                                                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A remote engine on a second machine, and over the internet (P0.3) | no second machine or cloud VM                                                        | a second Mac or a VM the companion can run on      | built and tested between two companions on one machine over loopback, including a host killed mid-search (`docs/design/remote-engines.md`) |
| A ChessBase export opened in ChessBase (P0.4)                     | no ChessBase licence                                                                 | a ChessBase installation to open the exported file | the CBH export is read back by Kingfisher's own reader (`e2e/chessbase-export.spec.ts`)                                                    |
| Sync, team access control, a coach sharing one assignment (P0.6)  | the owner decided "file exchange only; no server, no hosted share" (2026-09-24/25)   | reversing that decision                            | portable backups; Team packets by file; `docs/adr/00xx-optional-account-sync.md` is Proposed                                               |
| Windows: packaged harnesses and a signed installer (P0.7, P0.8)   | no Windows machine or code-signing certificate                                       | a Windows machine and a certificate                | `docs/design/windows.md` sizes the work; the companion's shutdown contract already covers Windows                                          |
| A hands-on comparison with ChessBase (Phase 87)                   | no ChessBase licence; ChessBase for Mac is announced for November 2026, not released | a ChessBase licence                                | the comparison from ChessBase's own pages and the owner's ten photographs, in `competitive-assessment-phase-87.md`                         |
| A licensed, dated, annotated reference corpus (Phase 84, 87)      | a licensing and data-rights question, not code                                       | a licence for such a corpus, or a decision on one  | open packs and fourteen public-domain annotated games; `docs/data/historical-games-audit.md` is the rights process                         |

## 2. Designed, not built

Written up with an architecture and a plan; no code yet.

| Item                                                                                     | Design                                                                        | Notes                                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Companion collections on a volume the user chooses** ("Create in…", "Move to…")        | [`../design/storage-proposal.md`](../design/storage-proposal.md) §5.2, §6, §7 | a registry of collections with volume identity; an unmounted volume reads "unavailable", never "empty"; move = verify at the destination before deleting the source |
| **Selective imports** ("keep games where both players are 2200+", "this player's games") | storage proposal §5.3                                                         | packs already reject on headers (`readGames(file, { accept })`); a collection import has no "keep only…" choice                                                     |
| **The posting layout as the default** for new companion collections                      | storage proposal §5.1                                                         | shipped as opt-in in 1.3.2; the plan is to make it the default after one release on it                                                                              |
| **The full 10,680,708-game month in the posting layout**                                 | `../release-evidence/phase-86/real-scale-10m-postings/`                       | measured at 7,484,400 games (36.37 GB); the whole month (~52 GB, extrapolated) exceeds the disk the owner approved for the test                                     |

## 3. Partly built

| Item                                               | Built                                                                                       | Missing                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| One query model for every search surface (P0.2)    | AST, planner, executor; Library move search, saved queries, the any-of/not editor           | Position, Preparation, reports and companion collections still build their own requests   |
| Query fields                                       | headers, moves, combined groups, saved and rerun with a diff                                | annotation text inside variations; opening/endgame/tactical keys                          |
| An incremental index over authored work (P0.2)     | —                                                                                           | authored-work search walks the stores and reparses Team PGNs each time                    |
| A general job model (P0.3)                         | one list and vocabulary over the analysis queue and deep analysis                           | the two still have separate stores; one shared job record                                 |
| Safe write-back (P0.3, P1)                         | stored evaluations into a chapter as one revision-guarded, undoable batch                   | write-back for other job kinds and targets (games, multi-game analysis)                   |
| Crash drill in one run (P0.3)                      | reload, engine chaos and a walk with faults, each on its own                                | reload, route change, companion restart and an engine crash during the same run           |
| ChessBase preservation (P0.4)                      | a per-field matrix and a loss report per import                                             | Team-related records are "unverified" (no fixture)                                        |
| Reversible entity merge/split (P0.4, P1)           | duplicates, integrity, player aliases                                                       | merge and split with history and undo                                                     |
| Interruption of every maintenance operation (P0.4) | verify-before-delete; interrupted imports finish on next open                               | a recorded forced-kill drill across copy, move, import, export, repair and reindex        |
| Opening Report history (P0.5)                      | population-labelled history from packs                                                      | history from companion databases                                                          |
| Batch departure review (P0.5)                      | batch departure                                                                             | its review queue and one-undo write-back not audited                                      |
| The brief's six workflows, timed (P0.5)            | Phase 85's own six workflows, packaged and browser; the Phase 86 workflow matrix            | the brief's six, timed against a baseline                                                 |
| Repertoire maintenance automation (P1)             | the inbox                                                                                   | running it on a schedule                                                                  |
| Reference data reconciliation (P0.1)               | index answers equal Kingfisher's own linear read                                            | reconciliation against an independent program; an end-to-end check on an annotated corpus |
| Aggregates that say where their games are (P0.1)   | companion sources link to their games                                                       | an audit that every pack surface says it cannot                                           |
| Coach questions (P1)                               | points and timers                                                                           | rubrics and cohort evidence                                                               |
| Evidence packages (P1)                             | shared evaluations keep engine, depth and origin through export and import                  | signing and content addressing                                                            |
| Shortcuts (P1)                                     | fixed shortcuts and a command palette                                                       | remapping                                                                                 |
| Accessibility (P1)                                 | names on 17 routes; visible focus and ≥ 4.5:1 contrast measured on seven pages, both themes | a formal WCAG audit record; the same measurements on every route                          |
| Capability matrix by platform (P0.7)               | browser and macOS in `platform-parity.md`                                                   | a Windows column (blocked with Windows)                                                   |

## 4. Not started

| Item                                                               | Why not yet                                                                              |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| A versioned pack schema keeping per-game facts and postings (P0.1) | packs are aggregates by design; the posting layout is the companion's, not a pack format |
| CTG read or verified conversion (P1)                               | not scheduled                                                                            |
| Direct DGT board capture (P1)                                      | the brief requires user research first                                                   |
| Explainable model-game recommendations (P1)                        | model games are curated and source-linked; no ranking rule has been designed             |
| A Linux / Intel Mac decision (P1)                                  | no documented segment decision                                                           |

## 5. The Phase 87 brief: what was not done

The brief asked for a reassessment against ChessBase, improvements, a
documentation audit and verification
(`docs/reports/phase-87-handover.md`, `competitive-assessment-phase-87.md`).
What it asked for and did not get:

| Item                                                                                                                       | State                                                                                                                                                                                                                      | What would close it                                                                          |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Read the Next.js guides in `node_modules/next/dist/docs/` before writing code (AGENTS.md)                                  | not read in Phase 87                                                                                                                                                                                                       | read them, and check the Phase 87 code against anything they deprecate                       |
| A design pass over every screen                                                                                            | Analysis, Library, Preparation, Databases, Repertoire, Studies and the tool dock were walked and changed; Training, Review, Openings, Players, Settings, Team, Daily, Season and Endgame only had their existing tests run | the same walk — laptop and large windows, light and dark, empty and loaded — over those nine |
| Dark theme across the product                                                                                              | checked on Analysis and Databases                                                                                                                                                                                          | the same check on every route                                                                |
| Keyboard access, visible focus and contrast                                                                                | not re-audited; the existing accessibility tests pass                                                                                                                                                                      | see "Accessibility" in §3                                                                    |
| Workflow W1: does Back to Library keep the list's scroll and the selected row, at a million games?                         | unknown — not tested                                                                                                                                                                                                       | a companion collection of that size, and a test that returns from a game                     |
| Workflow W6: the density of a study's chapter list                                                                         | unknown — not walked                                                                                                                                                                                                       | a study with many chapters, walked at laptop size                                            |
| Backup, restore, import and export walked by hand                                                                          | covered by their existing tests only                                                                                                                                                                                       | a hand walk of each, including a restore into a fresh profile                                |
| The Mac application offline                                                                                                | not exercised in Phase 87                                                                                                                                                                                                  | a packaged walk with the network off                                                         |
| User evaluation of the new layouts — above all the trade-off that the Explorer shows five rows instead of nine at 1280x720 | not done                                                                                                                                                                                                                   | strong players, coaches and seconds using it                                                 |
| Every document read in full                                                                                                | the audit searched all 264 files for what Phase 87 changed and read in full only those it hit (`docs/reports/phase-87-documentation-audit.md`)                                                                             | a full read of the categories marked "not read in full"                                      |
| Which database connection WebKit keeps after a page merely navigates away                                                  | not established (the test now closes the page, which ends it)                                                                                                                                                              | a WebKit trace of `indexedDB.deleteDatabase` with the application's workers listed           |

Decided rather than missing: the sidebar keeps its four groups (the owner's
choice; a Research-first order was tried and reverted), so on a 1280x800
window Databases stays below the fold of the list.

Outside the application's reach: a visitor's own browser may keep the old
favicon in its icon store until it revalidates; the site, the manifest icons
and the offline worker all serve the new mark.

## 6. Verification not repeated after the last changes

Not missing features — runs that were not repeated after the final commits
of Phase 87 (`docs/reports/phase-87-handover.md` §6):

- the whole four-engine browser matrix after the last application changes
  (it ran at `7f23b85`, 1,647/1,648, and its one WebKit failure was fixed in
  `c2d0836`; the database-connection fix, the icon change and the sidebar
  revert came after, and were rerun on the full Chrome suite and on the
  affected specs in all four engines);
- a first launch of 1.3.3 from a real Finder download, through Gatekeeper's
  own sheet — it needs the owner at the machine;
- the eight-hour soak (`npm run desktop:soak -- --duration=8h`), now on 1.3.3.
