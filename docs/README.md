# Kingfisher documentation

- [1.5.4 release notes](release/1.5.4.md) — collections, En Croissant and large files in the browser, collection sync, phones, tablets and installed iPhones, Safari storage. Web, and the Mac download.
- [1.5.3 release notes](release/1.5.3.md) — accounts and sync, opening map, openings to reconsider, analysis history, a faster-reading Studio. Web, and the Mac download (build 1228, notarised).
- [1.5.2 release notes](release/1.5.2.md) — puzzle move marks, unsaved-work safety, engine fallback.
- [2026-10-14 stream-hardening report](reports/2026-10-14-stream-hardening.md) — what was audited, found, fixed and run.

- [1.5.1 release notes](release/1.5.1.md) — puzzle retries and correctness fixes.

- [ChessBase Mac closure candidate for 1.5.0](product/chessbase-mac-comparison-1.5.0.md) — claim/control matrix and explicitly pending acceptance.

- [1.5.0 release notes](release/1.5.0.md)
- [1.4.9 release notes](release/1.4.9.md)
- [1.4.8 release notes](release/1.4.8.md)
- [1.4.7 release notes](release/1.4.7.md)
- [Professional-use stabilization audit](reports/2026-10-04-professional-stability-audit.md)
- [1.4.6 release notes](release/1.4.6.md)
- [ChessBase Mac comparison for 1.4.6](product/chessbase-mac-comparison-1.4.6.md)
- [2026-10-15 overhaul report](product/2026-10-15-overhaul-report.md) — accounts and sync, Describe search, landing, what was verified and what is left.
- [A large game database — proposal for review](product/2026-10-15-global-database-proposal.md) — sources, licences, architecture, cost and roadmap; nothing built.
- [Big data and accounts — a proposal](product/big-data-and-accounts-proposal.md) — 2026-10-04; §2 superseded by the 2026-10-15 database proposal, §3 by the account implementation.
- [1.4.5 release notes](release/1.4.5.md)
- [Local video lessons](design/video-lessons.md)

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

- [`release/1.4.4.md`](release/1.4.4.md) — annotation bar, Opponent, the reference in the Library, top games and strongest players, folders, the photo switch.
- [`release/1.4.3.md`](release/1.4.3.md) — rating classes, Library position and annotation filters, collection index, online download, costly moves, photos; the Chess960 import fix.
- [`release/1.4.2.md`](release/1.4.2.md) — puzzles, tournament tables, threats, diagrams, engine matches, rating history.
- [`release/1.4.1.md`](release/1.4.1.md) — opening surveys, preparation chapters, large imports; published 2026-10-03.
- [`product/chessbase-roadmap-2026-10-02.md`](product/chessbase-roadmap-2026-10-02.md) — the research-workflow comparison and roadmap.

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
- [`release/1.4.0.md`](release/1.4.0.md) — current Research workspace release notes.
- [`release/1.3.3.md`](release/1.3.3.md) — previous release notes. [`release/1.3.2.md`](release/1.3.2.md), [`release/1.3.1.md`](release/1.3.1.md), [`release/1.3.0.md`](release/1.3.0.md), [`release/1.2.6.md`](release/1.2.6.md), [`release/1.2.5.md`](release/1.2.5.md), [`release/1.2.4.md`](release/1.2.4.md), [`release/1.2.3.md`](release/1.2.3.md), [`release/1.2.2.md`](release/1.2.2.md), [`release/1.2.1.md`](release/1.2.1.md), [`release/1.2.0.md`](release/1.2.0.md), [`release/1.1.9.md`](release/1.1.9.md), [`release/1.1.8.md`](release/1.1.8.md), [`release/1.1.7.md`](release/1.1.7.md), [`release/1.1.6.md`](release/1.1.6.md), [`release/1.1.5.md`](release/1.1.5.md), [`release/1.1.4.md`](release/1.1.4.md), [`release/1.1.3.md`](release/1.1.3.md),
  [`release/1.1.2.md`](release/1.1.2.md), [`release/1.1.1.md`](release/1.1.1.md),
  [`release/1.1.0.md`](release/1.1.0.md) and [`release/1.0.0.md`](release/1.0.0.md)
  are the previous ones.
- [`../CHANGELOG.md`](../CHANGELOG.md) — what changed, by version;
  _Unreleased_ is what master has that the current release does not.

### Using Kingfisher

- [`user/getting-started.md`](user/getting-started.md) — the five-minute tour.
- [`user/diagnostics.md`](user/diagnostics.md) — what _Settings → Diagnostics_
  produces and how to send a useful report.
- [`product/first-100-user-guide.md`](product/first-100-user-guide.md) — the
  longer guide written for the first hundred users.
- [`product/first-100-known-issues.md`](product/first-100-known-issues.md) —
  known issues, kept current as they are fixed or found.
- [`product/planner.md`](product/planner.md) — the Kingfisher Planner:
  a tournament calendar and study schedule. **Idea only; not
  implemented.**
- [`product/long-term-data.md`](product/long-term-data.md) — where a
  player's work lived on 2026-09-19 and the staged plan for accounts (Phase
  72); its account stage was carried out on 2026-10-15
- [`product/player-style-opponent.md`](product/player-style-opponent.md)
  — the player-style sparring opponent: stage 1 built (Preparation →
  Sparring), the later stages a plan
- [`product/work-continuity.md`](product/work-continuity.md) — what survives
  a quit, a crash, a reinstall, a restore.
- [`product/studio-access.md`](product/studio-access.md) — how the landing
  and the Studio connect: `/`, `/analysis`, `/studio`, the returning
  player's line, `?stay`, and what the desktop shell opens.
- [`product/platform-parity.md`](product/platform-parity.md) — the web
  application and the desktop application, feature by feature, with the
  deliberate differences named.
- [`product/final-certification.md`](product/final-certification.md) — the
  Phase 49 certification matrix: every major system, on web and on macOS,
  with the command or the live check behind each row.
- [`product/phase-traceability.md`](product/phase-traceability.md) — every
  capability a phase handover reported as shipped, mapped to the code and
  the test that hold it today.

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
- [`product/chessbase-parity-audit.md`](product/chessbase-parity-audit.md) —
  Kingfisher against ChessBase 26 and ChessBase for Mac, workflow by workflow,
  with sources, what Phase 84 closed, and the verdict (ALMOST) with the gaps
  that stand between it and YES.
- [`product/competitive-assessment-phase-87.md`](product/competitive-assessment-phase-87.md)
  — Kingfisher against ChessBase by workflow, from the running application
  (Phase 87): the ten reference photographs and what was and was not taken
  from them, measured before-and-after numbers, and the verdict — yes on the
  core workflows with a player's own data, not yet for the professional who
  depends on ChessBase's corpus, remote engines or Windows.
- [`product/not-built.md`](product/not-built.md) — what is not built or not
  done after Phase 87: blocked, designed, partly built, not started, what the
  Phase 87 brief left open, and the runs not repeated, each with why.
- [`product/parity-ledger.md`](product/parity-ledger.md) — the parity
  program's gate (Phase 86): every P0/P1 requirement with its verified state,
  evidence authority and one of five statuses; the frozen ChessBase baseline
  and the release-truth table.
- [`product/market-research.md`](product/market-research.md) — the chess study
  market from first-hand sources: what people complain about, what they ask
  for and do not have, where Kingfisher stands on each, and the plan to close
  the gap with ChessBase and then lead.
- [`design/team-preparation.md`](design/team-preparation.md) — first-hand research,
  coach/second workflows, implemented improvements and staged implementation plan.
- [`design/surprise-finder.md`](design/surprise-finder.md) — the join of
  your repertoire, one opponent's games and a named population: what counts
  as a surprise, what is deliberately not claimed, and the record.
- [`design/windows.md`](design/windows.md) — the Windows audit: what is
  already portable, what is macOS by construction, what a port would have to
  do, and why no Windows claim may be made until a build has been run
  (Phase 76).
- [`design/organising-work.md`](design/organising-work.md) — tags rather
  than folders, and search as a page: the decisions, the model and the
  record.
- [`design/position-page.md`](design/position-page.md) — the un-silo: one
  URL for everything Kingfisher knows about a position, position-keyed
  rather than move-sequence-keyed, with concealed workspaces excluded
  from the entry point.
- [`design/daily-session.md`](design/daily-session.md) — the rehearsal
  the brief's other half needs: fifteen minutes built only from the
  player's own repertoire, critical positions, endgames and game-day
  sheet, with the existing schedule as the audit trail and no invented
  score.
- [`design/season.md`](design/season.md) — one named set of the player's
  games, read through five clock and opening sections with denominators and
  source populations kept separate.
- [`design/compact-position-postings.md`](design/compact-position-postings.md)
  — why a million games cost 33 GB, and a posting index proven equal on
  100,445 real games at 1/18 of the position side: ten million games in
  about 40 GB instead of 330 (proposed, not yet the schema).
- [`design/search-mask.md`](design/search-mask.md) — the Games search
  mask: header filters with written rules, time control by a printed
  formula, and material, theme, route and comment searches that read the
  moves and say how many they read.
- [`design/recurring-mistakes.md`](design/recurring-mistakes.md) — four
  recurring facts in Review, joined from stored evidence, structures,
  player-authored endgames and repertoire positions without a new score or
  label.
- [`design/chessbase-parity-features.md`](design/chessbase-parity-features.md)
  — the Phase 84 parity features (merging games, the repertoire scan, the
  Lichess cloud evaluation, position history, the Library over any database,
  questions inside a chapter): what each does, its rule, and what it does not.
- [`design/scoresheet.md`](design/scoresheet.md) — getting the
  over-the-board game in: what the research says about handwriting
  recognition, the decisions (the rules do the work, the photo goes to the
  user's own endpoint, a gap is first-class), and the model.
- [`design/team-hub.md`](design/team-hub.md) — the Team hub: the research
  on how seconds and coaches actually hand work around, the decisions
  (local-first, packet file, immutable handovers, verified PGN, derived
  evidence), the model, the merge and the interface.
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
- [`data/chessbase-archive-format.md`](data/chessbase-archive-format.md) —
  the ChessBase file family and the `.cbv` archive as Kingfisher reads them:
  what was derived, from which files, and what was run to check it (Phase
  76).
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
  runbook for a signed, notarised macOS release; the pipeline that made
  the current download.
- [`release/apple-developer-id-setup.md`](release/apple-developer-id-setup.md)
  — installing the `Developer ID Application` certificate that runbook needs.
- [`release/release-manifest.md`](release/release-manifest.md) — the schema
  of the release manifest a stable release publishes. Its examples use an
  illustrative future version.
- [`release/launch-kit.md`](release/launch-kit.md) — the announcement copy
  for the current release.
- [`product/marketing-facts.md`](product/marketing-facts.md) — the verified
  facts marketing may state, and nothing else.
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

- [`release-evidence/1.1.0-build-manifest.json`](https://github.com/mardakurt/kingfisher/blob/16d2fcc2/docs/release-evidence/1.1.0-build-manifest.json) and
  [`release-evidence/1.0.0-runtime-manifest.json`](https://github.com/mardakurt/kingfisher/blob/16d2fcc2/docs/release-evidence/1.0.0-runtime-manifest.json) — historical generated
  snapshots, removed from the tree on 2026-10-16; the links open them, byte for
  byte, at the last commit that held them. Regenerate a local build manifest with
  `release:manifest`; `publish:release-manifest` prepares the runtime manifest
  from the current public download descriptor and does not upload it.

- [`product/first-100-support-matrix.md`](product/first-100-support-matrix.md)
  — historical Phase 39 support audit of 1.0.0. Its unsigned-preview claims
  are obsolete; use the current install guide and platform-parity document.

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
- [`product/web-desktop-parity.md`](product/web-desktop-parity.md) — the
  Phase 45 parity table; superseded by
  [`product/platform-parity.md`](product/platform-parity.md).

## Historical

- [`product/interface-usability-study.md`](product/interface-usability-study.md)
  — the unrun five-player protocol and architecture checkpoint.

- [`reports/phase-89-independent-audit.md`](reports/phase-89-independent-audit.md) —
  independent corrections, regression evidence and recovered-file inventory.
- [`reports/phase-89-handover.md`](reports/phase-89-handover.md) — the
  collection-backed Opening Report audited, and two false claims found in it: a
  player's own archive taking the role that decides whether the report calls it
  "compared for disagreement" or makes it the reference that defines the
  opening's branches, and outcome columns that did not add up to the games
  behind them. Also Phase 88's recorded walk-harness defect, closed, and the
  packaged application re-verified at build 1012 — with the open pack-side
  `*`-as-Black-win defect that correcting would cost a full pack rebuild.
- [`reports/phase-72-handover.md`](reports/phase-72-handover.md) — the
  independent audit of Phase 71, eleven defects reproduced and fixed
  (checkmate on the eval bar, the between-moves dip, the board flip, the
  tool strip, the Companion panel's honesty), and the Vercel
  deployment-storage cause and remedy.

- [`reports/`](reports) — the most recent handovers and audits. Each
  describes what a phase set out to do, what it found, what it shipped and
  what remained. The most recent is the starting point for the next phase;
  none is a description of the product now.

**Removed on 2026-10-16, kept in git history.** The handovers of Phases
13–88, the dated release handovers before 2026-10-08, the Phase 85–87
evidence folders (`docs/release-evidence/`, 45 MB of screenshots and logs),
the phase audits under `product/phase-*` other than the traceability and
verification maps, the ChessBase comparisons superseded by the 1.4.6 and
1.5.0 ones, the 1.0.0 release-candidate notes, the Phase 85 session prompt
and the unused images of the old landing under `marketing/assets/`. Older
documents still cite some of these paths as evidence; every one can be read
with `git show 16d2fcc2:<path>` (for example
`git show 16d2fcc2:docs/reports/phase-88-handover.md`).

- [`release/1.0.0.md`](release/1.0.0.md) — the 1.0.0 release notes. The
  current notes are [`release/1.5.4.md`](release/1.5.4.md).
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

- [Large databases and external storage](operations/large-databases.md)
- [Turning on accounts: the Supabase and Google set-up](operations/supabase-setup.md) — the owner's steps, and `npm run cloud:verify` for the live account boundary.
- [Independent ChessBase acceptance](operations/independent-chessbase-acceptance.md)
