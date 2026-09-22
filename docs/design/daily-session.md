# The daily session — fifteen minutes, only your own material

> Research → decisions → design. The format is the one `team-hub.md` and
> `team-preparation.md` established; the gap is in §6 "Later — leading" of
> `docs/product/market-research.md`.

## 1. Research

The trainers' honest weakness is our honest weakness too. §3.3 quotes it
directly: "preparation stops at move ten to fifteen; what fails after that
is calculation". §5 lists the trainers' complaint stack — move-order
flexibility, deviation detection, a trainer that knows your own lines — and
the only existing answer with every one of those is a paid product that
gives itself a star on every card.

§5's other line is the relevant one for what is built here: "Kingfisher has
Calculation and Training; neither is yet a daily habit the way a tactics
trainer is. That is a later leap, not a parity item." This document is the
design for that leap.

§6 names the only piece of it that fits the brief's other half:
**rehearsal with spaced repetition on the game-day sheet**. The Phase 76
round brief is the sheet (it is exported as HTML, it is what a coach hands
back). What it does not yet do is rehearse with the player before the
round. This design adds that rehearsal — and only that rehearsal — as the
daily session.

Three pieces of §3 sit underneath this design, in order of how loud they are:

- "How many times I made a particular mistake" (Lichess-Weak, 64Squares) —
  a daily session can only answer that if it is built from facts that already
  exist; an invented streak is not a count.
- The trainers that stop at move fifteen and what fails after that being
  calculation — the daily session is the only place a product can speak to
  the *whole* fifteen-minute window, from repertoire through critical
  positions to endgames, without inventing a separate flow for each.
- The dislike of labels (Chess.com-Brilliant, Chess.com-Wrong) — a session
  that grades itself with invented streaks and invented ratings will sit in
  the same complaint file. The session must end with a count of what was
  attempted and a description of each attempt in the player's own
  vocabulary, never with a generated score.

What is **not** in scope, and is named so the next leap is clear:

- A web or push reminder to "do today's session". Kingfisher has no
  account, no cloud and no notification channel; a daily habit that needs a
  reminder from someone else's server is not a local-first product.
- A streak or rating-gain chart. Anything that scores an attempt by an
  invented number is the kind of label §3.4 lists. The session records what
  was attempted and what grade the player chose; the chart, if any, is the
  player's own later reading.
- An "AI coach" voice or summary. Generation is not fact and §3.4's
  complaint file is already long.

## 2. Decisions

### 2.1 The session is a workspace (`/daily`), not a modal

A modal blocks the workspace and removes the board's context. The session
needs the board (it asks the player to attempt a move), the analysis tree
(it records where the player's move left theory), and the queue header
(it shows what is left). The session is a `/daily` route, sitting in the
navigation like every other workspace, with its own header and its own
board.

Reasonable alternatives, and why they are not this:

- A dialog from `/review` or `/preparation`. It would reuse the workspace
  behind it, but a session that the user can dismiss with Escape is not a
  session they will return to.
- A scheduler task on the engine. The engine runs evaluation, not
  rehearsal; the player's attempt is the part a scheduler cannot grade.

### 2.2 Built only from the player's own material, never invented

The session is composed of four slices, each one already a store:

1. **Repertoire cards** — the `own` positions in `RepertoirePositionRecord`
   that are due under the same SM-2 schedule that `review/scheduling.ts`
   uses. There is no separate "repertoire review" schedule; the brief is
   that *any* due position is one the player should be able to find a
   move in.
2. **Critical positions as calculation prompts** — review items that are
   due under `dueReviews(...)`. The session uses them as calculation
   prompts: the player thinks on the position for at most thirty seconds
   and writes their reasoning, then the actual move from the tree is
   shown for comparison.
3. **One endgame from your own structures** — a random pick from the
   player's saved `EndgamePositionRecord`s. The session shows the
   position, the category the player chose and the goal, and asks the
   player to find the tablebase move. The result is graded by the
   tablebase, not by Kingfisher's judgement.
4. **The game-day sheet to rehearse** — the most recent `BriefRecord` if
   one exists for an upcoming round in the active event, otherwise the
   most recent completed round's brief. The session shows the opponent,
   the colour and three positions from the brief the player chose to
   remember; the player attempts the move and is told whether it
   matched.

Nothing else. No "today's tactic", no random training card outside the
rehearsal scope, no pull from a reference pack.

### 2.3 "Rehearsed" comes only from a real attempt

A "rehearsed" status is recorded against each item only after the player
made an attempt — a click on a candidate move, a typed move, or an
explicit "Skip" with a reason. The session never counts an unattempted
position as rehearsed, and the headline at the top of the workspace says
so in plain English: *"4 due, 2 rehearsed"*, not *"4 due, 50% done"*.

The graded outcome is the player's own grade on the existing scale —
the same four-button scale (`again` / `hard` / `good` / `easy`) that the
training workspace uses, with the same intervals and the same
`scheduleAfterReview` call. A rehearsal that is graded `again` schedules
the position for the same day, not for next week; a rehearsal that is
graded `easy` schedules it for the week after the existing
`intervalDays`. The schedule is honest because it is the same scheduler
the player already trusts in `/review`.

### 2.4 Reachable in one click from the header, one hit from the palette

The header's "Daily" tile shows today's session status — *"3 due, 1
rehearsed"*, *"15 minutes, 4 positions"*, *"Today: 2 of 4"* — and is
clickable. The palette command is "Open today's session" and lands on
the same URL. The URL carries no state: the session is rebuilt from the
stores every time, because what is due is what is due.

### 2.5 No cloud, no streak, no invented score

The session reads `Date.now()` for "today". The session grades with the
player's own grade. The session records the rehearsal as one write per
item to the existing `ReviewItemRecord.schedule` / `TrainingItemRecord.schedule`
/ `RepertoirePositionRecord.schedule`. There is no separate "daily session"
store, because the rehearsal *is* a graded review and the existing
schedule is the audit trail. There is no "streak" because the player can
miss a day and the schedule catches up; the headline just says *"Last
rehearsed 3 days ago"*.

### 2.6 Out of scope by design

- A streak counter, a "you've practised N days in a row" badge, a
  rating-gain estimate, a "personal best", or any invented score.
- A reminder, push notification, email summary, or "your daily session
  is ready" message. Kingfisher has no delivery channel and the brief
  says no cloud account.
- An "AI summary" of the session — the count of attempts and the
  player's own grade buttons are the summary.
- A "share my session" feature. Sharing a private rehearsal is a leak
  the user did not authorise; the existing `BriefRecord` HTML export is
  for the sheet, which is by definition shareable with a coach.

## 3. Design

### 3.1 The route

`/daily` — same `AppShell` wrapper as every other workspace, same
`WorkspaceFrame`, same header structure. The page reads no URL parameter;
the session is recomputed from the stores on every mount. A `data-daily`
attribute on the root element exposes the session to the e2e spec.

### 3.2 The header

The header carries a single piece of meta: *"15 minutes · 4 positions · 2
rehearsed"*. The duration is computed from the slice counts (a repertoire
card is one minute, a critical position is two, an endgame is two, a brief
rehearsal is one per position; the minimum is two minutes). The position
count is the total across slices. The rehearsed count is the count of
items already graded in this session.

The action row has two buttons: **"Resume"** if a previous session was
interrupted (a slice is in flight), **"Start"** otherwise. Both open the
session for editing; the rehearsal state is not lost.

### 3.3 The slices, in order

The session is four slices, each rendered as a section with the same
shape: a heading, a list of positions, an empty state that names what
would be there, and a "Skip" affordance. The order is fixed:

1. **Repertoire** — the due `own` positions from any repertoire, sorted
   by `dueAt`. The card shows the position and the first move the player
   recorded. The player is asked to find that move; the existing
   `BestMove`-style answer board is reused.
2. **Critical positions** — the due `ReviewItemRecord`s. The card shows
   the position with evaluation hidden (concealed by the workspace
   capability) and asks for the move; on reveal, the actual move from the
   source game is shown.
3. **Endgame** — one position, picked with a deterministic seeded shuffle
   so the player sees a different position each session without ever
   getting the same position twice in a row. The card shows the position,
   the category the player chose and the goal. The reveal is the
   tablebase move.
4. **Brief rehearsal** — the most recent `BriefRecord`. If there is no
   upcoming round, the most recent completed one. The card shows the
   position, the opponent's colour, and the engine line; the player's
   attempt is checked against the candidate moves in the brief.

A slice may be empty. The empty state names the data the player would
need to add to make the slice non-empty:

- *"No repertoire cards due. Mark positions as your move in any
  repertoire to start."*
- *"No critical positions due. Tag a position as critical in any review
  to start."*
- *"No saved endgame positions. Save a position from the position
  actions menu."*
- *"No round brief to rehearse. Build one for an upcoming round in
  /preparation."*

### 3.4 The grading buttons

For each slice the player is shown the four buttons in the same order and
with the same wording as `/review` — `Again`, `Hard`, `Good`, `Easy`.
Clicking any of them writes a `ReviewGrade` against the item's existing
schedule. The "Skip" affordance records a non-attempt and leaves the
schedule alone.

The button labels preview the interval that each grade will schedule, the
way the existing review queue does. The preview reads from
`previewGrades(schedule, now)` — same module, same numbers.

### 3.5 The state

The session is a single record held in the `usePreferencesStore`'s
transient state (the same store the workspace frame reads for
`recentTabs` and `lastRoute`). The record is not written to durable
storage: closing the tab does not preserve it, because the schedule
itself is the durable record of what was rehearsed. The transient
record exists only so a refresh during the session does not lose the
in-flight slice.

```typescript
interface DailySessionState {
  readonly startedAt: number;
  readonly slice: 'repertoire' | 'critical' | 'endgame' | 'brief' | null;
  readonly itemId: string | null;
  readonly revealed: boolean;
  readonly attempt: { readonly uci: Uci } | null;
  readonly graded: ReadonlySet<string>;
}
```

The slice is `"null"` when no item is in flight. Reveal sets
`revealed = true` but does not grade. Grading clears `slice` and
`itemId` and adds the item id to `graded`.

### 3.6 The reader

`src/daily/session.ts` is the pure module that builds a session from the
stores. The tests assert:

- A `own` position in `RepertoirePositionRecord` whose schedule is due is
  in the session; one whose schedule is *not* due is not.
- A `ReviewItemRecord` whose schedule is due is in the critical-positions
  slice; one without a schedule (the default for new items) is **not**,
  because reviewing a position once and never returning is the player's
  deliberate choice and the schedule honours it (`scheduleAfterReview(…
  'never')`).
- A saved `EndgamePositionRecord` whose `pieceCount ≤ 7` (the Syzygi
  cutoff) is eligible for the endgame slice; one with `pieceCount ≥ 8`
  is not, because the tablebase cannot answer it and the rehearsal would
  be guessing.
- The brief slice uses the most recent `BriefRecord` whose `game.event`
  is in the player's upcoming events, otherwise the most recent
  completed round.
- The session total is the sum of the four slice counts.
- Each test mutates one input (a missing schedule, a too-large endgame,
  an empty brief) and the test fails for that case.

### 3.7 The endgame shuffle

The seeded shuffle uses `positionKey` as the seed so the day's pick is
deterministic per player per position; the second seed is
`floor(now / DAY_MS)`, so a new position is in scope each day but
revisiting the route the same day shows the same position. The shuffle
selects from the eligible saved positions only; if the slice is empty, the
empty state explains why.

### 3.8 Concealment

The session is a workspace; the board it opens uses the standard
`CanonicalBoardSurface` capability contract. Critical-position cards are
`conceal: true` (the same setting `/review` uses), so the player does
not see the evaluation or the engine arrow. Repertoire, endgame and
brief cards are `conceal: false` — they are open by construction, the
position is the question.

### 3.9 The audit trail

Each grading click is one write: `scheduleAfterReview(schedule, grade,
now)` followed by the repository update. The repositories are
`ReviewItemRepository`, `TrainingItemRepository`,
`RepertoireRepository` and the brief is read-only (a rehearsal against
the brief grades the *position*, not the brief, so the brief itself is
not updated). The audit trail a coach or the player can read later is
exactly the schedule on each item, no separate "daily session history"
store.

## 4. Acceptance criteria

1. A pure module builds the session from the four stores; unit tests fail
   when a due item is missing, when a non-due item appears, when an
   8-piece endgame is treated as tablebase-eligible, or when the brief
   picks a completed round over an upcoming one.
2. The `/daily` route is reachable from the header and the palette, both
   with the same title.
3. The session header shows `15 minutes · N positions · M rehearsed`
   where N and M are read from the live state.
4. Clicking a grade button writes to the underlying schedule; the same
   item opened in `/review` shows the new schedule.
5. Concealment is enforced by the standard capability contract; a
   critical-position card has no evaluation visible until reveal.
6. No invented score, streak or rating-gain claim is reachable from any
   string the workspace renders.
7. The session is durable only in the schedules it writes; closing the
   tab does not preserve the in-flight slice, but does preserve the
   rehearsed count via the schedules.
8. The "Open position page" entry from Phase 77 is reachable from every
   card's board, with the same conceal rules as `/analysis`.
9. A browser spec walks the session end-to-end on a seeded dataset:
   starts the session, attempts one of each slice, grades them all, and
   confirms the header updates.

## 5. Files

- `src/daily/session.ts` — pure module; tests in
  `src/daily/session.test.ts`.
- `src/daily/DailyWorkspace.tsx` — workspace frame.
- `src/app/daily/page.tsx` — route.
- `src/stores/daily-session-store.ts` — transient slice state.
- `e2e/daily-session.spec.ts` — browser walk.

## 6. Out of scope (re-stated)

- Streaks, rating-gain, "personal best", invented scores.
- Reminders, push notifications, email, any delivery channel.
- "AI summary" prose; the count and the player's own grade buttons are
  the summary.
- A new authored store. The schedules on the existing records are the
  audit trail.
- A "share my session" feature. Sharing a rehearsal is a leak the user
  did not authorise.