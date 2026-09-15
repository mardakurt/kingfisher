# Platform parity — the web application and the macOS application

Kingfisher runs in a browser and as a Mac application, and they are the
same application architecture: `desktop/` packages a Next.js build from this
repository, and the whole surface between shell and page is one preload
file plus `src/desktop/bridge.ts`, which returns `null` in a browser.
This document is the Phase 49 check on that claim, feature by feature,
with the deliberate differences named and the reason for each.

**Published revision check (2026-09-15, 1.1.8).** The public Mac 1.1.8
DMG is built from the `v1.1.8` tag's revision — its build number and
commit are in `src/release/macos-download.json` — which is the revision
the web deployment served when it was built. 1.1.8 changes the shell
only: the update engine is Sparkle (`desktop/src/sparkle-updater.mjs`,
`desktop/native/sparkle/`), the Settings → Application panel describes
it, and the public security page says the launch-time check exists.
The renderer change is two sentences of copy; nothing else reaches the
web application, and the paragraphs below still hold.

**Published revision check (2026-09-14, 1.1.7).** The public Mac 1.1.7
DMG is built from the `v1.1.7` tag's revision — its build number and
commit are in `src/release/macos-download.json` — which is the revision
the web deployment served when it was built. 1.1.7 changes the shell
only: an update's relaunch adopts the profile that installed it, and a
launch of an older version is recorded without an "updated" notice
(`desktop/src/relaunch-profile.mjs`). Nothing in it reaches the web
application; the paragraph below is the 1.1.6 check and still holds.

**Published revision check (2026-09-14, 1.1.6).** The public Mac 1.1.6
DMG was built from the `v1.1.6` tag's revision — its build number and
commit are in `src/release/macos-download.json` — which is the revision
the web deployment served when it was built (`npm run deploy:status`);
the descriptor and docs commits that follow a Mac release change no
application code. Every Phase 53 change is in both identities: the
redrawn Opening, Endgame and Training icons; Position and Set up
labelled from 430 px and the header measured to fit an iPad; the
command palette's word matching and sections; the Databases rail with
its three Lichess sources readable and the storage line; the review
queue by staleness; the Recent page's games meta; the preparation
dossier's Recent form tab and the 2,000-game cap; the version-4
bundled reference (206,451 games). Three changes are Mac-only because
they concern the shell — the brand flush to the corner in full screen,
the route headers as the window's drag region, and the native
Stockfish's name — and are in the native-capability rows below. One
change is **web-only by design** and is the first such row: the
full-network browser Stockfish (113 MB), which the web deployment
installs and the Mac build leaves out because a Mac has native
Stockfish 19; the registry offers the row only where the manifest
lists the build, so neither identity shows an engine it cannot start.

The previous check (1.1.5, build 558) found the branch ahead of the Mac
by the Phase 53 commits; 1.1.6 is that release.

The previous check (1.1.4, build 544 from `8f3e1d5`) found no web-only
commits after it.

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
| Engine (browser, full network)     | ✅  |   —   | web only: a Mac has native Stockfish 19, and 226 MB of WebAssembly would double the DMG   | `registry.test.ts`; `build-desktop-web.mjs` leaves it out of the bundle |
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

| Capability                                    |               Web               |    macOS    | Why the difference exists                                                                                                                                                 | Evidence                                                                             |
| --------------------------------------------- | :-----------------------------: | :---------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Native engines (Stockfish, Lc0, …)            | ◐ via a companion the user runs | ✅ built in | A page cannot start a process; the shell starts and pairs its companion                                                                                                   | `desktop:engines -- --packaged`; smoke                                               |
| Local SQLite collections                      |         ◐ via companion         | ✅ built in | as above                                                                                                                                                                  | smoke: companion paired; `database-chaos`                                            |
| Local Syzygy tables                           |         ◐ via companion         | ✅ built in | Reading table files needs a filesystem                                                                                                                                    | `tbprobe-real.test.mjs`                                                              |
| Open a collection or PGN by path, Open Recent |                ✗                |     ✅      | A page cannot turn a chosen file into a _path_                                                                                                                            | `files.test.mjs`, `menu.test.mjs`; smoke                                             |
| Browse… beside a path field                   |          ◐ typed path           |     ✅      | A native picker returns a path                                                                                                                                            | `bridge-contract.test.ts`                                                            |
| Double-click a `.pgn`, drop a file            |                ✗                |     ✅      | Document association belongs to an installed application                                                                                                                  | smoke: PGN opens                                                                     |
| macOS menu bar, ⌘Q, full screen               |                ✗                |     ✅      | The window is the operating system's                                                                                                                                      | `desktop:menus`; `desktop:chrome`                                                    |
| Check for Updates…                            |  ✗ (the web is always current)  |     ✅      | Sparkle asks the feed, shows its own window with the release notes, verifies the signed archive and replaces the bundle; the save barrier holds the relaunch              | `desktop:update:real` (Sparkle → Sparkle, and 1.1.7 → Sparkle); `desktop:update:e2e` |
| Window buttons and the title-bar reservation  |                ✗                |     ✅      | macOS draws the buttons over the contents; the reservation is zero in a browser, and since 1.1.5 it is restated from the application so a client re-render cannot drop it | `desktop:chrome`; `window-chrome.spec.ts` (stubbed bridge)                           |
| Sign in with Lichess in a window of its own   |    n/a — the page navigates     |     ✅      | The shell refuses to navigate its window; the sign-in gets a child window that returns the callback to the main window (`oauth-window.mjs`)                               | `oauth-window.test.mjs`; the manual sign-in in the Phase 51 handover                 |

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
