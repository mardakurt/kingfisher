# Phase 46 — Findings

Every finding of the adversarial desktop phase, with an identifier, a class,
a severity, how it was found, what it cost, what fixed it and what pins it.
Nothing here is invented; every reproduction was run on 2026-09-12 on the
maintainer's Mac (macOS 26.6.2, Apple silicon, Electron 44.2.0).

Classes, kept apart because they have different review bars:

- **PRODUCT** — a defect a user could meet.
- **DISTRIBUTION** — a defect in what the public is offered, or how.
- **DOCUMENTATION** — a current document that said something untrue.
- **HARNESS** — a defect in the test infrastructure. Real engineering work;
  not a product defect.
- **QUALITY** — working behaviour that is now better, or an observation
  recorded without a change.

Severity: Critical (authored data loss, security compromise, wrong chess
state, the application does not run), High (a core desktop workflow does
not work, orphan processes, a crash a user meets), Medium (a real bug with
a workaround), Low (minor).

---

## PRODUCT

### BUG-46-01 — The packaged application contained no application

**Severity:** Critical. **Where:** every packaged build from `71ef535`
(Phase 35) to `b77d3a2` (Phase 45), including `/Applications/Kingfisher.app`
on the maintainer's machine.

**Reproduction:** launch the bundle with an isolated profile and read its
log: `Kingfisher.app/Contents/MacOS/Kingfisher --user-data-dir=<tmp>`, then
`<tmp>/logs/kingfisher.log`:

```
[launch] could not start: Kingfisher could not find part of itself:
…/Resources/kingfisher/companion/src/server.mjs
…/Resources/kingfisher/web/server.js
This build is incomplete.
```

The process shows an error box and exits before any window.

**Root cause:** the Phase 35 rewrite of `desktop/electron-builder.yml`
dropped the `extraResources` block that stages the web server, the
companion, the engine catalogue and the tablebase helper under
`Resources/kingfisher/`. Nothing in the test suite read that file;
`verify-dmg.mjs` verified the disk image without asking whether the bundle
could launch; and the Playwright harness reported the exit as
`firstWindow: Timeout`, which Phase 45 recorded as BUG-45-04, "a
Playwright-vs-Electron-44 harness mismatch". Two handovers stated the
packaged application opened correctly from the Finder.

**Fix:** `6b19995` — the block restored, with the `.pgn` file association
and `NSAppTransportSecurity` that went with it.
**Regression:** `desktop/src/builder-config.test.mjs` cross-checks every
staged path against `desktop/src/paths.mjs` (fails five tests on the old
file); `desktop/scripts/verify-dmg.mjs` refuses a bundle without a server;
`scripts/desktop-lib/launch.mjs` puts the shell log in the error when the
process exits before a window; `npm run desktop:smoke -- --packaged` is
17/17.

### BUG-46-02 — The `.pgn` file association was gone

**Severity:** High. Lost in the same rewrite; _Open With → Kingfisher_ did
not exist for any build since Phase 35. **Fix:** `6b19995`.
**Regression:** `builder-config.test.mjs`; `verify-dmg.mjs` asserts
`CFBundleDocumentTypes` names `pgn`; `scripts/desktop-instances.mjs` opens
PGNs through the system.

### BUG-46-03 — The Check for Updates dialog was inert

**Severity:** High. The dialog's preload invokes `kingfisher-update:initial`
and `:dispatch` and sends `:close`; no handler was ever registered in the
main process. Clicking _Check for Updates_ showed "No handler registered
for 'kingfisher-update:dispatch'", _Close_ did nothing, the initial verdict
never arrived. Every packaged build from Phase 35 to 45.
**Found by:** the seeded walk's `update-dialog` action, then a direct probe.
**Fix:** `bd02adc` — `update-window.mjs` registers the three channels once
and refuses a sender that is not the dialog.
**Regression:** `desktop/src/update-window.test.mjs` reads the preload and
requires a handler for every channel it names.

### BUG-46-04 — The update engine never loaded

**Severity:** High. Behind BUG-46-03: `electron-updater` is CommonJS and
exports `autoUpdater` through a getter; `import(...).then(({ autoUpdater })
=> …)` received `undefined` and the first check failed with "Cannot set
properties of undefined (setting 'autoDownload')".
**Fix:** `bd02adc` — read from the default export.
**Regression:** `desktop/src/electron-updater-import.test.mjs` pins the
getter. Live: a packaged check now reaches GitHub and reports truthfully
that v1.0.0 carries no `latest-mac.yml`.

### BUG-46-05 — No update feed in the bundle

**Severity:** Medium. `publish: null` meant electron-builder wrote no
`app-update.yml`; a working engine would have had nothing to ask.
**Fix:** `bd02adc` — the GitHub provider is declared; `build.mjs` passes
`--publish never` so nothing is uploaded at build time.
**Regression:** `builder-config.test.mjs`.

### BUG-46-06 — The board could not be played while an engine arrow was drawn

**Severity:** High. Since Phase 43 (`49b8299`), which removed
`pointer-events: none` from the engine-arrow SVG to make hit lines
hoverable: the SVG is a rectangle over every square, so with an arrow on
the board every click and drag landed on it. Click-click and drag both
failed until the engine was stopped. Web and desktop alike.
**Found by:** the seeded walk — every one of its twenty failed actions was a
`move` after an `engine-start`; confirmed with raw mouse events.
**Fix:** `d4b1ef3`, `b73132e` — the layer receives no pointer events at all;
hover is computed from the board container's pointer position.
**Regression:** `e2e/engines.spec.ts` "the board can be played while an
engine arrow is drawn" (fails on the Phase 45 layer).

### BUG-46-07 — An illegal `bestmove` would be drawn as an arrow

**Severity:** Medium. `bestmove` was recorded verbatim; nothing checked it
against the position. **Fix:** `9fb8bdf` — the session drops a bestmove
that is not legal in the root it asked about; the arrow computation checks
the first PV move too. The check caught a wrong test fixture (castling
through an occupied f1). **Regression:** `uci-adversarial.test.ts` (six
illegal shapes, 2,000 seeded noise lines), `engine-arrows.test.ts`.

### BUG-46-08 — One malformed token killed the companion

**Severity:** High (a single unauthenticated loopback request ended every
engine and open database). `tokenMatches` compared string length, then
handed byte buffers of different lengths to `timingSafeEqual`, which threw
from the request handler before any try/catch; Node ended the process.
Any token with the right number of characters and one non-ASCII character.
**Found by:** `companion/src/server-fuzz.test.mjs` (new), against the real
process. **Fix:** `8710393` — byte lengths are compared first.
**Regression:** the fuzz suite (fails 4/6 on the old code) and
`security.test.mjs`.

### BUG-46-09 — The companion kept reading a body past its limit

**Severity:** Low. `readBody` rejected at 64 MB but kept appending.
**Fix:** `8710393` — the request is destroyed at the limit.

### BUG-46-10 — A companion killed by a signal read as running

**Severity:** Medium. `Service.running` tested `exitCode === null`; a
signal death leaves it null. Diagnostics said a dead companion was up.
**Found by:** `desktop:walk --faults` (seed 7, step 53).
**Fix:** `46185a9`. **Regression:** `services.test.mjs` kills a real child.

### BUG-46-11 — Resize, then close within 400 ms: a main-process exception

**Severity:** Medium. The debounced bounds save called `getBounds()` on a
destroyed window and threw "Object has been destroyed" — which Electron
shows a user as "A JavaScript error occurred in the main process".
**Found by:** `desktop:walk --faults` (seed 7, steps 134 and 243).
**Fix:** `46185a9` — `attachBoundsPersistence` guards the timer and flushes
the last frame on `close`. **Regression:** three tests in
`window-bounds.test.mjs`.

### BUG-46-12 — A failed update check showed headers and a stack

**Severity:** Low. **Fix:** `6ef1d5e` (`describeCheckFailure`): the
three cases a person can meet are named; everything else is one bounded,
redacted line. **Regression:** `update-service.test.mjs`.

### BUG-46-13 — The update dialog claimed background updates

**Severity:** Low. "Kingfisher updates itself in the background" — it never
did. **Fix:** `bd02adc`.

## DISTRIBUTION

### DIST-46-01 — The landing offered a build 104 commits behind master

**Severity:** High. The public `Kingfisher-1.0.0-arm64.dmg` (v1.0.0,
`509eb94`, 2026-09-09) is a complete, working Phase 25 build; master at the
start of the phase was 104 commits and ~32,000 changed lines beyond it
(the updater, the polished DMG, engine arrows, game review, window
restoration…). No mechanism existed to publish a current build without a
version bump, and no check compared the landing to master.
**Fix:** the preview channel (`0f983cc`): `src/release/macos-download.json`
is the one descriptor; `npm run release:mac:preview` publishes a
clean-tree preview as a pre-release under an immutable tag;
`npm run desktop:public:verify -- --full` verifies the public bytes.
**Status:** see the handover for the build published and verified.

### DIST-46-02 — The public 1.0.0 carries five Finder duplicates

**Severity:** Low. `kingfisher-tbprobe 3`, `manifest 3.json`,
`tablebase 3.json`, `package 3.json`, `server 3.js` shipped inside the
bundle from a build machine's staging directory. Harmless at runtime.
**Fix:** not replaced (the release's bytes are immutable);
`verify-dmg.mjs` now refuses a bundle with Finder duplicates and the
tablebase `extraResources` entry names the one file.

### DIST-46-03 — The public 1.0.0 was built from a dirty tree

**Severity:** Low. Its own release manifest records `"dirty": true`.
**Fix:** a publishable channel refuses a dirty tree (`build.mjs`).

### DIST-46-04 — The DMG window showed every label twice and hid its caption

**Severity:** Medium (user-facing install surface). Photographed for the
first time: the background baked the app icon at both positions — a
second Kingfisher bird under the Applications folder — and baked both
labels under Finder's own; the caption at 82 % of the height sat under
Finder's status bar. **Fix:** `b62ba64`.

### DIST-46-05 — The bundle identifier changed between the public build and master

Recorded, not changed: the public 1.0.0 is `dev.kingfisher.app`; every
build since Phase 35 is `app.kingfisher.chess`, which the documentation and
verifier name. The profile directory is derived from the package name, so
data is unaffected (`desktop:upgrade` against the public 1.0.0: 7/7). macOS
treats them as different applications for file-association defaults, and
macOS's update engine would refuse a differently-signed update in any
case; both are stated in the trusted-release runbook.

## DOCUMENTATION

### DOC-46-01 — The three-piece tablebases were four-byte stubs

**Severity:** High (data truth). `0463cab` replaced the four WDL tables with
`stub` files while `THIRD_PARTY_DATA.md` kept describing a set verified
against the publisher's digests; the packaged probe read "stub" as a table
and the smoke's Syzygy check was red. **Fix:** `6b19995` — the real tables
restored, all ten re-verified against
`tablebase.lichess.ovh/tables/standard/sha256`; `tablebase-fixture.test.mjs`
pins the digests.

### DOC-46-02 — The profile directory was named wrong in four places

`~/Library/Application Support/Kingfisher/` on the landing, the install
guide, AGENTS.md and the diagnostics doc; the real directory is
`…/kingfisher-desktop/`. **Fix:** `0f983cc`; `docs:check` pins it.

### DOC-46-03 — SECURITY.md and the claims register described a 1.1.0 that does not exist

"The 1.1.0 binary carries a Developer ID signature… is submitted to Apple's
notary service…" as present tense. **Fix:** `d4b1ef3` — current state and
the future runbook are separated everywhere.

### DOC-46-04 — `release-manifest.md` described a trust boundary the app does not use

The desktop check reads `latest-mac.yml` through `electron-updater`, not
`kingfisher-release-manifest.json`. **Fix:** a status note at the top.

### DOC-46-05 — Personal path in a historical report (BUG-45-03)

Redacted; `docs:check` refuses a personal absolute path in any canonical
document.

### DOC-46-06 — 39 documents unlisted in the docs index

**Fix:** `docs/README.md` classifies every Markdown file.

### DOC-46-07 — Feedback

The production `/api/feedback` answers `503 unconfigured` (probed); the
feedback runbook now says so and names the two variables that would change
it.

### DOC-46-08 — README's desktop table was stale

`dev.kingfisher.app`, "auto-update not implemented", Windows/Linux "build in
CI" (the configuration is arm64-only). **Fix:** `d4b1ef3`.

## HARNESS

### HARN-46-01 — `desktop:certify` could not pass

Wrong DMG directory, a root `npm run desktop:dmg:verify` that does not
exist, `--keep-open` on the smoke, and a static skip-scan called "the unit
tests". It reported PASSED on a bundle that exited on launch (Phase 45
handover §29). **Fix:** rewritten (`46185a9`).

### HARN-46-02 — `verify-dmg.mjs` could never pass

`-mountrandom` made the mount basename random, so the volume-name check
failed first; every `Info.plist` field was read with `defaults read
"${path}"` where `path` was the Node module. **Fix:** rewritten (`6b19995`).

### HARN-46-03 — BUG-45-04 was misdiagnosed

The harness reported a Playwright timeout for a process that had exited.
**Fix:** `scripts/desktop-lib/launch.mjs` races the first window against
the exit and prints the shell log.

### HARN-46-04 — Walk harness defects found and fixed during the phase

A stale palette blocking later clicks; board actions on routes without a
board; an instance count that counted another harness's launch; a
30-second click timeout. All harness-side; none a product defect.

## QUALITY

### Q-46-01 — Build identity

Every packaged build records version, build number, commit, dirty flag and
channel; Diagnostics and the support summary report them.

### Q-46-02 — Companion recovery

_Diagnostics → Restart companion_ when the shell says it is not running
(`46185a9`); the fault walk asserts detection and recovery.

### Q-46-03 — The engine stops when the board leaves the analysed position

Observed, not changed: by the Phase 30 position guard's contract, playing a
move stops the engine and a person starts it again. Recorded here because
a first-time user may expect the engine to follow the board; it is a
design choice, not a defect, and no speculative feature was added.

### Q-46-04 — Companion HTTP fuzzing, engine UCI fuzzing

`companion/src/server-fuzz.test.mjs` (real process, 200 seeded requests
plus shaped malformed ones); `uci-adversarial.test.ts` (2,000 seeded
lines, six illegal bestmove shapes). Both found something (BUG-46-08,
BUG-46-07's fixture) on first run.

## Things NOT found

- No renderer crash, helper crash, unhandled rejection or uncaught
  exception in 2,000 seeded actions plus the soak, other than BUG-46-11.
- No orphan native engine after SIGTERM/SIGKILL of a running engine or
  after any quit; no survivor of any quit.
- No authored data lost in any run, including public 1.0.0 → current.
- No console error in the non-fault walks (0 in 1,000 actions, twice).
- No Save-failed claim.
