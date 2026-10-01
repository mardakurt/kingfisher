# Research workspace release — 2026-10-01

## Scope and starting point

The user approved implementing Research readiness and preparing a real 1.4.0
release. Initial checkout: clean `master`, HEAD and `origin/master`
`1e3cc6a1421e2b9e1235f552e078007e3813f8e2`. Electron, the shared renderer,
domain/board architecture, engine/session identity, persistence, profile origin,
file-access boundaries and Sparkle are retained.

The user explicitly left the five-player study pending and authorized temporary
VoiceOver/input-source testing with restoration. Research remains opt-in;
existing layouts are preserved because no player observations justify a new
default yet. This is not a claim of complete ChessBase usability parity.

## Implementation and QA

- Analysis → Research readiness opens a shared, keyboard-trapped dialog.
- Engine facts come from the primary slot. A finite depth-eight search uses the
  selected provider/session and current position. It cannot replace a running
  search. Handshake-only, stale-position, empty-candidate and failed results
  never count as successful search evidence.
- Reference readiness uses `useExplorerSource`, the Explorer's query/cache and
  global rating/year filters. The population, offline/online status and declared
  licence stay visible. Authentication/network errors and valid zero-game
  answers are separate. Offline recovery changes the existing source preference
  only after an explicit action; populations are never merged.
- Save/conflict and backup states use existing stores. A saved draft is not
  described as a filed study. A failed backup cannot be presented as healthy,
  and the pending store read now says "Checking backups…" rather than claiming
  there is no backup. Local snapshots are distinguished from an exported copy.
- A reproduced modal-key defect let ArrowLeft on the readiness close button
  navigate the board behind the dialog. Modal descendants now share the typing
  guard for workspace shortcuts; Escape and dialog Tab trapping still work.
  The populated browser regression fails without the fix.
- WebKit's pointer activation did not focus the readiness button, so dismissal
  restored the previous board control instead of the invoking button. The
  trigger now explicitly takes focus before opening. The original WebKit
  regression failed at focus restoration; all 12 focused WebKit cases pass
  after the fix, with zero retries. Keyboard activation remains unchanged.
- Existing tokens, buttons and Dialog supply light/dark backgrounds, text,
  contrast, borders, radii, focus and pressed states. No asset or dependency was
  introduced. Both lockfile diffs change only the package version to 1.4.0.
- Browser plugin is not available in this session. Repository Playwright is
  the fallback. The tested flow is Analysis → readiness → actual selected-engine
  search, named reference answer/offline recovery, protection/settings actions,
  then return to the same move with restored keyboard focus.
- Three reproduced shortcut failures opened Settings, Save to study and the
  command palette over readiness, leaving two active modal dialogs. A shared
  handoff closes readiness or the command palette before the destination opens.
  Editing forms retain input and block a second modal; repeating Save to study preserves
  its unfinished title. Native File → Import and Kingfisher → Settings use the
  same handoff. Redundant input autofocus in Import and Save to study had
  displaced the invoker before the shared dialog captured it; it was removed.
  The command palette now restores focus and ignores composing Escape in its
  document listener as well as its input listener.
- A pre-release regression then reproduced title loss when Command-comma
  replaced an unfinished Save to study form. Dialog handoff is now opt-in for
  informational surfaces; it cannot silently dismiss editing forms. The
  failing-before-fix log is `tmp/session/readiness-form-preservation-can-fail.log`.

Final targeted browser checks: **30/30 in 57.3 seconds**, nine readiness cases
plus six header-width cases in each of Chrome and WebKit, zero retries. Log:
`tmp/session/readiness-browser-handoff-final.log`.
Light/dark 390×700 and a populated desktop were captured and
inspected. The initial desktop shot caught an entrance-animation frame; the
final shot waits for both dialog and overlay opacity to reach one. Header checks
cover phone, iPad portrait/landscape and laptop widths. Shared tokens and control
standards are documented in the preceding interface acceptance report.

Meaningful mutation checks: dropping current-result identity makes the engine
readiness regression fail; dropping the pending-backup branch makes the backup
regression fail. `tmp/session/readiness-can-fail.log` records both nonzero exits.
`tmp/session/readiness-modal-can-fail.log` records the original modal navigation
failure. `tmp/session/readiness-dialog-handoff-can-fail.log` records all three
shortcut failures before the handoff fix. No visual baseline has been regenerated.

## Release evidence ledger

The source marketing version is 1.4.0. The public download descriptor remains
1.3.3 build 932 until the new artifact is published and byte-verified. Web and
public Mac version claims are checked separately because source may legitimately
be ahead of a packaged release.

The exact previous public DMG was downloaded from v1.3.3 and SHA-256 matched
`0d558a60b369954f27eb5612347ac2cdc8968b2fcbebcbaecdd3a3ecffa36c4d`.
It was mounted read-only and copied to an isolated release cache for the upgrade
harness; no installed application or owner's profile was replaced.

Source checks passed: `npm run typecheck`, `npm run lint` (zero problems),
`npm run format:check`, `npm test` (3,917/3,917 in 364 files), `npm run build`,
`npm run benchmark`, `npm run docs:check` (359/359), `npm run test:no-skips`,
`npm run public:check` (22/22) and `git diff --check`. The benchmark's rules
experiment deliberately rejects the simpler main-line loader because it loses
variations and annotations; its `FAIL` line is that rejected alternative's
semantic result, not a failing Kingfisher regression.

The optional HTTP/SQLite benchmark was run separately against an isolated
companion and 100,000 **generated benchmark games**, not a reference corpus.
It imported and reported all 100,000, with consistent aggregates over
1,051,297 indexed positions. Parse: 41.6 s; import: 110.4 s (906 games/s);
paged-list median: 1.0 ms; common-position aggregate median: 0.4 ms. These
are local timings under concurrent browser-test load, not a release latency
promise. The owned companion stopped and its temporary database was removed.
Log: `tmp/session/release-140-sqlite-benchmark.log`.

The full `npm run test:e2e` Chrome suite passed **445/445 in 29.2 minutes**,
zero retries and no regenerated visual baseline. Log:
`tmp/session/release-140-browser.log`. This includes the new readiness cases,
the existing visual comparisons, settings, persistence, source separation,
engine failure handling and repeated navigation/resource checks.
That run preceded the final focus and modal-handoff corrections. The final
repeat passed **448/448 in 28.1 minutes**, zero retries, including all 43 visual
comparisons. No baseline was regenerated. Log:
`tmp/session/release-140-browser-final.log`. Source gates listed above passed
again after the editing-form preservation fix. Interrupted runs were retained
as partial evidence; neither is counted as a passing final run.

The updater mutation harness passed **18/18**, including actual tampered-byte
signature rejection with a throwaway test key and save-barrier guards. Its
bundle-layout check used a fixture; it does not certify the candidate's real
Sparkle installation or relaunch. Log: `tmp/session/release-140-update-mutations.log`.

Focused WebKit readiness/header coverage passed **12/12 in 29.4 seconds**.
The default Playwright Firefox 155 launch failed in all 12 cases before any
test page opened: `Could not find profile folder` on macOS 27.0.1. Moving the
temporary profile did not help. An isolated application-data diagnostic could
start Gecko but its content target crashed; it is not application-test proof.
No permissions or existing Firefox profile were changed. The original failure
matches the app-data access failure described in
[Mozilla bug 2062988](https://bugzilla.mozilla.org/show_bug.cgi?id=2062988) and
[Playwright issue 42768](https://github.com/microsoft/playwright/issues/42768).
This is an inference about the host failure, not a verified Kingfisher defect
or an Electron limitation. Firefox remains uncertified here. Logs:
`tmp/session/release-140-browser-focused-matrix.log` and
`tmp/session/release-140-webkit-final.log`.

## Packaged candidate and final checks

Candidate: **1.4.0, build 1007, stable, clean**, source
`a88c130bd5a211608ef0c097a8b801adbd0b2b45`. The working tree was clean and
HEAD equalled origin/master when it was packaged. Root/desktop versions and
lockfiles agree. Developer ID signing, application notarization and stapling,
packaged boot, DMG notarization/stapling and the combined trust gate passed.
DMG submission: `8711e461-997b-4bed-9fa8-b992c49d8388`, Accepted.
DMG: **192,321,952 bytes**, SHA-256
`d1f669a9028c909f2e0053bc4b6fcacf3ebf636604ec13b74317050a2d18fd23`.
The update ZIP and appcast were signed with the existing Sparkle key.

The initial full desktop certification failed one of ten steps: Stormphrax's
57 MB download exceeded the engine harness's five-minute install wait. It
subsequently completed and the companion's real search checks passed. That run
remains a failure; its result was not re-labelled. The unchanged complete repeat
passed **10/10 steps**, including smoke 17/17, chrome 109/109, restart 7/7,
engine fleet 25/25, suspend 14/14, seed-46 walk 200 actions, seed-7 fault walk
120 actions, DMG verification, zero-skips and 3,917 unit tests. Both walks
reported zero findings; the fault walk's two console errors were expected
injected failures. Logs: `tmp/session/release-140-certify.log` and
`tmp/session/release-140-certify-repeat.log`. No deadline or assertion was weakened.

Native interface checks passed **14/14** against this candidate, including
actual native menus, Unicode copy/paste/undo, unfinished form preservation,
focus return, keyboard dividers and notation, narrow windows, light/dark mode,
real full screen and the native update sheet. All eight 1440×900, 1280×720,
1100×800 and full-screen light/dark screenshots were inspected. Their renderer
captures do not show OS traffic lights; the separate chrome harness checks
those. Log: `tmp/session/release-140-native-interface.log`.

Five fresh profiles per exact app compared the public 1.3.3 baseline to this
candidate at 1280×720 with the same annotated game and browser engine settings.
Median startup: 880 → 832 ms; summed process-tree RSS: 1,389 → 1,384 MiB.
Stopped-engine navigation p95: 15.88 → 15.86 ms; live-engine p95:
17.05 → 15.12 ms. The <=100 ms response and <=10% startup/RSS regression
criteria passed. These are local median timings, not a cold-cache promise;
RSS sums shared pages rather than deduplicating them. Evidence:
`~/Library/Caches/Kingfisher/release-1.4.0/evidence/performance.json`.

Live production was tested in a fresh isolated browser. The bundled Starter
completed its digest-checked first installation in about 18 seconds. The
readiness answer named **206,451 games in this population**, and an actual
Stockfish short search completed. Loaded production assets contained the full
`a88c130` source identity and diagnostics reported 1.4.0. Log:
`tmp/session/release-140-live-prepublish.log`. Initial diagnostic attempts that
opened readiness before installation finished were retained separately and
were not counted as passing checks.

## Scope explicitly deferred or excluded

The user requested faster completion. The additional 50-cycle packaged resource
soak was interrupted during its first test and is **not passed**. The additional
1,000-action walk, 300-action fault walk and 30-minute wall soak were not run.
The standard full certification's 200/120-action walks and existing full browser
resource tests passed; those do not stand in for the longer runs.

VoiceOver testing was **cancelled by the user** and is excluded from this release.
No VoiceOver observations are claimed. The attempted macOS input-method check
selected Japanese Hiragana but automation entered Latin text; actual OS marked
composition was not demonstrated. This is an unverified test, not an established
application failure. Original U.S./Turkish Q keyboard selections and the original
three dictation languages were restored, with VoiceOver off. macOS registered
an extra hidden Japanese palette service; the entire service inventory is not
claimed to be byte-identical. Automated composition guards passed, which is
narrower evidence than installed-IME correctness.

The five-player study remains pending by the user's decision. Research remains
opt-in. Firefox is uncertified on this host, focused WebKit coverage does not
establish a full matrix, and Windows execution is not claimed.

## Publication and upgrade evidence

Published **2026-10-01 20:28 Istanbul (17:28:23 UTC)** as GitHub `v1.4.0`.
The tag pins the exact packaged source `a88c130`; six new assets were uploaded
to a fresh draft and it was made public only after candidate checks. Existing
release assets were not replaced. A public download of the DMG passed **61/61**
byte, version/build/commit, layout, signature and notarization checks before
publication metadata was pushed. Log: `tmp/session/release-140-public-bytes.log`.

The previous-public-profile upgrade passed **7/7**: study, preferences,
reference metadata and the same data directory survived 1.3.3 → 1.4.0.
The real staged Sparkle update and the real **public-feed Sparkle update both
passed**: native offer, download, signature validation, installation, relaunch
into the test profile and retained study. The default profile log was unchanged
and no descendant survived quit. Logs: `tmp/session/release-140-upgrade.log`,
`tmp/session/release-140-sparkle-staging.log`,
`tmp/session/release-140-sparkle-public.log`.

A fresh quarantined DMG copy was mounted read-only and its app copied without
removing quarantine. Gatekeeper accepted it as Notarized Developer ID. Opening
it through LaunchServices produced the actual translocated Analysis window;
its renderer reported the exact stable 1007/a88c130 identity. No first-open
sheet was observed on this host and no developer/damaged-app warning appeared.
The initial helper could not scope quit by its original path because macOS
translocated the app; that helper exit is not called green. CUA observed and
quit the exact translocated test app, and all four recorded scoped processes
were gone. Evidence: `~/Library/Caches/Kingfisher/release-1.4.0/evidence/quarantined-launch.json`.

Publication claims now select the public 1.4.0 bytes. These metadata/documentation
changes do not alter the immutable package. The docs fixture audit exposed a
pre-existing false positive in the new test: its generated screenshot filename
was treated as an ignored input fixture after the test became tracked. Screenshot
outputs now use Playwright's per-test `outputPath`; no assertion was removed,
no product implementation changed and no visual baseline was regenerated.

After publication metadata and the screenshot-output correction, focused Chrome
readiness and landing checks passed **17/17 in 30.4 seconds**, zero retries.
Typecheck, lint, formatting, production build, docs **359/359**, public links
**22/22** and diff checks passed. The earlier full **448/448** browser result
still covers the unchanged 1.4.0 application implementation; it was not repeated
for version text, descriptors or test-output filenames under the user's expedited
scope. Ephemeral helper scripts were archived outside the checkout; they were
not included in the source or package.
