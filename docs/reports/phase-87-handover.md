# Phase 87 handover — Kingfisher against ChessBase, reassessed and worked on

_2026-09-27. One brief: reassess Kingfisher as a professional research
workstation against ChessBase (with ten ChessBase-for-Mac photographs from
the owner), then implement, verify and document what that finds. Every
number below comes from a command named here; what was not run is said._

## 0. State

- Started at `0547f38` (= `origin/master`, clean tree). Phase 87's commits
  follow it on **local master; they are not pushed** (see §5).
- No version bump, no release, no published asset touched. The public Mac is
  still **1.3.2, build 908, `6b59452`**; it does not contain Phase 87.
- Node 24.14.0 for every command (`$HOME/.nvm/versions/node/v24.14.0/bin`).

## 1. What was assessed

`docs/product/competitive-assessment-phase-87.md` is the assessment: the
photographs numbered R1–R10 with what each can and cannot establish, the
ChessBase-for-Mac availability read from the publisher's page (November 2026;
a date discrepancy with the Phase 84 audit recorded, not resolved), a
workflow matrix W1–W8 with the test behind each verified cell, content kept
apart from workflow, measured before-and-after numbers, and the verdict.

**Verdict:** yes on the core workflows with the data a player has; not yet
an alternative for a professional who depends on ChessBase's annotated
corpus, remote engines on a second machine, a ChessBase file verified in
ChessBase, or Windows — each blocked on content, hardware or a licence.
Whether the new layouts are more comfortable needs strong players to say;
no user evaluation was run.

## 2. What was found and changed

Baseline measurements came from a worktree of `0547f38` served on port 3211
beside master on 3210, with the same scripts
(`docs/release-evidence/phase-87/ux/`).

| Finding                                                                                                                                        | Commit    | Test that fails without it                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------- |
| Preparation offered Carlsen with "no reference games" while the packs loaded (Players: 705); the report called the pack's 300-game cap "found" | `ec5d5e9` | `e2e/preparation-counts.spec.ts`; `players.test.ts`  |
| Notation a 63px strip under the board below 860px tall; explorer table 650px wide in a 380px panel; a 36px layout row on every dock            | `dcd1c0a` | `e2e/analysis-laptop.spec.ts`; `e2e/phase10.spec.ts` |
| The skip-to-start and skip-to-end icons drew each other's glyph                                                                                | `e0f9550` | `src/components/icons.test.tsx`                      |
| Library: Open after stepping the preview started at move one                                                                                   | `68dfff6` | `e2e/library-continuity.spec.ts`                     |
| Sidebar: Databases below the fold at 1280x800 and 1440x860; Library in the last group                                                          | `d03ffd6` | `e2e/navigation-order.spec.ts`                       |
| Tab strip ignored its padding and gaps (the seven-pages audit caught the clipped button after `dcd1c0a`)                                       | `1738396` | `e2e/seven-pages-layout.spec.ts`                     |
| Empty Repertoire: three create buttons; Studies: two; "No route context available"                                                             | `243dc62` | `e2e/empty-states.spec.ts`                           |
| Enter before the player library loaded found nobody; the dossier never showed scores                                                           | `ea7de86` | `e2e/preparation-counts.spec.ts`; `dossier.test.ts`  |
| Three accent "Connect Lichess" buttons for one credential                                                                                      | `7d1b949` | none (visual)                                        |
| No layout showed notation, explorer and engine at once; a short engine panel had no room for its lines                                         | `e762a23` | `e2e/analysis-laptop.spec.ts`                        |
| Docs and Settings copy made untrue by the above                                                                                                | `7dde258` | `npm run docs:check`                                 |
| Assessment, documentation audit, evidence                                                                                                      | `649205b` | —                                                    |
| Repertoire's side panel could not scroll, so Position evidence collapsed once the notation sat above it (the full e2e run caught it)           | `2a08341` | `e2e/phase7.spec.ts` "stale edits"                   |
| macOS visual baselines for the two shots changed on purpose                                                                                    | `c934bdc` | `e2e/visual.spec.ts`                                 |

"Fails without it" means the change was reverted once and the test run; the
commit messages say how.

**A correction on the record.** `dcd1c0a`'s message says the explorer shows
"five rows where three were". Three was an intermediate state. Against the
baseline, the explorer shows **5 readable rows at 1280x720 where it showed
9**, because the notation now takes a third of the column; the board gained
104px and the notation went from two lines to the whole game. The assessment
§6 states the trade-off; it should be put to users.

## 3. What was run

| Command                                                                 | Revision    | Result                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                                              | `649205b`   | 3,793/3,793, 354 files (and again inside certify at `c934bdc`)                                                                                                                                                                                                   |
| `npm run typecheck`                                                     | `649205b`   | clean                                                                                                                                                                                                                                                            |
| `npm run lint`, `npm run format:check`                                  | `649205b`   | clean after the evidence scripts were tidied (the first run flagged only my scratch scripts)                                                                                                                                                                     |
| `npm run build`                                                         | `649205b`   | exit 0                                                                                                                                                                                                                                                           |
| `npm run test:e2e` (Chrome)                                             | `649205b`   | 409/412: phase7 "stale edits" (fixed in `2a08341`), two visual baselines (updated in `c934bdc` after reading the diffs)                                                                                                                                          |
| `npm run test:e2e` (Chrome)                                             | `c934bdc`   | **412/412**, 0 flaky (retries = 0), 26.5 min                                                                                                                                                                                                                     |
| `e2e/visual.spec.ts` (Chrome) twice after the update                    | `c934bdc`   | 43/43, 43/43                                                                                                                                                                                                                                                     |
| `e2e/visual.spec.ts` chromium, firefox, webkit (matrix mode), two shots | `c934bdc`   | 9/9                                                                                                                                                                                                                                                              |
| `npm run benchmark`                                                     | `c934bdc`   | exit 0 (its "FAIL PGN variations" line is the standing chess.js-replacement evaluation, decision REJECT, as in Phase 86)                                                                                                                                         |
| `npm run docs:check`                                                    | this commit | 345/345                                                                                                                                                                                                                                                          |
| `git diff --check`                                                      | this commit | clean                                                                                                                                                                                                                                                            |
| `npm run desktop:dist` (dev channel, no release credentials)            | `c934bdc`   | **1.3.2 · build 925 · `c934bdc` · dev**, signed Developer ID, not notarised; fresh packaged boot verified; output `~/KingfisherWork/desktop-out-p87/`                                                                                                            |
| `npm run desktop:certify -- --dmg=…dev-925-arm64.dmg`                   | `c934bdc`   | **10/10**: smoke 17/17, chrome 109/109, restart 7/7, engines 25/25, suspend 14/14, walk seed 46 ×200 (0 findings, 0 console errors), walk seed 7 ×120 with faults (0 findings, 2 console errors under injected faults), DMG verified, no skips, unit 3,793/3,793 |

**Not run:** the Firefox/WebKit/Chromium matrix beyond the two visual shots;
the Linux visual comparison (`visual-review.yml` is a manual dispatch and
needs a push); notarisation, `desktop:trust:verify`, `update:real`, the
thirty-minute soak and the other Section B release gates (no release was
made); `deploy:status` and a look at the live site (nothing was pushed);
any hands-on ChessBase run (no licence; ChessBase for Mac unreleased).

## 4. Documentation

`docs/reports/phase-87-documentation-audit.md` records the scope (all 264
tracked Markdown files), the method (docs:check, a targeted search for what
Phase 87 moved, full reads where it hit) and the disposition per category.
Corrected: ARCHITECTURE (notation home, presets, board policy), the visual
system, getting-started, the first-hundred guide, platform-parity (Phase 87
revision entry), CHANGELOG (Unreleased (web)), the Board priority hint and
settings contract. Added to the index: the assessment, this handover, the
audit, the evidence, and the Phase 86 handover the index had missed.
"All documentation is current" is **not** claimed; what was not read is
listed there.

## 5. What remains

1. **Push and deploy.** The commits are local. `docs/operations/after-a-fix.md`
   A.9–A.11 (push to master, which deploys production, `deploy:status`, a
   look at the live page) were not done in this session: pushing changes
   what every visitor to kingfisherchess.app sees and was left for the owner
   to approve. After the push, run `visual-review.yml` with `mode=update`
   for the two Linux baselines (`analysis-laptop-chrome-linux.png`,
   `endgame-chrome-linux.png`) and review them.
2. **The Mac.** The public 1.3.2 lacks Phase 87. A package from this source
   is certified (§3); Section B (version, notarisation, publish, descriptor)
   is the owner's call.
3. **User evaluation** of the laptop trade-off (explorer 9 → 5 rows) and the
   layouts, with strong players, coaches and seconds.
4. **Matrix engines.** Their macOS visual baselines were already stale before
   this phase (the WebKit endgame baseline predates Phase 86's "What can
   answer here"); the full matrix was not run.
5. Unknowns from the assessment's workflow matrix: whether Back to Library
   keeps the list's scroll and selection at a million games (W1); a density
   pass over a study's chapter list (W6).
6. Blocked, unchanged from Phase 86: a remote engine on a second machine, a
   ChessBase export opened in ChessBase, Windows, a licensed annotated corpus.

Kept on this Mac: `~/KingfisherWork/desktop-out-p87/` (build 925 app, DMG,
ZIP).

## 6. After the handover (same day, at the owner's request)

The owner asked for everything in §5 except a ChessBase run (no licence).
In order, with results:

| Step                                                          | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Push `7396eac`; `deploy:status`                               | production up to date; the live site checked in the browser at 1280x720 (notation beside the board, layout icon, corrected skip icon)                                                                                                                                                                                                                                                                                                                         |
| Linux baselines (`visual-review.yml` update, run 36325202985) | 21 changed, read and committed; compare run 36325460371 **success**                                                                                                                                                                                                                                                                                                                                                                                           |
| Four-browser matrix at `7f23b85`                              | **1,647/1,648** — one WebKit failure, `backup-restore` "a backup survives a profile that no longer exists"                                                                                                                                                                                                                                                                                                                                                    |
| That failure                                                  | WebKit left the profile delete unanswered about one run in three to eight. Fixed in `c2d0836`: the streaming cache closes on `versionchange`; Download backup stops leaking a connection; the test closes the app's page and requires every delete to succeed. WebKit 12/12, then all four engines ×4, 32/32. Which connection WebKit held after a mere navigation is **not established**                                                                     |
| The owner: "the favicon on the web is the old icon"           | The site served the new bytes. Fixed in `4d00913`: manifest icons carry the mark's version; the offline worker's freshness stamp (which never stuck) replaced; the old GitHub Pages address, still serving the whole previous landing with the old mark, now forwards to kingfisherchess.app (`publish:site`, kingfisher-data `726b89f`, reference data untouched). A visitor's own browser favicon store may still hold the old picture until it revalidates |
| The owner preferred the previous sidebar                      | Reverted in `767d863`; docs and baselines follow                                                                                                                                                                                                                                                                                                                                                                                                              |
| Gates at `767d863`                                            | unit 3,798/3,798 (356 files), typecheck, lint, format, docs 345/345, diff-check, build, e2e **409/409** (the three removed navigation tests account for 412 → 409)                                                                                                                                                                                                                                                                                            |
| Linux baselines again (run 36338389767)                       | 18 changed (those with a sidebar), committed `ebd7d63`; compare run 36338625417 **success**                                                                                                                                                                                                                                                                                                                                                                   |
| Release 1.3.3 (Section B)                                     | preflight GREEN; `desktop:dist` stable: **1.3.3 · build 932 · `ebd7d63`**, notarised and stapled; DMG notarised (submission 530f2136…); appcast; `desktop:trust:verify` GREEN; `verify-dmg` verified; `desktop:certify` **10/10**; `release:mac:publish v1.3.3`; `--latest`; the feed redirects to v1.3.3; `desktop:update:real` from 1.3.2 build 908 with the public feed **PASS 19/19**                                                                     |
| Descriptor and documents                                      | `macos-download.json` → 1.3.3 (SHA-256 `0d558a60…`, 191,953,378 bytes); release manifest regenerated; README, SECURITY, install guide, launch kit, public claims, security page, AGENTS; `docs:check` 345/345                                                                                                                                                                                                                                                 |

After the push of `2986faa`: `deploy:status` up to date; the live landing links only `Kingfisher-1.3.3-arm64.dmg`; `desktop:public:verify -- --landing --full` **67/67, every byte**.

Still not done: a quarantined first launch from a real Finder download with
Gatekeeper's sheet (it needs the owner at the machine); the eight-hour soak.

## 7. The not-built list, worked from the easiest (2026-09-27/28)

The owner asked for the remaining items of `docs/product/not-built.md` to
be taken in order of how little time each needs, completed, and struck off.

| Item                                     | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every document read in full              | **Done.** The categories the audit had only searched were read end to end (`phase-87-documentation-audit.md`, per category). The read corrected the data inventory (rewritten from the six published manifests), pack sizes that left out history chunks, two security reviews that read as current, issue templates naming places the app does not have, and a test path. It also found stale figures in **source**: the public landing quoted Elite OTB v2 and four packs of six; the Starter and six-month catalogue rows under-stated what an install writes (24.3 → 41.3 MB, 9.0 → 13.5 MB), which the storage check reads; the security page cited two files that do not exist and claimed an outbound-link allow-list nothing implements; eighteen `{}` in the public pages dropped a space. All fixed (`c9aa8aa`, `6b283ad`), with two new `docs:check` rules, each run against the defect first |
| Keyboard access, visible focus, contrast | **Done for text and focus.** `e2e/phase87-pages-audit.spec.ts` holds the six Phase 87 screens to the Phase 86 page audit (crowding, nested scrolling, clipping, text ≥ 4.5:1) at four window sizes in both themes, and the Tab-through focus test now covers them: no findings. Both were made to fail first (a lowered `--text-tertiary`; a rule removing every outline). Non-text contrast and a screen-reader walk remain on the list                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| The Mac application offline              | **Done.** `desktop:walk --offline` (new): 300 actions on 1.3.3 build 932 with every non-loopback request cancelled from launch, 0 console errors, 0 findings, 0 surviving processes. The filter was shown to work in that bundle (lichess.org blocked offline and reached online)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Gates at `ae06571`: unit 3,798/3,798 (356 files), typecheck, lint, format,
`docs:check` 356/356, diff-check, build, e2e **413/413**; pushed,
`deploy:status` up to date, the live landing shows the six packs with v4's
figures. A full Chrome run also passed at `ae7d21e` (413/413) after the
dev server of an earlier attempt died mid-run and every later test failed
to connect — a harness failure, rerun rather than reported as a result.
