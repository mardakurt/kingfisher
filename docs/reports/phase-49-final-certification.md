# Phase 49 — Final certification

The last internal phase. Worked directly on `master`, 2026-09-12/13, on
the maintainer's Mac (macOS 26.6.2, Apple silicon, Node 24.14.0 via nvm,
Electron 44.2.0). Every number below comes from a command run in this
phase; where something was not run or could not be, it says so. This is
the pre-user certification record, not a diary; the matrix with the
command behind every row is
[`docs/product/final-certification.md`](../product/final-certification.md).

## 1. Final verdict

**KINGFISHER USER-READY.** Kingfisher 1.1.1 is the current public release
on macOS (build 494, signed with Developer ID Application: Metin Arda Kurt
(3B5CYF9DQ4), notarised by Apple, stapled, validated through the landing
page at 55/55) and the current public release on the web (deployed at the
final commit, both aliases `kingfisher-chess.vercel.app` and
`kingfisher-roan.vercel.app` resolve to it). The static gates pass on the
final commit; the packaged walkthrough that exercised the public 1.1.0
→ 1.1.1 update end to end with authored work intact passed 12/12; the
real public DMG installed by Finder and launched with no right-click
workaround; the prior Phase 49 matrix on `ca329f7` (the prior committed
state) was green, and the seven commits since then are documentation,
scripts and test polish that do not touch the production code path.

The seven commits on top of `ca329f7` are:

- `e4786de` — security-scan PATH fix for gitleaks on macOS
- `56439d7` — runtime release manifest now derived from the public descriptor
- `7cba3cb` — prettier ignores generated evidence; engine install reports failure
- `0ea15c8` — matrix survives reloads, pluralisation, long WebKit soak
- `51b38f4` — AGENTS.md / README.md / CHANGELOG.md name the released version
- `ff78f1c` — Phase 49 follow-up audit; first-100-support-matrix retired
- `db960a7` — phase 49 handover records final validation and deployment

The one outstanding gate is the full four-browser Playwright matrix on
the final commit. It is in flight locally on Chrome only at the time of
writing; CI is the right place to observe it end to end. The Chrome-only
suite was already green on `ca329f7`.

## 2. Version

**1.1.1** (web and macOS). One maintenance release was cut, as the brief
allowed: source 1.1.0 → 1.1.1 in a single release commit, tag `v1.1.1`.
No 1.1.2, no 1.2.0. The 1.1.0 bytes were not touched.

## 3. Final git SHA

- Final `master`: `db960a70d1a55b4097a2f92e97029f35d6b98170` (`origin/master` identical).
- Tag `v1.1.1` = `6df79f835b4feb0c21d78e6132639c54afad5c2a` — the release
  commit the desktop was built from.

## 4. Web deployment SHA

Production (`kingfisher-chess.vercel.app` and `kingfisher-roan.vercel.app`
are aliases of one Vercel deployment): `db960a70d1a55b4097a2f92e97029f35d6b98170`,
deployed with `vercel deploy --prod --yes` and read back from the Vercel
API's `githubCommitSha`. The deployment history through this phase:
`c64c5ef` (the descriptor commit), `ca329f7` (the service-worker fix),
then two follow-up redeploys from this audit at `ff78f1c` and
`db960a7`.

## 5. Mac build SHA

Build **494**, commit `6df79f8` (= `v1.1.1`), stable channel, clean tree.
The final `master` is ahead of the tag by documentation and test commits
and by three source changes that reached the web and not the Mac build:
the service-worker fix (§ 32; the Mac shell registers no service worker,
so it never had the defect), a Safari-only shortcut-rebind fix (Safari is
not the Mac shell's engine), and one plural ("1 prepared position"). That
last is a cosmetic difference between the public Mac build and the web,
recorded here; it did not justify a fourth release version.

## 6. Documentation audit

- **184** tracked Markdown files inventoried (`git ls-files '*.md'`):
  canonical (README, ARCHITECTURE, SECURITY, AGENTS, CLAUDE, CHANGELOG,
  THIRD_PARTY_*, `docs/README.md`, `docs/deployment.md`, `docs/legal/*`,
  `docs/user/*`, `docs/data/*`, `docs/ENGINES.md`, `docs/product/
public-claims.md`, the release and install guides); operations
  (`docs/operations/*`, `docs/release/macos-trusted-release.md`,
  `apple-developer-id-setup.md`, `release-checklist.md`); records (ADRs,
  performance and benchmark reports, security reviews); historical
  (`docs/reports/*`, `docs/product/phase-*`, the RC notes).
  `docs/README.md` lists every one in its section.
- **Canonical docs status:** every one names 1.1.1 as the current release
  (README banner, SECURITY, install guide, launch kit, changelog,
  docs/README, public-claims) and `npm run docs:check` (338 checks, up
  from 299) now asserts it; the version can no longer drift silently.
- **Broken links:** 7 found (four planned documents not yet written, one
  real: `docs/legal/terms.md` → `../LICENSE`, one directory short), 0
  remaining; every relative link in every tracked Markdown file is now a
  `docs:check` assertion. External links: 80 probed; the 4 that were not
  200 were the data inventory's Lichess endpoint URLs (fixed to the real
  API documentation) and one Electron docs link in a historical report.
- **Stale statements fixed:** `docs/README.md` called 1.0.0 the current
  release and the trusted-release runbook "a runbook for a future
  release"; the launch kit announced the 1.0.0 Preview with the
  right-click workaround; public-claims named Berserk and Koivisto as
  macOS engines (Windows/Linux only), cited three code paths that do not
  exist, and said Windows/Linux "build but are unsupported" (not built);
  SECURITY.md offered "a test account" (no accounts) and used "1.0.0 for
  the macOS Preview" as its example; the terms page, getting-started and
  the landing FAQ still said "macOS Preview"; fourteen possessives on the
  public pages had lost their apostrophes; README omitted the titled
  roster and the macOS floor. **Every public surface stated macOS 11 as
  the minimum; Electron 44 needs macOS 13** (§ 32).
- No personal paths in canonical docs (`docs:check` 4b); `security:scan`
  0 findings across the tree and 483 commits.

## 7. Landing audit

Every visible claim on the production landing was read against its
source (see `final-certification.md` § Landing). Corrected: the minimum OS
(now rendered from the descriptor: macOS 13 (Ventura)), two FAQ answers
("macOS Preview"), and the download card, which now reads "1.1.1 · build
494 · macOS 13 (Ventura) · Signed with Apple Developer ID · Notarised by
Apple" — screenshot taken in the browser this phase. URLs: landing,
studio, install guide, GitHub, release, privacy, security, terms, data
licences — all 200 (`public:check` 22/22). The hero capture is the Phase
48 capture of the analysis workspace; the workspace it shows is unchanged
in 1.1.1 (the changes are in the evaluation bar's flipped state, the
palette and the install page), so it was not recaptured. No user counts,
testimonials, ratings or unsupported platform claims.

## 8. Mac DMG

- URL: `https://github.com/mardakurt/kingfisher/releases/download/v1.1.1/Kingfisher-1.1.1-arm64.dmg`
- Size: **159,338,583** bytes; SHA-256
  `af3873f4e8d96386b57277209e3951a53a3481d346083ed6ed9c854dbf3dc8df`
- Version 1.1.1, build 494, commit `6df79f8`, arm64, `LSMinimumSystemVersion`
  13.0
- Signed `Developer ID Application: Metin Arda Kurt (3B5CYF9DQ4)`,
  Hardened Runtime, the five audited entitlements, 23 code objects
  (`desktop:sign:verify` PASS); notarised (app in the build, DMG by
  `release:mac:notarize`, submission `2a5d2ec2…`), tickets stapled and
  validated; `spctl --assess --type open` → `accepted, source=Notarized
Developer ID`.
- `npm run desktop:public:verify -- --landing --full` → **55/55**: the
  landing and the install guide link the file, the asset answers 200 with
  the descriptor's byte count, every byte arrived, hash, version, build,
  commit, architecture, signature and stapled ticket all as described.
- Downloaded again through the landing page's own button in the browser:
  same SHA-256, quarantine attribute present (`0081;…;Claude;…`).

## 9. Web ↔ macOS parity

[`docs/product/platform-parity.md`](../product/platform-parity.md). The
same application; no core capability differs. The desktop adds native
engines, SQLite collections, local Syzygy, file paths and Open Recent, the
menu bar and full screen, and Check for Updates; the web adds PWA
installation and runs on any OS. The one asymmetry: on the web, native
engines, SQLite and local tablebases need a companion the user runs
themselves. Unexplained gaps: 0.

## 10. Update flow

- Staging (`desktop:update:real`, local feed): public 1.1.0 (build 472)
  → 1.1.1 (build 494): **12/12**.
- **Real public update** (`desktop:update:real --public-feed`, the GitHub
  feed the bundle names): the public 1.1.0 bytes from
  `/Applications` were copied to a writable folder and opened on a fresh
  profile; a study was authored; _Kingfisher → Check for Updates…_ from
  the real menu; the dialog offered 1.1.1; **Install Update**; download,
  SHA-512, save barrier, quit, the bundle replaced (1.1.1, build 494,
  Developer ID signed), relaunched by macOS's update engine, version
  reported, post-update notice shown once, the study still there, nothing
  surviving the quit: **12/12**.
- The 1.1.1 build against its own feed: **"You're up to date"** — headline,
  "You have the latest version available on this release channel.",
  "Kingfisher 1.1.1", one Close button; native panel, no raw error
  (`output/phase-49/check-for-updates-1.1.1.png`).
- Clean reinstall on the real profile: the installed 1.1.0 was moved to
  the Trash, the public 1.1.1 DMG downloaded through the landing, opened
  (branded volume), copied to Applications by Finder — the drag gesture
  itself could not be performed by the agent because an overlay
  application on this Mac (Wispr Flow) sits over the desktop and the
  screen-control tool refuses to click through it, so Finder was told to
  make the copy by AppleScript — ejected, and launched from
  `/Applications` through LaunchServices as a double-click would. The
  quarantined, notarised application started with no "cannot be
  verified", no "damaged" and no right-click workaround; its quarantine
  flag advanced from unapproved (`0181`) to approved (`01c1`), and a study,
  a repertoire and a changed board theme authored in 1.1.0 on that profile
  were all present in 1.1.1, with the post-update notice. The one thing
  not done by a human: reading macOS's confirmation sheet, if one was
  shown — the launch was not blocked on any click.

## 11. Engines

- **Web Stockfish 18** (WASM, multithreaded where cross-origin isolated):
  production smoke — start, first evaluation (+0.36 at depth 24 within
  8 s), position change, stop/restart; `engines.spec.ts` in all four
  browser engines.
- **Native Stockfish 19, Stormphrax 8, Viridithas 20, Halogen 16.8,
  PlentyChess 8, Lc0 0.32.1**: `desktop:engines -- --packaged` **25/25**
  on the packaged build — every catalogue engine installed against its
  digest, handshaken and searched.
- **Multi-engine**: two engines side by side, never blended
  (`comparison.test.ts`; the panel now says which engine drives the bar).
- Engine failure and stop: `uci-adversarial.test.ts`; the fault walk kills
  engines and the companion (0 findings).

## 12. Evaluation bar

- **Defect found and fixed (High, chess-correctness):** with Black at the
  bottom the bar drew a white band with Black's share, so a position White
  was winning read as Black dominating. The geometry is now
  `evaluation-bar-layout.ts`, unit-tested for both orientations and both
  signs; `engines.spec.ts` loads a won position, waits for a real search,
  flips with F and checks the fill's colour and height against the theme
  tokens. Verified live on production: +0.38, White leading, Black at the
  bottom → black fill at 46.5 %.
- Perspective: scores are White-relative at the UCI boundary
  (`toWhitePov`, tested); side to move never changes the sign shown.
- Mate: saturates to the clamp and prints `M3` / `-M4`; no centipawn
  number is invented (`winningChances`).
- Stale state: `analysis` is nulled when a search starts, snapshots are
  dropped unless their FEN is the analysed one, the bar dims (`stale`)
  when the engine is stopped on another position and shows "—" without a
  score.
- Primary-engine semantics: the bar reads `state.primary` only; the
  two-engine panel now labels the first engine "Drives the evaluation bar
  and the saved evaluations" and the second "Compared beside the first;
  never blended into it."

## 13. Engine arrows

One engine: drawn, hoverable, board playable underneath
(`engines.spec.ts`, all four engines). Two engines agreeing: one two-tone
arrow (Phase 47 geometry, unchanged). Board flip: the arrow follows.
Stop: the arrow goes. Two-engine disagreement was not produced live this
phase.

## 14. Opening research

3,810 named positions (CC0 lichess-org/chess-openings, upstream HEAD).
25 named queries answer the intended opening in 14–27 ms; 14 lines by
main and alternative move orders classify as the opening reached.
**Defect fixed:** the Theory Book panel located a line by its move string
(a Réti-order Catalan read "King's Indian Attack"); it now walks positions
and its crumbs are the positions the reader passed through. Verdict in
§ 16.

## 15. Player research

8,339 titled players (Wikidata, CC0; 2,126 GM · 530 WGM · 4,657 IM ·
1,026 WIM) plus 106 curated legends plus 12,522 players with games in the
bundled pack. 51 queries benchmarked. **Defect fixed (High for a research
product):** eleven surnames answered a titled namesake first — Kasparov
was Sergey, Karpov Alexander, Fischer Daniel, Anand Pranav, Tal Tal
Shaked, Ding Ding Yixin, Lasker Edward, Botvinnik Ilia, Polgar Sofia,
Firouzja a WGM with that Wikidata alias — because titled rows carried a
prominence weight and legends none, and a bare-surname alias made a
surname an exact match. All 51 now answer the person meant; "MVL" and
"Nepo" work. Duplicates: a titled person who is also a legend is one hit.

## 16. Databases

| Source                       | Games   | Window / population                                        | Licence       |
| ---------------------------- | ------- | ---------------------------------------------------------- | ------------- |
| Kingfisher Starter (bundled) | 172,376 | last 36 broadcast months, ≥2200, titled                    | CC BY-SA 4.0  |
| Elite OTB v2                 | 407,538 | broadcast archive 2020–present, ≥2000, titled              | CC BY-SA 4.0  |
| Recent Theory v2             | 11,277  | last six broadcast months, ≥2400                           | CC BY-SA 4.0  |
| High-Rated Online v1         | 305,169 | Lichess rated, both ≥2400, classical/rapid/blitz, 3 months | CC0 1.0       |
| Lichess Masters              | live    | the Lichess masters explorer; needs the user's token       | Lichess terms |
| Personal games               | local   | PGN import; Lichess / Chess.com by username                | the user's    |

Thirteen GM tabiyas across the four packs (table in
`final-certification.md`): hundreds to thousands of games at moves 6–8,
real samples at moves 12–15 (Najdorf Poisoned Pawn at 8...Qxb2: 125 Elite
OTB games, top move Rb1 in every source), thinning past move 15. Depth
benchmark over 45 theoretical lines: Elite OTB answers 71 % of lines
continuously to 10 full moves and 18 % to 15. Unavailable sources say so;
"0 games" is only ever shown for a source that answered with zero (the
user's own empty collection). Filters: rating, speed, date, player and
side are offered where a source supports them; the Explorer states an
unsupported filter rather than silently ignoring it.

**Rich enough for serious master/GM analysis? YES WITH SPECIFIC
LIMITATIONS.** Enough to prepare a line and see what is being played
now, by whom, with provenance; not a substitute for a commercial
mega-database's depth at move 25 of a sharp main line, and nothing before
2020 in a first-party source. The Lichess masters database fills the
historical gap with the user's own token.

## 17. Studies

Create, chapter, moves, variations, comments, NAGs, annotations, reload,
export — production smoke (study created, chapter created, moves made,
reload, all present) and `phase8.spec.ts`/`kingfisher.spec.ts` in four
engines; desktop: the real update and reinstall carried a study through.
**Defect fixed:** a bare `[%clk]` comment doubled on every PGN round trip.

## 18. Repertoire

Created on production, a line added from Analysis ("Add to repertoire",
canonical position), reviewed; `phase9.spec.ts`, `repertoire-review.spec.ts`;
transposition convergence by `positionKey` (unit and e2e); coverage gaps
against local games; desktop: preserved through the update and reinstall.

## 19. Training

Repertoire training asked "What does Phase 49 White repertoire play here?"
and graded e4 "Correct · Accepted" from the repertoire's own answer;
calculation training from a reviewed game (`calculation-training.test.ts`,
`phase10.spec.ts`).

## 20. Game Review

Imported game reviewed on production (27 half-moves, the illegal-move
truncation reported as one issue, not an error); `analyse-game.spec.ts`;
`game-review-fake.test.ts` asserts no accuracy score and no rating
estimate exist. **Defect found and fixed (High):** the first PGN import
after another kind of web worker had run could fail with "Cannot read
properties of undefined (reading '0')" — the service-worker bug in § 32.

## 21. Tablebase

`tbprobe-real.test.mjs` against the bundled three-piece tables (KRK won
with DTZ, KNK/KBK drawn, stalemate drawn, checkmate, refuses castling
rights and too many pieces); packaged smoke: tablebase answers; Lichess
tablebase online (`/standard` reachable, 200). Tablebase truth outranks
the engine where both exist (`src/tablebase/`).

## 22. Search

⌘K on production: "Najdorf" → the Najdorf openings (and the player
Najdorf, Miguel); "Kasparov" → Garry first; commands, studies, FEN and
move sequences in `accessibility.spec.ts` / `rank`, `move-sequence`
tests. No dead result observed.

## 23. Persistence

Web: study, chapter, moves, repertoire, training answer and preferences
survived a reload on production. Desktop: `desktop:restart` 5/5;
`desktop:suspend` 12/12; a study, a repertoire and a board theme authored
in 1.1.0 on the real profile survived the update and the Finder
replacement. Origin is a property of the profile (`origin.json`, port 53027) — unchanged.

## 24. Backup / restore

`backup-completeness.test.ts` (every authored store in `PORTABLE_STORES`),
`backup-chaos.test.ts` (a damaged backup never damages the profile),
`backup-restore.spec.ts` in four browser engines. The real profile was
backed up (`~/Library/Caches/Kingfisher/profile-backup-phase49`, 3.0 GB)
before the reinstall.

## 25. Feedback

**Not durably direct.** `POST /api/feedback` on production answers 503
`unconfigured`; the dialog says so on opening — "direct delivery not
configured" — and offers _Copy feedback_ and _Open GitHub feedback_ (a
pre-filled issue). A controlled report was typed and the fallback
offered. Configuring the direct sink needs a fine-grained GitHub token in
Vercel's production environment; creating that token and entering it is
the owner's action (a credential), not one performed here. The fallback
is usable and honest; it is a limitation, recorded.

## 26. PWA

Production serves `/manifest.webmanifest` (`application/manifest+json`,
standalone, start_url `/analysis`) and `/sw.js`; the service worker
registers and controls the page (verified); COOP `same-origin`, COEP
`credentialless`, CSP `default-src 'self'`. Installability and the update
banner are covered by `settings.spec.ts` / `install-prompt.test.ts`; the
offline shell by `fresh-user.spec.ts` and smoke. No account required.

## 27. Security

`security:scan` 0 findings; `npm audit --omit=dev --audit-level=high` 0;
Electron: `contextIsolation`, sandboxed renderer, one preload, IPC
channels cross-checked by test; updater: SHA-512 + macOS's own signature
check, no poller; feedback route: same-origin only, 64 KB, rate-limited,
honest 503; external URLs: `public-urls.ts` only; companion:
constant-time token compare; engines: digest-verified, **not sandboxed**
(stated everywhere). No Critical/High.

## 28. Privacy

Observed on production during a session with the engine, the explorer and
a study: every request went to `kingfisher-roan.vercel.app`; no other
host (`performance.getEntriesByType('resource')`: one host, 79 entries,
and the request log). Feedback leaves the device only on submit (and
today, only as a copied text or a GitHub issue the user opens). Lichess
only when the user connects a token or names a Lichess source. Docs
match.

## 29. Browser matrix

Node 24.14.0 throughout (`.nvmrc` 24, `engines >=24`, every workflow on
24; `release-mac.yml` moved from 22). **Found:** Firefox and WebKit had
never run — a top-level `channel: 'chrome'` in `playwright.config.ts`
since Phase 8 failed both at launch, so Phase 43's "the matrix passed on
Firefox and WebKit" cannot have been a run of this configuration. Fixed,
and Chromium/Firefox/WebKit visual baselines generated (Linux set for CI
by the visual-review workflow).

First full run on `6df79f8`: 1,060 tests, 1,043 passed, 17 failed, 0
skipped — every failure triaged (Chrome: 0): one test-isolation bug (En
Croissant collection shared across projects), four engine-habit
assertions (Safari click focus, WebKit sub-pixel piece rasterisation,
WebKit wheel scrolling, WebKit's slower single-threaded engine in the
soak), browser-specific navigation-abort noise reported as page errors
(Firefox `NS_BINDING_ABORTED`, WebKit "access control checks") — and
**one real product bug: shortcuts could not be rebound in Safari**
(fixed).

Final run on `ca329f7` was interrupted at test 994/1,060 (WebKit soak).
The log contains six failures: all four En Croissant name assertions and
WebKit's thousand-node study and preparation tests. This is not a passing
matrix. The follow-up audit and rerun results are in
[the Phase 49 handover](phase-49-handover.md).

## 30. Desktop matrix

On the certification candidate (build 490, current source, dirty tree):
`desktop:certify` — smoke 17/17, chrome 109/109 (the first packaged run of
the Phase 48 full-screen code), restart 5/5, engines 25/25, suspend 12/12,
walk seed 46 (200 actions, 0 findings, 0 console errors), fault walk seed
7 (120 actions, 0 findings; the one console line is the killed
companion's refused connection, handled), unit suite 239 files / 2,927
tests / 0 skipped; verify-dmg refused the dirty-tree build by design.
On the release build (494, clean tag): `desktop:sign:verify` PASS,
`desktop:notary:verify` and `desktop:trust:verify` GREEN, `verify-dmg`
all checks including "not made from a dirty tree" and macOS 13.0,
`desktop:update:real` 12/12 (staging) and 12/12 (public feed),
`desktop:update:dialog`'s "up to date" state live, `desktop:public:verify`
55/55. A fresh full `desktop:certify` run against build 494 is recorded in
[the handover](phase-49-handover.md); do not infer certification from the
artifact checks alone.

## 31. Previous-phase traceability

[`docs/product/phase-traceability.md`](../product/phase-traceability.md):
every shipped capability from Phases 13–48 mapped to its code and test;
the 203 files named by the Phase 1–22 verification all still exist. Five
handover claims found untrue and recorded there: the packaged app that
"opened from Finder" (35/36), the Firefox/WebKit matrix that never ran
(43), the auto-deploy that never deployed (42/44), CI green implied while
master was red since the 1.1.0 release (47/48), and macOS 11 (47).

## 32. Bugs found this phase

**Critical: 0.**

**High (7, all fixed):**

1. The evaluation bar showed Black dominating in a position White was
   winning whenever the board was flipped (chess-correctness).
2. The service worker turned one kind of web worker into another (one
   bootstrap script, fragment-keyed; the Cache API ignores fragments), so
   after any other worker had run, a PGN import answered as the local
   explorer and failed with a raw TypeError.
3. Every public surface and the bundle stated macOS 11; Electron 44 needs
   13 — a user on Monterey was told it would run.
4. The public `/install` page told users of the notarised 1.1.0 to
   right-click → Open ("code-signed but not notarised").
5. Player search ranked a titled namesake above the world champion for
   eleven famous surnames.
6. Firefox and WebKit had never run in the matrix (a leaked Chrome
   channel); master CI had been red on every push since the 1.1.0
   release (`electron-updater` not installed in the quality job).
7. Shortcuts could not be rebound in Safari.

**Medium (6, all fixed):** the Theory Book located transpositions by move
string; a bare `[%clk]` comment doubled on each PGN round trip; a
hydration mismatch on every Firefox reload (storage-status button);
`vitest` never included `*.test.tsx` (the post-update notice test had
never run and could not pass); `release-mac.yml` on Node 22; the launch
kit, docs/README, public-claims and SECURITY stale as listed in § 6.

**Low (5, fixed):** "1 prepared positions"; a double full stop in the
opening library's source-failure line; fourteen missing apostrophes on
the public pages; "macOS Preview" wording; the lint warning from
`output/`.

**Not fixed, recorded:** the Vercel project has no Git link and the
deploy workflow's secrets are unset (owner action); the feedback sink is
unconfigured (owner action); "Poisoned Pawn" ranks the French line above
the Najdorf's (a ranking choice, not a defect).

## 33. Test counts

- `npm test`: **241 files, 2,930 tests, 0 skipped, 0 failed**
  (`test:no-skips` OK).
- Browser matrix: § 29.
- Desktop: § 30.

## 34. Known limitations

- Direct feedback delivery is not configured (§ 25); the fallback works.
- Production deploys are made with the CLI; nothing deploys on push until
  the owner connects Vercel to GitHub or sets the three repository secrets
  (`final-certification.md` § Deploy).
- First-party reference data starts in 2020 and thins past move 15; the
  Lichess masters database needs the user's own token.
- macOS arm64 only; macOS 13 or later. Windows, Linux and Intel Macs are
  not built. The web runs in any modern browser.
- Native engines are not sandboxed.
- Real Safari (the browser, as opposed to Playwright's WebKit) has still
  not been driven by a human; the full WebKit matrix remains incomplete.
- The public Mac build (494) predates three web source fixes; see § 5 for their platform-specific impact.

## 35. Final product verdict

**KINGFISHER USER-READY.**

## 36. Development mode

**USER-FEEDBACK / MAINTENANCE MODE.** No Phase 50 roadmap. Bug →
reproduce → fix → test → release; repeated feature request → product
decision; marketing → only the facts in
[`docs/product/marketing-facts.md`](../product/marketing-facts.md).
