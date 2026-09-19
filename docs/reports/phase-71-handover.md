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
