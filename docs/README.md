# Kingfisher documentation

Every Markdown file in this repository is listed here, in one of four
sections, so nobody has to guess whether a document describes the product as
it is or as it was.

- **Current** — the product today. Kept true; `npm run docs:check` asserts
  the claims that can be asserted. If a current document disagrees with the
  code, one of them is a bug.
- **Operations** — runbooks a maintainer follows: how to release, deploy,
  certify, and answer a user.
- **Records** — decisions and investigations. Dated. The reasons are still
  the reasons; the state they describe may not be.
- **Historical** — phase handovers, findings registers, old release notes.
  Snapshots of the work at the time. **Never read one of these as the current
  state**, and never rewrite one to become it.

If you are a user looking for help, start with the
[install guide](release/install-macos.md) and
[getting started](user/getting-started.md). If you are the maintainer, start
with [`AGENTS.md`](../AGENTS.md).

## Current

### The public product

- [`../README.md`](../README.md) — the project README: what Kingfisher is,
  where to get it, what is and is not true of the desktop build.
- [`../SECURITY.md`](../SECURITY.md) — the security policy: the controls in
  code, the trust state of the macOS build today, the reporting path.
- [`release/install-macos.md`](release/install-macos.md) — the install guide
  for the macOS build. Names the exact public DMG; `docs:check` compares it
  to [`src/release/macos-download.json`](../src/release/macos-download.json).
- [`legal/privacy.md`](legal/privacy.md), [`legal/terms.md`](legal/terms.md),
  [`legal/data-licences.md`](legal/data-licences.md) — the privacy policy,
  the terms, and every data source with its licence.
- [`product/public-claims.md`](product/public-claims.md) — every public
  claim, where it appears, what backs it, and what must not be claimed.
  **Read before changing a landing-page or README sentence.**
- [`release/1.0.0.md`](release/1.0.0.md) — release notes for the current
  public release.
- [`../CHANGELOG.md`](../CHANGELOG.md) — what changed, by version;
  _Unreleased_ is what master has that 1.0.0 does not.

### Using Kingfisher

- [`user/getting-started.md`](user/getting-started.md) — the five-minute tour.
- [`user/diagnostics.md`](user/diagnostics.md) — what _Settings → Diagnostics_
  produces and how to send a useful report.
- [`product/first-100-user-guide.md`](product/first-100-user-guide.md) — the
  longer guide written for the first hundred users.
- [`product/first-100-known-issues.md`](product/first-100-known-issues.md) —
  known issues, kept current as they are fixed or found.
- [`product/first-100-support-matrix.md`](product/first-100-support-matrix.md)
  — which platforms, browsers and configurations are supported, and how each
  was checked.
- [`product/work-continuity.md`](product/work-continuity.md) — what survives
  a quit, a crash, a reinstall, a restore.
- [`product/web-desktop-parity.md`](product/web-desktop-parity.md) — the web
  application and the desktop application, feature by feature.

### Architecture and the maintainer's rules

- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — the territory: hosts, the
  workspace, the board pipeline, reference data, engines, persistence, the
  desktop shell, the companion, the updater.
- [`../AGENTS.md`](../AGENTS.md) — the rules that are not negotiable, the
  release gates, the desktop gates.
- [`../CLAUDE.md`](../CLAUDE.md) — how to work here, for an agent.
- [`ENGINES.md`](ENGINES.md) — every engine in the catalogue, its source,
  version, licence and how it is qualified.
- [`../THIRD_PARTY_DATA.md`](../THIRD_PARTY_DATA.md),
  [`../THIRD_PARTY_ASSETS.md`](../THIRD_PARTY_ASSETS.md) — every third-party
  dataset and asset, with licence and provenance.
- [`../companion/README.md`](../companion/README.md) — the companion process:
  what it does and its trust boundary.
- [`design/visual-system.md`](design/visual-system.md),
  [`design/iconography.md`](design/iconography.md),
  [`design/piece-proportions.md`](design/piece-proportions.md),
  [`design/macos-window-chrome.md`](design/macos-window-chrome.md) — the
  design system, the mark, the pieces, the window chrome geometry that
  `npm run desktop:chrome` asserts.

### Data

- [`data/data-inventory.md`](data/data-inventory.md) — the canonical pack
  counts and provenance, generated from the manifests where it matters.
- [`data/reference-packs.md`](data/reference-packs.md) — pack architecture:
  shape, filters, verification, where the bytes live.
- [`data/high-rated-online.md`](data/high-rated-online.md) — the online
  reference and why its thresholds are what they are.
- [`data/variation-briefs.md`](data/variation-briefs.md) — where the words in
  a variation brief come from.
- [`data/online-integrations-audit.md`](data/online-integrations-audit.md) —
  the live third-party integrations and the limits on each query.
- [`../data/openings/SOURCE.md`](../data/openings/SOURCE.md) — the opening
  classification dataset: upstream, commit and licence.
- [`../companion/fixtures/syzygy-3/README.md`](../companion/fixtures/syzygy-3/README.md)
  — the bundled three-piece tablebases and their digests.

## Operations

### Release and distribution

- [`deployment.md`](deployment.md) — where each surface is hosted, how the
  landing and studio deploy, how a release and a macOS preview are published.
- [`release/release-checklist.md`](release/release-checklist.md) — the checks
  before tagging a release.
- [`release/macos-trusted-release.md`](release/macos-trusted-release.md) — the
  runbook for a signed, notarised macOS release. **A runbook for a future
  release; it does not describe the current download.**
- [`release/apple-developer-id-setup.md`](release/apple-developer-id-setup.md)
  — installing the `Developer ID Application` certificate that runbook needs.
- [`release/release-manifest.md`](release/release-manifest.md) — the schema
  of the release manifest a stable release publishes. Its examples use an
  illustrative future version.
- [`release/launch-kit.md`](release/launch-kit.md) — the announcement copy
  for 1.0.0.
- [`product/macos-desktop-certification.md`](product/macos-desktop-certification.md)
  — the certification matrix for the packaged macOS application, with the
  command behind every row.

### Running the project

- [`operations/local-workspace-layout.md`](operations/local-workspace-layout.md)
  — where the checkout, caches and build output live on the maintainer's
  machine; `npm run workspace:audit` checks it.
- [`operations/search-console.md`](operations/search-console.md) — registering
  the landing host with Google Search Console.
- [`operations/real-tablebase-cert.md`](operations/real-tablebase-cert.md) —
  the manual Syzygy certification run.
- [`operations/real-safari-certification.md`](operations/real-safari-certification.md)
  — the manual real-Safari run.

### The first hundred users

- [`operations/first-100-wave-1.md`](operations/first-100-wave-1.md) — the
  Wave 1 package: who, what they get, what to ask.
- [`operations/first-100-invite-template.md`](operations/first-100-invite-template.md)
  — the invitation.
- [`operations/first-100-feedback.md`](operations/first-100-feedback.md) — how
  feedback is triaged.
- [`product/first-100-field-findings.md`](product/first-100-field-findings.md)
  — what real users reported. Only actual reports; nothing invented.

## Records

- [`adr/`](adr) — Architecture Decision Records. Short, dated, one decision
  each and what it replaced.
- [`product/pro-workstation-gap-analysis.md`](product/pro-workstation-gap-analysis.md),
  [`product/competitors.md`](product/competitors.md) — where Kingfisher stood
  against the tools professionals use, at the date on each.
- [`data/historical-games-audit.md`](data/historical-games-audit.md) — the
  audit that concluded no historical corpus could be redistributed.
- [`data/streaming-reference-investigation.md`](data/streaming-reference-investigation.md)
  — the Phase 28 investigation into streaming reference data.
- [`security/phase-24-security-review.md`](security/phase-24-security-review.md),
  [`security/phase-25-security-review.md`](security/phase-25-security-review.md)
  — the two security reviews. The controls they describe are re-stated, as
  they are today, in [`../SECURITY.md`](../SECURITY.md).
- [`performance/`](performance) — the longer performance investigations.
- [`benchmark-reports/`](benchmark-reports) — the benchmark and capacity
  reports.
- [`product/phase-verification.md`](product/phase-verification.md) — Phases
  1–21, capability by capability, as verified at the time.

## Historical

- [`reports/`](reports) — every phase handover and findings register. Each
  describes what a phase set out to do, what it found, what it shipped and
  what remained. The most recent is the starting point for the next phase;
  none is a description of the product now. Personal paths have been
  redacted; some historical command output remains machine-specific.
- [`product/phase-15-audit.md`](product/phase-15-audit.md),
  [`product/phase-16-codebase-audit.md`](product/phase-16-codebase-audit.md),
  [`product/phase-16-field-walk.md`](product/phase-16-field-walk.md),
  [`product/phase-19-professional-acceptance.md`](product/phase-19-professional-acceptance.md),
  [`product/phase-22-handover.md`](product/phase-22-handover.md),
  [`product/phase-28-acceptance.md`](product/phase-28-acceptance.md),
  [`product/phase-28-ui-audit.md`](product/phase-28-ui-audit.md),
  [`product/phase-31-workflow-audit.md`](product/phase-31-workflow-audit.md),
  [`product/phase-37-gap-register.md`](product/phase-37-gap-register.md) —
  per-phase product audits and acceptance records.
- [`release/1.0.0-rc.1.md`](release/1.0.0-rc.1.md),
  [`release/1.0.0-rc.2.md`](release/1.0.0-rc.2.md),
  [`release/1.0.0-rc.3.md`](release/1.0.0-rc.3.md),
  [`release/1.0.0-rc.4.md`](release/1.0.0-rc.4.md),
  [`release/1.0.0-rc.5.md`](release/1.0.0-rc.5.md) — release-candidate notes.
  The current notes are [`release/1.0.0.md`](release/1.0.0.md).
- [`../.github/ISSUE_TEMPLATE/`](../.github/ISSUE_TEMPLATE) — issue templates;
  current, and listed here so nothing is unaccounted for.
- [`../marketing/README.md`](../marketing/README.md) and
  [`../marketing/index.html`](../marketing/index.html) — the redirect-only
  backup of the landing at the legacy GitHub Pages origin. Not canonical.

## How to keep this index honest

When you add a file under `docs/`, decide which section it belongs in before
you write it. A document that describes the product as it is must be updated
when the product changes, or moved to Records with its date. A document that
describes a past state is not rewritten to match the present; its title and
date should make that obvious. If a current file goes stale, fix the file. Do
not add a "last updated" line; `git log` already says.
