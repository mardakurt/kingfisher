# Prompt: close the remaining gaps between Kingfisher and ChessBase for Mac

Give this whole file to a coding agent working in this repository. It is
written to be self-contained.

---

Close every gap between Kingfisher and ChessBase for Mac that Kingfisher can
close honestly, prove each closure, and say precisely why each remaining gap
stays open. Do the work; do not merely propose a plan. "Closed" means a
person can do the same work in Kingfisher, as well or better, and you have
used it yourself on real data.

Work in `/Users/metinardakurt/Desktop/Projects/chess&poker/chess/studying hub`.

## 1. Read before touching anything

1. `AGENTS.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `docs/operations/after-a-fix.md`.
2. `docs/README.md` — which documents are current and which are history.
3. The comparison series, newest first:
   `docs/product/chessbase-mac-comparison-1.4.6.md`, `…-1.4.5.md`, `…-1.4.4.md`,
   `docs/product/chessbase-mac-comparison-2026-10-03.md`,
   `docs/product/chessbase-parity-audit.md`, `docs/product/parity-ledger.md`,
   `docs/product/big-data-and-accounts-proposal.md`,
   `docs/data/chessbase-preservation-matrix.md`.
   They record what is already closed. Do not rebuild a closed gap, and do
   not reopen a gap that was declined on purpose without a reason the
   earlier document did not consider.
4. Verify the starting state: `git status`, `git log --oneline -25`,
   `git rev-parse HEAD origin/master`, the source version in `package.json`,
   and the public Mac release in `src/release/macos-download.json`.

## 2. The two sources of truth about ChessBase

- **<https://macland.chessbase.com/>**: read it again; it changes. Copy
  every product claim into a list: analysis window, sidebar, search filters,
  local/cloud/remote engines, databases and folders, tactics puzzles with
  ratings, statistics by rating class, Player Style Report, Fritztrainer
  video courses, repertoire, Engine Cloud, remote engine, Let's Check, cloud
  databases, system requirements.
- **`chessbase images for comparison/`**: ten screenshots of the preview,
  git-excluded, so do not commit them. They show the analysis board with the
  reference table (Moves, Score, Draws, Games, Played, Trend, Best Players,
  Frequent Players), Top games, Let's Check and DGT board panels, and
  "Fritz 21 · 5 · 4 GB". They also show Preparation (score donut, Openings,
  Games and Style tabs, Blunder report, Prepare), Style evaluations (Theory,
  Decided Games, Tenacity, Aggressiveness, Risk, Positional Play, Endgame
  Affinity, graded Low to Very High) and Theme games. Then the Library with
  the filter popover (Position, Opponent, Color, Result, Annotations, Beauty),
  "Databases 1 of 5" and a game preview; an opened game with "‹ Library";
  the Databases grid with folders and Cloud; the Mega Database page (Games,
  Players, Tournaments, Annotator, Sources, Teams, Game Title, Text titles,
  Analysis, Openings, Weekly updates, Newest Tournaments, Top Games); and
  the Shop. `sips -s format png` converts them for viewing.

ChessBase for Mac is unreleased (early November 2026) and calls its
recordings a development version. Describe it from these sources only, and
say so. Never claim to have measured it.

## 3. Build the gap matrix first

One row per claim and per visible control. Columns: what ChessBase shows
(with the source: page section or screenshot number); what Kingfisher does
today (file, route, test); the verdict; the evidence. Verdicts:

- **match**: the same work can be done; name the route and the test.
- **different**: the same question answered another way; say why it is no
  worse.
- **buildable**: missing and Kingfisher can build it honestly.
- **needs a server**: needs a service that accepts writes or holds accounts
  (Let's Check, cloud databases). Write the design and the cost; build only
  with the owner's approval.
- **publisher data or paid service**: Mega Database, the Opening
  Encyclopaedia, weekly updates, magazines, Fritztrainer courses, the Shop,
  Engine Cloud, 128-core rental. These cannot be copied. Name the nearest
  open equivalent, for example an open population pack or a remote engine on
  a machine the person owns.
- **declined**: deliberately not built (the DGT board, by the owner; style
  grades, because a grade needs a reference population and a model of the
  word). Quote the earlier reason; reopen only with a new argument.

Write the matrix to `docs/product/chessbase-mac-comparison-<version>.md`
before writing code, and link it from `docs/README.md`.

## 4. Close the buildable gaps

Order them by what a strong player would notice first on a livestream, and
by risk; small and safe first. Likely candidates; check each against the
matrix, since some may already be closed:

- Statistics by rating class for the move table on every source that
  declares ratings, and an honest "this source does not declare ratings"
  where it does not (`src/features/explorer/explorer-filters.ts`,
  `src/reference/rating-classes.ts`).
- A Trend column (popularity over years) where the source has dates.
- A video-course player for courses the person owns or that are openly
  licensed: video, board and chapter list side by side, moves following the
  timeline. No ChessBase content.
- Database record types the ChessBase reader preserves but does not show:
  game titles and text titles, as the preservation matrix allows.
- A Repertoire view that answers "your openings, in one place" at a glance.
- Anything in the screenshots that is visible there and absent here.

For every closure:

- Keep the architecture: `app → features → stores → engine/database/persistence → chess`;
  `chess.js` only in `src/chess/position.ts`; one board renderer; positions
  keyed by `positionKey()`; the game tree immutable.
- Keep the honesty rules: the Theory Book, Explorer, Book Moves and
  Repertoire answer different questions; populations are never merged; every
  number is labelled with its source; no fictional number reaches a chess
  judgement; a feature that cannot be built honestly stays visible and
  disabled, never mocked. Add every new dataset or asset to
  `THIRD_PARTY_DATA.md` / `THIRD_PARTY_ASSETS.md` with its licence.
- Every visible setting has a consumer and a runtime assertion
  (`src/features/shell/settings-contract.ts`, `e2e/settings.spec.ts`).
- Write a regression at the right boundary: unit for logic, Playwright for
  anything a person sees (`retries = 0`). Revert the implementation once and
  show the test fails; restore it and show it passes. Keep both logs.
- Use the feature yourself in a real browser on real data: the Starter
  Reference, an imported collection, a companion SQLite database. Check
  desktop and phone width, and light and dark themes. Verify first-mount
  behaviour against a production build or the packaged application, never
  only `next dev`.

## 5. Gates and release

Follow `docs/operations/after-a-fix.md` completely: section A for every
change, section B when the Mac application changes. Run all the gates
(`npm test` with 0 skipped, `typecheck`, `lint`, `format:check`, `build`,
`test:e2e`, `benchmark`, `docs:check`, `git diff --check`).
`desktop:certify` must pass on the exact package you publish, followed by
the real Sparkle update from the previous release and
`desktop:public:verify -- --landing --full`. Before long gates, check that
iCloud has not evicted files:
`find node_modules desktop/node_modules src -flags +dataless -type f | wc -l` must be 0.

Never replace published release bytes. Never bump the version for a docs-only
change.

## 6. Report

Finish with the updated comparison document and a short checklist in chat:
each gap and its verdict, the commit and the test that proves each closure,
the gates you ran and their results, the release identity, and every gap
still open with the precise reason. Do not write "parity" for anything you
did not use yourself. Evidence, not assertion.
