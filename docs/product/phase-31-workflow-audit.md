# Phase 31 — Professional Workflow Audit

> Goal: a professional player should move from a question to the right
> Kingfisher surface in one or two interactions. This audit is the work
> Phase 31 is measured against.

The audit was performed on the Phase 30 final commit (`d30aa50`) and the
Phase 30 close-out bridge (`00437f0`) on `feature/pro-workflow-discovery`.
The studio and the local desktop companion were both driven by hand; the
scripted equivalents live under `e2e/surface-contracts.spec.ts`.

## Method

For each question the user asked, the auditor counted:

- **Keystrokes** to type into the search box
- **Clicks** to leave the studio surface
- **Routes** crossed (one per URL change)
- **Context** lost (board position, FEN, orientation, recent work)

`Cmd+K` (the existing command palette) is counted as one keystroke and
one interaction; any _other_ command palette is forbidden — Kingfisher has
exactly one.

## Questions audited

| #   | Question                                       | Today (Phase 30)                                                                | Phase 31 target                |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------ |
| 1   | "What does Carlsen play against the Sicilian?" | Open players → "Carlsen" → click Opening Explorer filter → wait for live source | `Cmd+K` "Carlsen" + Enter      |
| 2   | "Show me my Najdorf repertoire"                | Open repertoire list → filter colour → filter opening tag                       | `Cmd+K` "Najdorf" + Enter      |
| 3   | "Open my latest Najdorf Study"                 | Open studies list → scroll → find the right one → open                          | `Cmd+K` "Najdorf" → Recent     |
| 4   | "Find games in this exact position"            | Position → menu → "Search databases" → choose source                            | `Cmd+K` → Search this position |
| 5   | "What opening is this FEN?"                    | Position setup → paste FEN → resolve                                            | Paste FEN into `Cmd+K`         |
| 6   | "Show Recent Theory here"                      | Position → Theory tab                                                           | Already in `Cmd+K` results     |
| 7   | "Open databases"                               | Click sidebar → Databases                                                       | `Cmd+K` "databases"            |
| 8   | "Create a Study from this position"            | Position → New Study → fill form                                                | `Cmd+K` "new study"            |
| 9   | "Train uncovered repertoire lines"             | Repertoire → Coverage → Train                                                   | `Cmd+K` "train"                |
| 10  | "Run Stockfish MultiPV 5"                      | Engine panel → set MultiPV → Start                                              | `Cmd+K` "multipv 5"            |

## Findings

### 1. The same FEN does not survive a route change

When the user navigates from the position to a Study, the new surface
either loses the FEN or has to copy it from a context prop. Tests that
trace this survive only because they pass FENs explicitly. Phase 30's
`useEnginePositionGuard` already invalidates engine evidence when the
FEN changes; Phase 31 extends that contract: the FEN itself is preserved
along the research back-stack so the user does not have to reconstruct
it.

### 2. The same player name is not searchable across surfaces

The players page and the legends roster each carry their own
search-style list. They use different field names and a different
ranking. Phase 31 indexes players once and serves them from the same
provider to every surface that needs a player.

### 3. A FEN pasted into the wrong place is silently dropped

The study search bar, the database filter, the repertoire label editor
and the engine panel all reject a FEN differently — some store it in
free text, some throw, some show a generic error. Phase 31 makes the
command palette a single front door with one parser, so a FEN is always
recognised and always offers a useful action.

### 4. Recent Work does not restore position or cursor

`RecentWorkspace` shows the resource title, the type and a timestamp.
It does not restore the move cursor inside a Study chapter, the engine
analysis, or the orientation. The user is asked to find the chapter
they were on. Phase 31 preserves the last position when a study /
repertoire / game is reopened, without restoring a failed engine
search or a half-typed form.

### 5. There is no shared "Open in …" vocabulary

The Study tab, the Repertoire page, the Explorer and the Analysis
surface each implement their own "Open in Study" / "Add to repertoire"
buttons, with subtly different labels and different modal flows. The
brief asks for one action model. Phase 31 introduces
`features/actions`, a small registry where every action declares an
`id`, a `label`, a `shortcut`, an `availability` predicate, and an
`execute(context)`. Surfaces use the registry; they do not invent
their own buttons.

### 6. The command palette does not search the user's own data

Phase 30's palette already crosses studies, games, repertoire and
databases. It does not, however, return openings or players as a
"result", only as the _target_ of a study or a game. Phase 31 adds
opening and player providers, with the same ranking and the same
grouping, so `Cmd+K` "Carlsen" returns Carlsen the player and "Open
in Explorer" is one Enter away.

### 7. The pin / continue affordance is half-finished

Pinning works. Continue is implemented as a single "last thing" pointer
plus a small list. It does not say which chapter, which move, or which
position. Phase 31 surfaces the chapter, the move and the time-to-live
on the Continue card.

### 8. FEN strings are not bounded

A 20 MB paste into a search box is currently possible; the providers
either OOM or silently truncate. Phase 31 adds a hard length limit with
a helpful message and a pointer to the PGN import.

## What Phase 31 will change

- **One keystroke** to reach any of the audited questions.
- **One parser** for FEN, move sequence, opening text, command
  syntax — bound by the same length limit.
- **One result shape** — `(group, identity, primary action, secondary
actions)` — across all providers.
- **One action registry** — surfaces no longer invent buttons.
- **One back-stack** — the FEN survives every navigation that the
  user did not explicitly clear.
- **One set of empty states** — every primary surface answers the
  same three questions: _what is this, why use it, what next_.

## What Phase 31 will not change

- The board remains the primary surface.
- The command palette is the only command surface; no second one is
  introduced.
- Streaming, persistence, reference, packaging, engines, databases
  all stay the way Phase 30 left them. Universal Search is a thin
  layer on top, not a rewrite of the underlying data model.
