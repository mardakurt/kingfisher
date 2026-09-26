# Security policy

Kingfisher is an open-source chess research workstation published under
the MIT licence. This page is the **security policy** — what the
product does, what it does not do, and how to report a vulnerability
to the maintainer privately.

The user-facing surfaces link here from their footers and from
`/.well-known/security.txt`.

## What the current public product is

- **Web:** Kingfisher 1.1 at the Studio host, deployed from `master`.
- **macOS:** Kingfisher 1.3.0 for Apple Silicon — Developer ID signed,
  notarised by Apple, stapled. The exact build (number, commit, SHA-256)
  the landing offers is in `src/release/macos-download.json`; the
  install guide is [`docs/release/install-macos.md`](docs/release/install-macos.md).
- Older release candidates and the 1.0.0 preview are not patched. If a
  regression is reported against one, the answer is to upgrade.

## What is actually enforced today

This section describes the controls that are in code, not a marketing
claim about the product. Every item below maps to a file or a header
in the running deployment.

### Browser / web application

- **Content Security Policy** — `vercel.json` ships a strict CSP with
  `default-src 'self'`, no `script-src` third parties, `frame-ancestors
'none'`, `base-uri 'self'`, `object-src 'none'`. The only `script-src`
  allowances are `'self'`, `'wasm-unsafe-eval'` (Stockfish WebAssembly)
  and `'unsafe-inline'` (no scripts are inlined; this allowance is
  retained for Next.js style attributes and does not allow arbitrary
  inline JavaScript).
- **Cross-Origin-Opener-Policy: same-origin** and
  **Cross-Origin-Embedder-Policy: credentialless** are sent on every
  response, which is what enables `SharedArrayBuffer` for the
  Stockfish multi-threaded build.
- **HSTS** with `max-age=31536000; includeSubDomains; preload` and a
  **Referrer-Policy: strict-origin-when-cross-origin** header on every
  response.
- **Permissions-Policy** disables `camera`, `microphone`, `geolocation`
  and `interest-cohort` (FLoC) at the document level.
- **Remote origins** the application calls are named in
  `connect-src`: the application's own host, the GitHub Pages data
  mirror (`mardakurt.github.io`), Lichess (`lichess.org`,
  `explorer.lichess.org`, `tablebase.lichess.ovh`), Chess.com
  (`api.chess.com`), and the desktop companion's loopback range
  (`127.0.0.1`, `localhost`, `ws://`). `connect-src` also carries
  `https:`, because two calls choose their host at runtime — the
  full-network browser engine is fetched from the address its
  manifest records (unpkg) with a pinned SHA-256, and a user-configured
  assistant endpoint is whatever the user typed — so the policy does
  not refuse other HTTPS hosts; what the application connects to is
  bounded by its code, which makes no other call. Scripts, styles,
  frames and objects are restricted to the origin regardless.
- **External link restrictions** — outbound links are validated
  against an allow-list before the application will follow them; see
  `src/middleware-host-rules.ts` and `src/lib/redirect-validation.ts`.
- **Downloaded data is verified.** Every reference-pack chunk and
  every managed engine binary is checked against a SHA-256 recorded
  in the manifest before it is used; a mismatch is reported, never
  silently accepted. See `src/reference/install.ts`,
  `src/engine/manager.ts` and [`THIRD_PARTY_DATA.md`](THIRD_PARTY_DATA.md).
- **Decompression bounds** — every decompression path uses
  `DecompressionStream` with an explicit byte budget and rejects a
  chunk whose decompressed size exceeds the manifest's record. See
  `src/reference/pack.ts`.
- **IndexedDB streaming cache** — the explorer caches shards in
  IndexedDB with a byte budget and a TTL; cached bytes are
  re-verified against the manifest before they are reused.
- **Backup portability** — backups are portable JSON with the same
  schema-versioned envelope as persistence; see `docs/deployment.md`.

### macOS application

- The desktop shell is **Electron 44** with `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true` for the renderer, and a
  preload (`desktop/src/preload.cjs`) that exposes a typed bridge and
  nothing else — no `require`, no `ipcRenderer`, no filesystem. The
  bridge returns `null` in a browser, so the same application is safe
  to serve over a public origin. `npm run desktop:smoke -- --packaged`
  asserts all three flags and the absence of a Node handle in the
  packaged renderer.
- The companion is a separate process the shell starts, on a
  loopback port only. Every request except `/health` needs a
  **pairing token** the shell mints in memory on each launch, hands
  to the renderer as a command-line switch, and never writes to
  disk; the log redacts it. Cross-origin requests are refused by
  CORS; only the loopback origin the shell serves from is admitted.
  `companion/src/server-fuzz.test.mjs` sends the real process
  unsupported methods, hostile paths, wrong tokens of every shape,
  malformed bodies, a 70 MB upload and two hundred random requests
  and requires it to answer 4xx and stay up.
- **Native engines are not sandboxed.** They run with the user's own
  operating-system permissions. A managed engine is downloaded
  against a recorded SHA-256 and must complete a real search before
  it is listed as ready; a custom engine is whatever the user
  pointed at. The engine process receives a minimal environment
  (`companion/src/engine-sandbox.mjs`), has its thread and hash
  requests clamped, and is stopped with its whole process group.
  Do not describe managed engines as sandboxed.
- An engine's answer is checked against the question: a `bestmove`
  that is not a legal move in the position the engine was given is
  dropped, never drawn on the board.
- The window cannot open a file that was not chosen in a dialog,
  dropped on the window, or handed to the application by the
  Finder; there is no `readFile(path)` on the bridge. Navigation is
  pinned to the shell's own server; any other URL opens in the
  user's browser.
- The shell holds no chess state. A desktop feature that needs a
  second copy of the board, the move tree, the engine session or
  the query is a bug in the arrangement, not a feature of it.
- **Code signing.** Kingfisher 1.1.0 and every build since is signed
  with a `Developer ID Application` identity (team `3B5CYF9DQ4`),
  Hardened Runtime on, secure timestamp, with the five entitlements in
  `desktop/build/entitlements.mac.plist` and no others: `allow-jit` and
  `allow-unsigned-executable-memory` for V8 and WebAssembly,
  `files.user-selected.read-write` for the dialogs, and the network
  client/server pair for the loopback web server and the release host.
  `disable-library-validation` and `allow-dyld-environment-variables`,
  granted in Phase 36 "for the engines", are gone: engines are separate
  processes the companion spawns, and nothing unsigned is loaded into a
  Kingfisher process. No debug entitlement. `npm run desktop:sign:verify`
  walks every nested code object and refuses any entitlement not in that
  file.
- **Notarisation.** The signed `.app` is submitted to Apple's notary
  service during the build and its ticket is stapled; the disk image is
  signed with the same identity and stapled separately
  (`npm run release:mac:notarize`). Gatekeeper's answer for both is
  "accepted, source=Notarized Developer ID", and it is available
  offline. Notarisation is Apple's automated malware screening, not a
  review of the product. `npm run desktop:public:verify -- --full`
  downloads the public DMG and checks that its signing identity and
  notarisation state are exactly what `src/release/macos-download.json`
  and this page claim.
- **The build is identified.** Every packaged Kingfisher records its
  marketing version, a monotonic build number
  (`git rev-list --count`), the commit, whether the tree was dirty,
  and its channel (`stable`, `preview`, `dev`) in `CFBundleVersion`
  and the packaged `package.json`; _Settings → Diagnostics_ reports
  them, so a support report about "1.3.0" can be matched to bytes.
  A publishable channel refuses to build from a dirty tree, and refuses
  to build without notarisation credentials.
- **The bundle is complete by construction.** One list
  (`desktop/src/required-resources.mjs`) names what the packaged
  application must contain; the build refuses to sign a bundle missing
  any of it, and launches the signed, notarised application — bridge,
  web server, companion, engine catalogue, update feed — before a DMG is
  made from those bytes.
- **Updates.** _Kingfisher → Check for Updates…_ is the entry point,
  plus one quiet, information-only look at launch that shows nothing
  and downloads nothing; there is no poller. The update engine is **Sparkle**
  (`desktop/scripts/fetch-sparkle.mjs` vendors it against the digest
  recorded in `desktop/sparkle.json`); the running application reads
  the appcast named by `SUFeedURL` in `Info.plist`
  (`scripts/desktop-mac-appcast.mjs` writes it), the download is
  verified against the appcast's EdDSA signature and the bundle's own
  Developer ID, the renderer confirms every write is committed (a
  failed save barrier aborts the install and leaves the postponed
  install unreleased), and Sparkle's own installer — which refuses an
  update whose code signature does not match the running application —
  replaces the bundle and relaunches. The public 1.0.0 predates the
  updater and is signed with a different identity; it cannot update
  itself and must be replaced by hand once. Every release from 1.1.8
  on carries an appcast; 1.1.0–1.1.7 still ship `latest-mac.yml` for
  the previous engine (`electron-updater`) and continue to be offered
  the next stable release through it.

### What the product deliberately does **not** do

- **No cross-device Sync.** Studies, repertoire, training, notes
  and preferences are local to one browser profile. There is no
  account, no cloud copy, no replication to a server. The
  documented way to move work between machines is
  _Settings → Database → Export backup_ and Import on the other
  side.
- **Page views and load times only, from this origin.** The website
  counts page views with Vercel Web Analytics and page load timings
  with Vercel Speed Insights, both served from `/_vercel/` on this
  origin — no cookie, no identifier on the device, query strings
  stripped (`src/app/_analytics/WebAnalytics.tsx`). No other
  analytics, no error-reporting service, no third-party script: the
  CSP is `'self'` and would refuse one. The Mac application, built
  off Vercel, never loads it.
- **No advertising cookies, no advertising scripts.** The web
  build does not set any cookie; what state the application
  needs is held in `localStorage` and IndexedDB, scoped to the
  origin. See [`docs/legal/privacy.md`](docs/legal/privacy.md).
- **Updates are asked for, never pushed.** _Kingfisher → Check for
  Updates…_ is the entry point; the only other request is one quiet,
  information-only look at the feed five seconds after launch, which
  shows nothing and downloads nothing and only relabels the menu item
  when a newer release exists. No timer, no telemetry. A
  **preview** build answers from what it is — its build number and
  a button to the download page — and makes no request at all,
  because previews are replaced by downloading the next one. A
  **stable** build reads the Sparkle appcast baked into the bundle
  (`SUFeedURL`) once, with `SUEnableAutomaticChecks=false` and
  `SUAllowsAutomaticUpdates=false` (so neither scheduled check nor
  silent download is possible); the bridge
  ([`desktop/native/sparkle/bridge.mm`](desktop/native/sparkle/bridge.mm))
  asserts the same on the `SPUUpdater`. If the appcast offers a
  newer release Sparkle shows its own window with **Install
  Update**; on that click Sparkle downloads the update archive,
  verifies its EdDSA signature against the public key baked into
  `Info.plist`, extracts it, and — before it may terminate the
  application — asks the renderer to flush every in-flight write (the
  **save barrier**: the bridge postpones the relaunch and only a
  passing barrier releases it; a failed one is reported in a sheet and
  the staged update installs on the next quit). Sparkle's installer
  then replaces the bundle, refusing one whose code signature does not
  match the running application. The renderer never sees
  `fetch` or the filesystem. Every release from 1.1.8 on carries an
  appcast; releases 1.1.0–1.1.7 still ship `latest-mac.yml` for the
  previous engine (`electron-updater`) and continue to be offered
  the next stable release through it; the public 1.0.0 predates the
  updater and is replaced by hand. The implementation is in
  [`desktop/src/update-service.mjs`](desktop/src/update-service.mjs)
  and [`desktop/src/sparkle-updater.mjs`](desktop/src/sparkle-updater.mjs);
  `npm run desktop:update:mutations` is its mutation suite and
  `npm run desktop:update:real` performs a real update between two
  packaged builds through Sparkle's own window.
- **First-launch trust.** A fresh download of the current release carries the
  browser's quarantine attribute; Gatekeeper finds the stapled ticket,
  macOS shows its standard "downloaded from the Internet" confirmation
  once, and the application starts on **Open**. No right-click
  workaround, no "cannot be checked for malicious software".

### Service worker / PWA boundaries (added in Phase 34)

The application origin (`kingfisherchess.app`) registers a
service worker (`public/sw.js`) so a player who installs
Kingfisher from their browser can reopen it like an installed
application. The worker is a small vanilla script bundled with
the application — no Workbox, no remote scripts, no
`importScripts` from third-party origins. Its boundaries are:

- **Same-origin only.** The worker is hosted at
  `https://kingfisherchess.app/sw.js` and the CSP allows
  only `'self'` script sources. A hostile site cannot register
  a different worker for the studio origin.
- **Application shell only.** The worker caches Next.js hashed
  static assets (`/_next/static/*`), the PWA manifest, and
  the application icons. It does **not** cache reference data,
  Lichess or Chess.com API responses, authentication, or any
  cross-origin resource. The reference data cache lives in
  IndexedDB and is owned by `src/persistence/streaming-cache.ts`.
- **No remote code.** The worker script is plain JavaScript
  served from the same pipeline that ships the application. It
  contains no `eval`, no remote imports, and no dynamic
  service-worker source.
- **Update by user choice.** A new worker installs and waits.
  The application surfaces a "Reload" button that the user
  clicks to apply the update; the new worker is never forced
  active while the player is editing a Study.
- **Cache versioning by build identity.** The cache name embeds
  the build identity, not the Kingfisher semantic version. A
  new deploy that ships a different worker automatically
  invalidates the previous app-shell cache on first activation.
  Old caches are explicitly deleted.

## How to report a vulnerability

**Do not** open a public GitHub issue, discussion, tweet or forum
post for a security problem. Public issues are indexed by search
engines and will be read by every attacker in the world before a
fix is in the next release.

Use the **private** GitHub Security Advisory flow — it is the
private channel the maintainer is set up to receive. From the
repository's Security tab:

> <https://github.com/mardakurt/kingfisher/security/advisories/new>

If the GitHub security flow is unavailable for any reason, open
a private issue at the same repository with the word
`SECURITY:` at the start of the title and **without** exploit
detail in the body — the maintainer will move the conversation
to the private advisory flow. The public-facing report should
say enough to be acknowledged and no more.

The report should include:

- the affected version, from _Settings → Diagnostics_ (the
  marketing version, and for the macOS build its build number and
  commit);
- a minimal reproduction;
- what you observed and what you expected;
- any workarounds you tried.

A diagnostic export from _Settings → Diagnostics_ is safe to
attach. The export never includes Lichess tokens, API keys, the
companion pairing token, home-directory paths or full PGN
libraries.

## What to expect

The maintainer aims to:

- acknowledge the report within seven days;
- ship a fix in the next release, or sooner if the issue is
  severe;
- publish a CVE if the report warrants one;
- credit the reporter in the release notes (unless the
  reporter prefers to remain anonymous).

## What _not_ to do

- **Do not** paste a vulnerability report into a public
  GitHub issue, a discussion, a tweet, a Reddit post, or a
  Lichess forum thread.
- **Do not** run a fuzzer against the public web or the public
  data mirror without coordination. Kingfisher has no accounts
  to hand out; for research that benefits the project the
  maintainer can arrange a local-only endpoint.
- **Do not** publish a working exploit before a fix is in
  users' hands.

## Out of scope

- **Engine binary vulnerabilities.** Kingfisher verifies the
  SHA-256 of every engine it downloads against the manifest
  shipped in the repository, but the engines themselves are
  third-party and are covered by their own security policies
  (Stockfish, Lc0, Halogen, PlentyChess, Stormphrax, Viridithas
  on macOS; Berserk, Koivisto and Obsidian are catalogued for
  Windows and Linux builds only).
- **Reference data vulnerabilities.** Kingfisher verifies the
  SHA-256 of every chunk it downloads against the manifest
  shipped in the data repository. The data sources are
  themselves Lichess and the broadcast archives.
- **Phishing, social engineering, or supply-chain attacks on
  the user's machine.** Kingfisher is local-first; the product
  is not a hosted service.

## See also

- [`AGENTS.md`](AGENTS.md) — the maintainer-facing rules of the
  project, including the desktop and persistence boundaries.
- [`docs/legal/privacy.md`](docs/legal/privacy.md) — what
  the application does and does not collect.
- [`docs/legal/data-licences.md`](docs/legal/data-licences.md) —
  every third-party data source and its licence.
