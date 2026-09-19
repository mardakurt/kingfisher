# Phase 71 handover — the Training icon, the landing, and the way into the Studio

Six enhancements, asked for in one message and landed together. This
report says what each was, what was done, what was run, and what is
left. The public Mac build is behind `master` after this phase (see
_Platform parity_ below).

## What was asked

1. Fix the Training page icon, everywhere it appears, web and desktop.
2. Replace the landing page's three outdated screenshots with the
   current interface.
3. Fix the landing header, whose section links sat visibly right of
   centre.
4. Make the favicon set complete and correct in production.
5. Give returning users a frictionless way into the Studio without
   removing the landing for new visitors.
6. Give the landing a restrained Kingfisher identity.

## Order, and why

1. **Training icon first.** It is shared Studio UI, it appears in the
   sidebar of every product screenshot, and a screenshot taken before it
   is a screenshot taken twice.
2. **Studio access next.** It adds a client component to the landing
   and a route alias; the header and design work builds on the final
   markup rather than the old one.
3. **Header, then design.** The header's grid is the page's column
   system; the identity work uses the same columns.
4. **Favicon.** Independent; done once the brand assets were confirmed
   to come from one source.
5. **Screenshots last**, from the running application, after every
   visible Studio change — the only one being the icon — had landed.

## 1. The Training icon

**What was wrong.** `Recall` in `src/components/icons.tsx` — the one
icon the sidebar, the Recent page, the tour and the workspace tool
strip all import — was a column with a curve on top, a separate plinth
rectangle and a 0.6 px filled eye. At 21 px (the sidebar's size) it
read as a desk lamp or a snail, and the eye was a smudge. Phases 67–69
had redrawn it three times feature by feature.

**What changed.** The icon is now a knight _silhouette_: one closed
outline (muzzle left, ear up, neck curving down), on the same plinth as
the Endgame king (`M7 16h10v3H7z`), no interior detail, drawn at the
family's 1.75 px stroke. The head fills 12 of the 24 units so it keeps
the optical weight of the magnifier and bullseye beside it. It was
iterated in a rendering lab beside the pawn, king, Review and
Preparation icons at 16, 21, 24, 32 and 96 px, in the dark and light
themes and in the accent colour, and then captured in the live sidebar
at 4× in the expanded, collapsed and light states.

**One source.** There is exactly one Training icon; `navigation.ts`,
`FirstRunTour.tsx`, `RecentWorkspace.tsx` and `tool-icons.ts` all
import `Recall`. The command palette draws no section icons. The
desktop shell serves the same Next build, so it gets the icon at its
next release.

**Test.** `src/components/icons.test.tsx` now pins the silhouette's
structure — two closed paths, the king's plinth, curves, a reach to the
left edge, no filled interior — and fails against the previous drawing
(verified by stashing the new icon and running it).

## 2. The landing screenshots

The three images were captures from before 1.2.0: the toolbar removed
in Phase 67, the wooden board, the old Training icon — and the
"Research" image was the Theory Book, not the Explorer its alt text
described. The 1440 × 900 `og.png` social card was the oldest of all
(an empty workspace) and did not match the 1200 × 630 the layout
declares.

`scripts/landing-captures.mjs` replaces `landing-hero-capture.mjs` and
makes the whole set from the running application on a fresh profile:

- `workspace-2026-09-19.webp` — the analysis workspace, Stockfish 18
  Lite at MultiPV 5 on the Italian, best move drawn (2240 × 1400).
- `engines-2026-09-19.webp` — the engine panel and the board beside it,
  from the same search (1558 × 1138).
- `research-2026-09-19.webp` — the Explorer's source comparison on the
  Najdorf: Kingfisher Starter (7,649 games) against Recent Theory
  (1,703 games), which the script installs from its public manifest;
  the dock dragged wider by its handle so both columns fit (1718 × 1138).
- `og.png` — the hero at 1200 × 630.

WebP q82. The three images weigh 233 KB together, against 474 KB
before; `og.png` 80 KB against 149 KB. Nothing is retouched; the only
thing hidden is Next's dev badge. "Storage is not protected" appears in
the hero's sidebar as it did in the previous hero: Chromium does not
grant durable storage to an automation profile (tried the Playwright
grant, the CDP `durableStorage` grant, a notifications grant and a
headed window — all refused), and the capture does not hide a true
product state. Lichess Masters could not be the second research source:
`explorer.lichess.ovh` answers 401 to this machine, and a column that
says "unavailable" is not a comparison.

`e2e/landing-chrome.spec.ts` asserts each image is served as WebP with
the natural size the markup declares and an alt text of substance.

## 3. The landing header

**Cause.** `.nav-links { margin: 0 auto }` in a flex row centred the
links in the space left between a 144 px wordmark and a 92 px button —
26 px right of the page's centre at every desktop width (measured:
746 vs 720 at 1440, 986 vs 960 at 1920).

**Fix.** The header is a `1fr auto 1fr` grid in the same box as every
section (`--max` plus the gutters), so the links centre on the page and
the brand and the action sit on the sections' own column lines. Below
900 px the links fold into a `<details>` disclosure — no script, one
named control — and the grid drops to two columns. Measured after:
960/720/640/512 at 1920/1440/1280/1024; brand left = section left at
each; zero horizontal overflow at 1920, 1440, 1280, 1024, 900, 820 and 390. `e2e/landing-chrome.spec.ts` asserts the centring to within 1 px
at three widths and the menu at two, and fails when the grid is
mutated back (verified).

## 4. The favicon

The set already existed and was rendered from one source
(`brand/kingfisher-mark.svg` → `scripts/render-brand-icons.py`). Two
things were wrong for the contexts that matter:

- No PNG at a multiple of 48 px was linked. Search engines make result
  icons from such a file; the .ico's 48 px layer is not something every
  crawler unpacks. `src/app/icon1.png` (96 × 96) is now rendered and
  linked by the file convention as
  `<link rel="icon" sizes="96x96" type="image/png">`.
- The Apple touch icon had transparent rounded corners, which iOS
  composites onto black. It is now square-cornered (`kind: "square"` in
  the renderer); iOS applies its own mask.

Production output (`npm run build`) emits `favicon.ico`, `icon.svg`,
`icon1.png` and `apple-icon.png` under `.next/server/app/` and the
landing's HTML links all four with their types; the manifest icons are
unchanged. `e2e/landing-chrome.spec.ts` asserts the linked set and
fetches each one. **Search engines refresh their cached favicon on
their own schedule; this phase makes the site correct for the crawler
and claims nothing about when Google will show it.**

## 5. Reaching the Studio

Documented in full in `docs/product/studio-access.md`. In short:

- `/studio` is a permanent (308) alias for `/analysis`, query
  preserved, in `next.config.ts`.
- The Studio's `AppShell` writes `kingfisher.studio.visited` on mount.
- The landing's one client component, `StudioEntry`, reads it after
  paint through `useSyncExternalStore`: a first visit is the landing as
  published; a returning browser gets _Continue in Studio →_ and a
  checkbox to open the Studio straight away next time; a browser that
  ticked it is sent to `/analysis` with `location.replace` unless the
  URL says `?stay`, which is also where the choice is undone. The
  decision is made once per page load, so ticking the box does not
  bounce the person off the page they are on.
- Nothing loops: the Studio never redirects to `/`; the auto-open key
  without the visit marker never fires; crawlers have no storage and
  see the first-visit page; the desktop shell opens on `/analysis` and
  never loads the landing.

`src/features/shell/studio-entry.test.ts` (6 tests) proves the rule;
`e2e/studio-entry.spec.ts` (5 tests) proves the page, the marker, the
opt-in, the history, `?stay`, `/studio` and deep-link reloads.

## 6. The landing's identity

Kept: the editorial serif, the paper-and-ink bands, the numbered
principles, the FAQ. Added, and nothing else:

- **The Studio's colours.** The ink is now the Studio's own dark
  surface (`#071827`), and the Studio's amber accent joins the
  kingfisher blue as the page's second colour — the bird's back and
  breast, and the colour of the selected section's rail in the sidebar.
- **Two motifs.** The mark's 2 × 2 board tile is the bullet before
  every section label and stands in for the three window dots on the
  product frame; the board's grid sits faintly behind the hero, masked
  to fade at the edges.
- **The rail.** Each principle's rule carries a 40 px amber rail, the
  Studio's selected-section mark; the Local-first band is ruled with
  one amber line the width of the content.
- **Notation.** Principle numbers and the source counts are set in
  the mono face with tabular figures.
- **Header.** Translucent ink with a blur; link underlines are the
  amber rail turned on its side and grow from the centre.
- Reduced motion turns every transition off, as before.

## Web / desktop

Shared: the icon, the visit marker (inert on the desktop). Web-only by
design: the landing, its captures, `/studio`, the favicon set. Nothing
under `desktop/` changed.

## Verification

Run on this machine, 2026-09-19, at the commit this report ships in:

```
npm run typecheck            clean
npm run lint                 clean
npm run format:check         All matched files use Prettier code style
npm test                     252 files, 3051 passed, 0 skipped
npm run test:no-skips        OK
npm run docs:check           344/344 checks passed
git diff --check             clean
npm run build                Compiled successfully; 33 static pages
npm run public:check         All 22 public link(s) responded successfully
npm run test:e2e             302 tests: 282 passed, 20 failed on the first
                             full run — every failure pre-dates this phase
                             (see below); after the test fixes, the specs
                             concerned were re-run green
```

### The browser suite

The full suite had not been run by any handover since Phase 61, and it
had rotted. None of the twenty failures involved a file this phase
changed, and each has a commit it dates from:

- **Tour on launch** (Phase 61, d162f42, dropped the on-launch tour;
  the helpers still waited for it): `fresh-user.spec.ts` × 8,
  `backup-restore.spec.ts` × 1. **Fixed here**: the helpers now assert
  the tour is absent on a fresh profile, which is the product decision.
- **Ambiguous "Analysis" link** (Phase 62, 4d17bd7, made the brand a
  link inside the same navigation): `kingfisher.spec.ts`,
  `phase7.spec.ts` × 2, `soak.spec.ts` × 2. **Fixed here**:
  `exact: true`.
- **Ambiguous "Name" label** (Phase 63, the inline rename):
  `phase10.spec.ts` § 7. **Fixed here**: `getByRole('textbox')`.
- **Stale DMG literal** (Phase 68 shipped 1.2.0; the live test still
  said 1.1.9): `prod-phase60.spec.ts`. **Fixed here**: reads the
  descriptor.
- **Left as found, and flagged**: `phase60-regressions.spec.ts` "tour
  dismissal survives reload" — the tour is not mounted anywhere since
  Phase 61, so Settings' "Open the tour guide" button sets state nobody
  renders (a product defect, not a test one; a task is queued for it);
  `settings.spec.ts` "every setting has a test" — `autoBackupEnabled`,
  `autoBackupReminderDays`, `autoBackupRetention` and `tourShowOnLaunch`
  have neither an assertion nor a stated reason in the contract;
  `phase8.spec.ts` "review candidates are suggested" — an evaluation
  string the review no longer prints; `visual.spec.ts` `board-pieces`
  and `board-pieces-light` — the board crop no longer matches the
  2026-09-16 baseline (the analysis page shots, which include the new
  icon, pass). Six tests, all product or baseline questions for the
  audit that follows, none touched by this phase.

Re-run after the fixes: `fresh-user`, `backup-restore`, `kingfisher`,
`phase10`, `phase7`, `prod-phase60` — 52 passed; `soak` — 3 passed
(3.6 m). `studio-entry`, `landing-chrome`,
`surface-contracts` — 14 passed.

Browser evidence beyond the suites: the icon before/after sheet at 4×
(expanded, collapsed, light); the landing at 1920, 1440, 1280, 1024,
900, 820 and 390 with header geometry printed; the mobile menu open;
the returning line at 820; the opt-in flow and `/studio` in a scripted
Chrome session.

## Platform parity

The Training icon is Mac-facing and the public Mac 1.2.0 (build 651)
still shows the previous one. Recorded in
`docs/product/platform-parity.md` under _Published revision check
(Phase 71)_. Section B of After-a-fix — a 1.2.1 release — has not been
run: it is a signed, notarised public release and is the owner's to
trigger.

## What remains

- A Mac release (Section B) to carry the icon to the desktop.
- Visual baselines in `e2e/visual.spec.ts-snapshots` were not
  regenerated: the icon change is far inside the 2 % page tolerance and
  the suite passes; regenerating twenty binaries for a 21 px icon adds
  bulk without evidence.
- Google's cached favicon: nothing here can force it.

## Independent re-verification (2026-09-19, Linux cloud checkout)

The phase was re-checked from a clean clone of `fe96dc5` on Linux, by
running the gates again rather than reading the section above. What was
run, and what it said:

```
npm ci                       clean
npm run typecheck            clean
npm run lint                 clean
npm run format:check         All matched files use Prettier code style
npm test                     3049 passed, 2 failed, 0 skipped  (see below)
npm run test:no-skips        OK
npm run docs:check           343/344 — the one miss is `.vercel/project.json`,
                             which is git-ignored and absent from any clone
npm run build                Compiled successfully; 33 routes
npm run public:check         All 22 public link(s) responded successfully
git diff --check             clean
```

The two failing tests are both in `desktop/src/sparkle-updater.test.mjs`,
a file this phase did not touch. They fail here because
`sparkle-updater.mjs` returns "Updates are delivered through Sparkle,
which is macOS only." at `process.platform !== 'darwin'` before it
reaches the checkout and missing-bridge branches the tests assert. A
third failure, `platform-floor.test.mjs`, was only `desktop/node_modules`
being absent; it passes once `npm install` is run there. This is a
platform limitation of the verification machine, not a regression.

### The six enhancements, each checked against the running application

Served by `npm start` (the production build) and driven with Playwright
against the bundled Chromium.

1. **Training icon.** Rendered the whole navigation set at 16/21/24/32 px
   in both themes and compared the knight with the pawn (`Opening`) and
   the king (`Endgame`) it shares a plinth with: three distinct
   silhouettes, one family, the knight legible at 16 px. Then captured
   the _live_ sidebar at `/training` at 3×: the row is selected, the icon
   carries `text-accent` beside the amber rail, and it is centred on the
   same axis as `Review` above and `Endgame` below. `desktop/src/`
   contains no icon code at all, so web and desktop share the icon by
   construction — only the already-published Mac 1.2.0 binary is behind,
   which _Platform parity_ above records.
2. **Landing captures.** All three files are WebP at exactly the natural
   size the markup declares (2240 × 1400, 1718 × 1138, 1558 × 1138),
   233 KB together, `og.png` 1200 × 630. Opened each one: they are the
   current interface, the hero's sidebar shows the new knight, the
   Research image is the Explorer's two-column source comparison (not the
   Theory Book), and none carries personal or development-only content.
3. **Header.** Measured in the browser at 1920/1440/1280/1024: the links'
   centre is within **0.01 px** of the viewport centre at every width,
   `.nav-brand`'s left edge equals the section column's left edge
   exactly, and horizontal overflow is 0 at all six widths tested
   (1920, 1440, 1280, 1024, 820, 390). At 820 and 390 the links fold into
   the `<details>` menu. The assertion was then shown to be able to fail:
   reverting `.nav-inner` to `display: flex` with `.nav-links { margin: 0
auto }` and rebuilding made the three centring tests fail (off by
   5.32 px); restored and re-checked green.
4. **Favicon.** Production HTML links four icons — `.ico` 48×48,
   `icon.svg`, `icon1.png` 96×96 and `apple-icon.png` 180×180 — and all
   four return 200 with the right `content-type` and real bytes. The same
   four are linked on the live `kingfisherchess.app`, where `icon1.png`
   is 4085 bytes, byte-for-byte the size of the file in this checkout.
   No claim is made about when a search engine refreshes its cache.
5. **Studio access.** Driven end to end in a browser: a first visit
   stores **nothing** (`localStorage` empty, no cookies) and shows no
   continue line; `/analysis` writes the marker; the landing then offers
   _Continue in Studio_; ticking the box leaves the visitor on the page;
   the next visit to `/` lands on `/analysis`; `/?stay` shows the landing
   with the box ticked; unticking undoes it; `/repertoire` deep-links and
   survives a reload; and Back from an auto-opened Studio goes to
   `/?stay`, not into a loop. `/studio` answers 308 to `/analysis` with
   the query preserved, locally and on the live site.
6. **Identity.** Inspected the rendered page at 1440 and 390 down its
   full 5,733 px: the ink/paper bands, the editorial serif, the board-tile
   bullet before each section label, the amber rails and the spec cards
   read as one deliberate system, and the download card's version, build,
   filename, size and SHA-256 are the ones in
   `src/release/macos-download.json`.

The regression test for the icon was also shown to be able to fail:
replacing `Recall`'s two paths with a placeholder made
`src/components/icons.test.tsx` fail on the silhouette's structure.

### What this pass added

Two gaps the phase left, both required by `AGENTS.md` for a public
surface change:

- `docs/product/public-claims.md` had no row for the `/studio` address
  or for what the landing now remembers. Two rows added.
- `src/app/privacy/PrivacyPage.tsx` described browser storage as the
  application's alone. It now names both landing keys, who writes each
  and when, and states that a first visit writes neither.

### The browser suite, re-run here (302 tests, 279 passed)

The whole suite was run against the dev server with the bundled
Chromium. Twenty-three failed, and each was traced rather than counted:

- **Fourteen `visual.spec.ts` baselines.** Linux baselines are
  committed, but this machine has Chromium 1194 where the repository's
  Playwright pins 1234, so the whole page rasterises differently: the
  diffs are 17–67 % of all pixels. `board-pieces` — a board crop with no
  sidebar and no Training icon in it — differs by 67 %, which is what
  rules the icon out as the cause (a 21 px icon is ~0.03 % of a page).
  Nothing was written into the snapshot directory.
- **Three `prod-phase60.spec.ts`.** They drive the live
  `kingfisherchess.app`, and fail at `ERR_CERT_AUTHORITY_INVALID`: this
  sandbox terminates HTTPS with its own CA, which Chromium does not
  trust.
- **One `en-croissant.spec.ts`**, which was this run's own fault: the
  companion was given a fixed data directory instead of the per-process
  one `playwright.config.ts` uses, so the second import of the fixture
  reported `0 imported · 60 duplicates`, exactly as that spec's own
  comment predicts. It passes on a cleared directory.
- **Three already on the list above** — `phase60-regressions` tour
  dismissal, `phase8` review candidates, and `settings.spec.ts`'s "every
  setting has a test". They reproduce precisely as this report describes
  them.
- **One that was not on the list, and is a real defect.**

### `stale-responses.spec.ts` — the explorer settles on a stale position

`the explorer ends on the position and source the user actually chose`
fails: after the raced walk the explorer shows the evidence for the
position after **1. e4** (`c5:40,519/41%`, `e5:32,342/33%`, …) where the
deliberate walk to the same position gives the position after
**1. e4 e5 2. Nf3** (`Nc6:26,960/88%`, `Nf6:3,316/11%`, …). That is the
staleness the spec exists to catch, and the rows are not close: they are
a different position's evidence entirely.

It is **not this phase's**. It reproduces on an idle machine in
isolation, and it fails identically at `b251020`, the commit before this
phase began:

```
git checkout b251020
npx playwright test e2e/stale-responses.spec.ts
  1 failed  the explorer ends on the position and source the user actually chose
```

Nothing in Phase 71 touches the explorer; the only Studio-side change is
`AppShell` writing a `localStorage` flag on mount. This belongs to the
audit that follows, with the other pre-existing findings above, and it
should be treated as a product defect rather than a test to relax —
"provenance is never lost" and a source's numbers being labelled with
that source are what this test is defending.

### Still not run here

`npm run test:e2e` cannot be run as the project defines it on this
machine: the Playwright project pins `channel: 'chrome'` and no Google
Chrome is installed. The phase's own specs were run against the bundled
Chromium instead — `landing-chrome.spec.ts` (7), `studio-entry.spec.ts`
(5) and `surface-contracts.spec.ts` (2) all pass. Section B (a Mac
release) is unchanged and still the owner's to trigger, and
`deploy:status` needs a `VERCEL_TOKEN` this machine does not hold —
though the live site demonstrably serves this commit's favicon set,
captures and `/studio` redirect.

## macOS close-out and the 1.2.1 release (2026-09-19, the maintainer's Mac)

The cloud checkout above could not run real Chrome, sign anything or
open a window. This pass equalised the repositories, ran what Linux
could not, resolved the six open items, and ran Section B of
`docs/operations/after-a-fix.md` in full. Everything below was run on
this machine; nothing is carried over from the section above.

### Equalising

```
git fetch origin claude/kingfisher-enhancements-h6h15h
git log --oneline master..FETCH_HEAD      42421bd, efaf459 — exactly the two
git diff --stat master FETCH_HEAD         4 files (the prompt said five; there
                                          were four: CHANGELOG, public-claims,
                                          this handover, PrivacyPage.tsx)
git merge --ff-only FETCH_HEAD            fast-forward, fe96dc5..efaf459
git push origin master                    efaf459
deploy:status                             up to date (efaf459), 25 min later
```

### The gates Linux could not close (at efaf459, then at 58f968b)

```
npm ci                       clean
npm run typecheck            clean
npm run lint                 clean
npm run format:check         All matched files use Prettier code style
npm test                     252 files, 3051 passed, 0 skipped — the two Linux
                             failures were sparkle-updater's macOS-only branch
npm run test:no-skips        OK
npm run docs:check           344/344 — the Linux miss was the git-ignored
                             .vercel/project.json
npm run build                Compiled successfully; 33 static pages
npm run public:check         All 22 public link(s) responded successfully
npm run benchmark            heaviest route /review at 523.9 kB gzipped
git diff --check             clean
npm run test:e2e             baseline at efaf459: 297 passed, 5 failed (20.2 m)
                             certified at 58f968b: 305 passed, 0 failed,
                             0 flaky (17.2 m) — channel chrome (Google Chrome
                             153.0.8010.53), retries = 0, against npm run dev
```

The five baseline failures were the five the section above predicted;
`stale-responses.spec.ts:113` **passed** on this machine, at efaf459,
five times out of five including under 6× CPU throttling — see below
for why that was no comfort.

### The six open items, and what each turned out to be

**(a) `stale-responses.spec.ts` — the explorer race.** The premise
handed to this pass was a product defect. It is not one. Instrumenting
the raced walk showed every one of its three clicks reporting
`found: false`: the walk plays moves by clicking explorer _rows_, a row
exists only once the explorer has answered for the position on the
board, and — the actual cause — `page.reload()` before the race
**restores the deliberate walk's game** through autosave, so the race
began at its own destination with rows for 1. e4 e5 2. Nf3 already on
screen. Nothing was clicked, nothing was queried, and the assertion
compared a restored panel with itself. On the cloud machine the reload
caught a different autosave draft, the same no-op walk ended on a
different restored position, and the mismatch read as a stale answer.
The `fen` the spec captured was read from `[data-fen]`, which has not
existed for some time (`null` on both sides), so it could not have told
the two apart.

The product keys every explorer answer by its position
(`useExplorer`'s query key carries `fen`; `ExplorerResult` carries the
`fen` it answers; `PackReader` is keyed by position). The test now
resets to the start position after the reload (the `New analysis`
button), plays the three moves on the board squares — which are always
there — with the source switched away and back between them, and
asserts the board's FEN (from `[data-fen-tooltip]`) as well as the
rows against the oracle. Shown able to fail: removing `fen` from the
explorer's query key fails the test (at the oracle walk, since that
guard's removal stales the deliberate walk too). No product change was
made, and no defensive `data.fen === node.fen` check was added: the
query key already guarantees it, and a check that cannot fire is dead
code.

**(b) The tour.** Phase 61 unmounted `FirstRunTour` so it would stop
opening on launch; Phase 62 added _Open the tour guide of the website_
to Settings → Help, which set `tourOpen` for a dialog nothing rendered.
Product decision, following the two owner decisions on record: the tour
opens **from Settings only**. `AppShell` mounts it again; the
_Don't show on launch_ checkbox is removed, and `tourShowOnLaunch` —
written by that checkbox and read by nothing since Phase 61 — is
retired by a version-6 preferences migration (unit-tested against a
version-5 blob; `desktop:upgrade` later showed a real 1.2.0 profile's
`boardTheme` surviving it). `useFirstRunTour.ts` is deleted.
`phase60-regressions.spec.ts` now asserts no tour on a fresh profile,
the Settings link opening it, ←/→/Esc, and nothing reopening after a
reload; unmounting the dialog again fails it.

**(c) The four settings without an assertion.** `tourShowOnLaunch` is
gone (above). For the three auto-backup settings, reading the consumer
turned up a product defect: the contract says `autoBackupReminderDays`
is "the status-bar reminder threshold", and `StatusBar.tsx` held a
literal `7`. It reads the preference now. `e2e/settings.spec.ts` has a
runtime assertion for each of the three — seed the `backups` store with
rows of a chosen age, reload, read back what the launch did — and the
reminder one fails against the literal (`Received "Backed up 3 days
ago"`, expected `Backup is 3 days old`). A first draft raced the
previous launch's own backup write; each measured launch is now
preceded by one with auto-backup off. Run ×3: 9/9.

**(d) `phase8.spec.ts:283`.** The expectation was wrong. Phase 58
(`b8de88b`) moved `formatScore` to one decimal — the Lichess convention
— and updated three unit-test files; this e2e kept `+0.40 to -1.80`.
Now `+0.4 to -1.8`.

**(e) The board baselines.** The board did not change. The Sep 16
`board-pieces` crops contain the floating _Analyse_ pill Phase 62 added
over the h1 corner and Phase 67 removed: 2,433 differing pixels, every
one inside the box (485,543)–(571,573), same 584 × 583 dimensions. The
two darwin baselines were regenerated once, for that reason. The other
darwin baselines passed as committed.

**AGENTS.md** said thirty-three preferences; there are thirty-seven
(and were thirty-eight). Both counts corrected.

### The landing captures (section 4)

Not re-captured. Real Chrome 153 on macOS refuses durable storage to an
automation profile exactly as the cloud's Chromium did: Playwright's
`persistent-storage` grant is unknown to the channel; the CDP
`Browser.grantPermissions` `durableStorage` grant is accepted and
`navigator.storage.persist()` still answers `false`, headed or headless.
"Storage is not protected" is therefore a true statement about the
profile in the picture and stays. `explorer.lichess.ovh` answers 401
from this machine too, with or without a user agent, and no Lichess
token exists here, so Lichess Masters cannot be the Research image's
second source honestly. Nothing in the Studio's rendered surface
changed in this pass, so the committed captures are current; the live
ones are byte-identical to the repository's (`shasum` of all three).

### Section B, in the runbook's order

```
B1  npm version 1.2.1 (root, desktop), lockfiles       1.2.0 → 1.2.1 only
B2  CHANGELOG: Unreleased → ## 1.2.1 — 2026-09-19
B3  docs/release/1.2.1.md; docs/README.md link
B4  commit 359193c, push; HEAD = origin/master; tree clean
B5  source ~/.kingfisher-release/env.sh
B6  desktop:release:preflight:mac                       GREEN (identity 3B5CYF9DQ4,
                                                        API key, master, clean, in sync,
                                                        versions agree, 71 GB free)
    desktop:sparkle:fetch                               Sparkle 2.10.0 is vendored
    desktop:sparkle:bridge                              Sparkle bridge is current
B7  npm run build                                       Compiled successfully
B8  KINGFISHER_DESKTOP_CHANNEL=stable desktop:dist      Build identity: 1.2.1 · build 667 ·
                                                        359193c · stable; notarization
                                                        successful; fresh packaged boot
                                                        verified (renderer, web, companion,
                                                        engine catalogue, Sparkle 2.10.0)
B9  release:mac:notarize <dmg>                          Accepted — submission 7be3f33b…;
                                                        ticket stapled and validated
B10 desktop:trust:verify                                GREEN — 29 code objects, stapled
                                                        ticket validates, Gatekeeper accepts
B11 verify-dmg.mjs --version 1.2.1 --commit 359193c…    DMG verified
    desktop:certify (run 1)                             9/10 — suspend failed once, see below
    desktop:certify (run 2)                             DESKTOP CERTIFIED — smoke 17/17,
                                                        chrome 109/109, restart 5/5,
                                                        engines 25/25, suspend 12/12,
                                                        walk seed 46 (200) 0 findings,
                                                        walk seed 7 (120, faults) 0 findings,
                                                        dmg verified, no skips, 3051 unit
    KINGFISHER_DESKTOP_PREV=<published 1.2.0> desktop:upgrade
                                                        7/7 — 1.2.0 (651) → 1.2.1 (667);
                                                        study, preferences (boardTheme sage,
                                                        through the v6 migration), pack
                                                        metadata all there
    release:mac:appcast --zip <1.2.1 zip>               appcast.xml (build 667, signed,
                                                        notes embedded), latest-mac.yml,
                                                        1.2.1.html
B14 release:mac:publish v1.2.1 "Kingfisher 1.2.1"       tag v1.2.1 at 359193c; 6 assets
B15 gh release edit v1.2.1 --notes-file … --latest      Latest; not draft, not pre-release;
                                                        publishedAt 2026-09-19T16:02:17Z
B13 desktop:update:real --current <1.2.0> --public-feed Real update: PASS (19 checks, Sparkle's
                                                        own window, relaunch on the test
                                                        profile, study still there)
    desktop:update:real --current <1.1.7> --public-feed Real update: PASS (16 checks, the
                                                        electron-updater dialog, latest-mac.yml)
B16 src/release/macos-download.json                     1.2.1 · 667 · 359193c ·
                                                        Kingfisher-1.2.1-arm64.dmg ·
                                                        sha256 9dab3692… · 172,114,997 bytes
                                                        (GitHub reports the same count)
B17 publish:release-manifest                            prepared for 1.2.1
B18 README, SECURITY, install-macos (file + hash),
    launch-kit, public-claims, SecurityPage.tsx, AGENTS.md
B19 docs:check                                          344/344
B20 commit 7034af1, push; deploy:status                 up to date (7034af1)
B21 desktop:public:verify -- --landing --full           66/66 — PUBLIC DMG VERIFIED (every
                                                        byte; 172,114,997 bytes in 18.5 s;
                                                        landing and install guide link and
                                                        name the file)
```

The previous builds: `Kingfisher-1.2.0-arm64.zip` and
`Kingfisher-1.1.7-arm64.zip` were downloaded from their releases and
matched their published `SHA256SUMS` before being used
(`~/Library/Caches/kingfisher/release-<v>/`).

**Certify, run 1.** The suspend gate failed one check, "the engine
panel says something true about itself" — `[data-workspace-dock]`'s
`innerText` was empty immediately after `SIGCONT`, once. A diagnostic
copy of the harness that dumps the dock's geometry and text on both
sides showed the dock at 380 × 840, `display: flex`, 22,883 bytes of
markup and full text before and after; the unmodified harness passed
three further times standalone, and run 2 of certify passed it 12/12.
Not reproduced; recorded rather than explained. Two things the harness
should say about itself: its "an engine that has been asked a question"
premise is silently unmet — it looks for _Analyse this position_, which
Phase 67 removed (0 buttons; the check only asserts the dock has text)
— and an empty `innerText` is not distinguished from a hidden dock.
Left for the next pass; the harness was not changed under a release.

### Confirmed by looking

The packaged 1.2.1 (`mac-arm64/Kingfisher.app`, the bundle the DMG was
archived from), driven through `scripts/desktop-lib/launch.mjs` on a
fresh profile to `/training`: the Training row's icon is the knight
(`M7 16h10v3H7z` plinth, the silhouette path), captured with
`window.screenshot` — sidebar expanded and collapsed, dark and light —
in the accent colour on the selected row beside the Endgame king.
`screencapture` is blocked on this machine; the renderer's own capture
is the evidence.

The live site, in a browser at 1440 × 900: the landing (header centred,
frame titled "Kingfisher 1.2.1", download card 1.2.1 · build 667 ·
`Kingfisher-1.2.1-arm64.dmg` · SHA-256 `9dab3692…` · asset URL under
`v1.2.1`); `/install` (1.2.1 build 667, the hash, no "1.2.0" anywhere);
`/privacy` (both landing keys named, "a first visit writes neither");
`/studio?stay=1` → `/analysis?stay=1`; `/training` draws the knight and
opens no tour. Also by command: `/studio?stay=1&x=2` → 308 →
`/analysis?stay=1&x=2`; `favicon.ico`, `icon.svg`, `icon1.png`,
`apple-icon.png` all 200 with their types; the three captures
byte-identical to the repository's.

### The five closing questions of After-a-fix, section A

1. **Same source, web and Mac?** Yes, and the Mac is no longer behind:
   the public Mac is 1.2.1, build 667, from `359193c`, the commit the
   web served when it was built (`deploy:status` at 359193c: up to
   date). `platform-parity.md` records it. The docs commit `7034af1`
   after it is documentation only.
2. **Documents accurate and current?** `npm run docs:check` 344/344 at
   `7034af1`; CHANGELOG, the 1.2.1 release note, platform-parity, the
   settings contract and AGENTS.md's counts and DMG line were each
   updated with the behaviour they describe.
3. **Vercel production is the latest commit?** `deploy:status`:
   `kingfisherchess.app: up to date (7034af1)`.
4. **Version, build, filename and hash on the landing and install pages
   are the descriptor's?** `docs:check` asserts it; `desktop:public:verify
-- --landing` confirms the live pages link and name the file; looked
   at both pages.
5. **The DMG on GitHub is the latest Mac build and the one the
   descriptor names?** `gh release list`: `v1.2.1` is Latest;
   `desktop:public:verify -- --full`: every byte of the public DMG
   hashes to the descriptor's SHA-256 and verifies as 1.2.1 / 667 /
   359193c, signed and stapled.

### What remains

- The suspend harness's stale _Analyse this position_ selector and its
  `innerText`-only dock check (above).
- Google's cached favicon: nothing here can force it; re-indexing was
  not requested.
- The captures' "Storage is not protected" and the single-pack Research
  comparison, for the reasons stated: neither can be changed honestly
  from an automation profile without a Lichess token.
