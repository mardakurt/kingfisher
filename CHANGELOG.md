# Kingfisher changelog

The user-facing changelog. Internal phase history is in
`docs/reports/` and `docs/product/phase-*.md`; the list below is what
real users notice.

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
  has a *Copy support information* line and a *Copy full diagnostic
  report* button, both with credentials redacted at write time. The
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
