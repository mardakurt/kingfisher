# Kingfisher changelog

The user-facing changelog. Internal phase history is in
`docs/reports/` and `docs/product/phase-*.md`; the list below is what
real users notice.

## 1.0.0 — public stable release

The first stable public release of Kingfisher. The web application is
production-stable; the macOS desktop application is signed and ships as
a **Preview** until notarization is available. The landing page now
serves at the production web origin (`https://kingfisher-chess.vercel.app/`)
and the studio is one click away.

### What is in this release

- **Web is stable.** Production deployment at
  <https://kingfisher-chess.vercel.app/>. The landing page is the
  first surface; the studio is one click in. Starter, Stockfish,
  Opening Explorer, Players, Databases, Studies, Repertoire, Settings
  — all working.
- **macOS is Preview.** Apple Silicon DMG (`Kingfisher-1.0.0-arm64.dmg`),
  code-signed, checksum published. Not notarized yet — see the
  installation guide for the right-click / Open path.
- **Reference data is published.** Elite OTB (407,538 games), Recent
  Theory (44,200 games), and High-Rated Online (305,169 games) all
  install from the public data mirror. Kingfisher Starter (172,376
  games) ships with the application.
- **No account, no telemetry, no subscription.** MIT-licensed source.

### What users notice

- A landing page that is informative and direct: what Kingfisher is,
  why it is different, how to launch the web app, how to install
  macOS, where the source lives.
- A one-click path from landing → web app.
- The web app works in a fresh private profile. Studies, repertoire
  and preferences persist across reloads.
- The macOS binary still works on Apple Silicon and survives
  quit / relaunch with all user data intact.
- GitHub issues and discussions are the public support channel; the
  in-app diagnostic report redacts OAuth tokens and personal paths.

## 1.0.0-rc.5 — public preview live

The web application and landing page are now public. This release adds a real
`/settings` deep link, points every current entry point at the production web
origin, and tightens the public-release security and deployment checks.

The macOS preview remains Apple Silicon-only and not notarized. Its release
artifact is signed, checksum-published, and validated on macOS.

## 1.0.0-rc.4 — public preview release

The first public release of Kingfisher. The product is on the web and
on macOS, the public landing page is live, and the optional reference
data is published.

### What is in this release

- **Public landing page.** A single, calm, fast page that explains
  what Kingfisher is, what the optional reference data is, and how
  to get it. Live at <https://mardakurt.github.io/kingfisher-data/>.
- **Optional reference data is published.** Elite OTB (407,538
  games), Recent Theory (44,200 games) and High-Rated Online
  (305,169 games) now install from the public data mirror. Kingfisher
  Starter ships with the application as before.
- **macOS preview build.** Apple Silicon, code-signed, `1.0.0-rc.4`.
  Not notarized — Gatekeeper refuses a first launch; the install
  guide walks through right-click → Open. Full guide:
  [`docs/release/install-macos.md`](docs/release/install-macos.md).
- **Web build.** The same application, served as a Next.js
  production build. The Stockfish engine is in the page; no
  install. The first time you open it, the bundled Kingfisher
  Starter installs itself.
- **Source-comparison Explorer.** Every reference source keeps its
  own licence, provenance and counts. The Explorer never produces a
  combined "truth" score that quietly blends them.
- **Diagnostics that are answerable.** Settings → Diagnostics now
  has a _Copy support information_ line and a _Copy full diagnostic
  report_ button, both with credentials redacted at write time. The
  log file is local, rotated, and never uploaded.
- **Local-first.** No account, no telemetry, no upload. Studies,
  repertoire, training and notes are stored locally. Restoring from
  backup does not require contacting a server.

### Known limitations

- **macOS preview is not notarized.** A Developer ID Application
  certificate will move the macOS build from "preview" to "release".
  Until then, the install guide is the right-click-Open dance.
- **No auto-update.** Open Help → Check for updates, or browse the
  releases page.
- **Windows and Linux build but are unsupported.** They have not
  been launched. The README and the install guide say so. Do not
  expect a Windows or Linux download to be the supported path.
- **macOS Intel builds but has not been launched.** The supported
  desktop platform is Apple Silicon.
- **No auto-update for the reference data either.** A new pack
  version replaces the catalogue pointer; existing installs
  continue to use the version they have until they re-install.
- **No games before 2020 in any first-party source.**
- **Chess960 is not supported, deliberately.**
- **Local Syzygy needs tables the user supplies.**

### Where to report problems

- **Issues:** <https://github.com/mardakurt/kingfisher/issues>
- **Discussions:** <https://github.com/mardakurt/kingfisher/discussions>
- **In-app:** Help → Report a problem copies a redacted support
  report to your clipboard. Paste it into the GitHub issue.

## 1.0.0-rc.3 — closed beta

The build that the closed-beta testers received. Web and macOS
Apple Silicon, code-signed but not notarized, with the Phase 22
closed-beta readiness work. Superseded by `1.0.0-rc.4`.

## 1.0.0-rc.2

Phase 21 follow-up. Web and macOS Apple Silicon, code-signed.

## 1.0.0-rc.1

The first release candidate, published for the closed beta.

## Earlier

The development history is recorded in `docs/reports/phase-*.md`. The
list above is the user-facing summary.
