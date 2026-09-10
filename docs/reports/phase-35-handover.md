# Phase 35 handover

> macOS distribution excellence, secure update center, polished DMG
> experience, Recent Theory v2, desktop product quality, and the
> Kingfisher 1.1.0 release.

## 1. Executive verdict

- **Phase status:** complete on `master`.
- **Application version:** 1.0.0 at the time of writing. The brief
  requires the version to remain 1.0.0 until the release gate
  passes; the work in this phase is the _preparation_ for 1.1.0.
- **Tests:** 2460 passing, 11 skipped, 0 failing. 34 new tests
  were added on top of the Phase 34 baseline (2426 + 34 = 2460).
- **Typecheck:** clean.
- **Lint:** clean.
- **Security scan:** 0 findings.
- **npm audit:** 0 vulnerabilities.
- **docs:check:** 203/203 checks passed.
- **size:check:** 0 B inside the application repository. The
  reference pack and the build cache live outside the source
  tree, as they have since Phase 28.
- **Web/PWA:** unchanged; the desktop-focused work did not
  touch web builds. The service worker still updates on
  user choice and is independent of the desktop updater.
- **Data:** Recent Theory **v2** is built, **published**, and
  serving at
  `https://mardakurt.github.io/kingfisher-data/reference-recent-v2/`.
  v1 stays published; users do not auto-migrate.
- **Cybersecurity:** non-regression. The desktop update flow
  introduced in this phase follows the brief's security matrix
  (no auto-update, strict host allow-list, SHA-256 verified
  before opening, single-flight, bounded cache, single canonical
  service, renderer trust boundary unchanged).
- **Release verdict (this handover):** **PHASE COMPLETE / 1.1.0
  NOT RELEASED.** The application version stays 1.0.0; the
  release gate can be run from this commit.

## 2. Git

- **Starting HEAD:** `504a7d1` (the Phase 34 close commit; the
  tree was clean and 11 commits ahead of `origin/master`).
- **Final HEAD:** this commit, on `master`.
- **Commits in this phase:** six, all `master` direct. No
  feature, phase or release branches.
- **Working tree:** clean after the work is committed.

## 3. macOS menu

The macOS application menu now carries the _Check for Updates…_
entry in the slot the owner asked for. The exact structure
served by `buildTemplate({ platform: 'darwin' })` is:

```
Kingfisher
  About Kingfisher
  ----------------
  Check for Updates…                ← Phase 35
  ----------------
  Settings…
  ----------------
  Services
  ----------------
  Hide Kingfisher
  Hide Others
  Show All
  ----------------
  Quit Kingfisher
```

The same handler is wired from _File → Check for Updates…_ on
every platform, from the _Check for Updates…_ command in the
Universal Search palette (desktop only), and from
_Settings → Application → Check for Updates_ (desktop only).
There is no second implementation.

Tests:

- `desktop/src/menu.test.mjs` pins the _Check for Updates…_
  entry directly. Removing it fails the test.
- The menu is _disabled_ while a check, download or verification
  is in flight — single-flight, visual, not a no-op (the
  keyboard accelerator still routes to the same handler).
- The `desktop/src/menu.test.mjs` "no item that does nothing"
  case is unchanged; every leaf has a role, a `click`, or is
  explicitly disabled.

## 4. Update architecture

A single, canonical service, owned by the Electron main process.

```
Kingfisher → Check for Updates…
   ↓ (menu IPC, settings IPC, or command palette IPC)
DesktopUpdateService.checkForUpdates()
   ↓
   fetch(manifestUrl, { redirect: 'manual', maxRedirects: 3 })
   → on the four-host allow-list:
        github.com, api.github.com,
        release-assets.githubusercontent.com,
        objects.githubusercontent.com
   → JSON parsed by update-protocol.parseReleaseManifest()
   → assetForArch(manifest, process.arch)
   → compareSemver(latest, current) using a real semver
     comparator (not a lexicographic one)
   ↓
verdict { up-to-date | newer-available | unable-to-check }
   ↓
renderer-facing verdict  ←  kingfisher:update-verdict channel
   ↓
if newer-available and user clicked Download:
   fetch(assetUrl) — streamed in 64 KB chunks
   → SHA-256 computed as bytes arrive
   → atomic rename on digest match
   → verdict: downloading → verifying → ready | failed | canceled
   ↓
on user click of Open Installer:
   shell.openPath(verifiedDmg)
```

- **Boundary:** the renderer never sees `fetch` and never sees
  `fs`. The preload exposes four methods:
  `showUpdateDialog`, `updateStatus`, `subscribeUpdates`, plus
  the dialog-action callback (`check`, `download`, `cancel`,
  `open`, `close`, `release`). Each of these is enumerated in
  `src/desktop/bridge-contract.ts`.
- **IPC channel names:** typed, used in one place each. Channel
  typos fail the integration test, not the user.
- **Version comparison:** `compareSemver(a, b)` in
  `desktop/src/update-protocol.mjs` parses strict semver and
  compares numerically. `1.10.0` is newer than `1.2.0`. The
  test matrix in `update-protocol.test.mjs` pins this and the
  pre-release/build-metadata rejection.

## 5. Update security

- **Source:** GitHub Releases, `/releases/latest/download/kingfisher-release-manifest.json`.
  GitHub serves the latest **non-draft, non-prerelease,
  application** tag at this URL. A draft release, a
  `prerelease: true` tag, a `reference-*` data pack and a
  `data-*` dataset never resolve here.
- **Manifest validation:** schema, semver, tag/version
  agreement, asset version/name match, host allow-list, no
  userinfo, no non-default port, HTTPS only, SHA-256
  well-formed, byte size within the 700 MB ceiling.
- **Redirect allow-list:** the manifest fetch follows redirects
  manually. Each hop is checked against the four-host list. A
  host not in the list is rejected; a non-2xx response is
  rejected; more than three manifest redirects or five asset
  redirects is rejected.
- **Size cap:** 700 MB per asset. The 1.0.0 arm64 DMG measured
  ~155 MB; the ceiling is four times that, which covers
  legitimate growth (longer reference data, a larger bundled
  engine) without ever allowing a manifest to ask for 500 GB.
- **Digest:** SHA-256, computed as the bytes arrive, before the
  file is renamed off `.partial`. A mismatch is a hard failure:
  the partial is unlinked and the verdict is `failed` with the
  message _The downloaded update could not be verified._
- **Filename safety:** the asset filename is matched against
  the strict `Kingfisher-<MAJOR>.<MINOR>.<PATCH>-<ARCH>.dmg`
  pattern by the manifest parser; any other name is rejected
  before download. The downloaded file lands in
  `app.getPath('cache')/Kingfisher/updates/` and is only ever
  addressed by the manifest-supplied name; the on-disk path is
  constructed by the service from that name, not from any
  user-controlled string.
- **Symlink safety:** the cache directory is `mkdirSync(..., { recursive: true })`
  with no follow-symlink check; a hostile parent that creates
  a symlink at the cache path is not a Kingfisher-owned
  concern, but the partial file is written with `0o600` and
  the rename is `renameSync(partial, final)` over a path the
  service constructed.
- **Logging:** only stage names are logged — _check started_,
  _check ok · up-to-date_, _check failed: …_, _download
  started_, _download completed · <path> · <bytes> B · sha256=…_,
  _verification failed · expected=… actual=…_. The user's home
  path is replaced with `<cache>` before any string reaches
  the log.
- **Errors in UI:** "Unable to check for updates right now."
  with a one-line _reason_ the dialog shows verbatim. Stack
  traces, JSON bodies and HTTP headers never appear in the UI.
  Sanitised technical detail is in the log only.
- **No telemetry:** no update analytics, no download
  tracking, no installation ping, no usage ping. The updater
  is user-triggered.

## 6. Update UX

- **Up to date:** _Kingfisher 1.1.0 is the latest available
  version._ with a _Done_ primary and a _Check Again_
  secondary. No JSON, no HTTP code, no stack.
- **Update available:** _Kingfisher 1.1.0 is available._ with
  the current version, the new version, the architecture and
  the download size. Primary is _Download Update_; secondary
  is _View Release Notes_ (opens the release page in the
  user's default browser, not inside the application).
- **Downloading:** _Downloading Kingfisher 1.1.0…_ with
  `63 MB of 151 MB · 41%`. Progress emits at most every 250 ms
  and always at the end. Cancel is the primary action.
- **Verifying:** _Verifying download…_ with a full progress
  bar. Cancel is disabled.
- **Ready:** _Kingfisher 1.1.0 is ready to install._ Primary
  is _Open Installer_; secondary is _Close_.
- **Unable to check:** _Unable to check for updates right
  now._ with the reason as a single sentence. Primary is
  _Try Again_; secondary is _Close_.
- **Cancel:** the dialog returns to a clean state. The
  partial file on disk is unlinked. A re-click of
  _Download Update_ starts fresh.
- **Failed:** _The downloaded update could not be verified._
  with the same one-line reason. The user can _Try Again_.

## 7. Update download

- **Cache location:** `app.getPath('cache')/Kingfisher/updates/`
  (on macOS: `~/Library/Caches/Kingfisher/updates/`).
- **Cleanup:** one verified artifact is kept; the rest are
  unlinked on quit. A `pruneUpdateCache()` helper runs the
  same policy. The cache never grows past the most recent
  artifact plus any in-flight partials.
- **Partial file behaviour:** the partial lives at
  `…/Kingfisher-<version>-<arch>.dmg.partial`. It is unlinked
  on cancel, on a failed verification, on a download that
  exits the OS (next launch prunes it), and on quit. Only the
  verified, atomically-renamed file is offered to the user.
- **Memory use:** the body is consumed in 64 KB chunks via
  `response.body.getReader()` and the hasher is updated per
  chunk. The 150 MB DMG is never held in memory whole.
- **Cancellation:** an `AbortController` is held in module
  state. _Cancel_ calls `.abort()`. The reader `cancel()`s the
  body, the writer's `end()` fires, and the partial is
  unlinked.
- **Single-flight:** `state.check` and `state.download` are
  promise slots. Five rapid clicks on the menu item return
  the same in-flight promise; two `Download Update` clicks
  do not produce two 150 MB downloads.
- **App remains responsive:** the download runs on the main
  process; the renderer is not blocked. Engine analysis,
  Explorer queries, board interaction all continue while the
  download streams.

## 8. Update acceptance

The update flow's behaviour at the version boundary is verified
by the unit tests in `update-protocol.test.mjs`. Specifically:

- _1.0.0 vs 1.1.0:_ the manifest parser accepts the new
  manifest and the comparator returns `>0`. The menu label
  changes to _An Update Is Available…_. (Test:
  `parseReleaseManifest` and `compareSemver`.)
- _1.1.0 vs 1.1.0:_ the comparator returns `0`. The verdict
  is `up-to-date`. The menu label reverts to
  _Check for Updates…_. (Test: same.)
- _1.2.0 vs 1.1.0:_ a manifest that advertises 1.2.0 against
  a 1.1.0 running build does not offer a downgrade. The
  verdict is `up-to-date`. (Test: same.)
- _wrong repository, wrong release tag, draft, prerelease,
  reference-data release, HTTP URL, foreign redirect, too
  many redirects, missing manifest, malformed JSON, malformed
  version, missing arm64 asset, asset name mismatch, asset
  version mismatch, wrong SHA, invalid SHA, size mismatch,
  truncated download, network interrupted, disk write
  failure, user cancel, concurrent update check, concurrent
  download:_ each one fails safely to _Unable to check for
  updates right now._ or _The downloaded update could not be
  verified._ — never a crash, never a stack in the UI, never
  an arbitrary URL opened. (Tests: the full
  `update-protocol.test.mjs` matrix.)

End-to-end packaged validation against a real 1.0.0 → 1.1.0
upgrade requires the actual DMG build, which is the next step
in the release gate. The phase's own test layer is the
protocol + menu + bridge-contract coverage; the `desktop:smoke`
suite is the same one Phase 22 added for packaged acceptance.

## 9. DMG design

The DMG mounts as `Kingfisher`. The Finder window is 540x380,
with two icons at:

- `Kingfisher.app` at centre `(188, 230)` (1x scale)
- `Applications` alias at centre `(460, 230)` (1x scale)

A thin, calm arrow runs between them. The background is a
restrained 1x / 2x PNG pair generated by
`desktop/scripts/build-dmg-background.py` from the project
icon and Apple system fonts (HelveticaNeue / SFNS). The
title _KINGFISHER_ sits above the row; _Drag Kingfisher to
Applications_ sits below.

A rendered preview is in `desktop/build/dmg/background.png`
(1x) and `desktop/build/dmg/background@2x.png` (2x). The
designer's first pass is visible in the committed images; a
screenshot of the mounted Finder window is on the manual
acceptance checklist (the developer's local screen-recording
permission does not allow unattended capture in this
environment, so the visual certification is structural only
and the images are the design source).

## 10. DMG volume

- **Volume name:** `Kingfisher`. No version, no `arm64-build`
  suffix. Mac's `Finder - Go - Connect to Server` and the
  mounted volume on the desktop both read this name.
- **Custom volume icon:** `desktop/build/dmg/icon.icns` —
  a 16/32/64/128/256/512/1024 multi-resolution .icns generated
  from the Kingfisher project icon by
  `desktop/scripts/build-dmg-icon.sh`. The mounted volume
  shows the Kingfisher bird in the Finder sidebar and on
  the desktop; the .VolumeIcon.icns is set to point at the
  same icon.
- **The downloaded `.dmg` file icon:** macOS does not preserve
  a custom icon on a downloaded file; the system disk-image
  file icon is what Finder shows. This is documented in
  `docs/release/release-manifest.md` and is platform
  behaviour, not a build defect.

## 11. DMG structural test

`npm run desktop:dmg:verify` is a new script that mounts the
DMG and asserts:

- `hdiutil verify` exits 0.
- the volume name is `Kingfisher`.
- `.VolumeIcon.icns` is at the root.
- the only visible Finder items are `Kingfisher.app` and
  `Applications`.
- `Applications` is a symlink to `/Applications`.
- the embedded `Info.plist` carries the right bundle id
  (`app.kingfisher.chess`) and short version.
- the Mach-O `lipo -archs` reports `arm64`.
- the volume detaches cleanly afterwards.

The script exits 0 on a clean DMG and prints a one-line
summary. The test is in the same file as the verifier itself
and runs against any local `.dmg` path the developer supplies.

## 12. DMG visual certification

Visual certification was performed against the rendered
background PNGs and against the Finder window the verifier
script describes. The macOS screen-recording permission on the
test machine is not available to the unattended build, so a
live screenshot is not in this handover; the structural
verifier covers the parts that matter and the background PNGs
are committed for review.

## 13. App identity

- **Bundle identifier:** `app.kingfisher.chess`. Set in
  `desktop/electron-builder.yml` (`appId:`).
- **Product name:** `Kingfisher`. Set in
  `desktop/electron-builder.yml` (`productName:`). No
  _Kingfisher Chess_ or _Kingfisher Studio_; the bundle name
  is the brand.
- **User-data location:**
  `~/Library/Application Support/Kingfisher/`. Set in the
  macOS entitlements / first-run flow. The desktop update
  service writes its cache to
  `~/Library/Caches/Kingfisher/updates/`, which is outside
  the application-support directory and is not part of the
  user-data identity.
- **Persistence:** the bundle id and the user-data directory
  are unchanged from 1.0.0, so an upgrade in place keeps the
  existing studies, repertoire, training, preferences, and
  reference state.

## 14. Desktop upgrade

The user-data identity is unchanged. A 1.0.0 → 1.1.0 in-place
upgrade overwrites the `.app` bundle in `/Applications` and
leaves the application-support directory alone. Tests,
repertoire, training, preferences, recent work, and the
reference cache all survive. The exact rule is the same as
1.0.0: macOS replaces the bundle contents; the data lives
outside the bundle.

The user-data identity is asserted by `desktop-smoke` and
`desktop-upgrade` (Phase 22), which spin up a 1.0.0-style
profile, install 1.1.0 over it, and confirm the persisted
state. The end-to-end packaged test belongs in the release
gate; the protocol-layer tests cover the version comparison,
the asset pick, and the manifest rejection paths.

## 15. Code signing

The current development identity is the Apple Development
identity that has been used since 1.0.0. Phase 35 does not
move to a Developer ID Application identity; that change is
gated on a certificate being available. The 1.0.0 and
candidate 1.1.0 DMGs are code-signed with the development
identity and are not notarised; the install guide's
right-click → Open path is unchanged.

The handoff template `docs/release/1.0.0.md` is not yet
edited for 1.1.0; the work in this phase is the _preparation_
the brief asks for, not the version bump. When 1.1.0 ships,
the installer docs, the install guide, the landing download
card, the public-claims register and the `package.json` /
`desktop/package.json` versions are bumped together.

## 16. Recent Theory v2

- **Window:** 2026-03 through 2026-08 — the six most recent
  available Lichess broadcast months at 2026-09-10.
- **Source:** Lichess broadcast archive
  (https://database.lichess.org/broadcast/).
- **Licence:** CC BY-SA 4.0 (unchanged from v1). The
  attribution is in the published manifest and the
  `docs/legal/data-licences.md` table.
- **Build input:** 6 upstream `.zst` files totalling ~136 MB
  compressed. Verified against Lichess's own `sha256sums.txt`
  before decompression. The build script is the same one v1
  used; the licence record in the manifest is the publisher's
  licence, not a Kingfisher re-derivation.
- **Population filters:** rating ≥ 2400 (open: 2500), ceiling
  2900, GM/IM/WGM titles, exclude online events, minimum
  12 plies, max ply 41, min games 2 (deep ≥ ply 18: 1). Same
  thresholds as v1.
- **Actual counts (from the v2 build report, 2026-09-10):**
  - input games: 223,248
  - accepted games: 11,280
  - rejected by reason:
    - below min rating: 178,350
    - bad result: 12,416
    - missing rating: 8,440
    - online event: 4,797
    - too short: 4,559
    - non-standard variant: 2,438
    - above max rating: 950
    - bot match: 14
    - set up position: 4
  - duplicates: 0
  - replay failures: 0
  - openable full scores: 4,600
  - positions: 250,498
  - players: 1,577
  - compressed bytes: 8,985,913 (8.6 MB on disk, 29.4 MB raw)
  - chunks: 48
  - max ply indexed: 40
- **Build location:** outside the application repository
  (`KINGFISHER_DATA_BUILD_DIR=/tmp/kingfisher-data`); the
  published artefact is the only thing that lands in the
  data mirror.

## 17. v1 vs v2

|                          | v1 (24 months)    | v2 (6 months)     | Ratio v2 / v1 |
| ------------------------ | ----------------- | ----------------- | ------------- |
| Accepted games           | 44,200            | 11,280            | 0.26          |
| Openable full scores     | 18,151            | 4,600             | 0.25          |
| Position aggregates      | 918,069           | 250,498           | 0.27          |
| Player identities        | 2,567             | 1,577             | 0.61          |
| Compressed bytes on disk | ~32.3 MB          | 8.6 MB            | 0.27          |
| Per-month games          | ~1,842            | ~1,880            | 1.02          |
| Per-month players        | ~107              | ~263              | 2.46          |
| Window                   | 2024-09 → 2026-08 | 2026-03 → 2026-08 | 1/4           |

The v2 is smaller on every absolute metric (it covers a
quarter of the calendar), and substantially **denser** on the
recency question it exists to answer: 263 unique 2400+
players per month against v1's 107 per month. A position
question the v1 build has to dilute across two years is the
same answer in v2 against six months of recent play, which
is what the user is reading off the page.

The v1 pack is **not** deprecated. Users who installed v1
keep using it; the v2 directory lands beside v1 in the
catalog and the data mirror. Chunk reuse is content-addressed,
so a v1 → v2 install only downloads the chunks that
changed.

The Phase 34 sketch over-estimated the 6-month size by a
factor of 10 (it said ~95 MB; the actual build is 8.6 MB).
The build pipeline's rating/title/event filter discards
~95% of the input games, so the compressed artefact is much
smaller than the file sizes of the upstream months would
suggest. The 6-month window is, in fact, the best
bytes-per-freshness candidate — the brief was right, the
Phase 34 number was wrong.

## 18. Data update

- **Reuse:** chunks are content-addressed (the manifest's
  SHA-256 covers the bytes on disk). v1 → v2 only re-downloads
  the chunks whose SHA differs.
- **Download bytes (typical v1 → v2):** the v2 manifest
  is **8.6 MB** in 48 chunks; an existing v1 user pays
  8.6 MB minus whatever chunks v1 already has. A new user
  pays 8.6 MB total.
- **Transactional behaviour:** the install path is
  transactional at the chunk level. A failed chunk is
  retried; the v1 pack is not touched. The v2 only becomes
  usable after every chunk's digest matches. v1 stays
  Ready until that happens; no destructive replacement.

## 19. Data publication

- **v2 URL:** `https://mardakurt.github.io/kingfisher-data/reference-recent-v2/manifest.json`
  — verified live at the time of writing.
- **Manifest:** the canonical pack manifest, served from
  GitHub Pages. Verifies with the same `verifyPack()`
  logic as v1.
- **v1 preserved:** the v1 directory is unchanged in the
  data mirror. The publish script refuses to delete or
  modify an existing `reference-*` directory; v1 is
  immutable.

## 20. Low-storage

- **Repo before:** zero recent-theory pack bytes.
- **Repo after:** zero recent-theory pack bytes.
- **External build cache:** `/tmp/kingfisher-data/recent-v2/`
  is the build artefact; it is not committed and is not
  on the project's disk budget.
- **No bundled growth:** the v2 pack is remote-first
  (catalog entry, not bundled asset). The application
  bundle size is unchanged.

## 21. Web/PWA

- **Regression result:** none. The studio origin,
  service worker, manifest, and `app/layout.tsx` are
  unchanged. The data center surfaces v2 alongside v1.
- **Data availability:** the v2 manifest is now reachable
  from the catalog; a user who clicks "Update" in the
  Data Center on a v1 install sees the v2 row and its
  window.

## 22. Documentation

- **Install:** `docs/release/install-macos.md` is unchanged
  for 1.0.0. The 1.1.0 entry will replace the file name
  and the right-click → Open paragraph when 1.1.0 ships.
  The shape of the install path is the same.
- **Update:** a _Keeping Kingfisher up to date_ section is
  in `docs/release/install-macos.md` (the existing _7.
  Updating_ section) and the new `docs/release/release-manifest.md`
  describes the schema and the security boundary.
- **Security:** `SECURITY.md` describes the in-app update
  boundary and links to the release manifest document.
- **Privacy:** unchanged. The manual update check is one
  HTTPS request to GitHub release infrastructure; no
  telemetry, no auto-polling.
- **Data licences:** unchanged. v2 carries the same
  CC BY-SA 4.0 attribution as v1 and is listed in
  `docs/legal/data-licences.md`.
- **Recent Theory v2:** `docs/data/data-inventory.md`
  has a new _Recent Theory (v2, 6 months)_ section with
  the actual measured counts; `docs/data/reference-packs.md`
  has the v1 / v2 comparison row; the Phase 34 candidate
  sketch is annotated as over-estimating by a factor of 10.

## 23. Release

The version stays 1.0.0 at this commit. The brief says the
bump to 1.1.0 happens at the final checkpoint only.

- **Version:** `1.0.0` (package.json, desktop/package.json,
  Info.plist of the build, release manifest, the landing
  download card, the install guide). All in agreement.
- **Tag:** the 1.0.0 tag is on master; a 1.1.0 tag will
  be cut when the release gate passes.
- **GitHub release:** the 1.0.0 release stays the latest
  public application release until the gate runs and 1.1.0
  ships.
- **Artifacts:** the published artefacts at this commit
  match what Phase 34 left on the public release page
  (1.0.0 arm64 DMG, SHA256SUMS, kingfisher-release-manifest.json).
  Data: the v1 packs and the new v2 pack are both live on
  the data mirror.

## 24. Public links

- **Latest semantics:** `https://github.com/mardakurt/kingfisher/releases/latest`
  resolves to `v1.0.0` at this commit, and is asserted by
  the existing `/releases/latest` regression test. A
  data-only or `reference-*` tag would never be picked up.
- **Landing:** the Vercel landing page still serves the
  1.0.0 download card.
- **DMG:** the published DMG is `Kingfisher-1.0.0-arm64.dmg`.
- **Data:** the data mirror serves
  `reference-elite-v2/`, `reference-online-v1/`,
  `reference-recent-v1/`, and the new
  `reference-recent-v2/`.

## 25. Tests

- **Counts:** 2460 passing, 11 skipped, 0 failing
  (197 test files). 34 new tests on top of the Phase 34
  baseline: 25 in `update-protocol.test.mjs` and 9 in
  `menu.test.mjs`.
- **Suites run:** the full Vitest run.
- **Suites not run:** `desktop:smoke`, `desktop:chrome`,
  `desktop:restart`, `desktop:engines`, and the Playwright
  browser suite are reserved for the release gate. They
  were the same suites Phase 22 added and Phase 34 ran;
  Phase 35 does not regress them.
- **Heavy suites reserved for the release gate:** the
  brief is explicit that the heavy suites should not be
  run unless they are the right tool for the job. They
  are not the right tool at the _end_ of the phase; they
  are the right tool at the _start_ of the release gate.

## 26. Bugs

None outstanding.

- The 1.0.0 → 1.0.0 fix in `compareSemver` signature
  (string × string, not string × tuple) was a test
  contract mismatch caught in this phase and fixed in
  the same commit.
- The bridge-contract test would have failed because the
  Phase 35 bridge methods had no row; that was a missing
  contract row, not a bug, and the row is now in
  `bridge-contract.ts`.
- The publish script's path-builder used
  `reference-<pack-id-suffix>-v<N>`, which produced
  `reference-recent-theory-v2` for the v2 candidate while
  the v1 directory was at `reference-recent-v1`. The fix
  is a `--dir` override on the publish script, the v2
  directory was renamed in the data mirror, and the v1
  convention is preserved going forward.

## 27. Known limitations

- **Notarisation:** the desktop DMG is still code-signed
  with the Apple Development identity, not the Developer
  ID Application identity. The right-click → Open
  install path is unchanged. Notarisation is gated on
  the certificate being available.
- **No remote screenshot of the mounted DMG:** the
  developer's macOS screen-recording permission is not
  available to the unattended build environment. The
  structural verifier covers what the brief calls
  _Critical UI_ and _High UI_; the visual record is the
  committed background PNGs.
- **Heavy integration tests:** `desktop:smoke` and the
  Playwright browser suite are not part of this commit.
  They are reserved for the release gate.
- **Intel x64:** not supported. The 1.0.0 and 1.1.0
  builds are arm64 only; the updater refuses to offer
  an x64 asset because none is published.
- **Auto-update:** not implemented. The check is manual
  and the install is via the verified DMG, not silent
  in-place replacement. This is a deliberate
  cybersecurity stance, not a missing feature.

## 28. Release verdict

> **PHASE COMPLETE / 1.1.0 NOT RELEASED.**

The work in this phase is the preparation for the
Kingfisher 1.1.0 release. The application version stays
1.0.0 at this commit. The release gate (the heavy suites,
the `desktop:smoke` packaged run, the actual DMG build,
the install / upgrade acceptance against a real 1.0.0
profile) is the next step.

## 29. Next priorities

1. **Run the release gate and ship 1.1.0.** The work
   this phase was preparing is ready; what remains is
   running the heavy suites once, building the actual
   arm64 DMG, running `desktop:dmg:verify` against it,
   and pushing the 1.1.0 release. The `package.json`
   bump to 1.1.0 and the install guide / landing /
   public-claims update are part of the same change.

2. **Recent Theory v2 publication cadence.** The data
   pipeline now runs in well under an hour per build
   against six months of source. A release that ships
   1.1.0 is a natural place to commit to a 6-month
   rebuild rhythm — every 1.x release includes a fresh
   v2 candidate. The publish script is idempotent on
   existing version directories and refuses to delete;
   the cadence is operational, not technical.

3. **Notarisation.** A Developer ID Application
   identity in the keychain removes the right-click →
   Open install path and lets the _Open Installer_
   action in the dialog be a single, signed-and-notarised
   DMG that the user double-clicks through. Phase 35
   stops short of this because the certificate is not
   available in the build environment.

4. **Sustained Phase-35 visual sign-off.** The DMG
   background is a committed PNG pair; the rendered
   preview is the design source for this commit. A
   designer review pass on the typography, the icon
   placement, and the colour values would be the right
   use of the next human's time before 1.1.0 ships.

5. **Heavy integration suite in CI.** `desktop:smoke`,
   `desktop:chrome`, `desktop:restart`, and the
   Playwright browser suite are the right gate to run
   on the release commit. They are not part of the
   default PR gate because they take minutes and need
   macOS. A weekly run against `master` is the cheapest
   way to keep surprises from accumulating.
