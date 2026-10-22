# Public claims

## Web additions after 1.5.3 (2026-10-22)

README, CHANGELOG and the privacy page say a browser keeps any number of
game collections beside My games, reads an En Croissant database from a
chosen file, imports PGN files of any size, and keeps collections on that
browser (not in the account; in a backup only with games). Implementations:
`persistence/browser-collections.ts`, `database/collections/registry.ts`,
`database/providers/browser-collections.ts`,
`database/encroissant/sqlite-read.ts` and `browser-reader.worker.ts`,
`persistence/pgn-chunks.ts`. Evidence: `browser-collections.test.ts`,
`sqlite-read.test.ts` (row for row against the companion's reader),
`pgn-chunks.test.ts`, `e2e/browser-only.spec.ts`. Limits stated, not hidden:
En Croissant files above 1 GB need the companion (sql.js holds the file in
memory); native engines other than Stockfish 18 and local Syzygy files still
need it. Collections sync only with _Sync My games and collections_ on
(`sync/cloud/collections-source.ts`, additive, newest 2,000 across them);
never claim every engine runs in a browser.

## 1.4.6 source additions

README describes databases in the sidebar, a game header with players'
photographs and flags, a database's openings, top games, annotators, sources
and teams, opening families in Preparation, frequent players in companion
databases and figurine notation. Implementations:
`features/shell/SidebarDatabases.tsx`, `features/movetree/GameHeaderCard.tsx`,
`features/player/CountryFlag.tsx`, `database/collections/collection-index.ts`,
`features/databases/CollectionTagsSection.tsx`,
`features/preparation/PreparationReport.tsx`, `companion/src/database.mjs`
(`#withFrequentPlayers`, `tagKeys`) and `features/movetree/use-san-display.tsx`.
Flags are the roster's country of citizenship, not federation. Companion
frequent players stop at 100,000 games per position and say so. No claim of
ChessBase parity, of Mega Database-scale data or of accounts is made.

## 1.4.5 source additions

README describes local video lessons with timed board cues, recorded PGN
metadata filters and frequent movers in My games. Implementations:
`features/studies/VideoLesson.tsx`, `chess/tree/video-cues.ts`,
`features/games/SearchMask.tsx`, `search/game-scan.ts` and
`database/local-aggregate.ts`. Video bytes stay local and outside backups;
only filename and cues are portable. Frequency counts are source-specific
distinct games. These are not claims of Fritztrainer compatibility, a
licensed video catalogue, complete reference player lists or ChessBase parity.

A register of the meaningful claims the public surface
(marketing site, README, install guide, security page) makes
about Kingfisher. Each claim records the wording on the
public surface, where it appears, and the implementation
that backs it.

The point of this file is to make a public-statement change
**deliberate**. The implementation may evolve; the claim
should not silently outrun the code.

When you change one of the claims below, change **both** the
wording on the surface **and** the entry in this file. When
you change the implementation, look for the claim that needs
to follow.

## Product identity

| Claim                                                                                                          | Where it appears                                     | Backed by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kingfisher is a local-first chess research workstation.                                                        | Landing hero, README lede, install guide             | `src/persistence/`, the `local-first` section of the landing, the security policy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| The current public macOS release is Kingfisher 1.5.4.                                                          | Landing download card, README, install guide         | `src/release/macos-download.json` names the exact public release build, SHA-256 and trust state. The descriptor changes only after publication and byte verification.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| The web source is Kingfisher 1.5.4.                                                                            | Security page, SECURITY.md                           | `package.json` names the source version deployed from master. It may be ahead of the public macOS download during release preparation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| The macOS build needs macOS 13 (Ventura) or later.                                                             | Landing download card, install page, install guide   | `desktop/src/platform-floor.mjs` — Electron 44's own floor, read from its plist by `platform-floor.test.mjs`; the descriptor's `minimumMacOS`; `docs:check` compares the documents to it. **Not** macOS 11, which the 1.1.0 release page and bundle stated.                                                                                                                                                                                                                                                                                                                                                                                       |
| The supported desktop platform is Apple Silicon.                                                               | Landing download card, install guide, README         | `npm run desktop:smoke` is run on darwin-arm64; `vercel.json` does not deploy a desktop artefact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| The supported desktop architecture is arm64.                                                                   | Install guide, landing download card                 | `desktop/electron-builder.yml` builds `arm64` only; `desktop/src/builder-config.test.mjs` pins it; the descriptor records `arm64`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| No account is required.                                                                                        | Landing hero strip, install guide, README, privacy   | Every feature works signed out. Optional accounts (`src/sync/cloud/`, `src/features/account/`) are additive; `src/release/public-services.json` records that the public site offers them (Supabase, Seoul) and `docs:check` holds SECURITY.md and the privacy page to it. Do not write "no account exists" or "no server".                                                                                                                                                                                                                                                                                                                        |
| Signed-in work follows you to every device.                                                                    | Landing FAQ and local-first section, README, privacy | `src/sync/cloud/sync-engine.ts`; two-device behaviour in `sync-engine.test.ts` (real migration in PGlite) and `e2e/account-sync.spec.ts`; a live round trip on the production project recorded in `docs/product/2026-10-15-overhaul-report.md` §8. Imported game collections and reference packs do not sync — never claim they do — except My games when the person switches on _Sync My games and collections on this device_ (newest 2,000, additive, per device, and with it the browser collections' newest 2,000; `src/sync/cloud/games-source.ts`, `collections-source.ts`, `sync-engine.test.ts` "My games", `e2e/account-sync.spec.ts`). |
| No cookies, no cross-site tracking; page views are counted.                                                    | Landing, README, privacy, security                   | CSP in `vercel.json` is `default-src 'self'`; the only measurements are Vercel Web Analytics and Speed Insights from this origin (`src/app/_analytics/WebAnalytics.tsx`: query strings stripped, rendered only on Vercel builds), disclosed in full on the privacy page.                                                                                                                                                                                                                                                                                                                                                                          |
| Feedback goes to the site's own server, which forwards it to ntfy.sh today; the browser sends it nowhere else. | Privacy page (_Feedback_), `docs/legal/privacy.md`   | `src/app/api/feedback/route.ts` forwards to `https://ntfy.sh/<topic>` when `KINGFISHER_FEEDBACK_NTFY_TOPIC` is set; it is set in production (checked with `vercel env ls production`, 2026-09-27, name only)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| No subscription.                                                                                               | Landing, README, launch kit                          | There is no billing surface; the application has no subscription state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Capabilities

| Claim                                                                                                                                                                                        | Where it appears                                                  | Backed by                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stockfish 18 in the browser, lite or full network.                                                                                                                                           | Landing, README, install guide                                    | `src/engine/stockfish/`; the lite build is served from the application's own origin; the full network is web-only and is fetched by the browser from its recorded address on `unpkg.com`, held to a recorded SHA-256 (`docs/ENGINES.md`, `/privacy`).                                                                                                               |
| Native engines on Apple Silicon: Stockfish, Stormphrax, Viridithas, Halogen, PlentyChess and Lc0.                                                                                            | Landing, README, terms                                            | `src/engine/registry.ts` (each entry's `platforms`); `docs/ENGINES.md` lists the catalogue. Berserk, Koivisto and Obsidian are catalogued for Windows/Linux only and must not be named as macOS engines.                                                                                                                                                            |
| Universal Search (`Cmd/Ctrl+K`).                                                                                                                                                             | README                                                            | `src/features/command/CommandPalette.tsx` with `src/features/search/` (players, openings, move sequences, ranking); `src/features/shell/Sidebar.tsx` (the palette's entry point).                                                                                                                                                                                   |
| Bundled Kingfisher Starter (~206,451 games).                                                                                                                                                 | Landing, install guide, README                                    | `public/reference/kingfisher-starter/manifest.json`; the bundled pack is a static asset.                                                                                                                                                                                                                                                                            |
| Optional reference packs (Elite OTB, Recent Theory, Recent Theory 6 months, High-Rated Online, High-Rated Rapid & Classical).                                                                | Landing, install guide, README                                    | `src/reference/catalog.ts`; pack manifests under `docs/data/data-inventory.md`.                                                                                                                                                                                                                                                                                     |
| Position aggregates indexed through twenty full moves.                                                                                                                                       | README                                                            | `docs/data/reference-packs.md`; the explorer depth benchmark in `scripts/bench-explorer-depth.mjs`.                                                                                                                                                                                                                                                                 |
| 3,810 named positions / ECO codes.                                                                                                                                                           | Landing, README                                                   | `data/openings/{a,b,c,d,e}.tsv` (CC0 lichess-org/chess-openings dataset).                                                                                                                                                                                                                                                                                           |
| Local Syzygy tablebase (3-piece bundled, 4- and 5-piece user-supplied).                                                                                                                      | Install guide, README                                             | `companion/fixtures/syzygy-3/`; `companion/src/tbprobe-real.test.mjs`.                                                                                                                                                                                                                                                                                              |
| Lichess and Chess.com integration.                                                                                                                                                           | Install guide, README                                             | `src/database/providers/lichess.ts` (explorer, with the user's own token), `src/sync/chess-com-sync.ts` and `src/stores/account-sync-store.ts` (games pulled by username).                                                                                                                                                                                          |
| Backup / restore.                                                                                                                                                                            | Install guide, README                                             | `src/persistence/backup.ts`; the documented flow is _Settings → Database → Export_.                                                                                                                                                                                                                                                                                 |
| Continue card / recent work restored after quit.                                                                                                                                             | README                                                            | `src/features/recent/RecentWorkspace.tsx`; `src/persistence/`.                                                                                                                                                                                                                                                                                                      |
| `kingfisherchess.app/studio` opens the application, and a browser that has used it before is offered _Continue in Studio_.                                                                   | Landing hero, `docs/product/studio-access.md`                     | `next.config.ts` (a permanent `/studio` → `/analysis` redirect, query preserved); `src/features/shell/studio-entry.ts` is the rule and `src/app/landing/StudioEntry.tsx` the affordance; `e2e/studio-entry.spec.ts` and `src/features/shell/studio-entry.test.ts`. A first visit — and a crawler, which has no storage — sees the landing exactly as published.     |
| The landing remembers a visit only in this browser, only after the Studio has been opened, and only if the visitor asks it to.                                                               | Landing (_Open the Studio straight away next time_), privacy page | `src/features/shell/studio-entry.ts`: two `localStorage` keys on this origin, `kingfisher.studio.visited` (written by `AppShell` on mount) and `kingfisher.landing.auto-open-studio` (written only by the checkbox, cleared by unticking or `/?stay`). No cookie, no server-side record, nothing to identify a person by. A first landing visit writes neither key. |
| The opening map draws the next three moves at once, each branch as wide as it was played and shaded by how it scored; a click plays the line. Preparation draws it from an opponent's games. | Landing (Research, Coming from ChessBase?), CHANGELOG             | `src/database/opening-map.ts` and `src/preparation/opening-map.ts` (with their tests); `src/features/explorer/OpeningMapSection.tsx`, `OpeningMapView.tsx`; `e2e/opening-map.spec.ts` and the preparation test in `e2e/workspace-tabs.spec.ts`. Offered only for sources on this machine, which the section says.                                                   |

## Limitations that must remain visible

These are not claims to drop. They are the truthful limits of
the product and the install guide and the security page must
keep stating them.

| Limitation                                                                                                                    | Where it appears                | Truth source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The macOS build is signed with Developer ID and notarised by Apple.                                                           | Landing, install guide, README  | `src/release/macos-download.json` records `notarized: true`; `npm run desktop:public:verify -- --full` downloads the public DMG and checks the identity and the stapled ticket; `npm run docs:check` fails if a canonical document disagrees with the descriptor. The certificate and the notary credentials exist since 2026-09-12 (`docs/release/apple-developer-id-setup.md`).                                                                                                                                                             |
| Check for Updates is manual apart from one quiet look at launch; the public 1.0.0 cannot update itself.                       | Install guide, security         | `desktop/src/update-service.mjs`: the engine is Sparkle, with `SUEnableAutomaticChecks` and `SUAllowsAutomaticUpdates` false (`desktop/src/sparkle-bundle.mjs` gates every bundle on it); one information-only check runs after launch and downloads nothing; 1.0.0 predates the updater and is signed with a different identity, so it is replaced by hand. `npm run desktop:update:real` performed a real update between two packaged builds through Sparkle's own window, and from the public 1.1.7 (electron-updater) to a Sparkle build. |
| Windows, Linux and Intel Macs are not built and not supported.                                                                | README                          | `desktop/electron-builder.yml` targets macOS arm64 only (`builder-config.test.mjs` pins it); `npm run desktop:smoke` is run on macOS only. The web application runs in any modern browser on those platforms.                                                                                                                                                                                                                                                                                                                                 |
| Sync covers authored work and settings, not imported games (unless _Sync My games and collections_ is on) or reference packs. | README, security, privacy       | `src/sync/cloud/scope.ts` (`SYNCED_STORES`, `DEVICE_ONLY_STORES`), `games-source.ts` (opt-in, newest 2,000, additive). Never say a whole game database syncs.                                                                                                                                                                                                                                                                                                                                                                                 |
| No games before 2020 in any first-party reference.                                                                            | README, landing                 | `scripts/reference/packs.mjs` filter; the Lichess broadcast archive begins in 2020.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Chess960 is not supported.                                                                                                    | README                          | `src/chess/` rules code is standard-chess only; ADR 0047.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Local Syzygy through 3 pieces bundled; 4- and 5-piece user-supplied.                                                          | Install guide                   | `companion/fixtures/syzygy-3/` exists; the rest is the user's.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Managed native engines are not sandboxed.                                                                                     | Install guide, security, README | The Settings → Engine dialog states this; the engines run with the user's OS permissions.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Apple notarisation is automated security/signing review, not App Store review.                                                | Security, privacy               | `notarytool` is an Apple-controlled service, not a product endorsement. The public claim may say "Developer ID signed and notarised by Apple" — never "Apple approved" or "Apple certified."                                                                                                                                                                                                                                                                                                                                                  |

## Things that must NOT be claimed

The following are not true of Kingfisher today. They are the
shape of the trap door; if a future change makes one true,
update this section and the public surface together.

- "Your whole database syncs" — sync carries authored work and
  settings, and imported games only when _Sync My games and collections on this
  device_ is on (the newest 2,000). Reference packs never sync.
- "Apple approved" or "Apple certified" — those are App Store
  review outcomes. When a release is notarised, the claim is
  **Developer ID signed** and **notarised by Apple**;
  notarisation is an automated security check, not a product
  endorsement.
- "macOS is signed and notarised" — true of 1.1.0 and later, and
  only because `macos-download.json` records `notarized: true`,
  which the release process writes after `npm run
desktop:notary:verify` passes against the published bytes. It
  is not true of the 1.0.0 preview.
- "Auto-update" — nothing is downloaded or installed without a
  click; the one request that runs without one is the quiet,
  information-only look at launch. The 1.0.0 preview never updates
  itself.
- "Windows / Linux support" — the desktop build is neither made
  nor run there. The web build is, of course; the claim would be
  about the desktop.
- "Intel Macs are supported" — only arm64 is built and
  qualified.
- "1,000,000-game offline database" — the bundled pack is
  ~172k games. The optional packs are larger but require an
  install action.
- "AI coach" / "personalised training" — the Training feature
  helps you organise your study; it does not coach.
- Testimonials, ratings, "used by GMs", download counts, user
  counts, awards — none of these are tracked; do not invent.
- A team, a photo, an address, a phone number — there is no
  company; do not invent one.
- "More secure than X" — say what controls exist (CSP, COOP,
  COEP, SHA-256 verification, `contextIsolation`, etc.) rather
  than a comparative claim.
- A `_private_` mail address for security reports — the public
  reporting path is the GitHub Security Advisory flow; do not
  invent an inbox that does not exist.

## What the implementation looks like

The single source of public product facts is
`src/release/public-urls.ts`. The list of supported versions
is `package.json#version` plus the `release-manifest.json`.
The list of public claims is the table above; do not duplicate
it elsewhere in the public tree.

The `npm run docs:check` script verifies the constraints in
this file and the related ones in
[`docs/operations/search-console.md`](../operations/search-console.md).

The install page's damaged-download troubleshooting follows the descriptor-backed
first-launch instructions: verify the hash, re-download mismatched bytes, and
report a failure with verified bytes. It does not recommend a right-click
workaround for the notarised release (`src/app/install/InstallPage.test.tsx`).

Opening surveys in source 1.4.1 are bounded, source-labelled recorded practice.
PGN export preserves game counts and limits; it is not a best-move or complete
theory claim. Opening Report Markdown retains each section’s provenance and
unavailable evidence. The public Mac release became 1.4.1 build 1025 on 2026-10-03.

Follow-up preparation saves selected survey paths and questions into portable
chapters. Large imports can write new compact collections in user-chosen
folders, apply PGN header filters and verify supplied checksums. Incremental
imports log new IDs transactionally for rollback; source ledgers state observed
annotation coverage without asserting expert authorship. Recent-source inbox
checks cover at most 40 positions. Playout seeds/checkpoints are exported with
reported engine identity and requested parameters; a seed cannot make
wall-clock engine searches bit-for-bit reproducible. A new 10M run, independent
ChessBase acceptance and thousands of expert annotations remain unverified.

## Credited classic game scores (source 1.4.7)

The Databases catalog offers 100 complete famous games and championship classics,
added only on request. The set has 21 named classics and 79 title-match games;
it is not a measured popularity ranking. Every score retains its exact
Wikimedia revision and CC BY-SA 4.0, with no modern commentary or images.
Evidence: `scripts/reference/classics-sources.json`, `npm run annotated:check`,
`src/annotated/classics.test.ts` and `e2e/annotated-sets.spec.ts`. The 14-game
public-domain Capablanca annotated collection remains separate.
