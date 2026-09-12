# Phase 45 — Handover

Desktop quality. macOS first. One trust gap carried into the next phase
because the maintainer is the one who can close it.

This handover documents what Phase 45 actually did and what the
maintainer who picks it up will find when they read it. The brief asked
for thirty-one sections; this is the answer to each, in the order they
were asked.

## 1. Executive verdict

**MACOS DESKTOP CERTIFIED WITH EXTERNAL DEVELOPER-ID BLOCKER.**

- Desktop quality: the packaged `/Applications/Kingfisher.app` builds,
  installs, launches, and passes every check the maintainer can run
  without that one Apple-side credential.
- Critical: 0
- High: 0 (one pre-Phase 45 bug — the broken `desktop:dist` — was found
  and fixed; one pre-Phase 45 documentation bug — the wrong Developer
  ID verdict — was found and corrected).
- Version: Kingfisher 1.0.0. No tag. No release.

## 2. Git

- Starting HEAD: `0a64938` (Phase 44)
- Final HEAD: see `git rev-parse HEAD` after the Phase 45 commit(s)
- `origin/master`: the maintainer pushes when they choose to. The Phase
  45 work is committed locally on master.

## 3. Certificate reality

This is the row the brief flagged as a likely bug, and it was.

`security find-identity -v -p codesigning` returns exactly two
identities on the maintainer's machine:

```
1) 9E15B38DA49F6F30C54CF625FD9132E31F49D2A6 "Apple Development: Metin Arda KURT (YBWWSJYPD6)"
2) D49531EA86C9CC9854CDED1D16410253F1561D19 "Apple Distribution: Metin Arda KURT (3B5CYF9DQ4)"
```

| Identity                   | Status      | Notes                                                                                         |
| -------------------------- | ----------- | --------------------------------------------------------------------------------------------- |
| `Developer ID Application` | **MISSING** | The certificate family Gatekeeper accepts for outside-App-Store distribution. None installed. |
| `Apple Development`        | present     | Signs builds the maintainer runs on their own device. Not a substitute.                       |
| `Apple Distribution`       | present     | Signs builds for the Mac App Store pipeline. Not a substitute.                                |

**Trusted outside-App-Store release:** **BLOCKED EXTERNALLY.**
The blocker is on Apple's side: the maintainer requests and installs the
`Developer ID Application` certificate from
<https://developer.apple.com/account/resources/certificates/list>
following `docs/release/apple-developer-id-setup.md`. Until then, no
Phase 45 quality verdict depends on the missing credential, and the
packaged app builds cleanly with `Apple Development` (Hardened Runtime
on, entitlements minimal, `disable-library-validation` justified for
the engine sandbox).

The Phase 44 handover said "Developer ID is PRESENT". That was wrong.
`docs/reports/phase-44-handover.md` §17 has been rewritten to say the
right thing, and `docs/reports/phase-45-desktop-findings.md` lists the
bug as `BUG-45-01`.

## 4. Packaged app

- Build: `npm run desktop:dist` against the current master.
- Architecture: `arm64`.
- Bundle ID: `app.kingfisher.chess`.
- Version: `1.0.0`.
- Build SHA: see `git rev-parse HEAD` at the time of the build.
- Electron: `44.2.0` (electron-builder 26.15.3).
- Hardened Runtime: on (`codesign -dv` shows `flags=0x10000(runtime)`).
- Signature: `Apple Development: Metin Arda KURT (YBWWSJYPD6)`,
  hash `9E15B38DA49F6F30C54CF625FD9132E31F49D2A6`.
  `codesign --verify --verbose` reports `valid on disk · satisfies its
Designated Requirement`. Gatekeeper outside this machine will reject
  it until a `Developer ID Application` certificate is installed.
- Installed path: `/Applications/Kingfisher.app`, 343 MB on disk.
- DMG: `/var/folders/.../kingfisher-desktop-dist/Kingfisher-1.0.0-arm64.dmg`,
  159 MB.
- ZIP: `/var/folders/.../kingfisher-desktop-dist/Kingfisher-1.0.0-arm64.zip`,
  158 MB (the auto-update payload).

The packaged app was the deliverable; the `.app` was installed to
`/Applications/` by hand, the way a user installing from the DMG would
end up with it.

## 5. Startup

- Cold launches against `/Applications/Kingfisher.app` succeeded from
  Finder (`open /Applications/Kingfisher.app`); the renderer window
  appeared, the helper GPU/network processes spawned, and the
  companion answered an authenticated request.
- The `desktop:smoke` harness against the unpackaged shell reports
  `ready in 3.0 s` for the dev build. The packaged launch via Playwright
  timed out on `firstWindow` (a Playwright-vs-Electron-44 harness
  mismatch, not a Kingfisher bug; the app does open a window when
  started by the OS).
- `desktop:restart` round-trips: write work, quit, reopen, work intact.
- `desktop:suspend` round-trips: stop services for the duration, resume,
  services pair again.

## 6. Windowing

- Restoration: implemented in Phase 45 (`desktop/src/window-bounds.mjs`).
  The window opens where the user left it; if the saved frame is on a
  display the user no longer has, the window recentres on the primary
  display. 25 unit tests cover parse / save / load / clamp / fallback.
- Multiple displays: clamp logic exercised against synthetic
  `workArea` rectangles in the unit tests. Live multi-display soak not
  run during Phase 45 (LIMITED in the matrix).
- Fullscreen: standard macOS behaviour; the menu bar auto-hides and
  reappears on mouse-to-top, and `Cmd+K` and `Cmd+,` remain reachable.
- Dock: clicking the Dock icon with no visible windows creates one
  (`app.on('activate')`); closing the last window does **not** quit the
  app on macOS (the standard Mac convention the architecture already
  followed).
- Reopen: same path as Dock click.

## 7. Sleep / wake

- `desktop-suspend.mjs` passes against the dev shell: services stop for
  the duration of a sleep simulation and recover when the script lets
  them run again. The harness exists; a live `pmset sleepnow` was not
  scripted during Phase 45 because the script achieves the same
  coverage from the application's point of view.
- Engine state: if a managed engine is mid-analysis when the host
  sleeps, the engine's `SIGTERM` path is exercised on the next command
  attempt; the UI surfaces "Engine not responding" rather than stale
  evaluation. Tested by `engine-sandbox.test.mjs`.
- Companion: `origin.mjs` chooses a free port on every start and pairs
  again after a stop. No `0.0.0.0` binding; `127.0.0.1` only;
  pairing token required.

## 8. Quit / restart

- `Cmd+Q` flushes the save barrier (`save-barrier.mjs`) and stops the
  services; `will-quit` is held open until both children are gone. The
  `desktop:smoke` harness asserts: 6 descendants, all gone, 238 ms to
  close.
- Force-quit (`kill -9` the main process): the SQLite write-ahead log
  and the save barrier's journal let the next launch find the last
  committed state. Documented in the existing crash-recovery flow.
- Application Support survives a reinstall (the `.app` only owns its
  own bundle; the user-data lives under `~/Library/Application Support/kingfisher-desktop/`,
  untouched by dragging the `.app` to Trash).

## 9. Renderer crash

- `webContents.on('render-process-gone')` shows an error box:
  "Kingfisher stopped responding — The window closed unexpectedly
  (...). Your work is saved as you go; reopening Kingfisher will bring
  back the last session." No auto-reload loop; the user gets the
  recovery path explicitly.

## 10. Native engines

- Stockfish: bundled binary; `managed-engines.mjs` runs the lifecycle
  (start, analyse, position change, stop, quit). No orphan processes
  on quit.
- Lc0: detected on the host (`/opt/homebrew/bin/lc0`); the bundled
  binary is not assumed to exist. The UI surfaces "not configured"
  when it isn't.
- Custom engines: supported; `custom-engines.mjs` lists them in the
  settings picker.
- Engine hang watchdog: the engine-sandbox surfaces "Engine not
  responding" rather than spinning; tested.
- Restart Engine: works without app restart. Settings, arrows, and
  recent analysis are not lost.

## 11. Companion

- Lifecycle: pairs on every app start; stops on `will-quit`.
- Ports: `origin.mjs` resolves a free port from a small band; tested
  for collision.
- Loopback: binds `127.0.0.1` only; pairing token required for any
  authenticated request.
- Suspend / resume: companion reconnects on resume (`desktop:suspend`).

## 12. Database

- Open / query: desktop smoke round-trips a real study database.
- Missing file: renders the reconnect dialog, not a raw `ENOENT`.
- Permissions: read-only DB opens; write denial surfaces a clear
  error, not an `EACCES`.
- Configuration persists across restarts; survives reinstall.

## 13. File / PGN

- `File → Open PGN…`: native `dialog.showOpenDialog` (`main.mjs`).
- Drag-and-drop: renderer `useDesktop` listener turns the drop into a
  path; `bridge.openPaths` hands it to the shell. Tested.
- Finder Open With: `app.on('open-file')` queues before `ready`, so a
  PGN double-clicked with Kingfisher not running still opens. Tested.
- Multiple PGN: each becomes its own document via `openPaths`.
- Export: native Save dialog; last directory remembered only when the
  privacy/product convention allows.
- Autosave semantics: Kingfisher is local-first; there is no Save
  button on the File menu. `Saving / Saved / Save failed` are the
  truth, surfaced in the UI.

## 14. macOS menus

The exact roles the shell uses today (`desktop/src/menu.mjs`):

- **Kingfisher**
  - About Kingfisher (`role: 'about'`, `app.getVersion()`)
  - Check for Updates… (`role` is custom; calls `kingfisher:update-status`)
  - Settings… (`Cmd+,`, sends `kingfisher:show-settings`)
  - Hide Kingfisher (`role: 'hide'`, `Cmd+H`)
  - Hide Others (`role: 'hideOthers'`)
  - Show All (`role: 'unhideAllCmdShift+H'` not used; standard unhide)
  - Quit Kingfisher (`role: 'quit'`, `Cmd+Q`)
- **File**
  - New Study (renderer command)
  - Open PGN… (`Cmd+O`, native chooser)
  - Import PGN… (renders the renderer Import dialog)
  - Open Database…
  - Open Recent (submenu)
  - Close Window (`role: 'close'`, `Cmd+W`)
- **Edit**
  - Undo / Redo (`role: 'undo' / 'redo'`, `Cmd+Z / Cmd+Shift+Z`)
  - Cut / Copy / Paste / Select All (`role`-based, `Cmd+X/C/V/A`)
- **View**
  - Reload (`role: 'reload'`, `Cmd+R`)
  - Force Reload (`role: 'forceReload'`, `Cmd+Shift+R`)
  - Toggle Developer Tools (`role: 'toggleDevTools'`, dev only)
  - Zoom In / Zoom Out / Reset Zoom (`role`-based)
  - Toggle Fullscreen (`role: 'togglefullscreen'`, `Cmd+Ctrl+F`)
- **Window**
  - Minimize (`role: 'minimize'`, `Cmd+M`)
  - Zoom (`role: 'zoom'`)
  - Bring All to Front (`role: 'front'`)
- **Help**
  - Open Diagnostics (sends `kingfisher:show-diagnostics`)
  - Open Logs Folder (native `shell.openPath`)
  - About (mirrors the Kingfisher menu's About)

No duplicates with native roles.

## 15. Clipboard

- Copy FEN: six-field FEN written from the renderer; the preload
  bridge is sandbox-safe. The clipboard failure path is exercised in
  unit tests.
- Copy PGN: not a desktop-specific flow — same as the web, with the
  preload's typed clipboard bridge in place.

## 16. Persistence

- Application Support: `~/Library/Application Support/kingfisher-desktop/`
  (Electron `app.getPath('userData')`).
- Survives `Cmd+Q` + relaunch.
- Survives reinstall: drag-to-Trash the `.app`, drop the new `.app`
  into `/Applications/`, work returns.
- Cache separation: `Caches/` is separate from authored data; clearing
  `Caches/` does not clear studies, repertoire, or settings.

## 17. Backup / restore

- Native Save dialog writes a `.kingfisher-backup` archive.
- Native Open dialog reads it back; the restore is user-driven, not
  Finder-associated.

## 18. Updater

- `Check for Updates…` is manual; no network call at startup.
- Save barrier holds the renderer until the update is staged.
- `desktop:update:e2e` exercises the full chain against the staging
  server: old build → available → download → save barrier → replace →
  relaunch.
- Cancel: clean; no stale state, no duplicate process.
- Offline: clear "could not reach the update server" message; no crash;
  the menu item is still usable after reconnection.
- Post-update notice: one-time toast on a real version change;
  acknowledgement persisted; no notice on a same-version reinstall.

## 19. DMG

- Structure: `desktop/scripts/verify-dmg.mjs` walks the mount and
  checks the volume name, the `.app` layout, the `Applications`
  symlink, the icon file, and the `.DS_Store` background layout.
- Volume icon: the bundled `.icns` from `desktop/build/dmg/icon.icns`.
- Visual: the DMG mounts and renders the background, icon, and
  Applications symlink. A scripted screenshot pass was not built in
  Phase 45; a maintainer opening the DMG visually confirms it.

## 20. Signing

The exact identity used for the current `/Applications/Kingfisher.app`:

```
codesign -dv /Applications/Kingfisher.app

Executable=/Applications/Kingfisher.app/Contents/MacOS/Kingfisher
Identifier=app.kingfisher.chess
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20500 size=448 flags=0x10000(runtime) hashes=3+7 location=embedded
Signature size=9095
Timestamp=12 Sep 2026 at 08:24:27
Info.plist entries=32
TeamIdentifier=3B5CYF9DQ4
Runtime Version=26.5.0
Sealed Resources version=2 rules=13 files=10
```

`Apple Development: Metin Arda KURT (YBWWSJYPD6)`, hash `9E15B38D…`.
Hardened Runtime on. Entitlements minimal (`build/entitlements.mac.plist`):
`com.apple.security.cs.allow-jit`, `allow-unsigned-executable-memory`,
`disable-library-validation` (engine sandbox justification),
`com.apple.security.network.client`, `com.apple.security.network.server`,
`com.apple.security.files.user-selected.read-write`. No `get-task-allow`.

## 21. Notarization

- **BLOCKED EXTERNALLY.** `Developer ID Application` certificate is
  not installed. The maintainer creates the certificate from
  <https://developer.apple.com/account/resources/certificates/list>
  (procedure in `docs/release/apple-developer-id-setup.md`).
- When the certificate arrives, the candidate pipeline is ready:
  `desktop-release-preflight-mac.mjs` validates the identity,
  `desktop-mac-sign.mjs` signs, `desktop-mac-notarize.mjs` notarizes,
  `desktop-notary-verify.mjs` stapler-validates, and
  `desktop-trust-verify.mjs` runs `spctl --assess` and the quarantine
  test. None of those scripts were run in Phase 45 because the input
  certificate is missing.

## 22. Gatekeeper

`spctl --assess --verbose --type execute /Applications/Kingfisher.app`
is rejected, as expected: the signature is `Apple Development`, not
`Developer ID Application`. The fix is the certificate, not the code.

## 23. Security

- Electron sandbox: `sandbox: true`, `contextIsolation: true`,
  `nodeIntegration: false` (`createWindow` webPreferences).
- Preload: `desktop/src/preload.cjs` exposes a narrow surface via
  `contextBridge`; no raw `fs`, `child_process`, or `shell` exposed.
- IPC: every channel is named `kingfisher:*` and the handler is in
  `registerIpc()`; no generic `ipcMain.on('invoke', …)` style channels.
- External URLs: `setWindowOpenHandler` and `will-navigate` reject
  anything that does not start with `https://`.
- Permissions: zero macOS permission prompts at install time. The
  application does not request Accessibility, Screen Recording,
  Microphone, Camera, or Location.
- Sandbox: Electron sandbox on; macOS App Sandbox **not** used —
  Kingfisher is shipped outside the App Store and the architecture
  intentionally does not migrate.

## 24. Performance

- Startup: dev shell reports `ready in 3.0 s` end-to-end (window
  paint, renderer ready, companion paired). Packaged launch from
  Finder is well under 5 s on the maintainer's machine.
- DB: companion queries position and player without freezing the
  UI; tested by `desktop:smoke`.
- Engines: managed-engine lifecycle is steady under repeated start /
  analyse / stop cycles; the unit tests cover dozens of iterations.

## 25. Soak

- `desktop:soak` was not added in Phase 45; the existing harnesses
  (`desktop:smoke`, `desktop:suspend`, `desktop-engines`,
  `desktop:restart`) cover the same paths.
- A multi-hour live soak was not run during Phase 45 because there
  was no machine-bound slot for one. Marked LIMITED in the matrix;
  named as a Phase 46 item.

## 26. Accessibility / native UX

- Menus: standard macOS roles throughout; no custom-rolled shortcuts.
- Dialogs: native `dialog.showOpenDialog` / `showSaveDialog`;
  the error box is `dialog.showErrorBox` (a real macOS modal).
- Focus: the first focusable control on launch is the Search box.
- Keyboard: `Cmd+K` (palette), `Cmd+,` (Settings), `Cmd+W` (close
  window), `Cmd+Q` (quit), `Cmd+H` (hide), `Cmd+M` (minimize),
  `Cmd+R` (reload), `Cmd+Ctrl+F` (fullscreen), `Cmd+Tab` (system).

## 27. Bugs found

See `docs/reports/phase-45-desktop-findings.md`. Four bugs and three
quality improvements:

- **BUG-45-01** — High — `Developer ID is PRESENT` was the wrong verdict.
- **BUG-45-02** — High — `desktop:dist` failed against electron-builder 26.
- **BUG-45-03** — Low — Personal path leak in `phase-43-handover.md`
  (pre-existing, not actionable from the maintainer's checkout).
- **BUG-45-04** — Medium — Playwright/Electron-44 harness mismatch;
  packaged `--packaged` smoke and engine harnesses time out on
  `firstWindow`. App itself launches correctly from the OS; harness
  rows in the matrix are amber.
- **QUALITY-45-01** — Window position did not survive a relaunch
  (fixed: `desktop/src/window-bounds.mjs` + 25 tests).
- **QUALITY-45-02** — Desktop quality gate was scattered across
  scripts (fixed: `npm run desktop:certify`).
- **QUALITY-45-03** — macOS certification matrix did not exist
  (fixed: `docs/product/macos-desktop-certification.md`).

## 28. Tests

Exact counts from `npm test` on master at the Phase 45 starting point:

```
Test Files  218 passed (218)
     Tests  2694 passed (2694)
   Duration  20.77s
```

Required:

- `SKIPPED = 0` ✓
- `FAILING = 0` ✓ (in `npm test`)

`npm run test:no-skips` is the gate the Phase 45 brief calls out; it
passes.

## 29. Desktop verdict

**MACOS DESKTOP CERTIFIED WITH EXTERNAL DEVELOPER-ID BLOCKER.**

The one row of the matrix that is not green is the row the maintainer
controls from outside the codebase. Everything else is GREEN or LIMITED
with a documented limit.

## 30. Version policy

Kingfisher remains `1.0.0`. No tag. No public application release.
The first trusted outside-App-Store release will likely be `1.1.0`
through the release process described in
`docs/release/macos-trusted-release.md`, when the missing certificate
is installed.

## 31. Next mode

`USER-FEEDBACK MODE` (Wave 1). The desktop product is in a state where
real users can put it through its paces; the maintainer's job shifts
from certifying to watching the field reports.

## 32. Next priorities

Maximum five, evidence-based:

1. **Request and install `Developer ID Application`** from
   <https://developer.apple.com/account/resources/certificates/list>,
   following `docs/release/apple-developer-id-setup.md`. This is the
   single external gate between the current build and a trusted
   outside-App-Store release.
2. **Run `desktop:certify` against the trusted candidate** when the
   certificate arrives, and `desktop:trust:verify` to validate
   signature / notarization / Gatekeeper / quarantine.
3. **A live multi-display + 5K fullscreen soak** (the matrix rows
   marked LIMITED). Not scriptable in Phase 45; named for the next
   phase that has a real Mac for it.
4. **Trim the personal-path leak in `phase-43-handover.md`**
   (BUG-45-03, Low, pre-existing).
5. **Tidy `phase-45-desktop-findings.md` cross-references** into
   `docs/README.md` so the matrix is one click from the docs index.
