# Platform parity — the web application and the macOS application

Kingfisher runs in a browser and as a Mac application, and they are the
same application architecture: `desktop/` packages a Next.js build from this
repository, and the whole surface between shell and page is one preload
file plus `src/desktop/bridge.ts`, which returns `null` in a browser.
This document is the Phase 49 check on that claim, feature by feature,
with the deliberate differences named and the reason for each.

**Published revision check (2026-09-14, 1.1.5).** The public Mac 1.1.5
DMG is built from the `v1.1.5` tag's revision — its build number and
commit are in `src/release/macos-download.json` (1.1.4 was build 544 from
`8f3e1d5`) — which is the revision the web deployment served when it was
built (`npm run deploy:status`); the descriptor and docs commits that
follow a Mac release change no application code.
Every Phase 52 change — the legible evaluation bar and the engine that
follows the board, the graph, the Reset moves button, Review's candidates
on the one board, the colour-blind verdict tokens, the three piece sets,
the version-3 bundled reference, the sparring partner — is in both
identities. Two changes are Mac-only because they concern the shell: the
window-button reservation restated from the application (a browser
reserves nothing) and the update dialog's three-highlight layout; both are
in the native-capability rows below. Later web-only commits, if any, are
recorded here when they land; the Mac release is due when there is a
Mac-facing change.

**Master is ahead of the public Mac (Phase 53, in progress).** The
Phase 53 work in this branch covers seven commits from `1e0a0ee` to
`9d2e0e9`. The first three (`1e0a0ee`, `6f831ba`, `1e0a0ee`'s window
chrome and iPad label changes, plus the platform-parity note) were
recorded in the prior commit; the next four add the rest.

`56c2622` changed two files: `engine/registry.ts` (the native
Stockfish display name from "Stockfish 18 (native)" to "Stockfish 19
(native)", matching what the install catalogue has been downloading
since Phase 51; the registry note also records that the browser
engine stays at Stockfish 18 because no public WebAssembly build of
sf_19 has been cut) and `features/recent/RecentWorkspace.tsx` (a
`gameMeta` helper that puts the imported-time on the Games row, in
the same shape the other rows already carried).

`a3d9b61` rewrote `features/review/CriticalInbox.tsx`: the unreviewed
queue now orders by `createdAt` ascending (staleness, not creation
date), and every row older than seven days carries a small "Waiting
Nd" tag so a busy player can see at a glance which positions are
slipping. The `Date.now` call that powers the timer is now read from
state seeded by an effect on mount and ticked once a minute — same
pattern the Recent page uses — so a re-render within the same minute
sees the same age.

`abbb6e0` redid the command palette: the 74 px in-row uppercase group
label is gone, replaced by a section divider that appears once at the
top of every run of consecutive same-group items. The list is still
ranked globally; only the rendering changed.

`82667ca` and `c840fa5` added the "Recent form" tab to the
preparation dossier (last twenty games of the opponent on the chosen
colour, newest on the left, with the W/D/L tally underneath) and
raised the Recent N cap from 1,000 to 2,000 opponent games.

`de729c1` added the upgrade-path sentence to the Starter Reference
catalog entry, so a user reading the catalog row and deciding 18 MB
is too small sees the bigger packs in the same list.

`9d2e0e9` moved the staleness `Date.now` call into a `useEffect`
because the lint rule flagged it as an impure render-time call, and
reformatted `CHANGELOG.md` after Prettier's trailing-newline rule
caught it. `8f21637` is the CHANGELOG update that ties the branch
together.

The Mac-facing files in this branch: `engine/registry.ts` (display
name and note) and the chrome files already in the prior paragraph.
The public Mac 1.1.5 (build 1.1.5, commit named in
`src/release/macos-download.json`) is now behind `master` by nine
commits. A Mac release is due.

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

| Capability                                    |               Web               |    macOS    | Why the difference exists                                                                                                                                                 | Evidence                                                             |
| --------------------------------------------- | :-----------------------------: | :---------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Native engines (Stockfish, Lc0, …)            | ◐ via a companion the user runs | ✅ built in | A page cannot start a process; the shell starts and pairs its companion                                                                                                   | `desktop:engines -- --packaged`; smoke                               |
| Local SQLite collections                      |         ◐ via companion         | ✅ built in | as above                                                                                                                                                                  | smoke: companion paired; `database-chaos`                            |
| Local Syzygy tables                           |         ◐ via companion         | ✅ built in | Reading table files needs a filesystem                                                                                                                                    | `tbprobe-real.test.mjs`                                              |
| Open a collection or PGN by path, Open Recent |                ✗                |     ✅      | A page cannot turn a chosen file into a _path_                                                                                                                            | `files.test.mjs`, `menu.test.mjs`; smoke                             |
| Browse… beside a path field                   |          ◐ typed path           |     ✅      | A native picker returns a path                                                                                                                                            | `bridge-contract.test.ts`                                            |
| Double-click a `.pgn`, drop a file            |                ✗                |     ✅      | Document association belongs to an installed application                                                                                                                  | smoke: PGN opens                                                     |
| macOS menu bar, ⌘Q, full screen               |                ✗                |     ✅      | The window is the operating system's                                                                                                                                      | `desktop:menus`; `desktop:chrome`                                    |
| Check for Updates…                            |  ✗ (the web is always current)  |     ✅      | macOS's own update engine replaces the bundle; the dialog shows three highlights and links to the full notes                                                              | `desktop:update:real`; `desktop:update:dialog`; public 1.1.4 → 1.1.5 |
| Window buttons and the title-bar reservation  |                ✗                |     ✅      | macOS draws the buttons over the contents; the reservation is zero in a browser, and since 1.1.5 it is restated from the application so a client re-render cannot drop it | `desktop:chrome`; `window-chrome.spec.ts` (stubbed bridge)           |
| Sign in with Lichess in a window of its own   |    n/a — the page navigates     |     ✅      | The shell refuses to navigate its window; the sign-in gets a child window that returns the callback to the main window (`oauth-window.mjs`)                               | `oauth-window.test.mjs`; the manual sign-in in the Phase 51 handover |

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
