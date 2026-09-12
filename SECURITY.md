# Security policy

Kingfisher is an open-source chess research workstation published under
the MIT licence. This page is the **security policy** — what the
product does, what it does not do, and how to report a vulnerability
to the maintainer privately.

The user-facing surfaces link here from their footers and from
`/.well-known/security.txt`.

## What the current public product is

| Surface           | Version                                                                                                                                     | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web application   | Kingfisher 1.0                                                                                                                              | Current. Hosted at the Vercel landing/studio host.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| macOS application | Kingfisher 1.0.0, offered as a **macOS Preview** — a build of the current source with a build number, not a tagged release                  | Apple Silicon DMG. Code-signed with an `Apple Development` identity, **not notarised**: the project has no `Developer ID Application` certificate yet, so Gatekeeper refuses the first launch and the [install guide](docs/release/install-macos.md) documents the right-click → Open flow. The exact file, its SHA-256, build number and commit are in [`src/release/macos-download.json`](src/release/macos-download.json), the one place that names it. A signed, notarised release (planned as 1.1.0) is described under _Trusted release_ below as a runbook, not as something that exists. |
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
- **Code signing, today.** The public preview is signed with an
  `Apple Development` identity, Hardened Runtime on, secure
  timestamp, with the entitlements in
  `desktop/build/entitlements.mac.plist`: `allow-jit` and
  `allow-unsigned-executable-memory` for WebAssembly,
  `disable-library-validation` and
  `allow-dyld-environment-variables` for the engine path,
  `files.user-selected.read-write` for the dialogs, and the
  network client/server pair. No debug entitlement. `npm run
desktop:sign:verify` checks the chain. This identity satisfies
  the signature on the machine that made it and is **not trusted
  by Gatekeeper elsewhere** — that is the whole difference between a
  preview and a release.
- **Notarisation, today: none.** There is no ticket to staple.
  `npm run desktop:public:verify -- --full` downloads the public
  DMG and checks that its signing identity and notarisation state
  are exactly what the descriptor and this page claim.
- **The build is identified.** Every packaged Kingfisher records its
  marketing version, a monotonic build number
  (`git rev-list --count`), the commit, whether the tree was dirty,
  and its channel (`stable`, `preview`, `dev`) in `CFBundleVersion`
  and the packaged `package.json`; _Settings → Diagnostics_ reports
  them, so a support report about "1.0.0" can be matched to bytes.
  A publishable channel refuses to build from a dirty tree.

#### Trusted release — the runbook, not the present

When a `Developer ID Application` certificate is installed
([`docs/release/apple-developer-id-setup.md`](docs/release/apple-developer-id-setup.md)),
[`docs/release/macos-trusted-release.md`](docs/release/macos-trusted-release.md)
produces a build that is Developer ID signed with Hardened Runtime,
submitted to Apple's notary service, with the ticket **stapled** to
the `.app` and the `.dmg` so the Gatekeeper decision is offline, and
launches from a quarantined download with a normal double-click.
`npm run desktop:notary:verify` and `npm run desktop:trust:verify`
are the gates. None of this describes the current public download,
and no document in this repository may say it does until
`macos-download.json` records `notarized: true`.

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
- **Updates are asked for, never pushed.** _Kingfisher → Check for
  Updates…_ is the only entry point and the user's click is the only
  network event: no poller, no background check, no telemetry. A
  **preview** build answers from what it is — its build number and
  a button to the download page — and makes no request at all,
  because previews are replaced by downloading the next one. A
  **stable** build asks the GitHub release feed baked into the
  bundle (`app-update.yml`) once, through `electron-updater`
  configured with `autoDownload: false`, `autoInstallOnAppQuit:
false`, `allowPrerelease: false` (so the preview channel is
  invisible to it) and `allowDowngrade: false`. If a newer release
  is published, the dialog offers **Install Update**; on that click
  the main process downloads the update ZIP, verifies its SHA-512
  against the feed, asks the renderer to flush every in-flight
  write (the **save barrier** — a failed save aborts the install
  and says so), and hands the verified archive to macOS's own
  update engine, which refuses an update whose code signature does
  not match the running application. The renderer never sees
  `fetch` or the filesystem. Today the public 1.0.0 release carries
  no update feed, so a stable-channel check reports exactly that;
  the implementation is in
  [`desktop/src/update-service.mjs`](desktop/src/update-service.mjs)
  and [`desktop/src/kingfisher-updater.mjs`](desktop/src/kingfisher-updater.mjs),
  and `npm run desktop:update:mutations` is its mutation suite.
- **First-launch trust, today.** A fresh download of the preview
  carries the browser's quarantine attribute and is refused by
  Gatekeeper on first launch; right-click → Open records the
  exception for that copy. The signed, notarised release described
  in the runbook above would launch with a normal double-click; the
  preview does not, and nothing here says otherwise.

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
