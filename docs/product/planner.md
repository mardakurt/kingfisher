# Planner — a tournament-and-study schedule inside Kingfisher

> **Status: idea only.** This document records the concept so it is not
> forgotten between sessions. No code, no schedule, no commitments.

## The shape

A planner is a separate workspace — the same kind of "I live in the
sidebar" page that Analysis, Repertoire and Training are — that helps
a chess player organise two things side by side:

1. **Tournament calendar.** Upcoming tournaments the player has
   entered or is considering. Each event holds the date, the format
   (rapid / classical / blitz), the time control, the venue or
   platform, the section, and any prep notes ("I have not played the
   Najdorf in three weeks").

2. **Study schedule.** The counterweight to the tournament side. What
   to work on between events: the opening file to finish, the
   endgame type to drill, the review session to clear. The planner
   knows which tournament is next and surfaces the prep the player
   has not done yet for it — "you have a classical game in 9 days
   and the Sicilian file is at 40%".

The two halves share a single timeline. The player opens the planner
the way they open Repertoire: a board on the right, the schedule on
the left. Selecting a tournament shows the prep gap; selecting a
study session shows the position it came from and the next session's
focus.

## Why it is a Kingfisher feature

Kingfisher already owns the inputs a planner needs:

- The study set (Training knows every position the player has
  reviewed; Repertoire knows every line the player has committed to;
  Position Report knows the themes the player has covered).
- The tournament side (Players knows every linked account; Lichess /
  Chess.com sync can pull upcoming tournaments a player has joined).
- The current focus (the sidebar knows the workspace the player was
  in last).

So the planner is mostly a new face on existing data — a calendar
view, a per-event gap report, and a "tomorrow I am playing, what
should I touch up tonight" lane. Not a new engine.

## What it is not

- Not a chess engine. The planner uses engines; it does not replace
  them.
- Not a generic calendar. The granularity is chess-shaped: prep
  windows are days, not hours; tournaments are rounds, not sessions.
- Not a coach. The planner surfaces what the player has not done;
  it does not prescribe what to do. The player or their coach decides.
- Not a sync to Google Calendar in v1. Calendars of "things I do
  on the chess board" are enough; calendars of "lunch with my
  mother-in-law" stay in iCloud.

## Surfaces the planner would need

A new top-level section in the sidebar, between Repertoire and
Recent — that is where a player looks when they ask "what is on
this week?". Inside:

- **Calendar pane.** Month, week, and a per-event detail view. A
  tournament has rounds; a study session is a single block.
- **Prep gap report.** "For Tournament X in N days, you have not
  reviewed Y, Z; you have not finished line L in your opening file;
  your last game in this format was G days ago."
- **Today / this week lane.** A short list at the top of the planner:
  the next thing on the timeline, one click to jump to it.
- **Tournament entry form.** Manual for now (the user types the
  tournament name, the date, the format). A Lichess sync that pulls
  "your upcoming tournaments" is the obvious v2.

## Open questions

- Does the planner belong in the same source tree as Analysis, or in
  its own package? v1 should be in-tree to reuse stores and types.
- Do prep windows roll up into a "study load" metric ("you are
  averaging 3 hours of prep per tournament; this week is at 5")?
  Useful but a distraction for v1.
- Does the planner touch the assistant? "Ask the planner to draft a
  prep plan" sounds compelling but is a feature on its own.

## What would prove the idea

If a player who has used Kingfisher for a week opens the planner the
day before a classical tournament, sees the prep gap, drills the
endgame type they had missed, and turns up to the round with a plan,
the planner is doing its job. Everything else is chrome.
