# Phase 82 handover — the quiet workstation

The owner's brief of 2026-09-23: ChessBase for Mac is announced for the
autumn, and Kingfisher should look like it — "simple and chill", on the web
and on the Mac alike — without losing any feature. The owner supplied a
photograph of the announced application. This phase is the redesign; it adds
no feature and removes none.

## 1. What was taken, and what was not

Taken: the layout language every Mac application shares, which is most of
what the photograph shows — a pale grey source-list sidebar with sentence-case
groups, the document title in the toolbar, a white workspace divided by
hairlines, the board on its own with the notation in a panel beside it, and
disclosure sections in that panel.

Not taken: anything that identifies ChessBase — its name, logo, red, piece
artwork or wording. Kingfisher keeps its own mark, its own blue accent, its own
pieces and its own section names. `docs/design/visual-system.md` states this
line, and it should be kept.

## 2. What changed

- **Tokens** (`src/app/globals.css`, `src/ui/tokens.ts`). A white light theme
  with `surface-sidebar` grey, hairline borders and a blue accent; a matching
  neutral dark theme. The platform face (San Francisco on a Mac, Segoe on
  Windows) replaces Inter as the UI font. Radii 6px for controls and 10px for
  panels; every hard-coded `rounded-[3–6px]` outside the board moved up by 2px.
- **Default theme and board.** Light, and a new board, **Studio** (near-white
  and periwinkle in a navy frame drawn as a ring outside the grid, so pointer
  mapping is untouched). Preferences version 7 moves a profile from dark and
  Midnight once, as version 5 did for Walnut; a choice made afterwards is kept.
  The first-paint bootstrap in `layout.tsx` paints what the migration will
  give, so there is no dark flash. `src/stores/preferences-store.test.ts`
  covers the move and the kept choice, and fails with the migration removed.
- **Sidebar** (`Sidebar.tsx`). 30px rows, 17px icons, sentence-case groups, a
  filled selection with the icon in the accent. Settings is the one labelled
  row at the foot; theme, feedback and collapse are one row of icons with the
  same accessible names as before. All nineteen sections fit 1440x900 without
  scrolling. Width stays 228px and the header geometry is unchanged, so the
  window-button composition `desktop:chrome` asserts is untouched.
- **Header.** The document title first, 15px semibold; New, Import and Export
  as icons (their accessible names are unchanged). The theme switch left the
  header: it is in the sidebar and the phone drawer, and the second copy cost
  routes like Repertoire their actions at 1280px.
- **Notation beside the board.** On a screen at least 860px tall the notation
  is the first section of the side panel — a disclosure, folded or open,
  remembered per browser — and the tools sit below it as pill tabs. The board
  column holds the board alone. On a shorter screen Balanced and Large keep it
  under the board, as before, because half a dock at 720px is too short for
  the explorer's table; `policyMoveTreeHome(priority, shortScreen)` is the
  rule. The label is now "Notation".
- **Board padding.** More air on tall screens, tight on short ones and always
  tight under Maximum — which is what keeps Maximum bigger than Large now that
  the notation leaves the board column under every policy.
- **Menus** measure the room to their nearest clipping ancestor, not the
  window: More, opened mid-panel, went up under the header and could not be
  clicked.
- **Labels.** 163 uppercase, letter-spaced labels became sentence case.

## 3. Evidence

```text
npm test                 301 files, 3469 tests passed, 0 skipped
npm run test:no-skips    OK
npm run typecheck        clean
npm run lint             0 errors (1 pre-existing warning, src/performance/move-search.test.ts)
npm run format:check     clean
npm run build            exit 0
npm run benchmark        exit 0; heaviest route /review 552.9 kB gzipped
npm run docs:check       345/345 checks passed
git diff --check         clean
npm run test:e2e         343 passed, 1 failed (20.2 min, chrome project);
                         the failure asserted the old default ('Dark theme');
                         corrected, then e2e/kingfisher.spec.ts:394 1 passed
npm run visual:baselines 43 passed; Darwin chrome baselines regenerated, inspected
```

Run on the owner's Mac against the working tree at the Phase 82 commit. Not
run: the Firefox/WebKit matrix, and any packaged-application gate.

## 4. What was found on the way

- The first full e2e run (294 passed, 50 failed) was run against the
  intermediate design. The failures were the design's, not the tests', and
  three were real usability defects: clipped menus, a phone with no Notation
  tab, and tools squeezed below usefulness on a 720px screen. All three are
  fixed above. Test changes were limited to what the design moved: the
  sidebar's accessible theme name now contains "theme", so the search mask's
  `getByLabel('Theme')` is scoped to `main`; `engines.spec.ts` read
  `--eval-white` naively and the stylesheet now shortens `#ffffff` to `#fff`.
- Another agent session was running its own e2e suite in this checkout when
  this phase began, against the same dev server this phase was hot-reloading.
  It stopped its run on request. Its Phase 81 commits (`4e154c6`..`20ea90b`)
  were unpushed; the owner then closed that session, and this phase carried
  them. See the Phase 81 handover.

## 5. What remains

- **Linux visual baselines.** The Darwin `chrome` baselines were regenerated
  and inspected; the Linux ones come from `visual-review.yml` and will differ
  until that workflow's artefact is committed.
- **The landing page's product image** still shows the navy design.
- **The packaged Mac application** has not been built or launched with this
  design; `npm run desktop:certify` is the check, and `desktop:chrome` in
  particular, although the header geometry it measures did not change.
- The layout bar above the tool tabs ("Layout · Analysis · 22 tools") is the
  one piece of the old dashboard left in the panel.
