# Phase 47 — Handover

Trusted macOS release: Developer ID certificate, notarisation, the
"Kingfisher could not start" packaging defect, the update window, engine
arrows, player and opening data, documentation, and the 1.1.0 release.
Worked directly on `master`, 2026-09-12, on the maintainer's Mac (macOS
26.6.2, Apple silicon, Electron 44.2.0, Node 24.14.0). Every number below
comes from a command that was run in this session.

## 1. Executive verdict

**Phase complete.** **Version: 1.1.0, released.** **Public release: yes** —
`v1.1.0` on GitHub, not a pre-release, with the DMG, the update ZIP,
`latest-mac.yml`, `SHA256SUMS` and `kingfisher-release-manifest.json`.
**Developer ID: present**, with its private key. **Critical: 0 open. High:
0 open.** Three Critical/High defects were found and fixed during the
release gate before the artifact was published (§28).

One thing was **not** verified: that the Vercel landing page has redeployed
from the descriptor commit and now serves `Kingfisher-1.1.0-arm64.dmg`.
The push that triggers it was made; the check was interrupted before it
ran. `npm run desktop:public:verify -- --landing --full` and
`npm run deploy:status` are the commands. The GitHub side is verified
(§22).

## 2. Git

- Starting HEAD: `0b85fa7` (= `origin/master`), with a previous agent's
  uncommitted Phase 47 work in the tree (package contract, update dialog,
  arrows, verifier rewrites), inspected and carried forward.
- Final HEAD: `9471266` = `origin/master`, working tree clean.
- Tag: `v1.1.0` at `a9d3b3e` — the commit the released bundle records.
- Commits this phase: 20.

## 3. Phase-46 completion audit

Every fix the Phase 46 handover reported was checked against source, and
its handover's template placeholders were resolved (`0b85fa7` was its final
commit; no preview was ever published; the soak figures existed only in the
certification matrix).

| Reported fix                                | Landed                       | Tested this phase                                    |
| ------------------------------------------- | ---------------------------- | ---------------------------------------------------- |
| 1 extraResources restored                   | yes                          | boot gate, verify-dmg, certify (build 472)           |
| 2 PGN association                           | yes                          | smoke 17/17, `fileAssociations` in yml               |
| 3 NSAppTransportSecurity loopback exception | yes                          | yml                                                  |
| 4 DMG verifier                              | yes                          | passes on 472; refuses dirty tree on dev             |
| 5 packaged Playwright harness               | yes                          | every packaged gate                                  |
| 6 Syzygy real tables                        | yes                          | ten digests re-fetched from the publisher: all match |
| 7 updater IPC wired                         | yes                          | `desktop:update:dialog`, `desktop:update:real`       |
| 8 electron-updater import                   | yes                          | `desktop:update:real` installed a real update        |
| 9 update errors sanitised                   | yes                          | dialog harness asserts no path/header/stack          |
| 10 engine SVG does not block input          | yes                          | `engines.spec.ts`; mutation fails it (§CI)           |
| 11 closed-window getBounds                  | yes                          | `window-bounds.mjs` isDestroyed guard                |
| 12 Service.running after death              | yes                          | `services.mjs`; fault walk                           |
| 13 companion recovery                       | yes                          | fault walk 4× companion kill, recovered              |
| 14 DMG duplicate icons                      | yes                          | verify-dmg "no unexpected files"                     |
| 15 menu says Kingfisher                     | yes                          | `desktop:menus` 45/45 on 472                         |
| 16 deleted SQLite backing file              | yes                          | `server.mjs` refuses; chaos test                     |
| 17 chooser args validated                   | yes                          | `main.mjs`                                           |
| 18 revival bounded                          | yes — and wrong; fixed (§18) |
| 19 updater cache path                       | yes                          | `kingfisher-updater.mjs` reads app-update.yml        |
| 20 dev artifact pruning                     | yes                          | `build.mjs`                                          |
| 21 duplicate Companion row                  | yes                          | `0e318fb`; `reference-packs.spec.ts`                 |

## 4. Startup / package

**Root cause of "Kingfisher could not start":** `desktop/electron-builder.yml`
lost its `extraResources` block in the Phase 35 rewrite (`71ef535`); every
packaged build to Phase 45 was a shell with nothing to serve. Phase 46
restored the block; Phase 47 made the class of defect structurally
impossible for a publishable artifact:

- `desktop/src/required-resources.mjs` is the one list (web server, Next
  output, browser Stockfish, companion, engine catalogue and digests);
  `paths.mjs`, `verify-dmg.mjs`, the yml test and the electron-builder
  `afterPack` hook (`verify-package.mjs`) all read it. A missing or empty
  entry fails the build before signing.
- `afterSign` (`verify-package-boot.mjs`) launches the signed, notarised
  application through the shared harness launcher — bridge, web server,
  companion `/status`, managed-engine catalogue, and `app-update.yml` — and
  only then are the DMG and ZIP made from those bytes.
- A split two-run pipeline tried first in this phase was reverted: it
  dropped `app-update.yml` (electron-builder writes the feed only in a run
  whose targets include the DMG/ZIP). The boot gate and verify-dmg now
  assert the feed.

## 5. Apple account

Browser actions performed by the agent in the Claude Browser pane after the
owner signed in: Certificates → + → Developer ID Application → G2 Sub-CA →
CSR upload → Continue → certificate created and downloaded; App Store
Connect → Users and Access → Integrations → Request Access (terms accepted
with the owner's explicit permission) → Generate API Key ("Kingfisher
Notarization", role Developer). Account: Metin Arda Kurt, team `3B5CYF9DQ4`,
with the rights to create a Developer ID certificate. The one-time `.p8`
download was done by the owner in a normal browser (a private key is not
captured through the page). No private data is committed.

## 6. Developer ID

`Developer ID Application: Metin Arda Kurt (3B5CYF9DQ4)` — **present** in
the login keychain, created 2026-09-12, expires 2031-09-13, from a CSR whose
RSA-2048 key was generated locally and imported into the keychain. Private
key: **present** (the certificate's public key matches it; `codesign`
signed with it without a prompt). `security find-identity -v -p codesigning`
lists three identities; the preflight requires this family and rejects the
other two.

## 7. Notarisation credential

**Configured.** App Store Connect API key, Key ID `AFKYN45963`, Developer
role; `.p8`, issuer and environment in `~/.kingfisher-release/env.sh`
(mode 0600, outside the repository). `notarytool history` authenticated.
No secret value appears anywhere in the repository or this report.

## 8. Signing

Build 472: `desktop:sign:verify` PASS — 23 code objects, every one
`Developer ID Application`, team `3B5CYF9DQ4`, secure timestamp, Hardened
Runtime on executables, entitlements exactly the audited five
(`allow-jit`, `allow-unsigned-executable-memory`,
`files.user-selected.read-write`, `network.client`, `network.server`).
`disable-library-validation` and `allow-dyld-environment-variables` were
removed after audit — engines are spawned processes, not loaded code — and
every managed engine still runs in the hardened bundle (`desktop:engines`
25/25). No `get-task-allow`. `CSC_NAME` must be given without the
`Developer ID Application:` prefix; `CSC_IDENTITY_AUTO_DISCOVERY=false`
without a p12 produces an unsigned build (the setup doc said the
opposite; corrected).

## 9. Notarisation

**Accepted** for the app (in the build, `@electron/notarize`) and for the
DMG (`release:mac:notarize`, submission `f84f6f8b…` for build 472).
**Stapled** to both; `stapler validate` passes on both.

## 10. Gatekeeper

`spctl --assess --verbose=4 --type execute Kingfisher.app` →
`accepted, source=Notarized Developer ID`. `spctl --assess --type open
--context context:primary-signature Kingfisher-1.1.0-arm64.dmg` →
`accepted, source=Notarized Developer ID` (the DMG is signed with the same
identity; `dmg.sign: true`). `desktop:trust:verify` GREEN.

## 11. Quarantine launch

A copy of the DMG with a browser quarantine attribute (`0083;…;Safari;…`)
was mounted, `Kingfisher.app` copied out (inherits `0283`), assessed —
`accepted, source=Notarized Developer ID`, also on the App-Translocated
instance — and launched through LaunchServices. It started into macOS's
standard first-open consent sheet (the process parked at `_dyld_start`
until the click). Nobody was at the machine to click **Open**, so the
sheet's wording was not read by a human; the assessment that decides which
sheet appears is recorded. Quarantine was never removed. The install guide
states what a person should and should not see.

## 12. Update window

**Before:** 420×280 with a hidden title bar whose title sat under the
traffic lights, a mostly empty grey surface, two equally loud buttons,
"carries no update feed" text. **After:** native title bar (the system owns
the traffic lights and the drag region), 400×206 content, icon + version +
headline + one sentence + action(s), one default button per state (Cancel
while downloading is plain), fifteen states in light and dark, no trailing
periods, nothing internal in any failure text. Keyboard: default button
focused, Tab/Shift-Tab, Enter, Escape closes and focus returns to the main
window; `aria-live` status, `aria-valuenow` progress. `npm run
desktop:update:dialog` drives every state, asserts layout and sanitisation,
and writes screenshots (`output/update-dialog/`).

## 13. Updater function

- IPC: `update-window.mjs` handles all three dialog channels.
- electron-updater: loaded from the CJS default export; `app-update.yml`
  in the bundle (owner `mardakurt`, repo `kingfisher`, `releaseType:
release`, cache `kingfisher-desktop-updater`).
- Staging: `desktop:update:mutations` 11/11; `desktop:update:e2e` GREEN;
  **`desktop:update:real`** (new) 12/12 — a signed 1.0.5 dev build updated
  itself to 1.1.0 (build 472) through the real menu and dialog: download,
  SHA-512, save barrier, quit, the system's update engine replaced the
  bundle, relaunch, version 1.1.0, post-update notice, study preserved,
  nothing surviving the quit.
- Public: the public feed serves `latest-mac.yml` for 1.1.0. Not exercised
  from an installed public 1.1.0 (there is no newer release to install).

## 14. Engine visualisation

Single filled outline per arrow: shaft 0.11 squares, head 0.30 × 0.36,
tail inset 0.30, tip inset 0.20, opacity 0.82, a faint light halo for dark
squares. Engine A solid blue; Engine B amber, dashed shaft, outlined head.
Agreement: **one** arrow — A's shaft and head with B's dashed core and
colour round the head. Tooltip beside the head, one line per engine, flips
to stay on the board. Arrows fade to 30 % while a piece is selected or
dragged; no hover then. The layer takes no pointer events; hover is
computed from the pointer on the board container. Screenshots were taken
at 900 px and 1600 px on green/walnut/slate, one engine and two agreeing;
two-engine disagreement could not be produced live (one browser engine
family) and was judged from the geometry only.

## 15. Player data

Before: installed packs + 106 curated legends. After: + 8,339 titled
players from Wikidata (2,126 GM, 530 WGM, 4,657 IM, 1,026 WIM; 1,606
women; 7,677 with FIDE ID; 8,322 with birth year) — `public/data/players/
titled-players.json`, 893 KB, ≈260 KB gzipped, fetched lazily on first
player search, never in the bundle. Source Wikidata, licence CC0, built by
`npm run players:roster`, digest-checked by `players:roster:check`,
recorded in THIRD_PARTY_DATA.md. Library search over the 8,400-row
catalog: ~7 ms; palette hit: 66 ms including the first fetch. Roster rows
never appear in a browse set.

## 16. Opening data

Before and after: 3,810 entries — the vendored lichess-org/chess-openings
is already upstream HEAD (`4b86227`, CC0). The gain is search: a vetted
abbreviation table (QGD, QGA, KID, KIA, QID, NID, Petroff, Spanish,
Fischer-Sozin, Archangel), British spellings, umlaut transliteration,
whole-word bands, a qualifier penalty (anti/reversed/neo), a data-derived
prominence weight, one hit per name, and a fuzzy term that means a typo
rather than a resemblance (the old one put a London System line above
"Queen's Gambit Accepted" typed in full). 31 named queries pinned in
`openings.test.ts`; ~15 ms per search.

## 17. Companion

Auth: `tokenMatches` compares byte lengths before `timingSafeEqual`;
mutated back to character length → 5 tests fail, restored. Recovery: four
SIGKILLs and a SIGTERM in the fault walk, all detected and recovered.

## 18. Desktop service recovery

The Phase 46 rule counted any exit within 30 s of a start as a crash, so a
healthy web server SIGKILLed four times in fifty seconds was left down
("3 crash-loop restarts") — found by `desktop:certify`'s fault walk. Now
`desktop/src/revival.mjs`: self-inflicted exits (codes, SIGSEGV/SIGBUS/
SIGABRT) within 30 s count against 3-in-5-minutes; external kills restart
every time, bounded at 10-in-5-minutes; a long healthy run resets. Unit
tests pin the walk's sequence; fault walk 0 findings.

## 19. SQLite

Writes into a collection whose file is gone are refused with a sentence
(`server.mjs`); `database-chaos.test.mjs`.

## 20. Syzygy

All ten `companion/fixtures/syzygy-3/*` digests match
`tablebase.lichess.ovh/tables/standard/sha256` fetched live this session;
THIRD_PARTY_DATA.md matches.

## 21. DMG

Final: `/tmp/kingfisher-release/Kingfisher-1.1.0-arm64.dmg` (build 472).
`verify-dmg`: volume, icon, two visible items, Applications symlink,
Info.plist, arm64, signed, notarised, feed present, 3,056 entries, no
unexpected files. A Finder screenshot could not be taken (no screen
capture in this environment); the structural checks are the evidence.

## 22. Public DMG

URL `https://github.com/mardakurt/kingfisher/releases/download/v1.1.0/Kingfisher-1.1.0-arm64.dmg`
(also `/releases/latest/download/…`, HTTP 200). 160,503,993 bytes. SHA-256
`c4b21c2ebeb0a3fd7963d63eb38002e8f955fddf8fb015c3edcec20241ce6b27`.
Version 1.1.0, build 472, commit `a9d3b3e`, arm64, Developer ID
Application, notarised and stapled. `desktop:public:verify -- --full`:
**49/49, every byte**.

## 23. Landing

`src/release/macos-download.json` names 1.1.0; pushed in `9471266`. Whether
Vercel has redeployed was **not checked** (interrupted). Run `npm run
desktop:public:verify -- --landing --full`.

## 24. Update from public 1.0.0

Impossible by construction, verified: the public 1.0.0 bundle contains no
updater code and no `app-update.yml`, and is signed `Apple Development`.
`desktop:upgrade` with the real public 1.0.0 (`f7b50af5…`) as previous and
build 472 as current: 7/7 — study, preference and pack metadata authored
in 1.0.0 are read by 1.1.0. The install guide says to replace by hand once.

## 25. Documentation

182 Markdown files tracked. Updated: README, SECURITY, AGENTS, CHANGELOG
(1.1.0 entry), ENGINES, install guide (rewritten), trusted-release runbook,
Developer ID setup guide, public-claims, certification matrix, THIRD_PARTY_
DATA, Phase 46 handover (placeholders resolved). Personal paths: none in
canonical docs (`security:scan` 0). `docs:check` 299/299, following the
descriptor's trust state.

## 26. Security

`security:scan` 0 findings; `npm audit --omit=dev --audit-level=high` 0;
Apple trust as above; IPC unchanged; feedback route unchanged; engines
unsandboxed and documented so.

## 27. Tests

`npm test`: **231 files, 2,881 tests, 0 skipped, 0 failed**
(`test:no-skips` OK). Playwright: **263 passed, 0 failed, 0 skipped**
(15.1 min, `retries = 0`). `desktop:certify` on build 472: 10/10.

## 28. Bugs

Found and fixed this phase (all before publishing): the split pipeline
dropped `app-update.yml` (High); the updater's signature check read
codesign's stdout and refused every install (Critical); the post-update
notice raced the renderer and fired on fresh installs (Medium); the
revival rule refused healthy kills (High); Halogen 16.0.0 SIGBUS at its
depth limit (High, engine → 16.8.0); the sign/notary/trust verifiers could
never pass (`.code` vs `.status`); the publish script named a ZIP that
does not exist; the entitlements comment contained `--` and broke
codesign; fuzzy search let resemblances outrank exact names. Harness:
three defects in the dialog harness (ESM top-level await, Playwright's
first-window wait, Escape-closes-target).

## 29. Version

**Kingfisher 1.1.0 released** — because Developer ID, notarisation,
stapling, Gatekeeper, the real update, `desktop:certify`, the public
artifact verification, the unit and browser suites all passed with
Critical = High = 0.

## 30. Release verdict

**KINGFISHER 1.1.0 TRUSTED MACOS RELEASED**

## 31. Next mode

**USER-FEEDBACK MODE.** Remaining concrete item: confirm the landing
redeployed (§23) and click through one quarantined first launch by hand.
