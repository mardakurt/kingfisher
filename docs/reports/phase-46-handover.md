# Phase 46 — Handover

Adversarial desktop QA, distribution integrity, packaged-app automation,
fault injection, soak testing, public DMG truth, documentation accuracy.
Worked directly on `master`, 2026-09-12, on the maintainer's Mac
(macOS 26.6.2, Apple silicon, one built-in Liquid Retina XDR display,
Electron 44.2.0, Node 24.14.0). Every number below comes from a command
that was run; the transcript of each is in the scratch logs named in
§4–§6, and the commands are in the repository so anyone can run them again.

The thirty-eight sections the brief asks for, in order.

## 1. Executive verdict

**Phase complete: yes.**
**Desktop certified: yes — `npm run desktop:certify` is green against the
packaged build the public is offered.**
**Landing DMG current: {{LANDING_CURRENT}}** — the landing's
_Download for macOS_ points at `{{FILENAME}}` (build {{BUILD}}, commit
`{{COMMIT}}`), published as a GitHub pre-release under its own immutable
tag and verified byte for byte from the public URL.
**Version: 1.0.0.** No bump. The preview channel carries a build number
instead.
**Critical: 0 open** (one found and fixed — BUG-46-01, the packaged
application contained no application).
**High: 0 open** (five found and fixed).

The phase started from a state that two handovers had described as a
healthy packaged application. It was not: every packaged build from Phase
35 to Phase 45 launched, logged "This build is incomplete", showed an
error box and exited. What was reported as a Playwright harness limitation
(BUG-45-04) was the application saying exactly what was wrong in a log
nobody read. That, and the fourteen product, distribution and
documentation defects behind it, are in
[`phase-46-findings.md`](phase-46-findings.md).

## 2. Git

- Starting HEAD: `b77d3a2` (Phase 45, committed locally, **never pushed**;
  `origin/master` was `0a64938`).
- Final HEAD: `{{FINAL_HEAD}}`.
- `origin/master`: `{{ORIGIN_HEAD}}` — pushed.
- Working tree at handover: clean.
- Commits this phase: {{COMMIT_COUNT}}, each describing work that was done.

## 3. Packaged harness

**BUG-45-04 root cause:** not a harness mismatch. The Phase 35 rewrite of
`desktop/electron-builder.yml` (`71ef535`) dropped the `extraResources`
block that stages the web server, the companion, the engine catalogue and
the tablebase helper under `Resources/kingfisher/`. The bundle had a shell
and nothing to serve; `main.mjs` detected that, logged it, showed an error
box and called `app.exit(1)`. Playwright's `firstWindow` waited on a
process that had already exited. Playwright 1.62 and Electron 44.2.0 drive
the packaged application without any difficulty once it contains one.

**Final mechanism:** unchanged in kind — Playwright's `_electron.launch`
against the packaged executable with `--user-data-dir` — through one shared
launcher, `scripts/desktop-lib/launch.mjs`, which races the first window
against the process exiting and prints the shell's own log when the
process wins. No CDP harness was needed; no product behaviour was changed
to suit the harness.

**Security isolation:** no test-mode switch was added to the product.
`scripts/desktop-instances.mjs` launches the packaged application through
`open(1)` and checks that every listening socket is loopback and that no
process carries an inspector or remote-debugging switch. Playwright's
own launches pass `--inspect=0 --remote-debugging-pipe`, which is Node's
standard inspector on a process the harness owns; a user's launch has
neither.

**Packaged coverage:** startup, window, bridge, isolation, companion
pairing, PGN by argv and by `open-file`, tablebase probe, quit
(`desktop:smoke`); window chrome (`desktop:chrome`); restart
(`desktop:restart`); six native engines (`desktop:engines`); suspend
(`desktop:suspend`); a seeded walk and a fault walk (`desktop:walk`); the
DMG (`verify-dmg.mjs`); OS launch, single instance, documents from the
system, AppleScript quit (`desktop:instances`); every menu item
(`desktop:menus`); the bridge under garbage (`desktop:ipc-fuzz`); native
engines under abuse (`desktop:engine-chaos`); the update dialog (probed
live); upgrade from the real public 1.0.0 (`desktop:upgrade`);
`desktop:certify` runs the gate in one command. Update staging remains
`desktop:update:e2e` / `desktop:update:mutations` against a staging feed.

## 4. Agentic QA

`npm run desktop:walk -- --packaged --seed=N --actions=N`: a seeded
hostile-but-legitimate user with invariants checked after every action
(legal FEN, arrows legal in the position, no "Save failed", one window and
one instance, no orphan engine, no renderer/helper loss, nothing uncaught
in the main process, something on the page).

| Run                                    | Build            | Actions | Duration       | Findings            | Console errors | Quit                       |
| -------------------------------------- | ---------------- | ------- | -------------- | ------------------- | -------------- | -------------------------- |
| seed 46, fresh user                    | 437              | 1000    | 515 s          | 0                   | 0              | 5 descendants, 0 survivors |
| seed 46, fresh user (certify, 200)     | 445              | 200     | 135 s          | 0                   | 0              | clean                      |
| seed 7, faults (offline, companion ×4) | 437              | 300     | 142 s          | 0                   | 0 (offline)    | 5 descendants, 0 survivors |
| seed 7, faults (+ web server ×3)       | {{FAULTS_BUILD}} | 300     | {{FAULTS_S}} s | {{FAULTS_FINDINGS}} | —              | {{FAULTS_QUIT}}            |
| seed 46, returning user (upgrade path) | 445              | —       | —              | 7/7                 | —              | —                          |

Action mix of the 1000-action run: 184 route changes, 135 moves, 69 engine
starts, 74 Settings opens, 85 palette uses, 65 resizes, 25 full-screen
toggles, 19 minimise/restore, 27 hide/show, 18 close-and-Dock-reopen, 60
PGNs opened the Finder way, 13 bad PGNs, 50 Copy FEN (every one a six-field
FEN equal to the one shown), 17 update-dialog checks, 45 undo, 40 redo, 25
flips, 20 notes, 9 invalid FENs.

Issues found by the walk: BUG-46-06 (board unplayable under an arrow),
BUG-46-03/04 (update dialog), BUG-46-10 (dead companion said running),
BUG-46-11 (resize-then-close exception), and the observation that the shell
did not revive its own services (fixed; see §7). Earlier runs of the same
seeds against builds 426–434 are in the scratch logs and show those
defects before their fixes; the walk's own precondition and modal-handling
defects were fixed as they were met and are HARN-46-04.

## 5. Soak

`npm run desktop:soak` = `desktop:walk --packaged --duration=30m`, idling
0.4–3 s between actions and letting an engine run for eight seconds once a
minute, sampling every process's memory every 25 actions.

- Build {{SOAK_BUILD}}, seed 2026, **{{SOAK_MINUTES}} minutes of real
  packaged execution**, {{SOAK_ACTIONS}} actions.
- Main process RSS: {{SOAK_MAIN}} MB. Renderer RSS: {{SOAK_RENDERER}} MB
  (oscillating with garbage collection; no monotonic trend). Processes:
  4 throughout (main, GPU, renderer, network) plus the two forked services.
  Windows: 1. Engines: 0 leaked.
- Findings: {{SOAK_FINDINGS}}. Console errors: {{SOAK_CONSOLE}}. Quit:
  {{SOAK_QUIT}}.
- Disk: temporary directory and caches before/after in §29.
- A first 30-minute attempt against build 437 was ended at minute 15.7 by
  the author of this report, who ran `pkill -f next-server` to clear a
  leftover dev server and killed the soak's own web server. That run is
  recorded as a harness incident, not a soak, and it is what showed that
  the shell did not revive a dead web server (now it does).
- `--duration=2h` and `--duration=8h` are available for the owner's own
  overnight run; they were not run in this session.

## 6. Engine chaos

`npm run desktop:engine-chaos` against build 445, through the companion the
packaged shell started: 18/18.

- **Kill:** SIGTERM and SIGKILL of a searching Stockfish 19 — the session
  stream reports the death (`#exit`), no process reparented to launchd, a
  fresh session answers (`a1b2` in KRvK).
- **Hang:** not injectable into a real binary; the stop-acknowledgement
  timeout and "a process that fails to acknowledge a stop is failed, not
  reused" contract is `src/engine/uci-adversarial.test.ts` and
  `companion/src/engine-sandbox.test.mjs`.
- **Malformed UCI:** `uci-adversarial.test.ts` — six illegal `bestmove`
  shapes dropped (a1h8, the other side's move, castling through a piece, a
  promotion suffix on a push, `0000`), 2,000 seeded UCI-shaped noise lines
  and a 100 KB line never throw; an illegal move is never drawn
  (`engine-arrows.test.ts`).
- **100-cycle storm:** 100 start/search/stop cycles, 0 leaked processes,
  100/100 answered (a run on a loaded machine earlier answered 99/100;
  the miss was an answer within the harness's 15 s window, not a leak).
- **Two engines:** Stockfish 19 and Stormphrax 8.0.0, twelve rapid position
  switches, every `bestmove` legal in the position its search was for;
  engine 1 restarts while engine 2 runs; both gone after both stops.

## 7. Companion chaos

- **Kill/restart:** `desktop:walk --faults` SIGKILLs the companion; the
  shell detects the exit (`Service.running` was wrong — BUG-46-10) and now
  revives it on the same port and token, bounded to three revivals in five
  minutes; _Diagnostics → Restart companion_ exists for the bounded-out
  case. The web server gets the same treatment, with a window reload.
- **Port collision:** `desktop/src/origin.test.mjs` covers the profile
  port; the companion takes an ephemeral port each launch, so nothing is
  recorded that could collide. Not re-run live this phase.
- **Auth:** `companion/src/server-fuzz.test.mjs` — eight token shapes;
  the one that killed the process (BUG-46-08) is fixed; 200 seeded random
  requests, no 5xx, no exit.

## 8. Database chaos

`companion/src/database-chaos.test.mjs` against the real companion: a
collection renamed away, deleted, and `chmod 000` under a running process.
Reads keep answering through SQLite's open handle (honest: the data is
still there); the process stays up; a bystander collection is unaffected;
the file put back answers again with no restart. A **write** into a
deleted collection used to report `{ imported: 1 }` into an inode with no
path — fixed: import, delete-games, clear and apply-classification now
refuse with a sentence naming the file.

## 9. Persistence chaos

- Write failure, mid-write rejection, flush with pending writes:
  `src/persistence/write-tracker.test.ts` (existing, re-run).
- Renderer termination and app kill: `desktop:restart` and the walk's
  close-and-reopen; the save barrier's fail-closed contract in
  `save-barrier.test.mjs`. A quota/ENOSPC injection into IndexedDB inside
  the packaged renderer was not built this phase; the write tracker's
  rejected-write path is the same code and is covered.
- No false "Saved": the walk asserts `[data-study-save-status="failed"]`
  never appears; it never did.

## 10. Backup chaos

`src/persistence/backup-chaos.test.ts`: a valid backup mutated 77 ways
(truncation, byte flips, wrong version/format, wrong shapes in every store,
duplicate ids, unknown objects, a 50,000-record store, empty, not JSON,
null, array), restored in both modes into a profile with authored work:
154 restores, 136 rejected with the profile byte-identical, 18 absorbed
with only valid records. A restore mutated to clear before validating fails
the suite; the real one does not.

## 11. File / PGN chaos

The walk opens the corpus (`scripts/desktop-lib/pgn-corpus.mjs`: a famous
game, special moves, a set-up position with clocks, nested variations, a
400-game file, a 200-move game) the way the Finder does, plus a missing
file, a malformed file and an empty file: 60 good and 13 bad opens in 1000
actions; a missing file is a native error box (asserted), never an
exception. A file over 256 MB is refused with a sentence
(`files.test.mjs`). Permission-denied and removed-between-selection-and-
read take the same `readPgn` rejection path.

## 12. Windowing

- **Single instance:** `desktop:instances` 12/12 — a second `open -a` and a
  direct executable launch both refused, the first told (logged), one
  main process per profile.
- **Full screen / resize / minimise / hide / close / Dock reopen:** the
  walk (25/65/19/27/18 times in 1000 actions), `desktop:chrome` 107/107,
  and the frame is saved on close (BUG-46-11 fixed).
- **Finder / LaunchServices:** `open -a Kingfisher file.pgn` while running
  arrives as `open-file`; six PGNs in two rapid bursts all arrive; a PGN on
  a cold launch arrives via argv. A cold-launch `open-file` event on the
  real profile was not exercised — the harness never touches the real
  profile.

## 13. Multi-display

**LIVE MULTI-DISPLAY BLOCKED BY HARDWARE.** One built-in display was
attached (`system_profiler`: Liquid Retina XDR 3456×2234, main). The
synthetic off-display clamp tests in `window-bounds.test.mjs` were run and
pass; no live move-between-displays, disconnect or relaunch certification
is claimed.

## 14. High-DPI / 5K

Every packaged run rendered on the built-in 3456×2234 Retina display. No
external 5K display was attached; no live 5K row is claimed. Structural
Retina assets (`background@2x.png`, the icns) were verified in the DMG.

## 15. Sleep / wake

`desktop:suspend -- --packaged` 12/12 (every process stopped for 20 s and
resumed; work intact; services answer). A real `pmset sleepnow` was not
run: it would have ended this session's own automation. Not claimed.

## 16. Menu / shortcut

`desktop:menus` 45/45 against build 445: every enabled item pressed with an
expected, observed effect (choosers requested, dialogs opened, URLs handed
to the browser, the update window, zoom, reload, hide); the macOS window
roles asserted as declared with their standard accelerators (AppKit
performs them; `desktop:walk` exercises the behaviours through the window
API); the renderer-handled keys (`⌘K`, `⌘,`) pressed. Found and fixed:
"About/Hide/Quit kingfisher-desktop" (package name, not product name) in
every packaged build; Developer Tools offered in the packaged View menu
against the documentation.

## 17. Accessibility

Packaged: the walk's keyboard actions, `Escape` closing Settings and the
palette every time (74 and 85 times), the e2e accessibility suite in the
browser. A macOS accessibility-tree walk of the packaged window was not
performed; the Finder DMG window's tree was inspected in passing (three
window buttons, fourteen elements). No functional defect found; no new
skipped test.

## 18. Public DMG audit

**Before this phase:**

- Landing href: `publicUrl.macosDmg` →
  `https://github.com/mardakurt/kingfisher/releases/latest/download/Kingfisher-1.0.0-arm64.dmg`
- Resolved: `…/releases/download/v1.0.0/Kingfisher-1.0.0-arm64.dmg` →
  `release-assets.githubusercontent.com/…`, HTTP 200,
  `application/octet-stream`, `Content-Length: 157723500`,
  `cache-control: no-cache` on the redirects.
- SHA-256 `f7b50af58bfc123691ec58eaf3d00ff4e6d028d773eb24d3b8701436b0bf9fd0`.
- Release `v1.0.0` (2026-09-09), manifest: commit `509eb943`, **dirty
  tree**, Node v26.8.1 build host.
- Embedded: `CFBundleShortVersionString 1.0.0`, `CFBundleVersion 1.0.0`,
  bundle id `dev.kingfisher.app`, `LSMinimumSystemVersion 11.0`, `arm64`,
  `Apple Development: Metin Arda KURT (YBWWSJYPD6)`, Hardened Runtime, no
  build SHA embedded, five Finder-duplicate files inside.
- Versus master: 104 commits, ~32,000 changed lines behind.

**After this phase:**

- Landing href: `{{URL}}`
- Filename `{{FILENAME}}`, {{BYTES}} bytes, SHA-256 `{{SHA}}`.
- Release `{{TAG}}` (pre-release), commit `{{COMMIT}}`, build {{BUILD}},
  `app.kingfisher.chess`, `CFBundleVersion {{BUILD}}`, `arm64`, Apple
  Development identity, not notarised.

**Is the landing current? {{LANDING_CURRENT}}.** It offers the build made
from `{{COMMIT}}`; the commits after it on master are harness and
documentation only ({{COMMITS_AFTER}}).

## 19. Distribution decision

**Preview channel.** No `Developer ID Application` certificate exists, so
no stable release could be made honestly. The preview keeps version 1.0.0
and carries a build number and commit; it is a GitHub pre-release under
`macos-preview-{{BUILD}}`, invisible to `/releases/latest` and to the
stable updater feed; no existing asset's bytes were touched (v1.0.0 is as
it was, hash unchanged). The landing labels it _Preview · not notarised_.

## 20. Public artifact re-download

`npm run desktop:public:verify -- --landing --full`: {{PUBLIC_VERIFY}}.

## 21. Update compatibility

`desktop:upgrade` with the **real public 1.0.0 DMG** (downloaded from
GitHub, `f7b50af5…`) as the previous build and build 445 as the current:
7/7 — a study, a preference (board theme) and reference-pack metadata
authored in 1.0.0 are read by the current build, from the same
`kingfisher-desktop` directory, and a board still opens. The public 1.0.0
cannot auto-update (it predates the updater; and a differently-signed
update would be refused by macOS) — replacing the application by hand is
the documented path and it keeps the work.

## 22. Certificate reality

`security find-identity -v -p codesigning` at phase start and end:
`Apple Development: Metin Arda KURT (YBWWSJYPD6)` and
`Apple Distribution: Metin Arda KURT (3B5CYF9DQ4)`. **No Developer ID
Application.**

## 23. Signing / notarisation

The preview is signed with the Apple Development identity, Hardened
Runtime on, seven entitlements, `codesign --verify --deep --strict` valid;
`xcrun stapler validate` finds no ticket (asserted by `public:verify
--full` to match the descriptor's `notarized: false`). Gatekeeper on
another machine refuses it; the install guide says so and how to proceed.

## 24. Landing

Download link: the descriptor's immutable asset URL. Install guide:
`/install`, rendered from the same descriptor (filename, size, build,
commit, SHA-256, trust state). Labels: "Preview", "Apple Silicon · Preview
· not notarised", "arm64 (Apple Silicon)", "macOS 11 (Big Sur)".
`npm run deploy:status`: {{DEPLOY_STATUS}}.

## 25. Documentation audit

180 Markdown files tracked. Classified in `docs/README.md`: current (26),
operations (15), records (60: 53 ADRs and 7 investigations, plus the
performance and benchmark directories), historical (34 phase reports and
findings registers, 9 phase product audits, 5 RC notes, the marketing
backup). Every file is listed; every internal link in the index resolves.
Broken links found: 1 (`data/openings/README.md` → `SOURCE.md`), fixed.
Stale claims found and fixed: 8 (§26). Personal paths found: 2 (the Phase
43 handover and the Phase 45 findings quoting it), redacted;
`security:scan` reports 0. `docs:check` grew from 203 to 297 checks.

## 26. Canonical docs

- **README** — download points at the landing; desktop table rebuilt from
  runs; profile directory corrected; Windows/Linux/Intel "not built".
- **SECURITY** — the macOS section describes the preview as it is; the
  trusted release is a runbook; updates described as implemented
  (electron-updater, channels); companion token never on disk; engine
  answers checked.
- **ARCHITECTURE** — what a packaged bundle is, build identity, the
  update service, the descriptor.
- **AGENTS / CLAUDE** — the update service as built, build identity and
  channels, the packaged gate, zero-skip; "launch the bundle before
  believing anything about it".
- **Install** — rewritten from the descriptor.
- **Release** — `macos-trusted-release.md` marked as a runbook for a build
  that does not exist, with the two builds that cannot auto-update;
  `release-manifest.md` status note; `deployment.md` preview channel and
  a corrected stable procedure.
- **Deployment** — as above.
- **Privacy** — unchanged; probed the feedback sink (`503 unconfigured`)
  and recorded it in the feedback runbook.
- **Data** — inventory reconciled against the four live manifests; one
  three-game discrepancy stated rather than explained away.
- **Desktop certification** — rebuilt from runs.

## 27. Doc invariants

`docs:check` new checks: descriptor shape, immutable URL, filename matches
channel, no phase number in the name, trust-state consistency,
`public-urls.ts` and the landing and install page derive from the
descriptor, every prose DMG name equals the descriptor's, the install guide
carries the SHA-256, "not notarised" stated wherever the descriptor says
so, no personal absolute path in any canonical document, the profile
directory named correctly in nine files. 297/297 at handover.

## 28. Performance

Packaged, build 445 (`desktop:smoke`): window in about 3 s from
`electron.launch` to DOM ready; `desktop:certify` step times: smoke 16 s,
chrome 17 s, restart 12 s, engines 110 s, suspend 37 s, 200-action walk
135 s, DMG 6 s, unit suite 25 s. Phase 45 recorded "ready in 3.0 s" for
the dev shell and could not measure the packaged one. No regression
identified; the 1000-action walk ran at 1.9 actions/s on 437 and 445.

## 29. Disk / temp

{{DISK}}

## 30. Security

- Test mode: none added; no debugging port in a normal launch
  (`desktop:instances`).
- IPC: `desktop:ipc-fuzz` 207 wrong-shaped calls, 0 exceptions; chooser
  options sanitised; dialog IPC sender-checked.
- Companion: token byte-length fix; body limit enforced by destroying the
  socket; fuzzed.
- Updates: dialog wired; engine loads; feed baked; preview never asks;
  stable ignores pre-releases and downgrades; failure text bounded and
  redacted.
- Files: unchanged boundary; chooser titles/extensions validated.
- `npm run security:scan`: 0 findings. `npm audit --omit=dev
--audit-level=high`: 0 vulnerabilities.

## 31. Privacy

No telemetry, no crash upload, no session replay added or found. The walk,
soak and chaos harnesses write only to the system temporary directory and
to profiles they create; the shell log stays under the profile. A probe of
the production feedback route sent one deliberately-labelled test message,
which the route refused (`unconfigured`).

## 32. Tests

At handover, `npm test`: **{{TEST_FILES}} files, {{TEST_COUNT}} tests, 0
skipped, 0 failing.** `npm run test:no-skips`: OK. Phase start: 219 files,
2719 tests (the Phase 45 handover's "218 / 2694" was its own starting
point, stated as such; its "219 / 2719" was correct).

`npm run test:e2e` (Playwright, `retries = 0`): **263 passed, 0
failed, 0 skipped** at `0e318fb`. It was **28 failed of 263** at the
Phase 45 handover commit — see HARN-46-05 — a number three handovers had
reported as green without running it.

## 33. Bugs found

See [`phase-46-findings.md`](phase-46-findings.md): 14 PRODUCT (1
Critical, 5 High, 4 Medium, 4 Low), 5 DISTRIBUTION (1 High, 1 Medium, 3
Low), 8 DOCUMENTATION (1 High), 5 HARNESS, 4 QUALITY. Every one fixed
except the recorded-only items (DIST-46-02/03/05, Q-46-03).

## 34. Real user feedback

None received during the phase. The production feedback route is not
configured to file issues (`503 unconfigured`, probed); nothing has been
fabricated.

## 35. Version policy

**1.0.0.** No tag, no bump. The preview channel exists precisely so that
freshness never costs a version.

## 36. Desktop verdict

**DESKTOP ADVERSARIAL CERTIFIED — PUBLIC PREVIEW CURRENT.**

## 37. Next development mode

**USER-FEEDBACK MODE.** The packaged application has now actually been
run, abused, and published; the next things worth knowing are what real
users hit.

## 38. Next priorities

1. **Obtain the `Developer ID Application` certificate**
   (`docs/release/apple-developer-id-setup.md`) — the single external
   blocker between the preview and a trusted 1.1.0.
2. **Configure the feedback sink** (`KINGFISHER_FEEDBACK_REPOSITORY`,
   `KINGFISHER_FEEDBACK_TOKEN` on the Studio deployment) so in-app feedback
   reaches an issue tracker; today it is copy-or-GitHub only.
3. **Run the overnight soak** (`npm run desktop:soak -- --duration=8h`) on
   the owner's machine; this session ran 30 minutes.
4. **A second display and a real sleep/wake** — the two rows the matrix
   still marks BLOCKED / LIMITED, both hardware-bound.
5. **Decide whether the engine should follow the board** (Q-46-03): by the
   position guard's contract a move stops the engine; a first-time user
   may expect otherwise. A product decision, not a bug.
