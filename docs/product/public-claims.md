# Public claims

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

| Claim                                                                                    | Where it appears                                   | Backed by                                                                                           |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Kingfisher is a local-first chess research workstation.                                  | Landing hero, README lede, install guide           | `src/persistence/`, the `local-first` section of the landing, the security policy.                  |
| The current public release is Kingfisher 1.0 (web) and Kingfisher 1.0.0 (macOS Preview). | Landing download card, README, install guide       | `package.json` (`"version": "1.0.0"`), `release-manifest.json`, the GitHub release page.            |
| The supported desktop platform is Apple Silicon.                                         | Landing download card, install guide, README       | `npm run desktop:smoke` is run on darwin-arm64; `vercel.json` does not deploy a desktop artefact.   |
| The supported desktop architecture is arm64.                                             | Install guide, landing download card               | The current DMG is `Kingfisher-1.0.0-arm64.dmg`; `desktop/package.json` does not list an x64 build. |
| No account is required.                                                                  | Landing hero strip, install guide, README, privacy | There is no sign-in surface; `src/features/shell/` has no account module.                           |
| No telemetry, no analytics.                                                              | Landing, README, privacy, security                 | CSP in `vercel.json` is `default-src 'self'`; no third-party script is loaded.                      |
| No subscription.                                                                         | Landing, README, launch kit                        | There is no billing surface; the application has no subscription state.                             |

## Capabilities

| Claim                                                                          | Where it appears               | Backed by                                                                                           |
| ------------------------------------------------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| Stockfish 18 in the browser.                                                   | Landing, README, install guide | `src/engine/stockfish/`; the WASM build is loaded from the application's own origin.                |
| Native engines on macOS (Stockfish, Berserk, Halogen, Koivisto, Lc0 and more). | Landing, README                | `src/engine/manager.ts`; `docs/ENGINES.md` lists the catalogue.                                     |
| Universal Search (`Cmd/Ctrl+K`).                                               | README                         | `src/features/shell/Sidebar.tsx` (search palette); `src/features/shell/navigation.ts`.              |
| Bundled Kingfisher Starter (~172,376 games).                                   | Landing, install guide, README | `public/reference/kingfisher-starter/manifest.json`; the bundled pack is a static asset.            |
| Optional reference packs (Elite OTB, Recent Theory, High-Rated Online).        | Landing, install guide, README | `src/reference/catalog.ts`; pack manifests under `docs/data/data-inventory.md`.                     |
| Position aggregates indexed through twenty full moves.                         | README                         | `docs/data/reference-packs.md`; the explorer depth benchmark in `scripts/bench-explorer-depth.mjs`. |
| 3,810 named positions / ECO codes.                                             | Landing, README                | `data/openings/{a,b,c,d,e}.tsv` (CC0 lichess-org/chess-openings dataset).                           |
| Local Syzygy tablebase (3-piece bundled, 4- and 5-piece user-supplied).        | Install guide, README          | `companion/fixtures/syzygy-3/`; `companion/src/tbprobe-real.test.mjs`.                              |
| Lichess and Chess.com integration.                                             | Install guide, README          | `src/features/account/lichess/`, `src/features/account/chesscom/`.                                  |
| Backup / restore.                                                              | Install guide, README          | `src/persistence/backup.ts`; the documented flow is _Settings → Database → Export_.                 |
| Continue card / recent work restored after quit.                               | README                         | `src/features/shell/RecentWork.tsx`; `src/persistence/`.                                            |

## Limitations that must remain visible

These are not claims to drop. They are the truthful limits of
the product and the install guide and the security page must
keep stating them.

| Limitation                                                                              | Where it appears                | Truth source                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS Preview 1.0.0 is code-signed but not notarised.                                  | Landing, install guide, README  | The 1.0.0 build identity is a development certificate, no Developer ID. The 1.1.0 line is Developer ID signed and notarised by Apple.                                                                                              |
| 1.1.0 has in-app auto-update with explicit user consent.                                | Install guide, security         | `desktop/src/kingfisher-updater.mjs` and `desktop/src/update-service.mjs`; the menu and the dialog both walk through the chain.                                                                                                    |
| Windows and Linux build but are unsupported.                                            | README                          | `npm run desktop:smoke` is run on macOS only.                                                                                                                                                                                     |
| No cross-device Sync.                                                                   | README, security, privacy       | There is no Sync module; the supported way to move work is the backup flow.                                                                                                                                                       |
| No games before 2020 in any first-party reference.                                      | README, landing                 | `scripts/reference/packs.mjs` filter; the Lichess broadcast archive begins in 2020.                                                                                                                                               |
| Chess960 is not supported.                                                              | README                          | `src/chess/` rules code is standard-chess only; ADR 0047.                                                                                                                                                                         |
| Local Syzygy through 3 pieces bundled; 4- and 5-piece user-supplied.                    | Install guide                   | `companion/fixtures/syzygy-3/` exists; the rest is the user's.                                                                                                                                                                    |
| Managed native engines are not sandboxed.                                               | Install guide, security, README | The Settings → Engine dialog states this; the engines run with the user's OS permissions.                                                                                                                                         |
| Apple notarisation is automated security/signing review, not App Store review.          | Security, privacy               | `notarytool` is an Apple-controlled service, not a product endorsement. The public claim may say "Developer ID signed and notarised by Apple" — never "Apple approved" or "Apple certified."                                        |

## Things that must NOT be claimed

The following are not true of Kingfisher today. They are the
shape of the trap door; if a future change makes one true,
update this section and the public surface together.

- "Cross-device Sync" — there is no Sync. Saying there is,
  even obliquely, would mislead users about what the product
  does.
- "Apple approved" or "Apple certified" — those are App Store
  review outcomes. Kingfisher is **Developer ID signed** and
  **notarised by Apple**; notarisation is an automated
  security check, not a product endorsement.
- "macOS is signed and notarised" — true for 1.1.0 once the
  release gate passes. If the build predates the gate, do
  not claim it.
- "Windows / Linux support" — the desktop build is not run
  there. The web build is, of course; the claim would be about
  the desktop.
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
