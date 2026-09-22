# Continue Kingfisher from master — the season, the mistakes, the overnight tree

> **Status (2026-09-22): done.** The season (Phase 79) and recurring facts
> (Phase 80) shipped and are live at `9c7e1b7`. The session close, the
> remaining browser failure and what comes next are in
> `docs/reports/phase-80-handover.md` §6. A new session starts from there.

You are picking up Kingfisher at commit `e8ca15d` on `master`, sixteen commits
ahead of `origin/master`'s old `9c39de0`. Read, in this order:

1. **The previous handover**: `docs/reports/phase-75-handover.md`, then
   `git log --oneline -30` to see Phases 76–78 (preparation/surprise finder
   - brief HTML, position page, daily session) and the small Phase 78 follow-up
     that centred the team page's empty-state buttons. Verify with
     `git rev-parse HEAD origin/master` and `git status` before editing.
2. **The market research**: `docs/product/market-research.md` in full —
   §3 (what people complain about, with sources), §4 (the 20-row table — the
   brief), §5 (the strategy in three lines), §6 "Later — leading" (the open
   list). Update §4's "Kingfisher" column to reflect what Phase 77 and
   Phase 78 add before you plan anything. The table is the brief, and it must
   stay true.
3. **The two designs already written**: `docs/design/position-page.md` and
   `docs/design/daily-session.md`. Then the recent reader
   (`src/daily/session.ts`, 22 unit tests) and the workspace
   (`src/features/daily/DailyWorkspace.tsx`).

## Goal, in one sentence

**Be better than ChessBase.** §5 of the research puts it in three lines:
ChessBase's complaints are crashes, a 1999 UI, Windows, price and support;
everyone else's complaints are silos; the trainers stop at move fifteen and
what fails after that is calculation. Everything below is one of those three
turned into a feature.

## Where the gaps are

§6 "Later — leading" names five. Two are partly in: the surprise finder is
Phase 76, the daily session is Phase 78 (reader + workspace + route; the
e2e spec in `e2e/daily-session.spec.ts` needs a seed-then-route wait fix on
follow-up — _not in this session's scope_, leave it alone). The other three
are open, and the original prompt asked for them before Phase 78:

- **The season** — `After the round` reads one game; a season reader reads
  every game you played, with named denominators.
- **Recurring mistakes as facts** — the Improvement view counts themes you
  tagged; add what engine evidence and structure keys can count without a
  model.
- **The overnight tree** — deepen a repertoire or study tree while idle
  into a persistent evaluation store keyed by position; a morning report
  of what changed.

Build **the season** and **recurring mistakes** in this session, in that
order. Each is designed in `docs/design/<name>.md` before code. Each is a
phase with its own handover. Each one closes a real complaint from §3 of
the research, not a feature for its own sake.

### 4. The season — the time the year cost

`After the round` already reads the clock section of a single game: think
time by phase (opening / middlegame / endgame), by move number, the
positions you spent longest on, time trouble per event, with denominators
("4 of your 18 games this season had you under 30 seconds on move 30").
This feature extends that to a season, per named set of games, with
OTB / Lichess / Chess.com never merged.

What it is:

- A season reader at `/season` (or as a tab in the Review workspace — pick
  one and say why in the design) that joins every game in a named set:
  "Club Open 2026", "Last 90 days", "Lichess rapid", "OTB classical". A
  named set is never a tag the player cannot reach by name.
- Five sections in one reading order, each with a denominator:
  1. **Per phase** — total think time and average think time per move,
     broken into opening / middlegame / endgame by move number
     (configurable threshold, default 12 / 30).
  2. **Per move number** — a sparkline of think time per move, with the
     bars highlighted when they crossed into your time trouble
     threshold (configurable, default under 30 s remaining).
  3. **The positions you spent longest on** — top N positions by total
     think time across all games, with "what happened next" for each
     (move that followed, eval change, result). Position-keyed, so the
     position page (Phase 77) is the natural deep-dive.
  4. **Time trouble per event** — how many games in each named set had
     you under threshold on move 30 / 35 / 40, with the same denominator
     surfaced in words ("4 of 18 this season").
  5. **Your slowest openings** — openings where the average clock after
     move 15 was the lowest; each row opens the dossier for that colour
     so the player can rehearse it. From the dossier, not invented.
- A control to pick a named set. The named sets are facts (an event
  field on a game) — the player can add their own by tagging or by
  picking a date range; never by typing a free-form label that
  fragments identity.
- A "When did this change?" line on each section that points to the
  earliest season in which the trend started. A trend that has been
  constant is not a complaint the player can act on.

Pure: a `season.ts` reader whose inputs are `readonly GameRecord[]` and a
named-set predicate, and whose outputs are the five sections. Tests fail
when a game is double-counted across sections, when the denominators
disagree, when the time-trouble threshold is silently crossed, and when
the OTB and Lichess games are merged into one bucket.

### 5. Recurring mistakes — facts, not labels

The Improvement view in `/review` already counts themes you tagged. Add
what engine evidence and structure keys can count without a model —
the Improvement view's "Improvement" tab is what this feature
extends, not a separate page.

What it is:

- A "What the engine flagged" section: positions in your named sets
  where the evaluation dropped ≥ a threshold (configurable, default
  −1.0) between the position you played and the position you reached
  one ply later — across all your games, with the games they came
  from as the row entries. Each row opens the position page
  (Phase 77), which already joins stored evidence, so the player sees
  the engine's PV line beside the position they played.
- A "What the same structure lost" section: positions reachable by
  pawn-structure key (the `skeleton` already used by position search)
  where your record across all games is below 50% in named sets of
  ≥ 5 games. The row says "Bishop on c1, pawn on d6 — 3 of your 8
  games in the King's Indian, 1 win". Each row opens the games it
  came from, not a label.
- A "What this endgame type lost" section: positions in named
  endgame categories (the existing `EndgameCategory` enum —
  `rook` / `queen` / `minor-piece` / `pawn` / `fortress` /
  `technical-conversion` / `defensive-study`) where your record across
  games reaching that category is below 50%, with the games they came
  from as the row entries.
- A "What this opening left" section: positions in your repertoires
  where your record across games that reached them is below 50%, with
  the games they came from. Position-keyed, so the row opens the
  position page.

The headline says "4 facts in your games this season, none of them
labeled 'style'". Each row is a fact with a denominator; none of them
is an invented classification. §3.4 and §3.5 of the research list
exactly the labels the player distrusts — this feature is the
structural answer.

Pure: a `recurring.ts` reader whose inputs are `readonly GameRecord[]`,
the engine evidence store, and the structure keys, and whose outputs
are the four sections. Tests fail when a game is double-counted, when
a section is shown without a denominator, when the engine threshold is
silently crossed, and when a row has no games to back it up.

### After these two

Pick up from where this session ends. The "Later — leading" list in §6
still has the overnight tree, the importers, the academy's morning,
the landing comparison, the remote companion and the structured
tournament brief — each designed before it is built, each a phase with
its own handover, each one a §3 complaint turned into a §5 product.

## Working rules

- **Per feature**: design in `docs/design/<name>.md` first (research →
  decisions → design, as `team-hub.md` and `team-preparation.md`
  established). Then unit tests for every pure module (mutate the
  implementation once and watch the test fail). Then code. Then
  targeted e2e. Do not run the full e2e suite per feature; run it at
  milestones (every 3–4 features) and at the end.
- **No version bump, no Mac or Windows release, no notarisation during
  the session**; postpone section B. Record each Mac-facing change in
  the "Published revision check" of `docs/product/platform-parity.md`
  as you go.
- **At the very end**: `docs/operations/after-a-fix.md`, every step of
  section A, then section B for the next release, and the five
  answers with proof. Handover under `docs/reports/`.
- **Commit after each feature with a message that says why**; keep
  `CHANGELOG.md` ("## Unreleased (web)"), `docs/product/features.md`,
  `ARCHITECTURE.md`'s schema history, `docs/README.md` and
  `market-research.md` §4 true as you go.
- **Tell me the situation occasionally**: a short status after each
  feature — what shipped, what was run, what's next. Not a running
  commentary.
- **Evidence, not assertion**. Never write "verified" for anything
  not run; name exactly what could not be run.
- **Fix the UI issues you encounter on the way.** `team-hub.md`,
  `team-preparation.md` and the layouts they define are the reference;
  anything that drifts from them (the team page's empty-state buttons
  were a small one, fixed in Phase 78 follow-up) gets fixed as you
  pass it.

## Environment (also in memory)

Node 24 first on PATH (`export PATH="$HOME/.nvm/versions/node/v24.14.0/bin:$PATH"`;
Node 20 fails the companion suites on `node:sqlite`). The full e2e suite
takes ~20 min; run it detached with an exit marker; never two Playwright
runs at once. `source ~/.kingfisher-release/env.sh` gives `VERCEL_TOKEN` for
`deploy:status` and the Apple credentials — never print them.
`globalThis.__kingfisher` exposes the repositories in dev for e2e setup.
Profile aliases match exactly as the games index matches them; Kingfisher
never guesses which player is you. The header's action row is invisible
until `data-header-measured` is set — wait for it in specs before clicking
a route action.

## Out of scope (re-stated)

- A streak or rating-gain chart anywhere; anything that scores an
  attempt by an invented number. §3.4 and §3.5 list the labels the
  player distrusts — repeat them in the design and the headline.
- Anything needing a cloud account or telemetry; remote delivery is
  the packet file (`docs/design/team-preparation.md`), the coach
  hands it over.
- A separate "daily session history" store; the schedule on the
  existing records is the audit trail.
- A separate "improvement" database; the engine evidence store
  and the structure keys are the inputs.
- Re-running the daily session e2e spec in this session; it is left
  here from Phase 78 as the next clean-up, not part of the season or
  the recurring mistakes.
