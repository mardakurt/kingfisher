# Platform parity — the web application and the macOS application

Kingfisher runs in a browser and as a Mac application, and they are the
same application architecture: `desktop/` packages a Next.js build from this
repository, and the whole surface between shell and page is one preload
file plus `src/desktop/bridge.ts`, which returns `null` in a browser.
This document is the Phase 49 check on that claim, feature by feature,
with the deliberate differences named and the reason for each.

**Published revision check (2026-09-13, 1.1.4).** The public Mac 1.1.4
DMG is build 544 from `8f3e1d5` (1.1.3 was build 539 from `0600ce1`), the same revision the web deployment
serves (`npm run deploy:status` → `up to date (8f3e1d5)`). Every Phase 51
change — the workspace frame on every board route, position setup
everywhere, the engine selector, the default board, the player identity
merge, the Preparation search over the reference packs — is in both
identities; the one Mac-only change is the Lichess sign-in window in
`desktop/src/oauth-window.mjs`, listed below under native capabilities.
Later web-only commits, if any, are recorded here when they land; the Mac
release is due when there is a Mac-facing change.

The previous check (1.1.2, build 516 from `fc95f4d`) recorded the web-only
commits made after it: the public address, Web Analytics, the retirement of
the old studio host, licence and footer corrections, and the durable-storage
request after the first save. All are in 1.1.3 as well.

**The rule.** Core chess behaviour should agree when built from the same
source revision. A difference is legitimate only where a native capability exists
that a browser does not have (a process, a file path, a menu bar, an
update engine, a window), and every such row says what the capability
is. A row that read "desktop only" for something a browser could do
would be a bug in the arrangement; there are none.

**Evidence.** A named spec is a browser test in `e2e/`, run in the
Phase 49 matrix (Chrome, Chromium, Firefox, WebKit). A named desktop
gate drives the packaged `Kingfisher.app` built in Phase 49. "Walk"
means the twelve-step side-by-side session in
[`final-certification.md`](final-certification.md) § Parity walk, done
once on the production web application and once on the packaged Mac
application.

## Core capabilities — identical

| Feature                            | Web | macOS | Difference                                                                                | Evidence                                                                |
| ---------------------------------- | :-: | :---: | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Board, pieces, orientation         | ✅  |  ✅   | none                                                                                      | `visual.spec.ts`, `piece-proportions.spec.ts`; smoke: board drawn; walk |
| Legal moves, check, mate           | ✅  |  ✅   | none                                                                                      | `src/chess/**`; same code path                                          |
| Engine (browser Stockfish 18)      | ✅  |  ✅   | none — and the desktop is cross-origin isolated, so it is threaded there too              | `engines.spec.ts`; smoke: `SharedArrayBuffer`; walk                     |
| Engine arrows                      | ✅  |  ✅   | none                                                                                      | `engines.spec.ts` "played while an arrow is drawn"; walk                |
| Evaluation bar                     | ✅  |  ✅   | none                                                                                      | `evaluation-bar-layout.test.ts`; `engines.spec.ts` flip test; walk      |
| Explorer, one source at a time     | ✅  |  ✅   | none                                                                                      | `reference-sources.spec.ts`; walk                                       |
| Compare Sources (no merging)       | ✅  |  ✅   | none                                                                                      | `source-comparison.spec.ts`; walk                                       |
| Reference packs (install, use)     | ✅  |  ✅   | none                                                                                      | `reference-packs.spec.ts`; `desktop:field`                              |
| Players (packs, legends, roster)   | ✅  |  ✅   | none                                                                                      | `players.spec.ts`; `players.test.ts`; walk                              |
| Openings (library, Theory Book)    | ✅  |  ✅   | none                                                                                      | `theory-book.spec.ts`, `opening-walk.spec.ts`; walk                     |
| Studies, chapters, annotations     | ✅  |  ✅   | none                                                                                      | `phase8.spec.ts`, `kingfisher.spec.ts`; walk                            |
| Repertoire                         | ✅  |  ✅   | none                                                                                      | `phase9.spec.ts`, `repertoire-review.spec.ts`; walk                     |
| Preparation                        | ✅  |  ✅   | none                                                                                      | `phase9.spec.ts`; walk                                                  |
| Training (repertoire, calculation) | ✅  |  ✅   | none                                                                                      | `phase10.spec.ts`; `calculation-training.test.ts`; walk                 |
| Game Review, Critical Moments      | ✅  |  ✅   | none                                                                                      | `analyse-game.spec.ts`, `phase11.spec.ts`; walk                         |
| Universal Search (⌘K)              | ✅  |  ✅   | none                                                                                      | `accessibility.spec.ts`; walk                                           |
| Recent Work                        | ✅  |  ✅   | none                                                                                      | `reliability.spec.ts`; walk                                             |
| Backup and restore                 | ✅  |  ✅   | none — the file is chosen with the platform's own picker in both                          | `backup-restore.spec.ts`; walk                                          |
| Feedback                           | ✅  |  ✅   | none — the same route and the same fallback (copy / open a GitHub issue)                  | `route.test.ts`; walk                                                   |
| Themes, boards, piece sets         | ✅  |  ✅   | none                                                                                      | `appearance.spec.ts`, `settings.spec.ts`                                |
| Copy FEN / PGN                     | ✅  |  ✅   | none — a six-field FEN, unchanged by orientation                                          | `fen.test.ts` (six fields, castling, en passant); walk                  |
| Tablebase (remote Lichess)         | ✅  |  ✅   | none                                                                                      | `phase9.spec.ts`; same code path                                        |
| Settings, every preference         | ✅  |  ✅   | none — desktop pairing is written through the same preference store                       | `settings.spec.ts`                                                      |
| Persistence across restart         | ✅  |  ✅   | none in behaviour; storage is the browser's origin vs the profile's fixed loopback origin | `reliability.spec.ts`; `desktop:restart`                                |

## Where the desktop adds a native capability

Every row is something a browser is not permitted to do. None changes
what a feature _does_; each adds a way of reaching it.

| Capability                                    |               Web               |    macOS    | Why the difference exists                                                                                                                   | Evidence                                                             |
| --------------------------------------------- | :-----------------------------: | :---------: | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Native engines (Stockfish, Lc0, …)            | ◐ via a companion the user runs | ✅ built in | A page cannot start a process; the shell starts and pairs its companion                                                                     | `desktop:engines -- --packaged`; smoke                               |
| Local SQLite collections                      |         ◐ via companion         | ✅ built in | as above                                                                                                                                    | smoke: companion paired; `database-chaos`                            |
| Local Syzygy tables                           |         ◐ via companion         | ✅ built in | Reading table files needs a filesystem                                                                                                      | `tbprobe-real.test.mjs`                                              |
| Open a collection or PGN by path, Open Recent |                ✗                |     ✅      | A page cannot turn a chosen file into a _path_                                                                                              | `files.test.mjs`, `menu.test.mjs`; smoke                             |
| Browse… beside a path field                   |          ◐ typed path           |     ✅      | A native picker returns a path                                                                                                              | `bridge-contract.test.ts`                                            |
| Double-click a `.pgn`, drop a file            |                ✗                |     ✅      | Document association belongs to an installed application                                                                                    | smoke: PGN opens                                                     |
| macOS menu bar, ⌘Q, full screen               |                ✗                |     ✅      | The window is the operating system's                                                                                                        | `desktop:menus`; `desktop:chrome`                                    |
| Check for Updates…                            |  ✗ (the web is always current)  |     ✅      | macOS's own update engine replaces the bundle                                                                                               | `desktop:update:real`; public 1.1.0 → 1.1.1                          |
| Window buttons and the title-bar reservation  |                ✗                |     ✅      | macOS draws the buttons over the contents; the reservation is zero in a browser                                                             | `desktop:chrome`; `window-chrome.spec.ts`                            |
| Sign in with Lichess in a window of its own   |    n/a — the page navigates     |     ✅      | The shell refuses to navigate its window; the sign-in gets a child window that returns the callback to the main window (`oauth-window.mjs`) | `oauth-window.test.mjs`; the manual sign-in in the Phase 51 handover |

## Where the web adds a browser capability

| Capability                      | Web | macOS | Why                                                                            | Evidence                                                    |
| ------------------------------- | :-: | :---: | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Install as a PWA, offline shell | ✅  |  n/a  | A service worker belongs to a browser origin; the Mac app is already installed | `manifest.webmanifest` route; SW rows in `settings.spec.ts` |
| Any modern browser on any OS    | ✅  |  n/a  | The desktop is built for macOS arm64 only                                      | the matrix                                                  |

## Differences that are not allowed, and are checked

| Would-be difference                      | Status                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A second board renderer in the shell     | Absent — one board architecture (`AGENTS.md`)                                                          |
| Chess state in the main process          | Absent — no board, tree, engine session or query in `desktop/src/`                                     |
| A second preferences system              | Absent — pairing is written through the same store                                                     |
| A web build changed to suit the desktop  | Absent — standalone output and isolation are opt-in env vars only `scripts/build-desktop-web.mjs` sets |
| A generic `readFile(path)` on the bridge | Absent, deliberately                                                                                   |
| A title-bar spacer in the browser        | Absent, and asserted by `window-chrome.spec.ts`                                                        |
| Fake window buttons drawn in HTML        | Absent — the traffic lights are the system's                                                           |

## The one asymmetry worth stating plainly

On the web, three things need a companion the user starts themselves:
SQLite collections, native engines and local Syzygy tables. On the
desktop they need nothing, because the shell starts and pairs one. That
is the largest practical difference between the two identities, and it
is a difference in _setup_, not in behaviour — the same code answers
the same questions once a companion exists either way. The desktop adds
native capability and loses nothing the web has.

[`web-desktop-parity.md`](web-desktop-parity.md) is the Phase 45 version
of this table, kept as a record.
