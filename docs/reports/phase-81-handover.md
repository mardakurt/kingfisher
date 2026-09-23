# Phase 81 handover — research after ChessBase 26, a UI sweep, and the search mask

Phase 81 answers the owner's brief of 2026-09-23: close the ChessBase gaps,
then leap. Research comes before design, the UI must stay free of visual
defects, and the UX must be hard to break. It did four things, in this order.

## 1. The UI sweep (`4e154c6`)

The owner reported the Team page's _New team_ label off-centre. A measured
audit of every route's first screen at 1440, 1024 and 390 px found three
defects, not one:

- `Button` had no `justify-*`, so any widened button pinned its label left.
  e8ca15d had "centred" New team by widening it, which made it worse
  (0 px left of the label, 43 px right). _Play it out_ in the endgame lab had
  the same defect (0/187 px). The base now centres the label unless the
  caller passes its own `justify-*`. Measured first: on any route's first
  render, only those two buttons move.
- `/install` and `/security` were 480 and 513 px wide in a 390 px phone,
  because a release URL and a SHA-256 would not wrap. The docs `code` and
  links now wrap anywhere.
- The endgame lab's opponent select cut its label mid-sentence. The short
  name is in the select, the explanation beneath it.

`e2e/layout-integrity.spec.ts` now measures every workspace and public route
at desk and phone width. With the Button default removed it fails on both
buttons; with the link wrap removed it fails on both pages. **Limits:** it
covers each route's first render with an empty profile, not dialogs, menus
or populated states. The search mask's own screens were checked separately
with screenshots, which found and fixed a clipped date input, a clipped
select, a two-line label and a panel that hid the results on a phone.

## 2. The research (`c5b0786`)

`docs/product/market-research.md` was revised from ChessBase's own
announcements and review:

- **ChessBase for Mac is announced** (2026-09-21, for November 2026). Row 6
  is no longer Kingfisher's alone, and §5 now rests the position on what a
  port does not change: one store keyed by position, facts in place of
  labels, no account, the web, and certified stability.
- **CB26** (2025-11-11): 7+ billion Lichess games on ChessBase's server,
  Chess.com by API, a rented cloud engine, Monte Carlo, an AI assistant
  whose own reviewer found it contradicting the engine, and a time-control
  filter that misclassified games.
- A code audit of twenty ChessBase capabilities found six absent (cloud or
  remote engine, engine matches, Monte Carlo, merging games into a tree,
  questions inside a chapter, a rating-band explorer split) and several
  partial. §6 "Next — parity after ChessBase 26" ranks five of them.

## 3. The search mask (`ed9aaa8`)

Designed in `docs/design/search-mask.md` before any code; §5 of that file is
the record of what shipped. In short:

- Header: event, site, a date range, an Elo band for either or both
  players, and a time class by a printed rule.
- In the moves: material (`R v B`, held two positions), a strategic theme
  with its definition, a piece's route (`N b1 d2 f1 g3`) and comment text.
  Each reads only the header-selected games, reports read/selected, can be
  stopped, and opens results at the move they were found.
- No schema change. Measured cost: 0.010–0.184 ms per 80-ply game.
- The companion refuses fields it does not implement. On its first run the
  refusal found that the schema-equivalence test and the real-scale
  benchmark had passed the nonexistent `yearFrom`/`yearTo` for as long as
  they existed. Both have been corrected to `fromYear`/`toYear`.

## 4. Evidence

The session that wrote this handover was closed by the owner before its
gates were recorded. Its commits (`4e154c6`, `c5b0786`, `ed9aaa8`,
`20ea90b`) were verified together with Phase 82, whose commits sit on top of
them — so the runs below measure Phase 81 _with_ the redesign, not alone:

```text
npm test                 301 files, 3469 tests passed
npm run test:e2e         343 passed + 1 corrected and re-run (see phase 82)
                         — including e2e/search-mask.spec.ts and
                         e2e/layout-integrity.spec.ts, this phase's own specs
npm run build, typecheck, lint, format:check, docs:check, benchmark: clean
```

`e2e/daily-session.spec.ts` passed in that run.

## 5. What remains

- `e2e/daily-session.spec.ts` — the Phase 78 seed-then-route follow-up, still
  failing, still out of scope of the phases that noted it.
- Market research §6 "Next — parity after ChessBase 26", items 2–5:
  questions inside a chapter, merging games into one tree, labelled cloud
  evaluation, the opening report's first game, players and popularity by
  year. Each needs its design first.
- The layout audit's reach: dialogs, menus and populated states.
- Section B for the next Mac release: everything since build 714, now
  including a companion change (the query refusal). A Mac build must come
  from a clean checkout.
