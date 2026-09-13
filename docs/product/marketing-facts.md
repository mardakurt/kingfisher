# Marketing facts

Not marketing copy. The list of factual claims about Kingfisher that
have been certified and may be used in marketing, each with the check
behind it. A claim that is not on this list has not been certified;
do not make it. When the product changes, change the fact here first
(and the row in [`public-claims.md`](public-claims.md)), then the copy.

Last certified in Phase 49 (2026-09-13),
[`final-certification.md`](final-certification.md).

## The product

| You may say                                                          | Because                                                                                                                                                                                         |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A local-first chess research workstation for serious players.        | Studies, repertoire, training, review, settings and imported games live in the browser's own storage or the Mac profile; nothing is uploaded. `src/persistence/`; network observed in Phase 49. |
| No account required. No sign-up.                                     | There is no account surface anywhere in the application.                                                                                                                                        |
| No telemetry, no analytics, no tracking, no cookies.                 | `default-src 'self'` CSP; no third-party script; production network observed: only the engines, reference data and Lichess/Chess.com calls the user asked for.                                  |
| No subscription. Free. Open source under the MIT licence.            | `LICENSE`; no billing surface.                                                                                                                                                                  |
| Runs in the browser and as a Mac application — the same application. | The Mac shell serves the same Next.js build; `docs/product/platform-parity.md`.                                                                                                                 |

## Engines

| You may say                                                                                         | Because                                                                                                            |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Stockfish 18 runs in the browser, no install.                                                       | `src/engine/stockfish/`; `engines.spec.ts`; multithreaded where the page is cross-origin isolated.                 |
| On Apple Silicon: native Stockfish, Stormphrax, Viridithas, Halogen, PlentyChess and Lc0.           | `src/engine/registry.ts` platforms; `npm run desktop:engines -- --packaged` (every engine installed and searched). |
| Every engine download is verified against a recorded SHA-256.                                       | `scripts/install-engines.mjs`, the catalogue digests.                                                              |
| Two engines side by side, never blended into one number.                                            | `src/features/engine/EngineComparison.tsx`; the evaluation bar follows the first engine only.                      |
| Best-move arrows and an evaluation bar that says which side is better, in either board orientation. | `evaluation-bar-layout.test.ts`; `engines.spec.ts` flip test.                                                      |

Do not say: "sandboxed native engines" (they run with the user's own
permissions), "the strongest engine", or any Elo figure.

## Research data

| You may say                                                                                                  | Because                                                                                        |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 172,376 recent elite over-the-board games ship inside the application and work offline.                      | `public/reference/kingfisher-starter/manifest.json` (Lichess broadcast archive, CC BY-SA 4.0). |
| Elite OTB: 407,538 title- and rating-filtered broadcast games since 2020, installable on demand.             | `reference-elite-v2/manifest.json` on the data mirror.                                         |
| High-Rated Online: 305,169 Lichess games, both players 2400+, classical/rapid/blitz, a rolling three months. | `reference-online-v1/manifest.json`.                                                           |
| Recent Theory: the last six broadcast months at a 2400+ threshold, 11,277 games.                             | `reference-recent-v2/manifest.json`.                                                           |
| Sources are compared side by side with their own game counts and licences; they are never merged.            | `source-comparison.spec.ts`; `AGENTS.md`.                                                      |
| 3,810 named opening positions with ECO codes, from the CC0 lichess-org/chess-openings dataset.               | `data/openings/SOURCE.md`; `theory-book.test.ts`.                                              |
| A roster of 8,339 titled players (GM, WGM, IM, WIM) from Wikidata, plus 106 curated historical figures.      | `public/data/players/titled-players.manifest.json`; `src/reference/legends.ts`.                |
| The Lichess masters database is available as a further source with your own Lichess API token.               | `src/database/providers/lichess.ts`; the endpoint answers 401 without one.                     |
| A bundled three-piece Syzygy tablebase; larger tables are yours to supply; the Lichess tablebase online.     | `companion/fixtures/syzygy-3/`; `tbprobe-real.test.mjs`; `src/tablebase/lichess.ts`.           |

Do not say: "millions of games", "the whole of chess history" (nothing
before 2020 in a first-party source), or compare the size to a
commercial database.

## Workflow

| You may say                                                                              | Because                                                                                |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Studies with chapters, variations, comments, NAGs and arrows, PGN in and out.            | `src/features/studies/`; `round-trip-corpus.test.ts`; `phase8.spec.ts`.                |
| A repertoire keyed by position, so a transposition is the same position.                 | `positionKey()`; `phase9.spec.ts`.                                                     |
| Repertoire training that asks what _you_ decided to play.                                | `src/training/`; `phase10.spec.ts`.                                                    |
| Game Review: critical moments, candidates, evidence, calculation training.               | `src/features/review/`; `analyse-game.spec.ts`. No accuracy score, no rating estimate. |
| Universal search (⌘K) over commands, players, openings, studies, FEN and move sequences. | `src/features/search/`; `accessibility.spec.ts`.                                       |
| Backup and restore as one JSON file; a damaged backup never damages the profile.         | `src/persistence/backup.ts`; `backup-restore.spec.ts`.                                 |
| Work survives a reload, a quit and an update.                                            | `reliability.spec.ts`; `desktop:restart`; `desktop:update:real`.                       |

Do not say: "AI coach", "personalised training plan", "accuracy",
"estimated rating".

## The Mac application

| You may say                                                                  | Because                                                                                                                 |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Signed with an Apple Developer ID certificate and notarised by Apple.        | `npm run desktop:public:verify -- --landing --full` on the public DMG; `spctl` accepted, source=Notarized Developer ID. |
| Opens with a normal double-click; no right-click workaround.                 | The install guide; the assessment above.                                                                                |
| Apple Silicon (arm64), macOS 13 (Ventura) or later.                          | `desktop/src/platform-floor.mjs` — Electron 44's own floor.                                                             |
| Checks for updates only when you ask, and keeps your work through an update. | `desktop/src/update-service.mjs` (no poller); `desktop:update:real`; the public 1.1.0 → 1.1.1 update in Phase 49.       |
| Native engines and SQLite databases with nothing else to install.            | The shell starts and pairs its own companion; `desktop:smoke`.                                                          |

Do not say: "Apple approved", "Apple certified", "App Store", "Windows",
"Linux", "Intel Mac", "auto-update" (nothing updates without a click).

## Numbers that are not facts

There are no user counts, download counts, ratings, testimonials,
awards, or named users. None is tracked; none may be invented.
