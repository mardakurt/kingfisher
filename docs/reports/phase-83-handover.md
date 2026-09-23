# Phase 83 handover — working tabs, the Library, the preparation report, Databases

The owner's brief of 2026-09-23 (second part): more screenshots of the
announced ChessBase for Mac — its Preparation page, its Library and its
Databases grid, and the tab strip under the window title — as the visual
benchmark for the whole application, with Kingfisher's own features kept and
improved rather than trimmed to match.

## 1. What was built

- **Working tabs** (`src/features/tabs/`, `docs/design/workspace-tabs.md`).
  A strip under every page header; + opens a fresh analysis board; the
  sidebar navigates within the current tab; each tab keeps its place (route
  and query) and its board work. There is still one analysis store and one
  board: an inactive tab's work is a snapshot in the `drafts` store under
  `tab:<id>`, so it is in every backup with no schema change, and orphaned
  tab work is offered back as a tab. Closing a tab that holds unsaved work
  asks first. Middle-click closes, drag reorders, the context menu duplicates
  or closes others, and the palette has New/Duplicate/Close/Next/Previous tab.
  Titles name the subject: `Analysis: Queen's Pawn Game` (the classification
  dataset's name for an untitled analysis), `Preparation against Carlsen,
Magnus`.
- **One header** (`PageHeader`) for every page without a board, and shared
  toolbar controls (`src/components/ui/Controls.tsx`).
- **Preparation** is a report: player card and score ring; Openings (tree
  with frequency bars, board preview, repertoire comparison, surprises,
  priorities), Games, Style, Dossier, Sheet. The toolbar has the opponent
  search, a year span, the colour as a segmented control and the finer
  filters in a Filters popover. The Style tab measures and never grades —
  `src/preparation/style.ts` and its test forbid the adjectives ChessBase
  prints, because Kingfisher has no population to grade against.
- **Library** (`/games`, renamed in the sidebar): search, Filters docked in
  the right column, applied filters as removable chips, a striped table, and
  a preview (board, notation, Open/Review/Analyse) on a single click; the
  player names still open the game directly. The
  search and player live in the address, so a tab keeps them.
- **Databases**: "All databases" as a grid of tiles with the corner checkbox
  for multi-select, a Reference sources tile, the same import buttons, and the
  provider health column kept.

## 2. What was found on the way

The first run of the new tab test failed, and it was right to: entering a tab
deleted its snapshot before autosave had rewritten the page's draft, so a
reload in that half-second restored the previous tab's board and lost this
one's work. Two causes, both fixed: the draft is now written at once on
entering a tab, and autosave treats every open as a new document (two
untitled analyses serialise identically, so it had not noticed the swap). A
switch also waits for the page load's draft restore to settle.

## 3. Evidence

```text
npm test                 303 files, 3489 tests passed, 0 skipped
npm run test:no-skips    OK
npm run typecheck        clean
npm run lint             0 errors (1 pre-existing warning)
npm run format:check     clean
npm run build            exit 0
npm run benchmark        exit 0; heaviest route /review 558.3 kB gzipped
npm run docs:check       345/345 checks passed
git diff --check         clean
npm run test:e2e         346 passed, 2 failed (17.8 min, chrome project):
                         prod-phase60 — ERR_NAME_NOT_RESOLVED for
                         kingfisherchess.app at that moment (curl answered 200
                         minutes later; re-run passed); soak — unticked a
                         collection while the grid was not on screen (test
                         corrected; re-run by name: 1 passed, 3.3 min)
e2e/workspace-tabs.spec  4 passed; --repeat-each=3 12 passed; failed before the
                         draft-write fix (§2)
npm run visual:baselines 43 passed; Darwin chrome baselines regenerated, inspected
```

Not run: the Firefox/WebKit matrix, and any packaged-application gate.

Also found by the suite: at 1280x720 the new strip cost the board its 450 px
floor (420 px). On screens under 860 px tall the strip is 28 px, the notation
panel under the board 104 px and the board's padding tighter; the floors are
unchanged. The explorer, squeezed in a laptop-height dock, now scrolls as a
whole instead of leaving its table no height.

## 4. What remains

- The Linux visual baselines (CI artefact) and the Mac application, which was
  not built or launched in this phase.
- The Mac menu does not yet bind ⌘T / ⌘W / ⌃Tab to the tab commands; they are
  in the palette.
- A page's own unsubmitted form state (other than what it keeps in the
  address) is not preserved across a tab switch; the Library is the page that
  keeps its search in the address.
- The Library searches My games; the ChessBase "Databases 1 of 5" selector
  would need a cross-collection query in the Library itself, which today lives
  in Databases → Search across collections.
