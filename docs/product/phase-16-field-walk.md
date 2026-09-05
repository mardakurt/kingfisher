# Phase 16 field walk — using every route by hand

Walked on 5 September 2026 against the running application at 1280×720,
1366×768, 1440×900 and 1920×1080, plus a narrow width. This records what using
the product turned up that the tests did not. Findings only — a route that was
fine gets one line saying so, not a paragraph of praise.

## Findings

| Route             | Task                             | Issue                                                                                                                                            | Severity          | Fix                                                                                    | Verified            |
| ----------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | -------------------------------------------------------------------------------------- | ------------------- |
| all (status line) | play 1.e4 e5, read where you are | Reads "White to play — move 1" when White is about to play move **2**. Wrong on every White turn.                                                | **High**          | `ed4b831` — number the move about to be played, not the one just made                  | ✅ unit test + live |
| `/analysis`       | resize an already-open window    | Not a defect, but nothing covered it: the viewport matrix sets a size and _then_ loads, so a stale board on resize would have shipped unnoticed. | Medium (coverage) | `ed4b831` — e2e resizes a loaded page and asserts the board tracks it, both directions | ✅ passes           |

## Routes walked, and what they do on arrival

Every route below was loaded, read, and checked for horizontal overflow at all
four widths. **No route scrolls sideways at any width.**

| Route            | State on arrival                                                                                                                     | Verdict                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| `/recent`        | "Kingfisher is ready. Nothing to continue yet."                                                                                      | fine                     |
| `/analysis`      | Board, engine dock, move tree, explorer. Engine reaches depth 28/43 on demand.                                                       | fine after the fix above |
| `/openings`      | Named openings with search; 12 kB of content on arrival.                                                                             | fine                     |
| `/opening-files` | "A file is a subject — 'Black vs 1.e4, Najdorf' — and everything already stored about it. It holds references, never copies."        | fine                     |
| `/studies`       | "Notebooks of chapters…" with a create action.                                                                                       | fine                     |
| `/repertoire`    | "No repertoire yet. Create one here, then add a line from Analysis. Positions reached by transposition will converge automatically." | fine                     |
| `/preparation`   | Session controls, opponent side, date/Elo/ECO/result filters, "Search an opponent."                                                  | fine                     |
| `/players`       | "12,589 players from 1 installed source, plus the historical roster", with Top 100 / champions / historical filters.                 | fine                     |
| `/games`         | "No games imported… Every game is indexed by position, so the explorer can tell you what you actually play."                         | fine                     |
| `/databases`     | Collections, source sets, connections, New collection / Import PGN.                                                                  | fine                     |
| `/review`        | Evidence Hidden/Visible toggle, queue, "Nothing waiting. Mark a position…"                                                           | fine                     |
| `/training`      | Due / New / Learning / Mature counters, "Create one from a game, study, repertoire, or the current analysis position."               | fine                     |
| `/endgame`       | "32 pieces on the board", category filters, "Set up an endgame on the board — or…"                                                   | fine                     |
| `/model-game`    | Loads; board present.                                                                                                                | fine                     |
| Settings         | Sections reachable and searchable (covered by `e2e/phase10.spec.ts` §17).                                                            | fine                     |

## On the empty states

Worth recording because it is the thing most often done badly and is done well
here: every empty state in this product says what to do next and why, rather
than announcing that a list is empty. `/games` explains _why_ importing matters
("every game is indexed by position"); `/repertoire` explains that
transpositions converge on their own; `/opening-files` defines what a file even
is. None of them needed a finding.

## One thing that was checked and was not a bug

At 1280×720 the board appeared to keep a size from a previous, larger window —
which would have been a real workstation defect, since people maximise windows.
It reproduced consistently in the embedded browser used for this walk.

It is not a product defect. A `ResizeObserver` installed by hand on the same
container never received even the initial callback that `observe()` is required
to deliver, which means resize observation was not being delivered in that
embedded context at all. Driven by Playwright, where viewport changes do deliver,
the board tracks the window in both directions and stays square and inside its
container — which is what the new e2e test now asserts on every run.

Recorded here because "I could not reproduce it with better tooling" is a
result, and because the next person to see it in an embedded preview should not
spend the afternoon on it again.

## Not covered by this walk

- Long editing sessions. A walk finds layout and wording; it does not find what
  breaks after two hours. `e2e/soak.spec.ts` covers that separately.
- Real online accounts. Lichess sign-in needs a consent step this walk had no
  way to give; those routes were exercised against fixtures.
