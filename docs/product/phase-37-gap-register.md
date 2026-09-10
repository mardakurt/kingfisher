# Phase 37 — Real Gap Register

> **Subject:** Evidence-based product gaps found during Phase 37.
> Sources: code, tests, runtime probes, doc audit, mutation suite.
> Phase 36 reported **0 open bugs** after a green gate. This register is
> the answer to: what did the green gate miss?

Each entry is one concrete gap. Severity follows the brief's table.

| Severity | Definition                                                   |
| -------- | ------------------------------------------------------------ |
| Critical | Authored data loss / install while data uncommitted / etc.   |
| High     | Update correctness, product state truth, recovery, security. |
| Medium   | Dead workflow, copy wrong, leaks, accessibility, soft bugs.  |
| Low      | Cosmetic or doc-only.                                        |

## Summary at open

| Bucket         | Count  |
| -------------- | ------ |
| Critical       | 4      |
| High           | 6      |
| Medium         | 9      |
| Low            | 5      |
| **Total open** | **24** |

## Open

### GAP-01 — Save barrier returns `ok: true` on every failure path

- **Severity:** Critical
- **Subsystem:** `desktop/src/main.mjs` → `requestSaveBarrier()`
- **Evidence:**
  `desktop/src/main.mjs:600-635`. Three failure paths all resolve `ok: true`:
  1. `no-window` (line 602) — when the BrowserWindow is destroyed.
  2. timeout (line 609) — when the renderer never answers.
  3. `send-failed` (line 632) — when the IPC `send` throws.
     The verdict listener treats `ok: true` as "safe to install." A user
     clicking **Install Update** with a destroyed window, a frozen renderer,
     or a transport failure would still get the install path. The Phase 36
     handover explicitly documents the timeout as "proceeds" — the brief
     calls this out as a Critical gap (PART G).
- **Reproduction:** Block the renderer JS thread; click **Install
  Update**; the timeout resolves `ok: true`; `quitAndInstall()` runs.
- **Affected:** All desktop update paths.

### GAP-02 — No renderer-side save barrier handler

- **Severity:** Critical
- **Subsystem:** `desktop/src/preload.cjs` exposes
  `onSaveBarrierRequest`; no renderer-side code in `src/` registers a
  handler.
- **Evidence:** `grep` over `src/` for `onSaveBarrierRequest` returns 0
  results. The preload wires the IPC contract; nothing in
  `useDesktop.ts`, `useWorkspacePersistence.ts`, or any other module
  calls it. Without a registered handler, every install request falls
  into the GAP-01 timeout path.
- **Reproduction:** Any update install path. The renderer never
  flushes; the main process waits 5 s; falls back to GAP-01.
- **Affected:** All desktop updates.

### GAP-03 — Save barrier has no single-flight

- **Severity:** Critical
- **Subsystem:** `desktop/src/main.mjs` → `requestSaveBarrier()`.
- **Evidence:** Two concurrent `installAndRestart()` calls would
  dispatch two save barrier requests with separate `requestId`s. Both
  promise a `quitAndInstall`. The Phase 36 handover
  (`docs/reports/phase-36-handover.md:30-50`) explicitly notes a "single
  install promise" — but the save barrier substep has no
  `inFlightBarrier` guard. The brief PART I requires request IDs and
  one-shot consumption.
- **Reproduction:** A user who double-clicks **Install Update** while
  the save barrier is pending fires a second barrier. The second
  barrier's listener does not get unregistered, and a late `ok: true`
  from the first request can race with the second request's listener.

### GAP-04 — Save barrier silently succeeds on a destroyed window

- **Severity:** Critical
- **Subsystem:** `desktop/src/main.mjs:601-602`.
- **Evidence:** `if (!state.window || state.window.isDestroyed()) return
Promise.resolve({ ok: true, reason: 'no-window', timedOut: false });`
  — a renderer that crashed, a window the user closed, or a window the
  OS reclaimed silently passes the save barrier. The user's edits are
  no longer in front of a process that could have flushed them, and
  the install proceeds. PART J requires explicit abort on renderer
  disappearance.

### GAP-05 — Post-update UI is unwired

- **Severity:** High
- **Subsystem:** `src/features/release/` (or equivalent) — the renderer
  side of `kingfisher:update-installed` and
  `kingfisher:update-acknowledged`.
- **Evidence:** Main process at `desktop/src/main.mjs:861-868` sends
  `kingfisher:update-installed` to the main window. No code in `src/`
  registers a listener for this channel. The Phase 36 handover
  (`docs/reports/phase-36-handover.md:680-686`) calls this out as
  "the renderer's job." It is still not done.
- **Reproduction:** Open the same Kingfisher build twice. No
  "Kingfisher was updated" notice ever appears. (The acknowledgement
  file in `userData/kingfisher-update-state.json` is also never read
  by anyone in the renderer.)

### GAP-06 — Post-update acknowledgement has no "newer than last

acknowledged" guard on the renderer side

- **Severity:** High
- **Subsystem:** `src/...` — the post-update surface would have to
  compare `currentVersion` to the renderer-known last-acknowledged.
- **Evidence:** Even if GAP-05 is fixed, the renderer must not show
  the notice on dev hot-reload, on the first install of a build, on
  a downgrade, or on every normal launch. PART M requires
  `previousAcknowledged < currentRunning` and PART N requires the
  notice to appear only after the new process actually runs.
- **Reproduction:** TBD once GAP-05 is fixed.

### GAP-07 — `install-macos.md` claims 1.1.0 is notarised today

- **Severity:** High
- **Subsystem:** Documentation.
- **Evidence:** `docs/release/install-macos.md:1-12` claims
  _"Kingfisher 1.1.0 for macOS is Developer ID signed and notarised
  by Apple"_. The current public binary is `Kingfisher-1.0.0-arm64.dmg`
  (the file name is also hard-coded in the same doc at line 27), the
  public 1.0.0 build is not Developer ID signed (the only identities
  on this host are `Apple Development` and `Apple Distribution`), and
  no 1.1.0 release exists. PART P / Q / CQ require the user doc to
  match the public binary that exists today, not the prepared one.
- **Reproduction:** Anyone who reads install-macos.md and applies its
  advice to the actual 1.0.0 download is told the wrong story.
- **Affected:** Every first-time macOS user.

### GAP-08 — `update-service.mjs` has no operation id for late events

- **Severity:** High
- **Subsystem:** `desktop/src/update-service.mjs`.
- **Evidence:** PART T requires an operation/generation id so a late
  `error` or `update-not-available` from a previous check cannot
  overwrite a current check. Currently, every engine event lands in
  `state.verdict` regardless of which check produced it. Two
  `check()` calls in sequence (the second started before the first's
  network reply) can have the first's late `error` event land after
  the second's `update-available` and corrupt the dialog.
- **Reproduction:** Slow check A; user clicks Check again; check B
  succeeds; A's `error` event lands and overwrites the verdict to
  `failed`.

### GAP-09 — Cancel race at 99%

- **Severity:** High
- **Subsystem:** `desktop/src/update-service.mjs` + `kingfisher-updater.mjs`.
- **Evidence:** `cancelDownload()` cancels the active token, but the
  engine can still emit `update-downloaded` between the cancel and
  the next `check()`. PART U requires that cancel + completion event
  produces exactly one terminal state, not a stuck `ready`.
- **Reproduction:** Download reaches 99%; user clicks Cancel;
  electron-updater emits `update-cancelled` followed by a late
  `update-downloaded`; dialog is left in `ready` state.

### GAP-10 — Install while app is quitting

- **Severity:** High
- **Subsystem:** `desktop/src/main.mjs` install path.
- **Evidence:** PART W requires that a normal quit aborts a
  not-yet-consented install. The `kingfisher-update:install` IPC
  handler at `main.mjs:537` calls `installAndRestart` without
  checking `app.isQuitting` / `state.quitting`. A user who clicks
  Install Update while the menu's Quit is in flight can trigger
  `quitAndInstall` from a process that is already on its way out.
- **Reproduction:** Trigger Quit from the menu; within the next
  frame, the renderer also sends `install`. The handler runs
  concurrently with the shutdown.

### GAP-11 — `DesktopBridge` TypeScript surface does not declare

`onSaveBarrierRequest` / `acknowledgeUpdate` / `subscribeUpdates`
(TS-side) — runtime preload exposes them, but `desktop()` returns
a typed bridge that does not include them.

- **Severity:** High
- **Subsystem:** `src/desktop/bridge.ts`.
- **Evidence:** `bridge.ts:87-138` lists `updateStatus`,
  `subscribeUpdates`, `showUpdateDialog` but not `onSaveBarrierRequest`
  or `acknowledgeUpdate`. The bridge contract at
  `src/desktop/bridge-contract.ts:130-148` only lists three of the
  five update channels. The renderer cannot type-safely use the save
  barrier (PART E) or the acknowledgement (PART L).
- **Reproduction:** A future renderer that wires the save barrier
  would have to use `(window.kingfisher as any).onSaveBarrierRequest`
  or `Reflect.get` — defeating the purpose of the typed bridge.

### GAP-12 — Save barrier error model is not a typed result

- **Severity:** High
- **Subsystem:** `desktop/src/main.mjs:600-635`.
- **Evidence:** PART H requires a structured result
  `{ ok: true } | { ok: false, reason: "pending-writes" | "write-failed" | "timeout" | "renderer-unavailable" }`.
  Current code returns `{ ok: true, reason: 'no-renderer-handler' }`
  on timeout, which is a different shape and does not include
  `pending-writes` / `write-failed` distinction. A renderer reporting
  a partial write must produce a reason the UI can act on.

### GAP-13 — Backup restore can partially mutate the live profile

- **Severity:** High
- **Subsystem:** `src/persistence/backup.ts:267-279` (`restoreWorkspaceBackup`).
- **Evidence:** PART AH requires that a failed restore leaves the
  existing local data intact. The current code does clear+put inside
  one `readwrite` transaction; the _transaction_ is atomic, but the
  validation is **outside** the transaction (`parseWorkspaceBackup`
  runs first and throws). The PART-AG concern is a backup that parses
  but has a bad record in a later store — the per-record `validateRecord`
  in `parseWorkspaceBackup` is called before the transaction opens,
  so a corrupt record aborts the whole restore before any write. Good.
  However, PART AH also concerns mid-restore _write_ failures (IndexedDB
  transaction aborts, disk full, etc.). The code does not commit
  record-by-record with a recovery path; a `QuotaExceededError` mid-way
  leaves the database partially written inside an aborted transaction
  (good — atomic) but the _return value_ counts partial records before
  the failure (it does not — it throws). A test that the partial
  count is honest, and that the user's prior data is byte-identical
  to before, is required. The existing `backup.test.ts` does not
  cover this.
- **Reproduction:** Inject a write failure in the second of three
  stores; assert: existing local data is unchanged, the function
  throws, and the partial record count is 0.

### GAP-14 — `BRIDGE_CONTRACTS` does not list every renderer-facing

capability

- **Severity:** Medium
- **Subsystem:** `src/desktop/bridge-contract.ts`.
- **Evidence:** The contract has 15 rows; the runtime bridge has 18
  methods. `openPgn`, `openDatabase`, `recentDocuments` are listed
  with `noCallerBecause`; `onSaveBarrierRequest`, `acknowledgeUpdate`
  are missing. PART BN calls for an exhaustive enumeration.

### GAP-15 — Update dialog close during download does not document

behavior

- **Severity:** Medium
- **Subsystem:** `desktop/src/dialogs/update.js`,
  `desktop/src/update-window.mjs`.
- **Evidence:** PART V requires an explicit decision. The current
  dialog close button calls `bridge.close()` which calls
  `updateWindow.close()`. The download continues in the background
  because `cancelDownload` is not called. The verdict listener
  continues firing into a closed window. This may orphan state and
  trigger `update-downloaded` events that fire after the user
  reopens the dialog.
- **Reproduction:** Click Check for Updates; download begins; close
  the dialog; download completes; reopen Check for Updates; observe
  the stale `ready` verdict replayed.

### GAP-16 — Cache ownership audit reveals dual update caches

- **Severity:** Medium
- **Subsystem:** `desktop/src/update-service.mjs` (Phase 35 leftover).
- **Evidence:** PART Y requires separating automatic update payload
  cache from manual fallback DMG cache. `pruneUpdateCache()` prunes
  `app.getPath('cache')/Kingfisher/updater`, the electron-updater
  cache. A separate manual fallback download path exists in
  `openManualInstaller` and goes through `shell.openExternal`
  (no local download). This is correct — no second cache. However,
  the `manual installer` openExternal pattern leaves the user in a
  browser; PART AA says "no arbitrary GitHub browsing." The fix is
  documentation + URL allow-list verification.
- **Reproduction:** Use Check for Updates; download fails; click
  Download Installer; observe a generic `/releases/latest` page opens.

### GAP-17 — Stale-request stress on Explorer not covered by tests

- **Severity:** Medium
- **Subsystem:** `src/features/explorer/`, `src/stores/explorer-store.ts`.
- **Evidence:** PART AS requires injecting network latency /
  out-of-order completion to ensure old results do not replace
  current position/source/filter. There is no test for this. The
  current code wires the explorer request to a "requestId" but the
  audit needs evidence the requestId is honored across undo/redo and
  route navigation.
- **Reproduction:** Pending test.

### GAP-18 — Player search stale-request stress not covered

- **Severity:** Medium
- **Subsystem:** `src/features/players/` or equivalent.
- **Evidence:** PART AT. Same shape as GAP-17. "Carlsen" then
  "Caruana" then "Carlsen" rapidly. Out-of-order responses.

### GAP-19 — Resource leak audit: no repeated mount/unmount test for

the engine listeners

- **Severity:** Medium
- **Subsystem:** `src/features/engine/`.
- **Evidence:** PART BU requires repeated mount/unmount for engine
  listeners. The existing engine tests do not measure listener
  retention.

### GAP-20 — Engine process leak stress

- **Severity:** Medium
- **Subsystem:** `src/features/engine/`.
- **Evidence:** PART BA requires repeated start/stop to verify
  descendant processes are reaped. The current tests cover a single
  start/stop. A loop of 100 starts/stops with a final process scan
  is missing.

### GAP-21 — Console cleanliness: stale React `act` warnings in

dev-only test paths

- **Severity:** Medium
- **Subsystem:** `src/**/*.test.tsx`.
- **Evidence:** PART BW requires a normal user session to produce
  0 unexpected React warnings, 0 unhandled rejections. The
  existing test runs include a separate environment; this is a
  smoke pass on `npm run dev` for a single representative session
  (open, play a move, save, close).

### GAP-22 — Backup format version boundary

- **Severity:** Medium
- **Subsystem:** `src/persistence/backup.ts:51` `BACKUP_VERSION = 1`.
- **Evidence:** PART AF requires that a future 1.1.0 can restore a
  1.0.0 backup. `parseWorkspaceBackup` enforces exact version
  match (`if (value.version !== BACKUP_VERSION) throw ...`).
  This is correct for now (1.0.0 = 1.0.0), but the rule must be
  documented as "schema is currently v1; future versions may accept
  v1 + write a v2".

### GAP-23 — Update cache pruning ignores cancel-in-flight

- **Severity:** Medium
- **Subsystem:** `desktop/src/update-service.mjs:489-528`.
- **Evidence:** `pruneUpdateCache({ keep = 1 })` does not consider
  whether a download is currently in flight. A prune that runs
  while a download is at 99% can delete the partial file, leaving
  the user with a half-finished download that electron-updater
  does not know about. The prune is only called on shutdown, which
  is after `quitAndInstall`, so it is unlikely to fire here, but
  the call is unguarded.

### GAP-24 — `Backup.version` rejection is silent on minor mismatch

- **Severity:** Low
- **Subsystem:** `src/persistence/backup.ts:174`.
- **Evidence:** A future build may bump `BACKUP_VERSION` to 2. The
  current `parseWorkspaceBackup` throws on any mismatch. A
  downgrade that should be safe (2 → 1 with new optional fields)
  would be rejected, which is correct for now, but the rejection
  message could say which version was expected vs. found.

## Skipped-test audit (out-of-band, see phase-37-handover §16)

The 11 skipped tests are documented and classified in the handover,
not in this register.

## What is NOT in the register

- Routine cosmetic issues.
- Bench / perf-only observations.
- Anything dependent on the missing Developer ID Application
  certificate, which is **BLOCKED** not **FAILED**.
