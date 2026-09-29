# Phase 88 — handover: a failure the interface could not report, and the states a control was missing

Phase 88 was not a feature phase. It was a defect-finding and desktop-UX
session run against local `master` at `49969ec` (Phase 87's work, four commits
ahead of `origin/master` and unpushed). The working tree was clean at the
start and nothing here resets, renumbers or reopens earlier work.

Its finding, in one line: **Kingfisher could tell you a backup had failed and
then draw a green dot beside it**, and the same class of defect — a state the
store can hold that the interface has no way to draw — ran through the
settings, the focus ring and the press behaviour.

## 1. Where this started

```
branch   master
HEAD     49969ec  "the navigation button goes back to the chevron"
origin   0a7d12d  "not-built, handover: the Linux dock failure is fixed…"
status   clean, no stash, no untracked work
```

Four local commits, all Phase 87, all preserved untouched:
`55902b6` (the accent read as text, and six routes had no way to Settings),
`bd5d721` (working tabs get the keys), `0e0dfe6` (the parity record),
`49969ec` (the navigation button goes back to the chevron).

Baseline before any edit, on this tree: `npm test` **3,845 passed / 3,845**,
358 files.

## 2. The defect matrix

Severity is against a workstation user: what does this cost, and can it cost
data.

| #   | Severity                    | Workflow                                  | Defect                                                                                                                                           | Root cause                                                                                                                                              | Fix                                                                                                                                                      | Regression                            | Browser | Packaged |
| --- | --------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------- | -------- |
| 1   | **1 — data safety**         | Settings → Database                       | A **failed** automatic backup rendered as **"Backup 3d ago"** with a **green** dot                                                               | `StatusBar` had no arm for `status: 'failed'`; a failure leaves `lastBackupAt` at its old value, so the missing arm fell through to the ordinary branch | `backup-status.ts` holds the whole mapping as a pure function; `failed` and `unavailable` now have arms                                                  | 10 unit tests, can-fail proven        | ✅      | ✅       |
| 2   | **1 — false claim**         | Any launch where IndexedDB is unavailable | An unreadable backup store left the indicator in `checking` forever — rendered as the most alarming reading — and rejected unhandled             | `useAutoBackup` awaited `getRepositories()` and `mostRecentBackup()` unguarded                                                                          | guard both; a new `unavailable` state that says _unknown_, not _none_                                                                                    | covered by 1                          | ✅      | ✅       |
| 3   | **1 — false claim**         | Settings import                           | A file naming **Deep** while carrying a one-thread, two-line engine left Settings asserting a configuration the engine was not in                | The preset is a _label_; import was the one path writing preferences wholesale without reconciling it                                                   | `reconcileEnginePreset` in `engine/presets.ts`, called from `settings-transfer.ts`                                                                       | 7 unit tests, can-fail proven (4 red) | ✅      | ✅       |
| 4   | **3 — desktop/a11y**        | Every keyboard interaction                | Focus **reshaped the control it was on**. Measured: a `rounded-[6px]` button computed 6px blurred and **3px** focused; a pill became a rectangle | The global `:focus-visible` rule is unlayered, and carried `border-radius: 3px` — unlayered beats all 373 radius utilities                              | delete the declaration; the ring now takes the shape of what it is around                                                                                | measured in-browser, before and after | ✅      | ✅       |
| 5   | **3 — desktop/native feel** | Every click                               | **0 of 50** rendered buttons had a press state (259 hover utilities against 5 press)                                                             | no `--surface-press` token existed, so "pressed" had nowhere to go                                                                                      | new token in both themes; `active:` on Button, IconButton, Segmented, Tabs, Menu, search clear, filter chip, popover, sidebar rows, dock tabs and chrome | measured in-browser, before and after | ✅      | ✅       |
| 6   | **3 — navigation**          | 1280×720 and shorter                      | The whole **Data** group sat below a hard edge with no scroll affordance, and the cut ran through the middle of a row                            | overlay scrollbars are invisible until you scroll; 710px of sections into a 531px box                                                                   | `Sidebar` measures and sets `data-nav-overflows`; `globals.css` fades the list only while there is something below                                       | 4 e2e tests, can-fail proven          | ✅      | ✅       |
| 7   | **3 — a11y**                | Reaching Settings                         | Two controls, one command, named "Settings comma" and "Settings, comma"                                                                          | the sidebar's `<kbd>` leaked into its accessible name; 28 test sites bound to one of them by a punctuation accident                                     | both name themselves "Settings" and announce ⌘, via `aria-keyshortcuts`; one `settingsButton()` helper for all 28 sites                                  | existing 28 sites, now unambiguous    | ✅      | ✅       |
| 8   | **3 — test quality**        | CI                                        | Two drift guards passed **vacuously** — a set comparison over an empty set                                                                       | a moved scan root makes every assertion `''.includes(…) === false` and every loop zero-iteration                                                        | both now prove the scan ran and found something before comparing                                                                                         | can-fail proven                       | —       | —        |

### Suspected, and disproved

- **"23 e2e sites reference a button name that does not exist."** The sidebar
  button's _text_ is `Settings⌘,` with no space, but the accessible-name
  algorithm joins an element's text children with a space, and Playwright's
  substring matching resolves it. Measured in a real browser:
  `getByRole('button', { name: 'Settings ⌘,' })` → **1 match, in the nav**;
  `{ name: 'Settings (⌘,)' }` → **1 match, in the header**. Not broken — but
  every one of those sites was exercising the sidebar, not the header control
  that Phase 87's `55902b6` added. That is defect 7, not a broken suite.
- **"The focus ring is globally inert because 60+ `focus:outline-none`."**
  No. The global rule is unlayered, so it still wins. The utilities are
  redundant, not effective; the real defect was the radius on the same rule.

## 3. What changed

| File                                                                                                                         | Why                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/shell/backup-status.ts` _(new)_                                                                                | The five claims the backup line may make, as a pure function. Same reason `layout-model.ts` holds no React: "which claim is this state making" is a unit test, not a ternary chain in a `footer`. |
| `src/features/shell/StatusBar.tsx`                                                                                           | Draws the indicator from that function; gains a `data-backup-status` test hook.                                                                                                                   |
| `src/features/shell/useAutoBackup.ts`                                                                                        | Guards the read; adds `unavailable`.                                                                                                                                                              |
| `src/engine/presets.ts`                                                                                                      | `presetDescribes` and `reconcileEnginePreset`.                                                                                                                                                    |
| `src/features/shell/settings-transfer.ts`                                                                                    | Calls it at the import boundary.                                                                                                                                                                  |
| `src/app/globals.css`                                                                                                        | Focus ring loses its radius; `--surface-press` added to both themes; the sidebar overflow fade.                                                                                                   |
| `src/components/ui/{Button,Controls,Menu,Tabs}.tsx`                                                                          | Press states; radii onto tokens.                                                                                                                                                                  |
| `src/features/shell/{Sidebar,GlobalControls}.tsx`                                                                            | Press states, tokens, one Settings name, the overflow measurement.                                                                                                                                |
| `src/features/tabs/WorkspaceTabStrip.tsx`, `src/features/workspace/{ModuleTabStrip,WorkspaceToolDock}.tsx`                   | Press states; radii onto tokens.                                                                                                                                                                  |
| `e2e/support/settings-control.ts` _(new)_                                                                                    | The one unambiguous Settings locator, written once.                                                                                                                                               |
| `e2e/sidebar-overflow.spec.ts` _(new)_                                                                                       | Four tests for the affordance and reachability.                                                                                                                                                   |
| `src/features/shell/{backup-status,settings-transfer}.test.ts`                                                               | 17 new unit tests.                                                                                                                                                                                |
| `src/ui/token-references.test.ts`, `src/features/shell/configuration-wiring.test.ts`                                         | Re-armed.                                                                                                                                                                                         |
| `settings-contract.ts`, `ARCHITECTURE.md`, `docs/design/visual-system.md`, `CHANGELOG.md`, `docs/product/platform-parity.md` | Current claims made true.                                                                                                                                                                         |

## 4. Gates

Every command in `docs/operations/after-a-fix.md`, on the final tree. Numbers
are from the run, not from expectation.

| Command                 | Result                                                                      |
| ----------------------- | --------------------------------------------------------------------------- |
| `npm test`              | **3,863 passed / 3,863**, 359 files (baseline 3,845 — this session adds 18) |
| `npm run typecheck`     | clean                                                                       |
| `npm run lint`          | 0 problems                                                                  |
| `npm run format:check`  | all matched files use Prettier style                                        |
| `npm run build`         | exit 0, 22 routes                                                           |
| `npm run test:e2e`      | **430 passed / 430**, 30.7 m, 0 failures, 0 flaky                           |
| `npm run benchmark`     | heaviest route `/studies` 590.1 kB gzipped / 29 scripts                     |
| `npm run test:no-skips` | OK                                                                          |
| `npm run docs:check`    | **357 / 357**                                                               |
| `git diff --check`      | clean                                                                       |

### Packaged macOS, against one `Kingfisher.app`

`npm run desktop:dist` → `1.3.3 · build 973 · 49969ec (dirty) · dev`,
`Kingfisher-1.3.3-dev-973-arm64.dmg`, signed with
`Developer ID Application: Metin Arda Kurt (3B5CYF9DQ4)`, hardened runtime on.
**Notarisation was skipped** — the builder reported `notarize options were
unable to be generated` — so this is a signed dev artifact and nothing more.
It is not published and is not a release.

`npm run desktop:certify -- --app …/mac-arm64/Kingfisher.app --dmg …/Kingfisher-1.3.3-dev-973-arm64.dmg`:

| Step                                  | Result                          |
| ------------------------------------- | ------------------------------- |
| smoke                                 | ✅ 17/17                        |
| chrome (window buttons, every layout) | ✅ 109/109                      |
| restart persistence                   | ✅ 7/7                          |
| engines in the bundle                 | ✅ 25/25                        |
| suspend / resume                      | ✅ 14/14                        |
| walk, 200 actions, seed 46            | ❌ 1 finding                    |
| walk, 120 actions, faults, seed 7     | ✅ 0 findings, 2 console errors |
| dmg                                   | ❌ 1 finding                    |
| zero-skip scan                        | ✅                              |
| unit + integration                    | ✅ 3,863 / 3,863                |

**Two reds, both reported rather than explained away:**

1. **dmg — `build was not made from a dirty tree`.** Correct behaviour: this
   session's work is uncommitted, and the gate is saying so. Not a product
   defect. It clears by committing and rebuilding from a clean tree, which is
   the owner's call.
2. **walk seed 46, step 83 `update-dialog`** — `action-threw: could not click
"OK": Can't get window 1 of process 1 … Invalid index. (-1719)`. A macOS
   Accessibility error meaning the window the harness was about to click was
   already gone. The seeded _action sequence_ is deterministic; the timing of
   a Sparkle update check is not, so the window can leave before the click
   lands.

   Re-run to separate a regression from a race: the same seed, the same 200
   actions, the same bundle, three times —
   `node scripts/desktop-walk.mjs --packaged --seed=46`:

   | run | findings | console errors |
   | --- | -------- | -------------- |
   | 1   | 0        | 0              |
   | 2   | 0        | 0              |
   | 3   | 0        | 0              |

   Three clean passes on the exact seed that had just failed, on the same
   bundle. That is strong evidence of a harness race rather than a regression
   from this session's changes — and it is recorded as evidence, not as a
   green gate. **`desktop:certify` reported this step red and that verdict
   stands.** The harness weakness is itself worth fixing: `desktop-walk.mjs`
   should re-resolve the window, or treat a vanished Sparkle dialog as the
   benign outcome it is, rather than counting it as a finding.

## 5. What this session did not do

- Nothing under `desktop/` or `companion/` changed, so no shell behaviour is
  affected. The macOS work is in shared application code and reaches the
  window through the existing chrome contract.
- The public DMG is still 1.3.3 build 932 `ebd7d63` and does **not** contain
  any of this. No release, publish, notarisation or descriptor change was
  attempted. `docs/product/platform-parity.md` records that gap.
- Chess rule logic, move decoding, engine evidence identity, source
  separation and the read-only ChessBase/En Croissant contracts were audited
  and **not** found to be defective; nothing under those invariants changed.
- The 60 redundant `focus:outline-none` utilities are still there. They are
  inert (the global rule is unlayered) but misleading; removing 60 call sites
  was judged more churn than the defect warranted, and is recorded as a
  follow-up rather than done silently.
