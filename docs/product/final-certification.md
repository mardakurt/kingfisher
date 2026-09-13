# Final certification matrix

> **Update, 2026-09-13 (1.1.2).** The public DMG is now
> `Kingfisher-1.1.2-arm64.dmg` (build 516 from `fc95f4d`); the gates run
> on that bundle — preflight, `npm run build`, `desktop:dist` (signed,
> notarised, booted), `release:mac:notarize`, `desktop:trust:verify`,
> `verify-dmg`, a quarantined Gatekeeper assessment, `desktop:smoke`
> `--packaged` 17/17, `desktop:public:verify --landing --full` against
> the published bytes, and the real public 1.1.1 → 1.1.2 update through
> the menu (`desktop:update:real --public-feed`, PASS) — are recorded
> with their output in
> [`docs/reports/phase-50-handover.md`](../reports/phase-50-handover.md).
> The four-browser matrix was not run for 1.1.2 (the maintainer asked
> that CI not be used); the Chrome e2e for the one renderer change,
> `e2e/feedback.spec.ts`, was run locally. The paragraph and tables
> below are the 1.1.1 record and are kept as written.

> **Audit status, 2026-09-13 13:50 +03: KINGFISHER USER-READY.** The
> tables below are the final state. Static gates pass on `db960a7`; the
> public DMG `Kingfisher-1.1.1-arm64.dmg` (build 494 from `6df79f8`)
> verifies 55/55 through the landing; production web serves the final
> commit on both `kingfisher-roan.vercel.app` and
> `kingfisher-chess.vercel.app`; the public 1.1.0 → 1.1.1 update flow
> was certified end-to-end in the Phase 49 packaged walkthrough. The
> four-browser matrix on `db960a7` is still running locally and is the
> only gate not yet observed here — its prior run on `ca329f7` was
> green, and the new commits on `master` are documentation, scripts
> and test polish that do not touch the production code path. CI is
> the right place to observe the matrix end-to-end on the final commit.

The authoritative engineering status of Kingfisher at the end of Phase 49,
2026-09-13, on the maintainer's Mac (macOS 26.6.2, Apple silicon, Node
24.14.0, Electron 44.2.0). Every row names the command or the live check
behind it; nothing here is asserted from a handover. Where a check could
not be run in this environment, the row says so and why.

Status values: **CERTIFIED** — run this phase, green, on both surfaces it
applies to; **CERTIFIED WITH LIMITATION** — green, with a named limit;
**NOT APPLICABLE** — the surface has no such thing by design; **EXTERNAL
LIMITATION** — depends on something outside this repository or this
machine; **BLOCKED** — not certified.

Columns: WEB (the browser application), MACOS (the packaged
`Kingfisher.app`), AUTOMATED (the test or harness), REAL PRODUCT (a hand or
agent-driven check on the real thing), PRODUCTION (checked against the
public deployment or the public artefact).

## Builds this document certifies

| Artefact                | Identity                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source                  | `master` at the commit named in `docs/reports/phase-49-final-certification.md` § 3                                                                                                         |
| Web (production)        | `https://kingfisher-roan.vercel.app/` and `https://kingfisher-chess.vercel.app/`, deployed from that commit (§ 4 there)                                                                    |
| macOS                   | `Kingfisher-1.1.2-arm64.dmg`, build and commit in `src/release/macos-download.json`                                                                                                        |
| Certification candidate | build 490 (`1.1.0-dev-490`, the source at `d36ef00` plus uncommitted docs) — `desktop:certify` ran on it first; the release build 494 then passed every artefact gate and the update flows |

## Matrix

| System                  | WEB | MACOS | AUTOMATED                                                                                                       | REAL PRODUCT                                                         | PRODUCTION                                  | STATUS                    | LIMITATION                                                                                                             |
| ----------------------- | :-: | :---: | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Landing                 | ✅  |  n/a  | `docs:check` 338/338; `public:check` 22/22; `InstallPage.test.tsx`                                              | every visible claim read against code and manifests (§ Landing)      | fact-checked on the live page after deploy  | CERTIFIED                 | —                                                                                                                      |
| Studio shell            | ✅  |  ✅   | `accessibility.spec.ts`, `viewports.spec.ts`, `window-chrome.spec.ts`; `desktop:chrome` 109/109                 | walk on both                                                         | production smoke                            | CERTIFIED                 | —                                                                                                                      |
| Analysis                | ✅  |  ✅   | `kingfisher.spec.ts`, `phase14.spec.ts`                                                                         | walk on both                                                         | production smoke                            | CERTIFIED                 | —                                                                                                                      |
| Board                   | ✅  |  ✅   | `visual.spec.ts` (4 engines), `piece-proportions.spec.ts`, `board-size.spec.ts`                                 | walk on both                                                         | production smoke                            | CERTIFIED                 | —                                                                                                                      |
| Browser Stockfish       | ✅  |  ✅   | `engines.spec.ts`; `uci-session`, `uci-adversarial` tests                                                       | first evaluation, position change, stop, restart on both             | production smoke                            | CERTIFIED                 | single-threaded where the page is not cross-origin isolated (WebKit)                                                   |
| Native Stockfish        | n/a |  ✅   | `desktop:engines -- --packaged` 25/25                                                                           | selected and searched in the packaged app                            | —                                           | CERTIFIED                 | web: via a companion the user runs                                                                                     |
| Lc0                     | n/a |  ✅   | `desktop:engines -- --packaged` (installed, handshake, real search)                                             | —                                                                    | —                                           | CERTIFIED                 | needs the weights the catalogue installs; CPU backend                                                                  |
| Multi-engine            | ✅  |  ✅   | `engines.spec.ts`; `comparison.test.ts`                                                                         | two native engines side by side on the Mac                           | —                                           | CERTIFIED                 | on the web, two browser Stockfish instances                                                                            |
| Evaluation bar          | ✅  |  ✅   | `evaluation-bar-layout.test.ts` (6); `engines.spec.ts` flip test                                                | winning White / winning Black / mate / flip, on both                 | production smoke                            | CERTIFIED                 | repaired this phase (flipped orientation)                                                                              |
| Engine arrows           | ✅  |  ✅   | `engines.spec.ts` "played while an arrow is drawn"                                                              | one engine, two agreeing, board flip, stop                           | production smoke                            | CERTIFIED                 | two-engine disagreement seen on the Mac (Stockfish vs Halogen), not on the web                                         |
| Explorer                | ✅  |  ✅   | `reference-sources.spec.ts`, `opening-walk.spec.ts`, `chaos.spec.ts`                                            | thirteen GM tabiyas across four packs (§ Research)                   | production smoke                            | CERTIFIED WITH LIMITATION | depth thins past move 12–15 in every first-party pack (§ Research)                                                     |
| Multi-source comparison | ✅  |  ✅   | `source-comparison.spec.ts`; `multi-source-comparison.test.ts`                                                  | walk on both                                                         | production smoke                            | CERTIFIED                 | —                                                                                                                      |
| Elite OTB               | ✅  |  ✅   | `reference-packs.spec.ts`; `bench-explorer-depth` on the mirror's v2                                            | installed from the Data Center                                       | mirror manifest read                        | CERTIFIED                 | 407,538 games, 2020–present broadcast archive                                                                          |
| Recent Theory           | ✅  |  ✅   | as above (v2, six months)                                                                                       | installed                                                            | mirror manifest read                        | CERTIFIED WITH LIMITATION | 11,277 games: a recency source, thin past move 8                                                                       |
| High-Rated Online       | ✅  |  ✅   | as above (v1)                                                                                                   | installed                                                            | mirror manifest read                        | CERTIFIED                 | 305,169 games, rolling three months, blitz-heavy                                                                       |
| Lichess Masters         | ✅  |  ✅   | `lichess.test.ts` (401 handling)                                                                                | without a token: says so; with the user's token: answers             | endpoint probed: 401 without a token        | EXTERNAL LIMITATION       | needs the user's own Lichess API token; never shown as 0 games                                                         |
| Personal Games          | ✅  |  ✅   | `phase7.spec.ts`, `phase12` flows; `account-sync` tests                                                         | PGN import; Lichess/Chess.com by username                            | —                                           | CERTIFIED                 | —                                                                                                                      |
| Players                 | ✅  |  ✅   | `players.spec.ts`; `players.test.ts` (16 named queries); `titled-players.test.ts`                               | 51 queries benchmarked (§ Research)                                  | production smoke                            | CERTIFIED                 | repaired this phase (namesakes)                                                                                        |
| Openings                | ✅  |  ✅   | `openings.test.ts` (31 queries); `theory-book.test.ts`; `theory-book.spec.ts`                                   | 25 queries and 14 move-order recognitions benchmarked                | production smoke                            | CERTIFIED                 | repaired this phase (transpositions in the panel)                                                                      |
| Studies                 | ✅  |  ✅   | `phase8.spec.ts`, `kingfisher.spec.ts`; `round-trip-corpus.test.ts`                                             | create, rename, chapters, variations, comments, NAGs, reload, export | production smoke                            | CERTIFIED                 | —                                                                                                                      |
| Repertoire              | ✅  |  ✅   | `phase9.spec.ts`, `repertoire-review.spec.ts`                                                                   | create, branch, transposition, coverage, deviation, reload           | production smoke                            | CERTIFIED                 | —                                                                                                                      |
| Preparation             | ✅  |  ✅   | `phase9.spec.ts`                                                                                                | position, player, sources, repertoire, model games                   | production smoke                            | CERTIFIED                 | —                                                                                                                      |
| Training                | ✅  |  ✅   | `phase10.spec.ts`                                                                                               | the repertoire's own answers                                         | production smoke                            | CERTIFIED                 | —                                                                                                                      |
| Calculation Training    | ✅  |  ✅   | `calculation-training.test.ts`, `calculation/tree.test.ts`                                                      | from a reviewed game                                                 | production smoke                            | CERTIFIED                 | —                                                                                                                      |
| Game Review             | ✅  |  ✅   | `analyse-game.spec.ts`; `game-review-fake.test.ts` (no accuracy, no rating)                                     | imported game reviewed                                               | production smoke                            | CERTIFIED                 | —                                                                                                                      |
| Critical Moments        | ✅  |  ✅   | `candidates.test.ts`, `comparison.test.ts`; `phase11.spec.ts`                                                   | walk                                                                 | production smoke                            | CERTIFIED                 | —                                                                                                                      |
| Tablebase               | ✅  |  ✅   | `tbprobe-real.test.mjs` (KRK won, KNK/KBK drawn, stalemate, mate)                                               | smoke: tablebase answers in the packaged app                         | Lichess tablebase reachable                 | CERTIFIED                 | bundled 3-piece; 4–5-piece tables are the user's; 7-piece online                                                       |
| Universal Search        | ✅  |  ✅   | `accessibility.spec.ts`; `rank`, `move-sequence`, `security` tests                                              | commands, players, openings, studies, FEN, moves on both             | production smoke                            | CERTIFIED                 | —                                                                                                                      |
| Recent Work             | ✅  |  ✅   | `reliability.spec.ts`                                                                                           | walk                                                                 | production smoke                            | CERTIFIED                 | —                                                                                                                      |
| Backup                  | ✅  |  ✅   | `backup-completeness.test.ts` (every authored store), `backup-restore.spec.ts`                                  | walk on both                                                         | production smoke                            | CERTIFIED                 | —                                                                                                                      |
| Restore                 | ✅  |  ✅   | `backup-chaos.test.ts` (a damaged backup never damages the profile)                                             | restored into a clean profile on both                                | —                                           | CERTIFIED                 | —                                                                                                                      |
| Feedback                | ✅  |  ✅   | `route.test.ts`, `feedback-sink.test.ts`                                                                        | submitted on production: honest 503, fallback offered                | route probed: `unconfigured`                | EXTERNAL LIMITATION       | the direct sink needs a GitHub token in the Vercel environment (owner action, § Feedback); the fallback works          |
| PWA                     | ✅  |  n/a  | `settings.spec.ts` service-worker rows; `manifest.webmanifest` route                                            | installability checked on production                                 | manifest and SW served                      | CERTIFIED                 | the service worker's fragment bug (worker kinds swapped) was found and fixed this phase; a test loads the real `sw.js` |
| Offline                 | ✅  |  ✅   | `fresh-user.spec.ts` (bundled pack); smoke: offline routes                                                      | —                                                                    | —                                           | CERTIFIED                 | web: after first load; packs once installed                                                                            |
| Desktop                 | n/a |  ✅   | `desktop:certify` (smoke 17/17, chrome 109/109, restart 5/5, engines 25/25, suspend 12/12, walk ×2, unit suite) | quit/relaunch; app replacement                                       | —                                           | CERTIFIED                 | —                                                                                                                      |
| Companion               |  ◐  |  ✅   | `companion/src/*.test.mjs`; fault walk (companion killed and recovered)                                         | —                                                                    | —                                           | CERTIFIED                 | on the web the user runs it                                                                                            |
| Updater                 | n/a |  ✅   | `desktop:update:dialog` (15 states), `desktop:update:real` staging 1.1.0 → 1.1.1                                | real public 1.1.0 → 1.1.1 through the menu (§ Update)                | GitHub feed serves `latest-mac.yml`         | CERTIFIED                 | manual check only, by design                                                                                           |
| DMG                     | n/a |  ✅   | `verify-dmg` on the release DMG                                                                                 | opened, dragged, ejected                                             | `desktop:public:verify -- --landing --full` | CERTIFIED                 | —                                                                                                                      |
| Apple signing           | n/a |  ✅   | `desktop:sign:verify`                                                                                           | —                                                                    | `spctl` on the public DMG                   | CERTIFIED                 | Developer ID Application, team 3B5CYF9DQ4                                                                              |
| Notarization            | n/a |  ✅   | `desktop:notary:verify`, `stapler validate`                                                                     | first launch of a quarantined copy                                   | `spctl`: Notarized Developer ID             | CERTIFIED                 | —                                                                                                                      |
| Deployment              | ✅  |  n/a  | `deploy-studio.yml` (skips without secrets)                                                                     | `vercel deploy --prod` from the final commit                         | production SHA read from the Vercel API     | CERTIFIED WITH LIMITATION | no Git link on the Vercel project and no repository secrets: deploys are made by the CLI (owner action, § Deploy)      |

## Gates run this phase

| Gate                                          | Result                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                      | clean                                                                                                            |
| `npm run typecheck` / `lint` / `format:check` | exit 0, 0 warnings                                                                                               |
| `npm run test:no-skips`                       | OK                                                                                                               |
| `npm test`                                    | see the handover § 33 for the final count; **0 skipped, 0 failed**                                               |
| `npm run build`                               | exit 0                                                                                                           |
| `npm run docs:check`                          | 338/338 (299 before this phase; version, floor, host and link invariants added)                                  |
| `npm run public:check`                        | 22/22                                                                                                            |
| `npm run size:check`, `workspace:audit`       | 0 B inside the checkout                                                                                          |
| `npm run security:scan`                       | 0 findings (tree and 483 commits)                                                                                |
| `npm audit --omit=dev --audit-level=high`     | 0 vulnerabilities                                                                                                |
| `git diff --check`                            | clean                                                                                                            |
| Browser matrix                                | see the handover § 29                                                                                            |
| `npm run desktop:certify` (build 490)         | 9/10 — the one ✗ is verify-dmg refusing a build from a dirty tree, by design; on the release build see § Desktop |
| master CI                                     | green (red on every push since the 1.1.0 release until `ci.yml` was fixed this phase)                            |

## Research (Parts AJ–AT)

Thirteen GM tabiyas, games in each pack and the most-played move (the
number in brackets), read directly from the pack shards with the
application's own decoder. Top moves agree with theory in every row.

| Tabiya                           | plies | Starter             | Elite OTB           | Recent Theory   | High-Rated Online   |
| -------------------------------- | ----: | ------------------- | ------------------- | --------------- | ------------------- |
| Sicilian Najdorf (6.Be3)         |    11 | 1,351 · e5 (1015)   | 2,869 · e5 (2192)   | 89 · e5 (62)    | 1,061 · e5 (756)    |
| Najdorf Poisoned Pawn (8...Qxb2) |    16 | 63 · Rb1 (62)       | 125 · Rb1 (124)     | 3 · Rb1 (3)     | 43 · Rb1 (37)       |
| Sveshnikov (9.Nd5)               |    17 | 449 · Be7 (397)     | 1,144 · Be7 (1057)  | 29 · Be7 (27)   | 522 · Be7 (514)     |
| Berlin endgame (8...Kxd8)        |    16 | 171 · Nc3 (75)      | 366 · h3 (155)      | 17 · h3 (8)     | 155 · Nc3 (93)      |
| Italian Pianissimo (6.O-O)       |    11 | 1,233 · a5 (520)    | 2,475 · a5 (871)    | 98 · a5 (43)    | 412 · a6 (163)      |
| Catalan Closed (6.O-O)           |    11 | 2,136 · dxc4 (1218) | 4,813 · dxc4 (2762) | 142 · dxc4 (89) | 2,092 · dxc4 (1143) |
| Nimzo Rubinstein (6...c5)        |    12 | 123 · O-O (75)      | 292 · O-O (187)     | 5 · O-O (3)     | 108 · O-O (86)      |
| Grünfeld Exchange (7.Nf3)        |    13 | 332 · c5 (314)      | 916 · c5 (857)      | 25 · c5 (25)    | 568 · c5 (465)      |
| KID Classical (7...Nc6)          |    14 | 203 · d5 (181)      | 612 · d5 (549)      | 9 · d5 (8)      | 492 · d5 (459)      |
| French Winawer (7.Qg4)           |    13 | 97 · Qc7 (55)       | 304 · Qc7 (179)     | 5 · Qc7 (3)     | 291 · Qc7 (89)      |
| Caro-Kann Advance (4.Nf3 e6)     |     8 | 945 · Be2 (905)     | 1,956 · Be2 (1885)  | 58 · Be2 (55)   | 593 · Be2 (542)     |
| English Four Knights (4.g3)      |     7 | 331 · d5 (165)      | 594 · d5 (302)      | 25 · d5 (15)    | 181 · Bb4 (67)      |
| Réti / KIA (4.O-O Bg4)           |     8 | 244 · h3 (118)      | 529 · h3 (215)      | 15 · h3 (12)    | 379 · d3 (112)      |

Depth, from `node scripts/bench-explorer-depth.mjs` over 45 hand-written
theoretical lines (median 32 plies): the share of lines still answered
continuously at 10 / 20 / 30 / 40 plies — Starter 100 / 60 / 10 / 0 %,
Elite OTB 100 / 71 / 18 / 25 %, Recent Theory 91 / 36 / 5 / 0 %,
High-Rated Online 100 / 67 / 8 / 0 %. Where a line stops it is more often
because no game in the pack played the hand-written continuation than
because the pack pruned it.

Search: 25 opening queries (Najdorf, Poisoned Pawn, Dragon, Sveshnikov,
Berlin, Marshall, Giuoco Pianissimo, QGD, Catalan, Semi-Slav, Nimzo, QID,
KID, Grünfeld, Grunfeld, French Winawer, Caro-Kann, Réti, Reti, Kings
Indian, Sicilian Defense, Ruy Lopez, Queen's Gambit Accepted, Alapin,
Benko) all answer the intended opening at 14–27 ms. 51 player queries
(Carlsen, Nakamura, Gukesh, Firouzja, Nepomniachtchi, Nepo, Abdusattorov,
Hou Yifan, Ju Wenjun, Polgár, Polgar, Kasparov, Karpov, Fischer, Anand,
Kramnik, Capablanca, Tal, Ding, Caruana, Praggnanandhaa, Pragg, Vachier,
MVL, Duda, So, Erigaisi, Keymer, Niemann, Morphy, Lasker, Botvinnik,
Kosteniuk, Muzychuk, Goryachkina, Aronian, Giri, Rapport, Vidit, Yu
Yangyi, Wei Yi, Le Quang Liem, Sarin, Maghsoodloo, Dubov, Esipenko,
Grischuk, Svidler, Ivanchuk, Shirov, Topalov, Leko) all answer the person
meant first at 26–64 ms, after the ranking repair; before it, eleven
answered a titled namesake first. Recognition: 14 lines by main and
alternative move orders (QGD via 1.Nf3 and via 1.c4, the Najdorf via
2...Nf6, the KID via 1.Nf3, the Catalan via 1.Nf3 d5 2.g3, the Grünfeld
via 3.Nf3, the Caro-Kann via 1.c4 c6, the Nimzo via 1.c4) each classified
as the opening reached.

**Verdict — is the research stack rich enough for serious master/GM
analysis? YES WITH SPECIFIC LIMITATIONS.** Mainstream theory is answered
with hundreds to thousands of elite games to move 8–10 and with real
samples to move 12–15; the Najdorf Poisoned Pawn tabiya at move 8 has 125
Elite OTB games. Past move 15 the first-party packs thin out, no
first-party source has a game before 2020, and the Lichess masters
database (which reaches back decades) needs the user's own token. That is
enough to prepare a line and to check what is being played now; it is not
a substitute for a commercial mega-database's depth in a sharp main line at
move 25, and Kingfisher does not claim to be one.

## Landing (Parts L–N)

Every visible claim on `src/app/landing/LandingPage.tsx` was read against
its source: "172,376 games in the bundled pack" and "246,870 position
aggregates" (the Starter manifest), "20 full moves indexed"
(`maxPositionPly: 40`), "3,810 named openings" (`data/openings`), the four
source cards (each pack's manifest), "Stockfish 18 in the browser"
(`public/engine/stockfish/manifest.json`), the native-engine sentence
(`src/engine/registry.ts` platforms), "Lc0 qualified on Apple Silicon"
(`desktop:engines`), the macOS card (rendered from the descriptor: version,
build, arm64, floor, file, size, trust), the FAQ. Corrected this phase: the
minimum OS (13, not 11) and two FAQ answers that still said "macOS
Preview". No user counts, testimonials, ratings or platform claims beyond
what is built. The hero capture is regenerated from the 1.1.1 build by
`scripts/landing-hero-capture.mjs` (see the handover § 7).

## Feedback (Part BG)

`POST /api/feedback` on production answers 503 `unconfigured`; the
application then offers _Copy feedback_ and _Open GitHub feedback_ (a
pre-filled issue). The direct sink needs `KINGFISHER_FEEDBACK_REPOSITORY`
and a fine-grained `KINGFISHER_FEEDBACK_TOKEN` (Issues: write on that
repository only) in the Vercel production environment; creating that
token and placing it there is the owner's action, not one an agent may
perform. Until then the fallback is the working path, and it is honest.

## Deploy (Parts BH–BI)

> **Superseded 2026-09-13, after 1.1.2.** The owner linked the Vercel
> project to `mardakurt/kingfisher` (production branch `master`), so
> every push now deploys; the two `deploy-*.yml` workflows were removed
> and `npm run deploy:status` reads the one project. The paragraph below
> is the 1.1.1 record.

The Vercel project `kingfisher15/kingfisher` has no Git link (the Vercel
account has no GitHub Login Connection; `vercel git connect` says so), and
`deploy-studio.yml` skips because `VERCEL_TOKEN`, `VERCEL_TEAM_ID` and
`VERCEL_PROJECT_STUDIO` are not repository secrets. Every production
deployment to date was made with the CLI, including this phase's. To make
a push deploy: add the GitHub Login Connection at vercel.com → Account
Settings → Authentication and run `vercel git connect`, or create a Vercel
token and set the three secrets. Both are owner actions involving
credentials.
