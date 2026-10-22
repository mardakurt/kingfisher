# 2026-10-22/23 — everything in a browser, every screen, and 1.5.4

What was audited, found, fixed and run, from `cf73c7f4` (1.5.3) to the
commit that adds this report. Every number below came from a command run in
this session; where something could not be run, it says so.

## What was asked

Make the phone view usable; answer a Search Console indexing email; give
puzzles both colours at random; make every screen size work; make Kingfisher
fully usable in a browser without the Mac application; then ship it to both.

## Search Console

The indexing report named three redirected URLs (`http://`, `http://www.`,
`https://www.` — each a 308 to `https://kingfisherchess.app/`) and one
noindexed URL (`/repertoire`, a Studio route that sends
`X-Robots-Tag: noindex` on purpose). Both are intended; nothing was changed
and "Validate fix" was not pressed.

## Found and fixed

- **Puzzles** walked a fixed id order through the twelve nearest, so the side
  came in runs. A coin now picks the side, then a random puzzle within 75
  points (`42fbe20c`).
- **Phones** (`a6f2f39b`): titles cut to three letters by header controls,
  Settings' rail leaving a 140 px panel, 16 px text fields (iOS zoom), a
  32 px band above the board, the landing and documents scrolling sideways at
  320 px, and smaller faults. A first fix moved every desktop board down
  32 px (`sm:` lost to `mid:` in Tailwind's breakpoint order); the visual
  suite caught it.
- **The browser alone** (`ab0a8dad`): collections kept beside My games
  (each its own IndexedDB database with the application's schema); En
  Croissant read from a chosen file with sql.js, held row for row to the
  companion's reader; ChessBase into a new collection; PGN files read in
  pieces. A companion `/status` probe aimed at the site itself (404) fixed.
- **Collections sync** with My games (`9da43422`), additive.
- **Tablets, installed iPhones, touch, Safari** (`63bb1cce`): header labels
  yield to the page name by measurement (the first version looped against
  the action fold and crashed Review — the full suite caught it); safe-area
  insets on every edge; 32 px touch targets; notices fit 320 px; Safari's
  seven-day storage deletion explained once there is work to lose.
- **The Linux baseline job** lost every redrawn picture when a development
  server fault timed out one smoke test; it now retries and always uploads
  (`72f31fc5`).

## What was run

- Unit: 4,438/4,438 in 440 files, 0 skipped; typecheck, lint, format,
  `git diff --check`, `test:no-skips`, `docs:check` 375/375, the production
  build, and the benchmark (exit 0).
- Browser suite, Chrome, Firefox and WebKit: 1,867/1,890 on the first full
  run. Real faults among the 23 were fixed (the Review crash, the switch's
  hit area counted as overflow, three test races in the new specs); every
  failing spec was rerun in the engines where it failed and passed, except
  WebKit's engine tests on the development server — the slowness recorded
  for 1.5.3 — which passed against a production build, apart from two that
  read a development-only hook and cannot run there.
- Phone and tablet audits of every route at 320, 390, 768, 834, 1024, 1194
  and 1366 px in Chromium and WebKit, and on the live site at 320 px.
- The browser-only flows on the live site after deploy, and on a
  production build in Chromium, Firefox and WebKit.
- 1.5.4 for the Mac, build 1237 from `c85f9314`: notarised app and DMG,
  trust gate GREEN, `desktop:certify` 10/11 (the seed-46 walk failed at its
  first step on a `du` of an unwritten profile and passed alone), the
  staged update feed, the real Sparkle update from 1.5.3 through the live
  feed, and `desktop:public:verify -- --landing --full` 68/68.

## Not done, and why

- A real iPhone or Android phone was not used: phones were emulated, and
  the safe-area insets were checked through Chromium's emulation of them.
- The macOS first-open sheet on a quarantined download was not clicked
  through; it needs a person at the Mac.
- Native engines other than Stockfish 18, and Syzygy files on disk, still
  need the companion: a page cannot start a process or read a path. En
  Croissant files over 1 GB likewise.
