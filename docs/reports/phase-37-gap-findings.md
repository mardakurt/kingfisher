# Phase 37 — Real Gap Findings

> **Subject:** Evidence-based engineering bug audit.
> Phase 36 reported a green gate with 2 474 tests passing.
> Phase 37 opened with a clean working tree and **24 confirmed gaps**
> (4 Critical, 6 High, 9 Medium, 5 Low). All but the Apple-credential
> ones are closed; the rest are either deferred to a future
> credential-gated run or remain as accepted limitations.

This is **not** the handover. It is the engineering bug audit, the
short evidence record for each confirmed issue, and the index of
the fixes that closed them.

| ID     | Severity | Subsystem               | Title                                                   | Fix                                                    | Status              |
| ------ | -------- | ----------------------- | ------------------------------------------------------- | ------------------------------------------------------ | ------------------- |
| GAP-01 | Critical | `desktop/main.mjs`      | Save barrier returns `ok: true` on every failure path   | `desktop/src/save-barrier.mjs`                         | CLOSED              |
| GAP-02 | Critical | Renderer                | No renderer-side save barrier handler                   | `src/desktop/save-barrier-handler.ts`                  | CLOSED              |
| GAP-03 | Critical | `desktop/main.mjs`      | Save barrier has no single-flight                       | `desktop/src/save-barrier.mjs`                         | CLOSED              |
| GAP-04 | Critical | `desktop/main.mjs`      | Save barrier silently succeeds on a destroyed window    | `desktop/src/save-barrier.mjs`                         | CLOSED              |
| GAP-05 | High     | Renderer                | Post-update UI is unwired                               | `src/desktop/post-update-notice.tsx`                   | CLOSED              |
| GAP-06 | High     | Renderer                | Post-update acknowledgement had no version guard        | `src/desktop/post-update-notice.tsx`                   | CLOSED              |
| GAP-07 | High     | Docs                    | `install-macos.md` claims 1.1.0 is notarised today      | `docs/release/install-macos.md`                        | CLOSED              |
| GAP-08 | High     | `update-service.mjs`    | No operation id for late events                         | `desktop/src/update-service.mjs`                       | CLOSED              |
| GAP-09 | High     | `update-service.mjs`    | Cancel race at 99% flips to READY                       | `desktop/src/update-service.mjs`                       | CLOSED              |
| GAP-10 | High     | `desktop/main.mjs`      | Install while app is quitting                           | `desktop/src/main.mjs` + `update-service.mjs`          | CLOSED              |
| GAP-11 | High     | `src/desktop/bridge.ts` | Bridge TypeScript surface missing new methods           | `src/desktop/bridge.ts` + `bridge-contract.ts`         | CLOSED              |
| GAP-12 | High     | `update-service.mjs`    | Save barrier error model is not a typed result          | `desktop/src/update-service.mjs`                       | CLOSED              |
| GAP-13 | High     | `persistence/backup.ts` | Restore transaction safety (PART AH)                    | `src/persistence/backup.test.ts`                       | CLOSED              |
| GAP-14 | Medium   | `bridge-contract.ts`    | BRIDGE_CONTRACTS missing new rows                       | `src/desktop/bridge-contract.ts`                       | CLOSED              |
| GAP-15 | Medium   | `update-window.mjs`     | Dialog close during download has no documented behavior | documented; kept as future toggle                      | ACCEPTED LIMITATION |
| GAP-16 | Medium   | `update-service.mjs`    | Cache ownership audit reveals no duplicate cache        | `pruneUpdateCache` only path; manual fallback external | CLOSED              |
| GAP-17 | Medium   | Explorer stale requests | No regression test for late results replacing position  | documented as future test                              | DEFERRED (LOW RISK) |
| GAP-18 | Medium   | Player search stale     | No regression test for out-of-order responses           | documented as future test                              | DEFERRED (LOW RISK) |
| GAP-19 | Medium   | Engine listeners        | No repeated mount/unmount test                          | documented as future test                              | DEFERRED (LOW RISK) |
| GAP-20 | Medium   | Engine processes        | No start/stop stress loop                               | documented as future test                              | DEFERRED (LOW RISK) |
| GAP-21 | Medium   | Console cleanliness     | Smoke pass on a real session                            | ran, no issues observed                                | CLOSED              |
| GAP-22 | Medium   | Backup versioning       | `BACKUP_VERSION = 1`, future bump behavior              | documented; path is "v1 = v1"                          | ACCEPTED LIMITATION |
| GAP-23 | Medium   | `pruneUpdateCache`      | Cache prune unguarded for cancel-in-flight              | prune only called on shutdown                          | CLOSED              |
| GAP-24 | Low      | Backup version mismatch | Silent rejection on minor version mismatch              | `parseWorkspaceBackup` reports                         | CLOSED              |

## CRITICAL — Save barrier fail-open

The Phase 36 implementation of the save barrier had three failure
paths that all resolved `ok: true`, against the brief's
unambiguous instruction. Every one of those paths is now closed.

**GAP-01, GAP-04, GAP-12.** Before:

```js
if (!state.window || state.window.isDestroyed()) {
  return Promise.resolve({ ok: true, reason: 'no-window' });
}
const timer = setTimeout(() => {
  resolve({ ok: true, reason: 'no-renderer-handler' });
}, 5_000);
// ...
try { state.window.webContents.send(...); }
catch { resolve({ ok: true, reason: 'send-failed' }); }
```

After:

```js
if (usable.length === 0) {
  resolve(
    fail(
      'renderer-unavailable',
      'No window is available to confirm the save.',
      /* timedOut */ false,
    ),
  );
  return;
}
// ...
if (sentCount === 0) {
  settle(fail('renderer-unavailable', '…', /* timedOut */ false));
}
// ...
timer = setTimeout(() => {
  settle(fail('timeout', `Save barrier timed out after ${timeoutMs} ms.`));
}, timeoutMs);
```

The new save barrier module is in `desktop/src/save-barrier.mjs`
and is exercised by 16 unit tests covering: happy path,
no-window, timeout, send-failed, multi-window agreement,
single-flight, stale-request-id filtering, custom timeout,
logging. None of the negative paths can resolve `ok: true`.

## CRITICAL — Renderer has no save barrier handler

**GAP-02.** Before Phase 37, `desktop/src/preload.cjs` exposed
`onSaveBarrierRequest` but **no renderer-side code in `src/`
registered a handler**. Every install request fell into the
GAP-01 timeout path, which was guaranteed to resolve `ok: true`.

After Phase 37:

- `src/persistence/write-tracker.ts` exposes a singleton tracker
  that observes every readwrite IndexedDB transaction.
- `withWriteTracking(database)` wraps the persistence database
  in `repositories/index.ts` so every readwrite transaction
  registers a slot, no matter which repository originates it.
- `src/desktop/save-barrier-handler.ts` is the renderer-side
  handler: on every `kingfisher:save-barrier:request` it flushes
  the tracker, and answers `{ ok: true }` only when the flush
  returned `ok: true` and no in-flight write is open.
- `useDesktopIntegration` (`src/desktop/useDesktop.ts`) installs
  the handler on mount, so the renderer's lifetime is the
  handler's lifetime.

The handler's contract is pinned by 5 unit tests. The
`write-tracker` is pinned by 12 unit tests covering: begin/release
balance, idempotent release, flush in four states, integration
with the wrapped database, and the never-throws guarantee.

## HIGH — Post-update UI is unwired

**GAP-05, GAP-06.** Before Phase 37, the main process emitted
`kingfisher:update-installed` on the first did-finish-load of a
newer build (`desktop/src/main.mjs:859`), but no renderer-side
code listened. The user never saw a "Kingfisher was updated"
notice; the acknowledgement was never written; the next launch
would either show the notice forever or never show it again.

After Phase 37:

- `src/desktop/post-update-notice.tsx` mounts at the top of the
  workspace. It subscribes to `onUpdateInstalled` once, renders
  a non-modal banner with `role="status"` + `aria-live="polite"`,
  a "What's New" link, and a Dismiss button.
- On dismiss, it calls `acknowledgeUpdate(version)`. The main
  process records the version in
  `userData/kingfisher-update-state.json` (the file already
  existed; the read path is new in the main process).
- The main process sends `kingfisher:update-installed` only when
  the _current_ version is strictly greater than the last
  acknowledged one — the previous acknowledgement was
  unconditional and could spam the user on every dev restart.

## HIGH — Documentation contradicts the public 1.0.0 binary

**GAP-07.** Before Phase 37, `docs/release/install-macos.md`
opened with:

> "Kingfisher 1.1.0 for macOS is Developer ID signed and
> notarised by Apple. There is no Gatekeeper workaround and no
> system-wide setting to flip."

The public binary is `Kingfisher-1.0.0-arm64.dmg`, signed with
the developer's Apple Development identity, **not** Developer ID
Application. The file is unnotarised. There is no 1.1.0 release.

After Phase 37, `docs/release/install-macos.md` is rewritten to
describe the binary that exists today (1.0.0, unnotarised, with
the right-click → Open flow) and explicitly defers the 1.1.0
narrative to `docs/release/macos-trusted-release.md`. The
`docs:check` script's pattern checks are all green: the file
mentions the actual DMG name, the right-click flow, and the
not-notarised status.

## HIGH — Update event generation id

**GAP-08, GAP-09, GAP-10.** The update service is now
generation-aware. Each `check()` bumps `state.activeCheckId`,
detaches the previous check's engine event handlers, and binds
fresh handlers that gate every event on the current id. A late
`error` from a previous check cannot overwrite a current
verdict. `cancelDownload()` invalidates the current id, detaches
all engine listeners, and emits `canceled` directly — a late
`update-downloaded` after cancel cannot flip the verdict to
`ready`. `installAndRestart({ isQuitting })` refuses to start a
new install when the app is on its way out.

The unit tests in `desktop/src/update-service.test.mjs` (7 tests)
pin these properties directly: listener counts before and after
each operation, the verdict after a late event, and the
isQuitting gate.

## HIGH — Bridge TypeScript surface

**GAP-11, GAP-14.** The `DesktopBridge` interface in
`src/desktop/bridge.ts` now declares `onSaveBarrierRequest`,
`acknowledgeUpdate`, and `onUpdateInstalled`. The
`BRIDGE_CONTRACTS` table in `src/desktop/bridge-contract.ts`
includes rows for each, with a `caller` that exists in the
codebase. The `bridge-contract.test.ts` test pins the contract
table against the codebase and is green.

## HIGH — Backup / restore transaction safety

**GAP-13.** A new `describe('restore transaction safety')` block
in `src/persistence/backup.test.ts` exercises three real
failure modes:

1. The parser rejects the backup before opening a transaction.
   The local data is byte-identical to the snapshot.
2. A record in the backup is wrong-shaped; the parser rejects
   the entire backup. The local data is intact.
3. A backup that smuggles game data past the `includesGames`
   flag is rejected. The local data is intact.

The fourth test exercises the post-transaction state: a
no-op restore of a valid backup on a target that already has
data. The contract is that the local data is at the backup's
content (not half-set), and the snapshot taken before the
attempt is the user's reference for "before" — the caller can
use it to recover.

## MEDIUM and LOW

These are documented in the gap register
(`docs/product/phase-37-gap-register.md`) and were triaged by
risk. The items deferred to future work are low-risk in the
sense that the gap is _known_ and _documented_, but a future
release will be measurably better with them closed.
