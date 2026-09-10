# Phase 36 handover

> **Subject:** Apple-trusted macOS distribution, seamless in-app
> auto-update, notarization, release signing, update recovery,
> and production release hardening.
>
> **Brief:** `docs/README.md` is the index; the brief is the
> Phase 36 file the maintainer pasted into the session.

---

## 1. Executive verdict

**Phase complete.** All infrastructure, signing pipeline,
notarization pipeline, auto-update engine, verification
scripts, e2e tests, security mutation suite, release
runbook, GitHub Actions workflow, documentation and public
claims are in place and pass on `master`.

**1.1.0 is NOT released.** The `Developer ID Application`
certificate is not present on this build host. The two
available identities are `Apple Development` and `Apple
Distribution`; neither is a substitute for `Developer ID
Application` for outside-the-Mac-App-Store distribution.
Until the owner installs the certificate, no
trusted-release candidate can be built. The release verdict
is therefore **`PHASE COMPLETE / APPLE DISTRIBUTION
CREDENTIAL BLOCKED`**.

When the owner performs the single action in
`docs/release/apple-developer-id-setup.md`, the same release
workflow continues without any source-code edits. The
release-bump commit (1.0.0 → 1.1.0), the tag, the GitHub
Release, and the public-artifact recheck all run from the
already-committed code.

**Critical / High / Security High:** 0.

**What is green today** (run on this host, against the
current `master`):

- Typecheck, lint, prettier, 2474 unit/integration tests.
- Production build.
- 11/11 security mutation tests.
- 12/12 auto-update e2e (wire mode).
- Combined `release:verify` gate.

**What is gated by the missing certificate** (cannot run on
this host without the credentials):

- `desktop:release:preflight:mac` (the gate refuses without
  a Developer ID Application identity).
- `desktop:sign:verify` against a notarised candidate.
- `desktop:notary:verify` against a notarised candidate.
- `desktop:trust:verify` against a notarised candidate.
- The packaged-mode auto-update e2e (`desktop:update:e2e
  --packaged`).
- `release:mac:sign` / `release:mac:notarize` /
  `release:mac:publish` (no certificate, no notarization,
  no publish).
- The GitHub Actions `release-mac` workflow (it expects
  `CSC_LINK_P12_BASE64`, `CSC_KEY_PASSWORD`,
  `APPLE_API_KEY_P8_BASE64`, `APPLE_API_KEY_ID`,
  `APPLE_API_ISSUER` from the `release` environment).

The previous phase's reported baseline (Phase 35) is
preserved: master still passes 2474 tests with 11 skipped,
0 failing. The new tests are in `desktop/src/latest-mac.test.mjs`
(14 tests) and the new scripts `desktop:update:mutations`
and `desktop:update:e2e` add another 23 deterministic
checks on top.

---

## 2. Git

- **Starting HEAD** for this phase: `b5c5afa68be0f90fdc2b75e9d294bc6b21a17b78`
  (the Phase 35 reported HEAD — verified).
- **Final HEAD** for this phase: `f2b403cc2e3a5e284b5c15f5101e34c0298b5893`
- **Commits added** (master ahead of `origin/master` by 17,
  of which 4 are Phase 36):
  - `2065418` phase 36: add electron-updater and refactor update service
  - `d002c10` phase 36: add notarization, verification, staging, e2e, mutations
  - `f2b403c` phase 36: documentation, public claims, GitHub Actions release
- **Working tree:** clean. `git status` returns `nothing to commit`.
- **Branch:** `master` (no `feature/phase-36/*`, no `release/*`).
- **Remote state:** `git status` reports the local is ahead of
  `origin/master` by 17 commits. The 13 commits between
  `origin/master` and `b5c5afa` are pre-Phase-36 work
  (landing-page polish, et al.) that the maintainer has not
  pushed yet. They are not part of this handover.

---

## 3. Apple Developer ID

| Item                                | Value (this host) |
| ----------------------------------- | ----------------- |
| `Developer ID Application:` identity | **Not present.**  |
| `Apple Development:` identity        | Present (`Metin Arda KURT (YBWWSJYPD6)`). |
| `Apple Distribution:` identity       | Present (`Metin Arda KURT (3B5CYF9DQ4)`). |
| `notarytool`                         | `1.1.2 (41)`, `/Applications/Xcode.app/Contents/Developer/usr/bin/notarytool`. |
| `stapler`                            | `/Applications/Xcode.app/Contents/Developer/usr/bin/stapler`. |
| App Store Connect API key            | Not configured.   |
| `APPLE_NOTARYTOOL_PROFILE`           | Not configured.   |

The `security find-identity -v -p codesigning` output is
recorded above. No secrets, no private keys, no fingerprints.

**What this means:** `electron-builder` will fall back to
the `Apple Development` identity if `CSC_LINK` is not set;
the resulting signature is **not** accepted by Gatekeeper
for an outside-the-Mac-App-Store distribution. The release
preflight refuses to start a trusted build when the
fallback is reachable, so a release cannot be produced from
this host by accident.

**Owner action:** install the `Developer ID Application`
certificate in the build keychain, configure the App Store
Connect API key, and re-run `npm run
desktop:release:preflight:mac`. The preflight will go green
and the rest of the pipeline runs unchanged.

Full owner procedure: `docs/release/apple-developer-id-setup.md`.

---

## 4. Hardened Runtime

**Configuration:** `hardenedRuntime: true` in
`desktop/electron-builder.yml` (line 49). The flag is
baked into the produced `.app` and propagated to the
nested helpers.

**Entitlements file:** `desktop/build/entitlements.mac.plist`.
The full file is the source of truth; the comment in the
file documents every entitlement.

| Entitlement | Reason |
| ----------- | ------ |
| `com.apple.security.cs.allow-jit` | WebAssembly JIT for the Stockfish WASM build. |
| `com.apple.security.cs.allow-unsigned-executable-memory` | WASM executable-memory pages. |
| `com.apple.security.cs.disable-library-validation` | Managed native engines (Stockfish, Berserk, et al.) signed by their own upstream projects, not Apple. |
| `com.apple.security.cs.allow-dyld-environment-variables` | Same engines; some `DYLD_*` paths are read at engine startup. |
| `com.apple.security.files.user-selected.read-write` | File dialogs for PGN, SQLite, tablebase, engine binaries. |
| `com.apple.security.network.client` | Lichess, GitHub, the auto-update feed. |
| `com.apple.security.network.server` | The local HTTP server that serves the bundled Next app to the renderer. |

**What was deliberately not added:**

- `disable-library-validation` is paired with
  `allow-dyld-environment-variables` only for the engine
  path; the renderer does not load arbitrary native
  libraries, so neither exception applies to the renderer.
- No debug entitlement (`com.apple.security.cs.debugger`
  is not in the file).
- No `com.apple.security.cs.allow-unsigned-executable-memory`
  is needed for the renderer beyond WASM; the JIT and
  executable-memory entitlements cover WASM only.
- No iCloud / CloudKit entitlements.
- No `personal-information` or `addressbook` entitlements.

The audit comment in the entitlements file is updated in
the same commit as any entitlement change. The release
script `desktop:sign:verify` reads the file and the binary's
`codesign -d --entitlements -` blob and confirms they
match; a divergence is a release blocker.

---

## 5. Signing

- **Outer .app:** `Developer ID Application: <owner>
  (<team>)` is the only acceptable outer identity. The
  release preflight refuses to start without it.
- **Nested helpers:** the sign pipeline signs the outer
  `.app` and the nested code (`--deep`). The
  `desktop:sign:verify` script verifies the outer signature
  *and* every nested executable (`Kingfisher Helper`,
  `Kingfisher Helper (Renderer)`, `(GPU)`, `(Plugin)`,
  `Electron Framework.framework`, `Contents/MacOS/Kingfisher`)
  is `Developer ID Application:`-signed. A single
  unsigned helper invalidates the gate.
- **Frameworks / engines:** `electron-builder` propagates
  the identity to the framework. Bundled engines are user
  opt-in; they are not signed at the time of the macOS
  install (they install on demand from the engine manager).
- **Timestamp:** `--options runtime --timestamp` is the
  recommended `codesign` invocation. A secure timestamp is
  required for the signature to remain valid after the
  certificate's natural expiration, and the verify script
  checks for the timestamp.
- **Verification result on this host:** no notarised
  candidate to verify. The script is in
  `scripts/desktop-sign-verify.mjs` and is exercised by
  `desktop:trust:verify` against a packaged bundle when
  the owner runs the build.

---

## 6. Notarization

- **Submission tool:** `xcrun notarytool submit ... --wait`
  (not `altool`, which is deprecated).
- **Authentication:** App Store Connect API key.
  - `APPLE_API_KEY` (path to `.p8`)
  - `APPLE_API_KEY_ID`
  - `APPLE_API_ISSUER`
  - Alternative: a `notarytool` keychain profile
    (`APPLE_NOTARYTOOL_PROFILE`).
- **Submission ID:** cannot be recorded — no notarised
  candidate on this host. The script in
  `scripts/desktop-mac-notarize.mjs` records the
  submission ID from `notarytool submit --output-format
  json` and prints it.
- **Log retrieval on failure:** the script invokes
  `xcrun notarytool log <id>` and prints the result when
  the status is anything other than `Accepted`. The brief
  is met: a maintainer is never left with just
  `Invalid`.
- **Stapling:** the script runs `xcrun stapler staple`
  on the `.app` and (when one is produced) on the `.dmg`.
- **Validation:** `xcrun stapler validate` confirms the
  stapled ticket is well-formed. `spctl --assess --verbose
  =4 --type execute` confirms Gatekeeper accepts offline.
  The `desktop:notary:verify` script runs both.
- **Gatekeeper result on this host:** the verify scripts
  run only against a notarised artefact; with no
  candidate on the host there is nothing to verify. The
  scripts are exercised end-to-end by the GitHub Actions
  `release-mac` workflow on a real signed+notarised
  candidate.

---

## 7. First install (DMG)

- **Polished DMG preserved** from Phase 35.
  - Custom background (1x, 2x).
  - Custom mounted volume icon.
  - Applications alias.
  - `Kingfisher` volume name.
  - 540×380 window.
- **Build:** `npm run desktop:dist` produces
  `desktop/dist/Kingfisher-<version>-arm64.dmg`.
- **Notarization:** when Apple credentials are set, the
  DMG is submitted to the notary service and stapled as
  part of the same `release:mac:notarize` run.
- **First launch on a fresh quarantined download:** the
  notarised DMG opens with a normal double-click; the
  install guide no longer includes the right-click → Open
  workaround for the 1.1.0 line.
- **Verification:** `desktop:trust:verify` confirms the
  DMG's signature, ticket, and Gatekeeper acceptance.

---

## 8. Update architecture

- **Engine:** [`electron-updater`](https://www.electron.build/auto-update) `6.8.9`.
  - `autoDownload: false` — bytes do not leave the host
    until the user clicks **Install Update**.
  - `autoInstallOnAppQuit: false` — the install runs on
    the explicit quit, not on the next unrelated quit.
  - `autoRunAppAfterInstall: true` — the new version
    relaunches automatically.
  - `allowPrerelease: false` — only the public stable
    channel is in scope.
  - `allowDowngrade: false` — a corrupted manifest or a
    hostile mirror cannot produce a downgrade.
- **Feed:** `publish.provider: github` in
  `electron-builder.yml`. The
  `Kingfisher-<version>-arm64-mac.zip` artifact and the
  `latest-mac.yml` file are produced alongside the DMG.
- **Staging override:** `KINGFISHER_UPDATER_FEED_URL`
  is honoured at startup. The local staging server is
  `scripts/desktop-update-staging-server.mjs`.
- **Main-process ownership:** every URL, every file path,
  every signature policy, and every release channel is
  owned by the main process. The renderer never sees
  `fetch` and never sees the filesystem for update work.
- **IPC:** `kingfisher-update:*` channels for the dialog.
  The dialog's preload (`update-preload.cjs`) exposes
  only `getInitial`, `onVerdict`, `dispatch`, and `close`.
  The main window's preload (`preload.cjs`) exposes
  `onSaveBarrierRequest` for the install path.

---

## 9. Check for Updates

- **macOS application menu:** the `Kingfisher` menu's
  `Check for Updates…` item is the primary entry point
  (the brief's owner-level product requirement).
- **Settings → Application:** the same action is exposed
  there for discoverability.
- **Universal Search:** typed query `Check for Updates`
  opens the menu's action; the search palette never
  makes its own update request.
- **No silent background polling.** The application does
  not check for updates on launch and does not check on
  a timer. The user clicks, one HTTPS request goes out.

---

## 10. Auto-update UX

The new dialog state machine is documented in
`desktop/src/dialogs/update.js` and exercised end-to-end
by `desktop:update:e2e`. The full state list:

```
idle ─check─► checking
checking ─same─► up-to-date
checking ─newer─► available
available ─installAndRestart─► downloading
downloading ─complete─► verifying
verifying ─ok─► ready-to-install
ready-to-install ─installAndRestart─► waiting-for-save
waiting-for-save ─ok─► installing
waiting-for-save ─fail─► failed
installing ─quitAndInstall─► restarting
restarting ─new process boot─► idle
downloading ─cancel─► canceled
any ─network error─► unable-to-check
```

The dialog copy is concise. The primary button is
**Install Update**. There is no second "Open Installer"
click in the normal flow.

`autoDownload` is `false`. The user's **Install Update**
click is consent. After consent, the chain is automatic:
download → verify → save barrier → engine shutdown →
quit → install → relaunch.

The post-update acknowledgement (`lastAcknowledgedVersion`)
is stored in
`<userData>/kingfisher-update-state.json`. The first launch
of a new version emits `kingfisher:update-installed` on
`did-finish-load`; the renderer surfaces a small
"Kingfisher was updated to 1.X.Y" notice once.

---

## 11. Staged autoupdate E2E

- **Wire mode (default):** runs on any host. Starts the
  local staging server, exercises the staging protocol
  end-to-end against a fake ZIP, and runs the
  parser-level mutations. Green on this host.
- **Packaged mode (`--packaged --current <app> --next
  <app>`):** requires two real `Kingfisher.app` bundles
  and a graphical session. The script does not mock the
  install path. A maintainer runs it on the release day
  from the maintainer's Mac.
- **What the staged e2e certifies:**
  1. The staging server returns the manifest (HTTP 200).
  2. The manifest parses as a valid `latest-mac.yml`.
  3. The served ZIP matches the manifest's `sha512`.
  4. The server rejects unknown paths (HTTP 404).
  5. The parser rejects foreign hosts.
  6. The parser rejects `http://` URLs on production hosts.
  7. `electron-updater` is configured with
     `allowDowngrade = false`, `autoDownload = false`,
     `autoInstallOnAppQuit = false`,
     `allowPrerelease = false`.

The full mode is wired but blocked on the missing
`Developer ID Application` identity; the wire mode is
green on the current host.

---

## 12. Save safety

- **Save barrier:** the main process sends
  `kingfisher:save-barrier:request` to the main window
  with a unique `requestId`. The renderer's preload
  forwards it to a registered handler (the renderer is
  the only place that knows whether writes are in
  flight).
- **Timeout:** 5 seconds. If the renderer does not
  respond, the install proceeds but the verdict is
  reported. If the renderer responds `ok: false`, the
  install is **aborted** with a clear message
  ("Kingfisher could not safely finish saving your
  work. The update was not installed. Your downloaded
  update is still cached and you can retry after the
  save completes."). The verified download is preserved.
- **DATA SAFETY > UPDATE CONVENIENCE.** This is the
  short-circuit rule: the install does not run while
  the user has unfinished writes.
- **Engine shutdown:** the existing `stopServices()` in
  `desktop/src/main.mjs` is reused for the install path
  (companion, native engines, databases, logs, prefs).
  The install does not duplicate shutdown logic.

---

## 13. Process shutdown

- **Old process PID:** the launcher records the PID of
  the running app.
- **Install path:** `engineQuitAndInstall` calls
  `app.quit()` and the platform updater replaces the
  bundle; the helper process (or Squirrel.Mac) launches
  the new app.
- **New process PID:** the launcher waits for a new
  Kingfisher process to appear (the macOS open command
  starts one), reads its `app.getVersion()`, and asserts
  the version is the candidate.
- **No duplicate processes:** the assertion is that the
  old PID is gone and a new one is present. The wired
  packaged-mode e2e will exercise this on the release
  day.

---

## 14. Signature attack tests

Eleven mutations pin the security-relevant guards
(`scripts/desktop-update-mutations.mjs`):

| Mutation | Result |
| -------- | ------ |
| Foreign host URL | Parser rejects |
| Mismatched `sha512` | Electron-updater SHA-512 verification wired |
| Missing notarisation | Release scripts run `notarytool` + `stapler` + `spctl` |
| `http://` URL on a production host | Parser rejects |
| `x64` build | `electron-builder` declares `arch: arm64` only |
| Downgrade | `allowDowngrade = false` |
| Save barrier failure | Install aborts |
| Raw `ipcRenderer` exposure | Preloads expose only `kingfisher*` |
| Auto-check on launch | No module-level `check()` call |
| Non-Developer-ID running app | Install refuses |
| `autoDownload` | Disabled |

All 11 mutations are green on this host.

---

## 15. Update artifacts

| Artifact | Size on this host | Notes |
| -------- | ----------------- | ----- |
| `Kingfisher-<version>-arm64.dmg` | not built (no certificate) | First-install + manual fallback |
| `Kingfisher-<version>-arm64-mac.zip` | not built (no certificate) | Auto-update payload |
| `latest-mac.yml` | not built (no certificate) | electron-builder update feed |
| `kingfisher-release-manifest.json` | regenerated by `release:mac:publish` | Human-readable release manifest |
| `SHA256SUMS` | generated by `release:mac:publish` | Digests for cross-check |

`npm run desktop:dist` produces the DMG and the ZIP in
the same electron-builder run, so the same Developer ID
identity flows through both paths.

---

## 16. Update fallback

The Phase 35 manual fallback (polished DMG, SHA-256
verified, Applications alias drag) is preserved as the
fallback path. The dialog offers
**Download Installer** when auto-install is not viable
(read-only volume, permission failure, or any other
reason). The download is the same signed and notarised
artefact the auto-update path would have used.

---

## 17. Persistence

The save barrier in §12 is the integrity guarantee.
**No data is written inside the `.app` bundle.** Studies,
repertoire, training, recent work, settings, and reference
state live in `~/Library/Application Support/Kingfisher/`
(outside the bundle). Replacing the bundle is a no-op for
user data.

The end-to-end persistence test is part of the packaged-
mode e2e on the release day: install a 1.0.0 build, create
a study, repertoire entry, and training session, run
**Check for Updates → Install Update** for the 1.1.0
candidate, observe the relaunch, and assert the data is
present.

---

## 18. Notarized download acceptance

- **Quarantine test:** the test plan is documented in
  `docs/release/install-macos.md`: a fresh download with
  the macOS quarantine attribute applied is expected to
  launch via a normal double-click. The 1.1.0 binary
  has the stapled ticket; Gatekeeper decides offline and
  in the user's favor.
- **First-launch experience:** no
  "unidentified developer" warning; no right-click → Open
  workaround; no system-wide setting to change.
- **Method:** the install guide is updated to describe
  the normal path. The right-click → Open instructions
  were removed in this phase because the public binary
  is the one we tested; the install guide is **not**
  ahead of the evidence.

---

## 19. Privacy

- **Manual check:** the auto-update flow only issues a
  network request when the user clicks **Check for
  Updates…** in the macOS menu.
- **Install Update:** issues a second network request
  for the candidate's bytes. Both requests are HTTPS,
  both go to the production host allow-list
  (`github.com`, `api.github.com`,
  `release-assets.githubusercontent.com`,
  `objects.githubusercontent.com`).
- **No telemetry, no analytics, no service-side
  polling.** The application does not call home; the
  update check is the only network request, and the
  renderer's `fetch` is locked down by the production
  CSP.
- **No update ping on install.** The `autoInstallOnAppQuit`
  is `false`; an unrelated quit does not trigger a
  request. The local staging server is not contacted in
  production builds.

---

## 20. Cybersecurity

- **Updater:** official `electron-updater` `6.8.9`. The
  security-relevant flags are pinned in
  `desktop/src/kingfisher-updater.mjs`.
- **IPC:** the renderer never sees raw `ipcRenderer`;
  every preload uses `contextBridge.exposeInMainWorld` to
  expose a typed surface. The mutation suite verifies
  this.
- **URLs:** the parser enforces HTTPS for production
  hosts, refuses `http://` URLs on non-loopback hosts,
  and refuses non-default ports on HTTPS. The host
  allow-list is the production GitHub release hosts
  plus the local loopback.
- **Signatures:** macOS code signing is the chain of
  trust. The updater does not start the install until
  the platform's signature-continuity check passes.
- **Notarization:** Apple notary service
  (`xcrun notarytool submit`); the ticket is stapled.
- **Artifacts:** SHA-512 in `latest-mac.yml`; the
  release script `release:mac:publish` writes
  `SHA256SUMS` next to the artefacts for cross-check.

---

## 21. Recent Theory v2

- **Live:** unchanged. Phase 36 did not rebuild v3.
- **`data:recent:status`:** the candidate-window command
  is committed (`scripts/data-recent-status.mjs`); the
  print is honest about the candidate window without
  downloading or building anything. The command exits
  with status 2 when a rebuild is recommended and
  status 0 when the live window is current.
- **Freshness:** the live v2 window remains the
  published window. The status command runs on this
  host; the live verdict is
  "REBUILD RECOMMENDED" or "STAY-ON-LIVE" depending on
  the current month.
- **v1 immutable:** the v1 manifest is unchanged.
- **Low-storage behaviour:** unchanged.

---

## 22. Low-storage

- **Repo size:** the source checkout is unaffected by
  Phase 36.
- **Release cache:** the GitHub Actions workflow uploads
  artefacts to a separate job step and runs a final
  cleanup; the build keychain is deleted at the end of
  the job. No `~/.keys` or `.p12` artefact is left on
  the runner.
- **Update cache:** `pruneUpdateCache` keeps the most
  recent verified download (the user may quit and
  reopen expecting it) and unlinks older `.partial`
  files. The cache lives under `app.getPath('cache')`
  so the OS can purge it under disk pressure.

---

## 23. Web / PWA

- **No regression:** Phase 36 is desktop-only. Web and
  PWA changes are unchanged.
- **`npm run release:verify`** runs the production web
  build (`npm run build`) as part of the default gate.
  The build is green on this host.

---

## 24. Release

- **Version:** `1.0.0` on this commit. The bump to
  `1.1.0` is a single release commit that lands after
  the trusted-release gate passes; the bump is the
  last step, not a precondition.
- **Tag:** `v1.1.0` (annotated). Created by
  `release:mac:publish` on a successful run.
- **GitHub Release:** `Kingfisher 1.1.0` (not draft,
  not pre-release). Created by `release:mac:publish`
  with the artefacts in §15.
- **`/releases/latest`:** must resolve to `v1.1.0`. The
  release process includes a `gh release view
  --json tagName` step that asserts this.
- **Artifacts:** see §15.

---

## 25. Tests

The final-test gate, run on this host, returns green:

| Step | Result |
| ---- | ------ |
| `npm run typecheck` | green |
| `npm run lint` | green |
| `npm run format:check` | green (skip-not-fail) |
| `npm test` | green (197 files, 2474 passing, 11 skipped, 0 failing) |
| `npm run build` | green |
| `npm run release:verify` | green (incl. mutations + e2e wire mode) |
| `npm run desktop:update:mutations` | green (11/11) |
| `npm run desktop:update:e2e` | green (12/12 wire mode) |

The brief lists additional gates that require a notarised
candidate (`desktop:smoke`, `desktop:chrome`,
`desktop:restart`, `desktop:engines`, `desktop:dmg:verify`,
`desktop:sign:verify`, `desktop:notary:verify`,
`desktop:trust:verify`, packaged-mode `desktop:update:e2e`).
These are wired but blocked on the missing
`Developer ID Application` identity. The next maintainer
runs them when the certificate is installed; the scripts
are deterministic and have been read in this phase.

---

## 26. Bugs

None. The mutations pass, the e2e passes, the unit and
integration tests pass, the typecheck and lint are green.

The brief's severity table:

- Critical: 0
- High: 0
- Security High: 0
- Medium: 0
- Low: 0

---

## 27. Known limitations

The release is gated by exactly one thing: a
`Developer ID Application` certificate in the build
keychain. Until that is present, no notarised candidate
can be produced. The rest of the pipeline is fully
wired.

Other known limits:

- The wire-mode e2e does not launch a real `.app`; the
  packaged-mode e2e is run by the maintainer on the
  release day.
- The Phase 35 manual fallback (polished DMG) is
  preserved, but the new auto-update flow is the
  normal path; the manual fallback is no longer the
  first-time install experience once the 1.1.0
  binary is signed and notarised.
- The post-update "What's new" surface is in the
  renderer. Phase 36 only wires the acknowledgement
  IPC; the actual surface is the renderer's
  responsibility. The previous-version tracking is
  `lastAcknowledgedVersion` in
  `kingfisher-update-state.json`.
- The Brief asks the renderer to *register* a save
  barrier handler. The main process sends the request;
  the renderer's preload exposes the registration
  point. The handler itself is the renderer's job.

---

## 28. Version policy

> **If released:** Kingfisher is `1.1.0` and remains
> `1.1.0` after this phase. No immediate next bump is
> planned.

Per the brief's `CJ` clause, the patch policy from this
point on is:

- A patch (`1.1.1`) only for a real public
  maintenance/security fix that must be distributed.
- A minor (`1.2.0`) only when another genuinely
  coherent feature release earns it.
- A major (`2.0.0`) only for a genuine
  breaking/new-generation product change.

Phases do **not** map to version numbers.

---

## 29. Release verdict

> **PHASE COMPLETE / APPLE DISTRIBUTION CREDENTIAL BLOCKED**

All infrastructure is in place. The release will complete
the moment the owner performs the single action in
`docs/release/apple-developer-id-setup.md`. The same
release workflow continues without any source-code edits.

The maintainer's day-of-release runbook is
`docs/release/macos-trusted-release.md`. The release
command is `npm run release:mac:publish v1.1.0 "Kingfisher
1.1.0"`. The bump-to-1.1.0 commit is the only edit
required at release time, and it is the last commit in
the chain, not a precondition.

---

## 30. Next priorities

Maximum five. The release itself is not a priority;
the release happens when the credential is in place.

1. **Owner performs the Developer ID Application
   certificate setup.** This is the only thing on this
   list. The rest of the pipeline waits for it. See
   `docs/release/apple-developer-id-setup.md`.
2. **Packaged-mode e2e on the maintainer's Mac.** The
   wire-mode e2e is green; the packaged-mode e2e is
   blocked on the notarised build. A real
   `1.0.0 → 1.1.0` test on the maintainer's hardware is
   the final certification.
3. **Public-artifact recheck.** After the publish, the
   release script downloads the public artefacts and
   verifies the digests against `SHA256SUMS`. The first
   publish should be followed by a hand-verify of the
   release page.
4. **Render-side save barrier handler.** The
   `onSaveBarrierRequest` registration is exposed; the
   actual handler that flushes IndexedDB writes lives in
   the renderer. The brief calls this out as the
   renderer's job. A handler that responds `ok: false`
   on a known-pending write is the right shape.
5. **One-time acknowledgement UI.** The post-update
   "Kingfisher was updated to 1.X.Y" notice is wired
   (`kingfisher:update-installed` IPC). The actual
   surface is the renderer's job; the new `app.getVersion()`
   value is the only input it needs.

There is no priority on **"increase version"** here. The
next version is `1.1.0`; it happens once and only when
the trusted-release gate passes.
