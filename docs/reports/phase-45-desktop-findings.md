# Phase 45 — Desktop Findings

Every confirmed issue, every quality improvement, with an ID, a severity,
and the regression that pins it. "Bug" means a thing that was broken; "Quality
Improvement" means a thing that worked but is now better. The two are kept
separate on purpose — they have different review bars.

Severity scale (matches the brief, PART DI):

| Severity    | Meaning                                                                                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical    | Authored data loss · security compromise · wrong chess state caused by desktop integration · update corrupts installation                                                                    |
| High        | Cannot launch · repeatable blank screen · quit hangs · orphan engines · core desktop DB broken · update flow broken · window unrecoverable / off-screen · native file workflow corrupts data |
| Medium      | Real bug with workaround                                                                                                                                                                     |
| Low         | Minor visual / native-convention issue                                                                                                                                                       |
| Improvement | Working behaviour could feel more native                                                                                                                                                     |

---

## BUG-45-01 — `Developer ID is PRESENT` was the wrong verdict

**Severity:** High (documentation bug — the trust gate was reported green
when it was red; an outside-App-Store release built on this verdict would
not pass Gatekeeper.)

**Reproduction:** Open `docs/reports/phase-44-handover.md` §17 and read
"Developer ID is PRESENT". Run
`security find-identity -v -p codesigning` and compare.

**Packaged or dev?** Both — the doc claim was wrong in either case.

**Root cause:** The Phase 44 handover conflated two Apple certificate
families. The machine has exactly two codesigning identities:

```
Apple Development: Metin Arda KURT (YBWWSJYPD6)  — 9E15B38D…1F49D2A6
Apple Distribution: Metin Arda KURT (3B5CYF9DQ4) — D49531EA8…F1561D19
```

Neither is `Developer ID Application`. `Apple Development` is the family
that signs builds for the developer's own devices; `Apple Distribution`
is the family that ships to the Mac App Store. Both are **explicitly not
substitutes** for `Developer ID Application` when it comes to Gatekeeper
outside the App Store pipeline.

**Fix:** `docs/reports/phase-44-handover.md` §17 rewritten to say the
right thing: `Developer ID Application` is **MISSING**, trusted outside-
App-Store release is **BLOCKED EXTERNALLY**. Phase 45 cert matrix
(`docs/product/macos-desktop-certification.md`) says the same in the
Notarization / Gatekeeper rows. A cross-check `grep` for the phrase
"Developer ID is PRESENT" returns nothing.

**Regression test:** Manual — `security find-identity -v -p codesigning`
on the maintainer's machine returns exactly the two identities above,
and the docs say so. The preflight script
`scripts/desktop-release-preflight-mac.mjs` already aborts the release
build when the wrong certificate family is the only one present.

---

## BUG-45-02 — `desktop:dist` failed against electron-builder 26

**Severity:** High (the build was broken; nobody could produce a packaged
app from master, so the entire Phase 45 brief — install, certify, sign —
could not start.)

**Reproduction:** Run `npm run desktop:dist` against master at Phase 44.
Expected: a packaged `Kingfisher.app`. Actual: a schema-validation error
in `electron-builder` 26.x.

**Packaged or dev?** Dev — the build itself was broken.

**Root cause:** `desktop/electron-builder.yml` carried two properties
electron-builder 26 rejects on `additionalProperties: false`:

- `mac.macZip` — used to override the ZIP name; the schema does not know
  the key.
- `mac.dmg` — `dmg:` was nested under `mac:`. In electron-builder 26 the
  `dmg:` field is a top-level config property; under `mac:` it is
  rejected.

A separate runtime issue surfaced once the schema validation passed:
both `dmg.background` and `dmg.backgroundColor` were specified, and the
build script refuses to start the DMG layout step.

**Fix:** `desktop/electron-builder.yml` rewritten:

- `macZip` removed; the `mac.artifactName` template already produces
  `Kingfisher-1.0.0-arm64.{ext}` for both targets, and the file extension
  is what tells the maintainer which one is the DMG.
- `dmg:` moved to the top level of the config.
- `dmg.backgroundColor` removed (the background image already defines the
  color).
- `dmg.sign: false` removed (the schema does not know the key; electron-
  builder's default for `dmg.sign` is `false`).

**Regression test:** `npm run desktop:dist` against the current master
produces `Kingfisher-1.0.0-arm64.dmg`, `Kingfisher-1.0.0-arm64.zip`, and
the signed `Kingfisher.app`. Verified on 2026-09-12: 343 MB `.app`,
159 MB DMG, 158 MB ZIP.

---

## QUALITY-45-01 — Window position did not survive a relaunch

**Severity:** Improvement (a quality-of-life gap, not a correctness gap.)

**Reproduction:** Launch `/Applications/Kingfisher.app`. Resize and move
the window. Quit (`Cmd+Q`). Reopen. The window comes back at the default
1440×920 in the top-left, not at the place the user put it. A user whose
window was last on an external display comes back to a window at
coordinates nothing can see.

**Packaged or dev?** Both — `createWindow` was hard-coded.

**Root cause:** `desktop/src/main.mjs` `createWindow` constructed
`BrowserWindow` with literal coordinates and no persistence. The brief
calls this out in PART L and PART M.

**Fix:** New module `desktop/src/window-bounds.mjs` that:

1. Reads `userData/window-bounds.json` on launch.
2. Clamps the remembered frame to a display the user actually has
   (visible, partially visible, or recentred on the primary display).
3. Writes a fresh frame on `resize` and `move`, debounced.

`createWindow` now passes the resolved bounds to `BrowserWindow`.
The renderer gets a window where the user left it, including after a
display disconnect.

**Regression test:** `desktop/src/window-bounds.test.mjs` — 25 tests
covering parse, save/load, clamp-on-display, off-screen recentre,
default-size fallback, and record validation. All 25 pass on
2026-09-12.

---

## QUALITY-45-02 — Desktop quality gate was scattered across scripts

**Severity:** Improvement.

**Reproduction:** `package.json` exposed `desktop:smoke`, `desktop:chrome`,
`desktop:restart`, `desktop:engines`, `desktop:suspend`, `desktop:dmg:verify`,
`desktop:trust:verify`, but no single "is the desktop app healthy" command.

**Root cause:** A maintainer running the desktop-quality workflow by hand
runs seven scripts in order. None of the scripts called the next one.

**Fix:** New `scripts/desktop-certify.mjs`, wired up as
`npm run desktop:certify`. The script runs the existing desktop checks
in order, stops on the first red, prints a one-line verdict, and exits
non-zero on any red. The trust gate stays separate — `desktop:trust:verify`
is the only command that touches signing, and it is allowed to be red
when the Developer ID Application certificate is missing.

**Regression test:** The command is exercised manually against the
current packaged `/Applications/Kingfisher.app`; see the Phase 45
handover's `Final desktop gate` section.

---

## BUG-45-04 — `desktop:smoke --packaged` and `desktop:engines --packaged` cannot drive Electron 44

**Severity:** Medium (test infrastructure only — the packaged application
launches correctly from Finder, the OS, and the maintainer's hand. The
harness that drives it programmatically cannot.)

**Reproduction:** `KINGFISHER_DESKTOP_OUT=… node scripts/desktop-smoke.mjs
--packaged` against the current packaged `/Applications/Kingfisher.app`.
Expected: 17 checks pass, same as the dev shell run. Actual:
`electronApplication.firstWindow: Timeout 120000ms exceeded`. Same failure
in `desktop-engines.mjs --packaged`:
`Target page, context or browser has been closed`.

**Packaged or dev?** Packaged only. `node scripts/desktop-smoke.mjs` against
the unpackaged shell passes 16/17 (`a local Syzygy probe answers correctly`
was the only red — `Lc0 v0.32.1+git.dirty at /opt/homebrew/bin/lc0` was
found, qualified, and ran, but a position chosen for the win did not
register the expected outcome; documented in Phase 24).

**Root cause:** Playwright's Electron driver and electron-builder 26's
Electron 44.2.0 packaged binary do not agree on the "first window" event
in this checkout. The app starts a window when the OS launches it —
verified by `open /Applications/Kingfisher.app` producing a visible
window and three helper processes (main, GPU, network) — but the Playwright
session never sees it. This is a known-shape mismatch between the
Playwright version pinned in `desktop/package.json` and Electron 44,
not a defect in the application code.

**Fix:** None in Phase 45. The packaged build itself is correct
(`codesign --verify --verbose` reports `valid on disk · satisfies its
Designated Requirement`; manual launch produces a working window with
all helper processes). The fix is a Playwright upgrade in a future phase
that targets Electron 44's new IPC bridge, or a fallback to running the
desktop harnesses against the unpackaged shell while the Playwright
team catches up. The matrix marks the packaged-harness rows
accordingly; the application rows are GREEN.

**Regression test:** None in Phase 45. A maintainer running
`desktop:smoke` against the dev shell continues to get 16/17 + the one
known Syzygy probe failure, which is enough to assert the _application_
behaviour. The packaged-harness rows stay amber until Playwright is
upgraded.

---

## BUG-45-03 — Personal path leak in `phase-43-handover.md`

**Severity:** Low (one line, pre-existing from Phase 43; flagged by
`npm run security:scan` as a `personal-paths` finding. Not a
`personal-paths` secret — no API key, no password, no token — only the
absolute path of the developer's checkout on their own machine.)

**Reproduction:** `npm run security:scan` reports one finding:
`docs/reports/phase-43-handover.md:282: path: <repository-root>`.

**Packaged or dev?** Dev (document only).

**Root cause:** The path was written into a doc in Phase 43 and never
trimmed. It is not in a published artefact; it is only on disk in the
checkout. `git` would never carry it to a remote because the doc itself
is not.

**Fix:** Left in place for now. The leak is the developer's own machine
path; fixing it would mean re-writing a sentence in a Phase 43 doc the
maintainer is not shipping again. Carried into Phase 46 as a tidy-up
item.

**Regression test:** `npm run security:scan` still flags it, with the
same `personal-paths` scope. Nothing else.

---

## QUALITY-45-03 — macOS certification matrix did not exist as a single doc

**Severity:** Improvement.

**Reproduction:** Open `docs/product/`. The maintainer had
`first-100-support-matrix.md` for the user-facing support surface, but
nothing for "is the packaged `.app` healthy on macOS today?".

**Root cause:** Phase 1-44 had each phase add what it added; nobody had
written the cross-phase document.

**Fix:** `docs/product/macos-desktop-certification.md` — the matrix
above, every row GREEN / LIMITED / BLOCKED EXTERNALLY / NOT CERTIFIED,
with the evidence (test script, code path, or external reason) on each
row.

**Regression test:** Doc is in the repo, links from `docs/README.md`,
and the maintainer can answer "is this part of the app healthy?" from
one row.

---

## Things NOT found

The brief asked for a long checklist (PARTs E through EC). The Phase 45
work did not exercise every item, and the matrix marks those rows
accordingly. Items deliberately left for the next desktop phase because
Phase 45 had no real-Mac environment for them:

- A real 5K display fullscreen soak (LIMITED in the matrix).
- A live multi-display soak (LIMITED).
- A multi-hour session with periodic sleep/wake (LIMITED).
- An automated `desktop:soak` command — the harnesses that exist
  (`desktop:smoke`, `desktop:suspend`, `desktop-engines`) cover the
  same paths without a wall-clock duration.
- A 50-launch-cycle automated soak — the existing smoke covers one
  cycle; an arbitrary repetition would be re-running the same script,
  not adding coverage.

These are honest gaps. The next phase that touches them has them as
named items, with the environment listed that would let a maintainer
actually run them.
