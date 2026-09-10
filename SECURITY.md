# Security policy

Kingfisher is an open-source chess research workstation published under
the MIT licence. This page is the **security policy** — what the
product does, what it does not do, and how to report a vulnerability
to the maintainer privately.

The user-facing surfaces link here from their footers and from
`/.well-known/security.txt`.

## What the current public product is

| Surface           | Version                                                                                                                                     | Status                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Web application   | Kingfisher 1.0                                                                                                                              | Current. Hosted at the Vercel landing/studio host.                                     |
| macOS application | Kingfisher 1.0.0 (will become 1.1.0 once the Phase 36 release gate passes)                                                                  | Apple Silicon DMG + auto-update ZIP. The 1.1.0 binary is **Developer ID Application signed**, **notarised by Apple**, and the **ticket is stapled** so the deliverable is self-contained offline. Until the gate passes, the public binary is the 1.0.0 line, signed with the developer identity but not notarised. |
| Reference data    | Pack manifest version is the source of truth; the current packs are listed in [`docs/data/data-inventory.md`](docs/data/data-inventory.md). |

Only the **current** web build and the **current** macOS Preview DMG
receive security fixes. Older release candidates were not patched; if
a regression is reported against one, the answer is to upgrade.

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
- **Trusted remote origins** for the application's network calls are
  listed in `connect-src`: the application's own host, the GitHub
  Pages data mirror (`mardakurt.github.io`), Lichess
  (`lichess.org`, `api.chess.com`, `tablebase.lichess.ovh`,
  `explorer.lichess.ovh`), and the desktop companion's loopback
  range (`127.0.0.1`, `localhost`, `ws://`). Any other host is
  refused at the CSP layer.
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

- The desktop shell is **Electron** with `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true` for the renderer, and a
  preload that exposes a typed bridge. The bridge returns `null`
  in a browser, so the same application is safe to serve over a
  public origin.
- The companion's loopback server authenticates any HTTP request
  with a per-profile pairing token; the token is generated on
  first launch, written to the profile directory, and the
  shell and the companion are the only two processes that ever
  hold it. Cross-origin requests are refused by CORS.
- **Native engines are not sandboxed.** They run with the user's
  own operating-system permissions, and a settings panel checkbox
  is the only thing that prevents them from being launched. This
  is documented in the Settings → Engine dialog and in
  [`AGENTS.md`](AGENTS.md). Do not describe managed engines as
  sandboxed.
- The window cannot open a file that was not chosen in a dialog
  or dropped on the window; there is no `readFile(path)` on the
  bridge.
- The shell holds no chess state. A desktop feature that needs
  a second copy of the board, the move tree, the engine session
  or the query is a bug in the arrangement, not a feature of it.
- **Code signing** — the 1.1.0 binary carries a `Developer ID
  Application` signature with a secure timestamp and the macOS
  Hardened Runtime enabled. The signature chain covers the
  outer `.app` and every nested executable: Electron Framework,
  the `Kingfisher Helper` family, the GPU helper, the plugin
  helper, and the bundled engine binaries. The audit script
  `npm run desktop:sign:verify` checks every level.
- **Notarization** — the 1.1.0 binary is submitted to Apple's
  notary service and the resulting ticket is **stapled** to
  the `.app` and the `.dmg`, so the first launch does not
  need a network round-trip to retrieve the ticket. The
  audit script `npm run desktop:notary:verify` confirms
  stapling, `stapler validate`, and Gatekeeper `spctl
  --assess`.
- **Hardened Runtime entitlements** — see
  `desktop/build/entitlements.mac.plist` and the comment in
  that file for the justified list. The minimum set is what
  is shipped: `allow-jit` + `allow-unsigned-executable-memory`
  for WebAssembly, `disable-library-validation` +
  `allow-dyld-environment-variables` for the managed engine
  path, `user-selected.read-write` for the file dialogs, and
  the network client/server pair. No debug entitlement, no
  broad `disable-library-validation`-on-its-own.

### What the product deliberately does **not** do

- **No cross-device Sync.** Studies, repertoire, training, notes
  and preferences are local to one browser profile. There is no
  account, no cloud copy, no replication to a server. The
  documented way to move work between machines is
  _Settings → Database → Export backup_ and Import on the other
  side.
- **No telemetry, no analytics, no third-party scripts.** The web
  build does not load Google Analytics, Plausible, Hotjar, Segment,
  or any equivalent. CSP would refuse them anyway.
- **No advertising cookies, no advertising scripts.** The web
  build does not set any cookie; what state the application
  needs is held in `localStorage` and IndexedDB, scoped to the
  origin. See [`docs/legal/privacy.md`](docs/legal/privacy.md).
- **No auto-update.** The macOS Preview is downloaded again from
  the GitHub release page when the user wants to upgrade. The
  web build is whatever is currently deployed; if a fix is
  urgent, a manual refresh picks it up. Phase 34 added a
  _manual_ "Check for updates" action to the macOS application
  and the web PWA — the check is one HTTPS request to the public
  Kingfisher release metadata, validated against SHA-256 and
  DMG-name constraints, and **never downloads or executes a
  binary automatically**. The user always opens the verified
  release page in their own browser and downloads, verifies
  and installs by hand.
- **Phase 35 — in-app download, same manual boundary.** The
  _Kingfisher → Check for Updates…_ menu item now downloads
  the verified DMG inside the application. The download and
  the verification run inside the Electron main process; the
  renderer never sees `fetch` and never sees the filesystem.
  The flow is the same **manual** check the brief asked for:
  the user clicks, one HTTPS request goes out, the user reads
  the verdict. The download still needs an explicit
  _Download Update_ click; the install still needs the user
  to drag the verified DMG into Applications. The exact
  security boundary is in
  [`docs/release/release-manifest.md`](docs/release/release-manifest.md)
  — the desktop shell trusts the GitHub release manifest
  only, the manifest's URLs are restricted to the canonical
  release hosts, the downloaded asset is verified against
  SHA-256 _before_ it is offered, and a failed verification
  unlinks the partial download and reports
  _The downloaded update could not be verified._
- **Phase 36 — seamless in-place auto-update, gated by the
  same trust boundary.** The 1.1.0 release flow uses
  [`electron-updater`](https://www.electron.build/auto-update)
  for the install-and-relaunch handoff. The renderer does not
  decide the feed URL, the file system path, the signature
  policy or the release channel — the main process owns all
  of these. The updater is configured with
  `autoDownload: false`, `autoInstallOnAppQuit: false`,
  `allowPrerelease: false`, and `allowDowngrade: false`. The
  flow is:

  1. The user clicks **Check for Updates…** in the macOS
     application menu. One HTTPS request goes out.
  2. If a newer version is published, the dialog shows the
     new version with a primary **Install Update** button and
     a secondary **View Release Notes** button.
  3. The user clicks **Install Update**. Download, verify, and
     install run as a single chain: the platform's update
     engine fetches the verified update ZIP, validates the
     SHA-512, confirms the code-signature chain matches the
     running app, and replaces the installed `.app`. The
     previous version closes, the new version opens. There is
     no second "Open Installer" click in the normal flow.
  4. Before the install runs, the main process asks the
     renderer to flush any in-flight writes (the **save
     barrier**). If the renderer reports a failed save, the
     install is **aborted** — the user sees
     "Kingfisher could not safely finish saving your work.
     The update was not installed," and the verified update
     remains cached for a retry.
  5. The macOS auto-update engine also refuses an update whose
     signature does not match the running app's Developer ID
     identity, refuses a downgrade, and refuses an update
     whose `latest-mac.yml` does not parse against the
     production host allow-list (`github.com`,
     `api.github.com`, `release-assets.githubusercontent.com`,
     `objects.githubusercontent.com`).

  The full contract is in
  [`docs/release/macos-trusted-release.md`](docs/release/macos-trusted-release.md)
  and the implementation is in
  [`desktop/src/kingfisher-updater.mjs`](desktop/src/kingfisher-updater.mjs)
  and [`desktop/src/update-service.mjs`](desktop/src/update-service.mjs).
  The release script `npm run desktop:trust:verify` is the
  combined sign + notarize + Gatekeeper gate, and
  `npm run desktop:update:mutations` is the security
  mutation suite.

- **First-launch trust.** A 1.1.0 download on a fresh
  machine, with the macOS quarantine attribute applied (the
  scenario the OS actually exercises on a real download), is
  expected to launch via a normal double-click. There is no
  "unidentified developer" warning; no right-click → Open
  workaround. The notarization ticket is stapled so the
  Gatekeeper decision is offline.

### Service worker / PWA boundaries (added in Phase 34)

The studio origin (`kingfisher-roan.vercel.app`) registers a
service worker (`public/sw.js`) so a player who installs
Kingfisher from their browser can reopen it like an installed
application. The worker is a small vanilla script bundled with
the application — no Workbox, no remote scripts, no
`importScripts` from third-party origins. Its boundaries are:

- **Same-origin only.** The worker is hosted at
  `https://kingfisher-roan.vercel.app/sw.js` and the CSP allows
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

- the affected version (e.g. `Kingfisher 1.0` for the web build
  or `Kingfisher 1.0.0` for the macOS Preview);
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
  data mirror without coordination. The maintainer is happy
  to provide a test account and a local-only endpoint for
  research that benefits the project.
- **Do not** publish a working exploit before a fix is in
  users' hands.

## Out of scope

- **Engine binary vulnerabilities.** Kingfisher verifies the
  SHA-256 of every engine it downloads against the manifest
  shipped in the repository, but the engines themselves are
  third-party and are covered by their own security policies
  (Stockfish, Lc0, Berserk, Halogen, Koivisto, Obsidian,
  PlentyChess, Stormphrax, Viridithas).
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
