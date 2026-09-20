# Platform parity — the web application and the macOS application

Kingfisher runs in a browser and as a Mac application, and they are the
same application architecture: `desktop/` packages a Next.js build from this
repository, and the whole surface between shell and page is one preload
file plus `src/desktop/bridge.ts`, which returns `null` in a browser.
This document is the Phase 49 check on that claim, feature by feature,
with the deliberate differences named and the reason for each.

**Browser verification follow-up (2026-09-16).** Phase 58–60 application
changes are shared with macOS, even though they do not edit `desktop/src/`.
The public Mac 1.1.9 (build 590, `d46fe98`) embeds an older Next.js build;
it does not receive website deployments. The prior statements that these
changes were not Mac-facing because the Electron shell was untouched were
incorrect. Desktop release and certification remain pending; this browser
validation pass does not certify or publish a new Mac package.

The pending shared-source changes include Phase 56–57 UI enhancements,
Phase 58 tour, backup navigation, username validation and panel shortcuts,
Phase 59 evaluation formatting and endgame settings navigation, and Phase 60
manual backup independence and the assistant duplicate-submit guard.
This follow-up also fixes tour preference hydration, mixed-case account
validation, scheduled backup preference serialization, and an incorrect
native-companion prerequisite on the AI assistant panel. The engine toolbar
also wraps controls to keep the engine selector readable in a narrow panel.

**Published revision check (Phase 73 follow-up, Mac-facing — released as
1.2.5 below).** After 1.2.4 shipped, three owner reports changed application
code the Mac shell renders, and each is something a Mac user sees: Settings
→ Engines drew Berserk, Koivisto and Obsidian — projects that publish no
macOS build — as catalogue rows with a switch turned on, above the note
saying they are not offered here (1.2.4 carries that; the rows are now the
engines the machine can install or has installed and the note names the
rest); the best-move arrow drew a tooltip on the board when the pointer
crossed it (removed; the move, score and depth stay in the engine panel);
and Settings → Engine → Analysis settings gains threads, hash, the search
limit, line length, follow-the-board and variation arrows as controls with
a runtime assertion each. Nothing under `desktop/` changed. Section B of
`docs/operations/after-a-fix.md` was then run in full; the result is the
1.2.5 entry.

**Published revision check (2026-09-20, 1.2.4).** The public Mac 1.2.4
(build 698, `7bfdb67`) is built from the `v1.2.4` tag's revision, the
revision `kingfisherchess.app` served when it was built (`deploy:status`
at that commit: up to date). It carries the Phase 73 audit's fixes and the
five additions to the desktop: the canonical form of a pasted FEN, the
engine-switch race, the "⋯" header fold, PGN from the current move, the
score-by-depth strip, "Known position?" in Set up and "Train these gaps".
The real update 1.2.3 → 1.2.4 was performed through Sparkle's own window
against the public feed (19 checks, PASS); the packaged smoke passed
17/17. Web-only by design and unchanged for the desktop: the `middleware`
→ `proxy` rename (the shell serves `/analysis` directly), the feedback
route's header encoding (the Mac application posts to the same route on
the public origin) and the CSP wording. Nothing under `desktop/` changed
between 1.2.3 and 1.2.4. The Mac is not behind `master` at this commit;
the record below is the history of how it got here.

**Published revision check (Phase 73 audit, Mac-facing — released as
1.2.4 above).** The whole-codebase audit after 1.2.3 changed application code
the Mac shell renders, so the public Mac 1.2.3 (build 679, `9a6265b`) is
behind `master` on: the canonical form of a pasted or imported FEN (the
en passant field, so a `[FEN]` game, a Set up position and an `?fen=` link
share one identity with the played position in the explorer, the
repertoire and the "in your work" counts); a FEN describing nine squares
on a rank refused; arrows on the starting position kept through a PGN
export; an engine switched during a slow start no longer running the first
engine under the second one's name (Lc0 → Stockfish 19 inside the Mac
application is exactly that case); `setoption` sent only for options the
engine declared; the Lichess "Min Elo" band; the explorer's "also reached
by" move orders; counts of one pluralised; the Repertoire and Training
header titles at 1280–1440 px; the Databases facts grid; and the message a
tab shows when another tab upgraded the local database. Web-only by
design: the `middleware` → `proxy` rename (the shell serves `/analysis`
directly and never routes by host), the feedback route's header encoding
(the Mac application posts to the same route on the public origin), and
the CSP wording. Section B of `docs/operations/after-a-fix.md` was then
run in full; the result is the 1.2.4 entry above.

**Published revision check (2026-09-20, 1.2.3).** The public Mac 1.2.3
(build 679, `9a6265b`) is built from the `v1.2.3` tag's revision, the
revision `kingfisherchess.app` served when it was built. It carries the
three follow-up fixes below; the More menu was driven on the signed
bundle itself (15 of 15 items reachable, the last one selectable), the
real update 1.2.2 → 1.2.3 was performed through Sparkle's own window
against the public feed (19 checks, PASS), and the Windows-only engines
are not offered inside the application at all (its built-in companion
reports the platform). The Mac is not behind `master` at this commit.

**Published revision check (Phase 72 follow-up, Mac-facing — released as
1.2.3 above).** After 1.2.2 shipped, three owner reports changed
application code the Mac shell renders: the dock's More menu was clipped
to one item by the one-row strip (1.2.2 carries that regression — in the
Mac application, choosing a folded tool means pinning everything before
it until 1.2.3); the engine selector's platform notes are now decided by
one tested rule from the browser's OS and where the page is served
(inside the Mac application the wording is unchanged: "needs the
companion" / "Windows only"); and Settings → Workspace gains the "skip
the landing page" switch, which the Mac application hides because it
never loads the landing. Web-facing in substance, but the More-menu fix
matters to a Mac user, so the difference was recorded and 1.2.3 followed
the same day.

**Published revision check (2026-09-20, 1.2.2).** The public Mac 1.2.2
(build 673, `96f1822`) is built from the `v1.2.2` tag's revision, which
is the revision `kingfisherchess.app` served when it was built
(`deploy:status` at that commit: up to date). It carries every Phase 72
change to the desktop, including the one the owner reported for both
the web and the Mac: a launch opens on the initial position, with the
last work one click away on Recent. The real update 1.2.1 → 1.2.2 was
performed through Sparkle's own window against the public feed (19
checks, PASS), and the packaged bundle was driven through three
launches to prove the launch rule. The Mac is not behind `master` at
this commit; the record below is the history of how it got here.

**Published revision check (Phase 72, Mac-facing — released as 1.2.2
above).** Phase 72 changed application code the Mac shell renders, so
the public Mac 1.2.1 (build 667, `359193c`) was behind `master` on: the evaluation
bar's result for a finished game and its steadiness between moves, the
engine panel's terminal-position and warming states, the board flip
(snap and fade instead of a rotation), the one-row tool tab strip, the
tour's icons, the command palette's page and settings commands, the
"You played White/Black" pill on synced games, account-sync progress and
Cancel, the Databases page's source descriptions, and the Companion
panel's desktop wording ("the companion is built in"). Web-only by
design and unchanged for the desktop: the landing's pre-paint Studio
redirect, the remote full-network Stockfish (the desktop's manifest
lists no full build), the Vercel retention policy, and the Sparkle
release-notes summary (which is how the _next_ release's feed is
generated, not a change to the running application). Section B of
`docs/operations/after-a-fix.md` was then run in full; the result is the
1.2.2 entry above.

**Published revision check (2026-09-19, 1.2.1).** The public Mac 1.2.1
(build 667, `359193c`) is built from the `v1.2.1` tag's revision, which is
the revision `kingfisherchess.app` served when it was built
(`deploy:status` at that commit: up to date). It carries everything the
web had shipped since 1.2.0: the knight Training icon, the tour mounted
again and opened from Settings → Help only (with `tourShowOnLaunch`
retired by a version-6 preferences migration, which `desktop:upgrade`
showed a real 1.2.0 profile surviving), the status bar's backup reminder
reading `autoBackupReminderDays`, and Phase 70's auto-backup reference
sources. Web-only by design and unchanged for the desktop: the landing,
its captures, the favicon set and the `/studio` alias — the shell opens
on `/analysis` and never loads the landing, and `AppShell`'s
`kingfisher.studio.visited` marker is inert there. Nothing under
`desktop/src/` changed between 1.2.0 and 1.2.1. The Mac is not behind
`master` at this commit; the record below is the history of how it got
here.

**Published revision check (Phase 71, Mac-facing — released as 1.2.1
above).** Phase 71 changed application code the Mac shell renders: the
Training icon (`src/components/icons.tsx`, `Recall`) is redrawn, and
`AppShell` writes the `kingfisher.studio.visited` marker on mount (inert
on the desktop — the shell never loads the landing). Everything else in
the phase is web-only: the landing page (`src/app/landing/`), its
captures, the `/studio` redirect in `next.config.ts` and the favicon set
in `src/app/`. Nothing touches `desktop/src/` or the Electron shell. The
public Mac 1.2.0 (build 651) showed the previous Training icon until
1.2.1, which is Section B of After-a-fix run in full on 2026-09-19
(`docs/reports/phase-71-handover.md`).

**Published revision check (Phase 70, web only).** Phase 70 changed four
src/ files plus the diagnostic script and `.gitignore`: `runAutoBackup`
and `ensureBackup` now accept and forward `referenceSources`, and the
two callers — the on-launch `useAutoBackup` hook and the manual
"Back up now" handler in `SettingsDialog` — pass
`installedReferenceSources()`. The manual export download already
captured this; the three other backup paths (scheduled cycle, on-launch
check, manual "Back up now") now capture it too. None of the changes
touch `desktop/src/` or the Electron shell, so the public Mac 1.2.0
stays on the previous surface until the next Mac release. Section B
of After-a-fix is therefore not required for this fix.

**Published revision check (Phase 64, mac only).** Phase 64 changed one
declaration in `src/app/globals.css` plus the e2e test that asserts the
fullscreen inset. The fullscreen padding for the sidebar brand was 8 px
(0.5rem), which the owner reported back as glued to the window corner;
macOS moves the traffic lights into the menu bar in full screen so
nothing needs clearing at the window edge, but the brand still wants the
design inset (14 px / 0.875rem) so the mark sits where it does on the
web. Outside full screen the reservation is still `max(0.875rem,
var(--titlebar-safe-w))` = 84 px on a Mac shell, so the mark still
clears the window buttons in a windowed session. The packaged chrome
harness catches regressions where the cascade reintroduces the
windowed-session inset; the test now asserts `markX = 14` in full
screen and `markX = 84` on returning. This is a Mac-desktop-only
behaviour change; the web version always read from the 14 px design
inset and is unaffected. Recorded so the next Mac release notes can
point to it.

**Published revision check (Phase 63, web only).** Phase 63 changed
six src/ files plus `CHANGELOG.md` and `docs/product/platform-parity.md`.
The web-only changes are: backup export downloads reliably (anchor
attached to DOM, microtask-deferred URL revoke, KB in success toast);
the database diagnostics row in Settings shows a status badge so the
Test button's work is visible; the companion setup prose and the
empty-state on Engines list every companion engine by name and link
to the install guide; the palette preview is larger and explains what
the colourblind variant actually changes; opening a Lichess or
Chess.com game flips the board to the viewer's side and the
workspace title strip says "Playing as White" / "Playing as Black";
clicking the title in an untitled analysis turns it into an inline
rename input. None of the changes touch `desktop/src/` or the
Electron shell, so the public Mac 1.1.9 stays on the previous Phase 55
surface until the next Mac release. Section B of After-a-fix is
therefore not required for this fix.

**Published revision check (Phase 62, web only).** Phase 62 changed
seven src/ files plus the documentation tree: the tour is openable
from Settings (not on launch) and its first step shows the correct
icon; the Analyse button is in a toolbar above the board; the pawn
and knight icons are redrawn; the Kingfisher mark / wordmark link
to /analysis; the dock's "More" sits next to the tabs; the
evaluation graph toggle has an empty-state strip; the move-list NAG
glyphs have tooltips; and a planner idea is captured in
`docs/product/planner.md`. None of the changes touch `desktop/src/`
or the Electron shell, so the public Mac 1.1.9 stays on the previous
Phase 55 surface until the next Mac release. Section B of After-a-fix
is therefore not required for this fix.

**Published revision check (Phase 61, web only).** Phase 61
removed the first-run tour and the sidebar "What should we call you?"
/ "Welcome back, X" greeting. Three src/ files changed: the tour is
no longer mounted in AppShell, ProfileGreeting is no longer mounted
in Sidebar, and the "Replay the first-run tour" link in Settings has
been removed. The `tourShowOnLaunch` and `displayName` preferences
stay in storage so existing users keep their values; the tour /
prompt machinery is left on disk as dead code that does not run.
None of the changes touch `desktop/src/` or the Electron shell, so
the public Mac 1.1.9 stays on the previous Phase 55 surface until
the next Mac release. Section B of After-a-fix is therefore not
required for this fix.

**Published revision check (Phase 55, web only).** Phase 55 changed
twelve files in `src/` and one in `src/app/globals.css`. None of them
touches `desktop/src/` or the Electron shell — every change is web
surface area that the packaged Mac picks up at build time. The public
Mac 1.1.9 is now behind `master`. The next Mac release will catch up;
until then, the Mac user is the user who waits. Section B of After-a-fix
will run when that release is cut.

**Published revision check (2026-09-15, 1.1.9).** The public Mac 1.1.9
DMG is built from the `v1.1.9` tag's revision — its build number and
commit are in `src/release/macos-download.json` — which is the revision
the web deployment served when it was built. 1.1.9 changes the shell
only: a launch with an explicit `--user-data-dir` leaves the update's
relaunch handoff alone (`desktop/src/relaunch-profile.mjs`). Nothing in
it reaches the web application; the paragraphs below still hold.

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
