# Phase 52 handover — 2026-09-14

The owner used 1.1.4 and wrote twelve numbered enhancements, in no order,
asking that they be ordered before being built. This phase reproduced each
on the running application, ordered them by dependency, closed all twelve,
ran the after-a-fix checklist in full, and shipped 1.1.5. The user-facing
wording is the 1.1.5 entry in `CHANGELOG.md`; the maintainer's reasoning is
in the code and summarised here.

## Starting HEAD and ending HEAD

- **Starting HEAD:** `374bc74` — docs: Phase 51 handover records the 1.1.4
  update, deploy and public verification. Clean tree, HEAD = origin/master.
- **Ending HEAD:** recorded in the final section.

## The order, and why

A hydration failure found while probing the routes for item 12 went first:
`EngineSelect` rendered a platform note on the client that the server had
not, React threw the whole tree away on every visit to Analysis, and any
measurement taken on a page in that state would have been a measurement of
the failure. It also turned out to be the cause of item 5.

Items 1, 4 and 3 are one file cluster under the board (the bar, the graph
and the controls strip in `CanonicalBoardSurface`), so they went together,
the bar first because the graph draws the same numbers. Item 7 (Review)
touches the shared frame and the board's move input, so it came before any
visual work; then the small settings items 9 and 11; then 10 (piece sets),
which had to land before any visual baseline. Item 8 (the data rebuild) is
a forty-minute download, so it ran in the background while 6 was built on
top of it — the sparring partner plays from exactly the games 8 enlarged.
The desktop-only items 2 and 5 came after the web items because they are
verified against a packaged build, made once at the end. Item 12 was last
because it is the check on everything above.

| #   | Report                                          | What was actually wrong                                                                                                                                                                                                                                          | Fix                                                                                                                                                                                                           |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12a | (found) Analysis fails hydration                | `EngineSelect` read `navigator.userAgent` during render; the server rendered no platform note, the client did, React regenerated the root on the client                                                                                                          | `useSyncExternalStore` with a null server snapshot                                                                                                                                                            |
| 1   | eval bar wrong, wants a number                  | Nine-pixel label in an eighteen-pixel column clipped "+0.38" to "+0."; a move on the board stopped the engine and blanked the bar, so every position had to be restarted by hand                                                                                 | 32px bar, 10px figure that fits (29.2 of 30px measured), depth and engine in the title; a running engine follows the board (`followBoard`, five store tests); concealing workspaces switch it off             |
| 4   | graph under the board looks corrupt, Mac only   | One evaluated ply was one block of colour across the whole strip, untitled; the Mac game had stored evaluations and the web game had none                                                                                                                        | scaled to ≥40 plies, titled, captioned "N of M plies analysed", White/Black labels                                                                                                                            |
| 3   | reset move tree not findable                    | In three menus, none obvious                                                                                                                                                                                                                                     | a button beside the move controls, disabled when there is nothing to clear, toast names ⌘Z                                                                                                                    |
| 7   | Review dock text at the edge, second board      | `PanelBody` with no padding; a 210px `AnswerBoard` in the dock for candidates; and a concealed board accepted no moves at all (`showLegalHints` emptied the destinations)                                                                                        | padded; candidates recorded on the canonical board through `board-move-capture`, drawn back as arrows; `legalHints` prop separates the dots from the input                                                    |
| 9   | annotation colours change nothing               | The palette repainted only the four brushes; a person who draws no arrows saw nothing                                                                                                                                                                            | Okabe–Ito block also sets `--positive/--negative/--caution`; move quality painted through those tokens; live preview in Settings; e2e asserts the verdict tokens change                                       |
| 11  | owner's name in Settings → Profile              | The placeholder                                                                                                                                                                                                                                                  | a world champion's                                                                                                                                                                                            |
| 10  | more serious piece sets                         | Of ten sets, three tournament-grade; the sets strong players use most are non-commercial or unlicensed                                                                                                                                                           | Pirouetti (AGPL-3.0+), Kryukov (GPL-2.0+, GNOME Chess "fancy"), Sophia (W3C, GNOME Chess "simple"), byte-identical, calibrated by `pieces:measure`, licences recorded                                         |
| 8   | more games per player, not huge                 | Stored scores capped at 2600+ and 120 a player                                                                                                                                                                                                                   | starter pack v3: 2500+ (and GM/IM v GM/IM), 200 a player, through 2026-08 — 27,521 openable (from 10,707), 18.5 MB (from 12.3)                                                                                |
| 6   | a companion that plays like the player          | —                                                                                                                                                                                                                                                                | `src/preparation/sparring.ts` + a Sparring dock tool: their own moves, weighted by frequency and labelled with the count, while the position is in their games; the engine after, labelled; on the main board |
| 5   | traffic lights over the mark, not in fullscreen | On launches where hydration failed (12a), React reset the singleton `<html>` and dropped the bootstrap's `--mac-titlebar-safe-*` and `data-titlebar`; nothing restated them. Measured on the installed 1.1.4: `data-titlebar` null, safe width 0px, mark at x=14 | `useDesktop` restates the chrome in an effect; a new e2e stubs the bridge past the bootstrap and asserts the effect alone reserves the corner; fails with the effect removed                                  |
| 2   | update dialog is a changelog in a box           | The whole release body in a 168px scroll box inside a 206px window                                                                                                                                                                                               | three single-line highlights and a "Full release notes…" link; 400×264; the dialog harness feeds a fourteen-bullet body to every state                                                                        |
| 12  | all sections work, Recent completely            | Every route loaded with zero console errors after 12a; every Recent action followed (six quick actions, first-run buttons, the two that open Settings sections)                                                                                                  | the sweep is in the Verification section                                                                                                                                                                      |

## Verification

Every claim below is a command that was run in this session, with its
result.
