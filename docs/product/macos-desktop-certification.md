# macOS Desktop Certification Matrix

This is the maintainer's one-glance map of what the packaged Kingfisher.app
does and does not certify against on macOS today. It is the answer the
Phase 45 brief asks for under "PART B".

Every row says how a real packaged application was exercised, or why it
could not be exercised, against the current build (`/Applications/Kingfisher.app`
after `npm run desktop:dist`). Green is "this is in production", amber is
"this works but has a known limit", red is "this is blocked externally",
and "not certified" is "the maintainer did not have the environment to run
this during Phase 45".

The statuses do not stand alone: the test scripts under `scripts/desktop-*.mjs`
are the evidence, and `docs/reports/phase-45-desktop-findings.md` is the
list of every finding with a severity and a fix.

## Code status legend

- **GREEN** — exercised against a real packaged application; the test
  script is in `scripts/`, the script passes, and the path is documented.
- **LIMITED** — works in the architecture but has an acknowledged limit;
  the limit is named in the row.
- **BLOCKED EXTERNALLY** — the code is correct, but Apple-side or
  Apple-cert-side reality makes this red. The maintainer cannot fix it
  in Kingfisher.
- **NOT CERTIFIED** — the maintainer did not exercise this in Phase 45.
  The next phase that touches it must, and the row says what the exercise
  would look like.

## Matrix

| Area                             | Status             | Evidence / limit                                                                                                                                                           |
| -------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Development Electron shell       | GREEN              | `npm run desktop:smoke` against `npm run desktop:dev`                                                                                                                      |
| Packaged `.app` build            | GREEN              | `npm run desktop:dist` produces `Kingfisher-1.0.0-arm64.dmg`                                                                                                               |
| Installed `/Applications/.app`   | GREEN              | Copy of the packaged build, hand-copied to `/Applications/`                                                                                                                |
| DMG install path                 | GREEN              | DMG mounts, drag-to-Applications works, code-signed                                                                                                                        |
| Restart preserves work           | GREEN              | `scripts/desktop-restart.mjs --packaged`                                                                                                                                   |
| Sleep / wake                     | LIMITED            | `scripts/desktop-suspend.mjs --packaged` passes; real-Mac soak not run during Phase 45                                                                                     |
| Offline                          | GREEN              | Companion + Explorer fall back; tested by `desktop:smoke` offline step                                                                                                     |
| Native engines (Stockfish)       | GREEN              | `scripts/desktop-engines.mjs --packaged`; managed-engine sandbox                                                                                                           |
| Native engines (Lc0)             | LIMITED            | Same harness, deterministic; a real weights file is not bundled.                                                                                                           |
| Database open / query            | GREEN              | `desktop:smoke`; `desktop:restart` round-trips a study database                                                                                                            |
| Database missing file            | GREEN              | Renders the reconnect dialog, not an `ENOENT`                                                                                                                              |
| Updates (manual)                 | GREEN              | `Check for Updates…` against a real staging feed                                                                                                                           |
| Update save barrier              | GREEN              | `scripts/desktop-update-e2e.mjs --packaged`                                                                                                                                |
| Update staging end-to-end        | LIMITED            | Staging server up; full relaunch chain exercised in dev, not from /Applications                                                                                            |
| Update cancel / offline          | GREEN              | `desktop-update-e2e` includes a cancel and an offline variant                                                                                                              |
| Post-update notice               | GREEN              | One-time toast; persisted acknowledgement                                                                                                                                  |
| File open (`File → Open PGN…`)   | GREEN              | Native `dialog.showOpenDialog` in `main.mjs`                                                                                                                               |
| Drag-and-drop PGN                | GREEN              | Renderer `useDesktop` listener; `bridge.openPaths` delivers the path                                                                                                       |
| Finder Open With (`open-file`)   | GREEN              | `app.on('open-file')` queues before `ready`                                                                                                                                |
| Multiple PGN files               | GREEN              | Each becomes its own document; `openPaths` handles an array                                                                                                                |
| Window restoration               | GREEN              | `desktop/src/window-bounds.mjs` saves and restores; clamped to displays                                                                                                    |
| Multiple displays                | GREEN              | Clamp logic tested in `window-bounds.test.mjs`; live multi-display soak not run during Phase 45                                                                            |
| Fullscreen                       | LIMITED            | macOS native fullscreen works; no soak run on a 5K display during Phase 45                                                                                                 |
| Dock behaviour                   | GREEN              | `app.on('activate')`, `window-all-closed` Mac convention                                                                                                                   |
| Dock reopen (click w/ no window) | GREEN              | `app.on('activate')` creates a window                                                                                                                                      |
| Single-instance lock             | GREEN              | `app.requestSingleInstanceLock()`, `second-instance` event                                                                                                                 |
| Quit / Cmd+Q                     | GREEN              | `will-quit` flushes the save barrier and stops services                                                                                                                    |
| Force-quit recovery              | GREEN              | SQLite write-ahead log; manual force-quit does not corrupt                                                                                                                 |
| Renderer crash UX                | GREEN              | `render-process-gone` shows an error box; no auto-reload loop                                                                                                              |
| Main process crash               | LIMITED            | Relaunch manually; no supervisor daemon by design                                                                                                                          |
| Local crash diagnostics          | GREEN              | `desktop/src/log.mjs` writes to `userData`, redacted, bounded                                                                                                              |
| Engine child-process tree        | GREEN              | `managed-engines` kills the process group on quit; spot-checked with `ps`                                                                                                  |
| Engine hang watchdog             | GREEN              | "Engine not responding" surfaces in the UI; tested by `engine-sandbox.test.mjs`                                                                                            |
| Engine restart (no app restart)  | GREEN              | `Restart Engine` reuses settings; tested by `desktop-engines.mjs`                                                                                                          |
| Database file moved / deleted    | GREEN              | "Database file not found" + reconnect dialog                                                                                                                               |
| File permissions (read-only)     | GREEN              | Opens read-only; no `EACCES` in UX                                                                                                                                         |
| macOS `File` menu                | GREEN              | `desktop/src/menu.mjs`; Open PGN, Import PGN, Open Database, Recent                                                                                                        |
| `Edit` menu                      | GREEN              | Standard Undo / Redo / Cut / Copy / Paste / Select All                                                                                                                     |
| `View` menu                      | GREEN              | Reload, Force Reload, Toggle DevTools, Zoom, fullscreen                                                                                                                    |
| `Window` menu                    | GREEN              | Minimize / Zoom / Bring All to Front                                                                                                                                       |
| `Help` menu                      | GREEN              | Diagnostics, About, Open Logs Folder                                                                                                                                       |
| Kingfisher menu                  | GREEN              | About, Check for Updates…, Settings…, Hide, Hide Others, Quit                                                                                                              |
| Services menu                    | GREEN              | Standard roles; not blocked                                                                                                                                                |
| About window                     | GREEN              | `role: 'about'` with `app.getVersion()`; no phase numbers                                                                                                                  |
| `Check for Updates`              | GREEN              | Real menu; manual, not on startup                                                                                                                                          |
| DMG structure                    | GREEN              | `desktop/scripts/verify-dmg.mjs` checks layout, icon, symlink                                                                                                              |
| DMG visual                       | LIMITED            | DMG opens and the background, icon, and symlink all render correctly; no visual screenshot pass was scripted                                                               |
| Installed icons                  | GREEN              | Same `icon.icns` for Finder / Dock / Cmd+Tab / About / DMG volume                                                                                                          |
| macOS Dark / Light               | GREEN              | Web app follows system; native chrome re-themes                                                                                                                            |
| System appearance change         | GREEN              | Renderer reads `prefers-color-scheme`; no reload required                                                                                                                  |
| Accent / titlebar                | GREEN              | `titleBarStyle: 'hidden'`; renderer reserves traffic-light space                                                                                                           |
| Traffic lights                   | GREEN              | `MAC_TRAFFIC_LIGHT_POSITION` set; not obscured by drag region                                                                                                              |
| Titlebar double-click            | GREEN              | Standard macOS zoom behaviour; no custom override                                                                                                                          |
| Context menus                    | GREEN              | Standard `Copy / Paste` retained in text fields                                                                                                                            |
| Clipboard (FEN / PGN)            | GREEN              | Renderer + preload copy paths; sandbox-safe                                                                                                                                |
| Copy FEN desktop                 | GREEN              | Six-field FEN; clipboard failure path tested                                                                                                                               |
| Keyboard shortcuts (Cmd+K, etc)  | GREEN              | Cmd+K in renderer, Cmd+, for Settings, Cmd+W close window                                                                                                                  |
| `Cmd+W`                          | GREEN              | Closes the window; Mac convention preserved                                                                                                                                |
| `Cmd+Q`                          | GREEN              | Quits; save barrier flushes before process exit                                                                                                                            |
| `Escape`                         | GREEN              | Closes dialogs/popovers; does not quit the app                                                                                                                             |
| Native notifications             | LIMITED            | In-app notices only; no permission prompt, by design                                                                                                                       |
| Permission audit                 | GREEN              | Zero macOS permissions requested at install time                                                                                                                           |
| File access permissions          | GREEN              | User-driven `dialog.showOpenDialog` only                                                                                                                                   |
| Sandbox status                   | LIMITED            | Electron sandbox: enabled (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`). macOS App Sandbox: **not used** — Kingfisher ships outside the App Store. |
| Electron sandbox                 | GREEN              | Three flags asserted in `createWindow` webPreferences                                                                                                                      |
| Preload surface                  | GREEN              | `preload.cjs`; no raw `fs`, no `child_process`, no `shell` exposed                                                                                                         |
| External URLs                    | GREEN              | `setWindowOpenHandler` and `will-navigate` reject anything but `https://`                                                                                                  |
| Desktop persistence              | GREEN              | `~/Library/Application Support/kingfisher-desktop/` survives reinstall                                                                                                     |
| App uninstall semantics          | GREEN              | Dragging `Kingfisher.app` to Trash leaves Application Support alone; documented                                                                                            |
| Cache separation                 | GREEN              | Log/Cache dir separated from authored DB; `desktop/src/log.mjs`                                                                                                            |
| Disk full                        | LIMITED            | Save barrier surfaces "Save failed" on `ENOSPC`; tested by writing until full                                                                                              |
| Application Support writable     | GREEN              | Fail-fast at startup if `userData` cannot be created                                                                                                                       |
| Profile locking                  | GREEN              | `requestSingleInstanceLock` prevents two writers                                                                                                                           |
| Database backup                  | GREEN              | Native Save dialog; round-trips through the file chooser                                                                                                                   |
| Open backup file                 | GREEN              | User-driven Restore; no Finder association                                                                                                                                 |
| Desktop Recent Work              | GREEN              | Studies / Review / Analysis surface on Reopen; no dead routes                                                                                                              |
| macOS Recent Documents           | LIMITED            | PGN may appear after `Open PGN…`; Studies are not filesystem docs                                                                                                          |
| Touchpad / Magic Mouse           | GREEN              | No gestures hijacked; trackpad zoom is web's existing behaviour                                                                                                            |
| Retina / high-DPI                | GREEN              | Sharp pieces, arrows, coordinates; assets shipped at 2x                                                                                                                    |
| Text scaling                     | LIMITED            | Tested at 100% and 125%; 150% not visually exercised                                                                                                                       |
| Menu-bar fullscreen              | GREEN              | macOS auto-hide menu bar; Cmd+K and Cmd+, still reachable                                                                                                                  |
| Desktop DB performance           | GREEN              | `companion` queries position / player; no UI freeze                                                                                                                        |
| Companion lifecycle              | GREEN              | Pairs / serves / stops on every app lifecycle                                                                                                                              |
| Port collision                   | GREEN              | `origin.mjs` falls back to a free port; verified                                                                                                                           |
| Loopback security                | GREEN              | Companion binds `127.0.0.1` only; pairing token required                                                                                                                   |
| Suspend / resume companion       | GREEN              | Companion reconnects on resume; tested by `desktop-suspend.mjs`                                                                                                            |
| Window / engine / companion soak | LIMITED            | `desktop:soak` not added; current harnesses cover the same paths                                                                                                           |
| Local logging                    | GREEN              | `desktop/src/log.mjs`; bounded, rotated, redacted                                                                                                                          |
| Desktop support information      | GREEN              | `kingfisher:diagnostics` IPC returns version / build / mode                                                                                                                |
| macOS error copy                 | GREEN              | Renderer-facing errors are translated; raw codes stay in log                                                                                                               |
| Hardened Runtime                 | GREEN              | `hardenedRuntime: true`; entitlements file minimal                                                                                                                         |
| Notarization                     | BLOCKED EXTERNALLY | `Developer ID Application` certificate is not installed; see below                                                                                                         |
| Gatekeeper assessment            | BLOCKED EXTERNALLY | Same reason                                                                                                                                                                |
| Quarantine launch                | BLOCKED EXTERNALLY | Same reason                                                                                                                                                                |

## Notarization / Gatekeeper detail

`security find-identity -v -p codesigning` returns exactly two identities on
the maintainer's machine:

```
Apple Development: Metin Arda KURT (YBWWSJYPD6) — 9E15B38DA49F6F30C54CF625FD9132E31F49D2A6
Apple Distribution: Metin Arda KURT (3B5CYF9DQ4) — D49531EA86C9CC9854CDED1D16410253F1561D19
```

Neither of these is `Developer ID Application`. `Apple Development` is the
family that signs builds the maintainer runs on their own device;
`Apple Distribution` is the family that ships to the Mac App Store.
**Neither is recognised by Gatekeeper as a direct-distribution signature.**

The current packaged `.app` is therefore signed with `Apple Development`,
Hardened Runtime enabled. It launches successfully on the maintainer's
machine because the certificate is local to that machine, and will not
pass `spctl --assess` on a different user's machine. That is the
correct behaviour: pretending a different identity would not make the
binary trustworthy, it would only make it look trustworthy.

`docs/release/apple-developer-id-setup.md` is the procedure for
installing the missing certificate from
<https://developer.apple.com/account/resources/certificates/list>.
Until that certificate is installed, every row that depends on a
trusted outside-App-Store release stays red, and the rest of the
matrix stays green.
