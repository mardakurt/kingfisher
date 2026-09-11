# Kingfisher documentation

Documentation for the Kingfisher chess research workstation.
The tree is split into **canonical / current** documentation —
the source of truth for today's product — and **historical**
records that describe what each phase set out to do.

If you are a user of Kingfisher looking for help, start at
[`docs/user/`](user). If you are the maintainer, start at
[`AGENTS.md`](../AGENTS.md).

## Canonical — current

These documents describe the product **as it is now**. They
are the source of truth for the public-facing product, the
project, and the data it ships. If something in
[`ARCHITECTURE.md`](../ARCHITECTURE.md) or the in-app help is
not consistent with the documents below, this is where the
tie-breaker lives.

### Public product

- [`../README.md`](../README.md) — current project README.
- [`../SECURITY.md`](../SECURITY.md) — current security
  policy, including the supported versions, the actual
  controls in code, and the private reporting path.
- [`docs/legal/privacy.md`](legal/privacy.md) — current
  privacy policy. What the product does and does not collect.
- [`docs/legal/data-licences.md`](legal/data-licences.md) —
  every third-party data source and its licence, in a single
  human-readable place.
- [`docs/legal/terms.md`](legal/terms.md) — the human-readable
  summary of the MIT licence and the things the product does
  not promise.
- [`docs/product/public-claims.md`](product/public-claims.md) —
  the public statements the product makes, where they appear,
  and what implementation backs them. **Read this before
  changing a landing-page or README sentence.**
- [`docs/release/install-macos.md`](release/install-macos.md) —
  the canonical install guide for the macOS Preview. The
  landing page links here; do not move the link without
  updating both.

### User

- [`docs/user/getting-started.md`](user/getting-started.md) —
  the five-minute tour of the application.
- [`docs/user/diagnostics.md`](user/diagnostics.md) — what
  _Settings → Diagnostics_ produces, and how to send a useful
  report.

### Deployment, release, data

- [`docs/deployment.md`](deployment.md) — how the web build is
  deployed today, the relationship between landing and
  studio, and the separation between the current production
  method and the recommended future method.
- [`docs/release/1.0.0.md`](release/1.0.0.md) — release notes
  for the current public release.
- [`docs/release/release-checklist.md`](release/release-checklist.md) —
  the checks a maintainer runs before tagging a release.
- [`docs/data/data-inventory.md`](data/data-inventory.md) —
  the canonical pack counts and provenance. Where it matters,
  this is generated from the manifests.
- [`docs/data/reference-packs.md`](data/reference-packs.md) —
  pack architecture: shape, filters, signing, where the bytes
  live.
- [`docs/data/online-integrations-audit.md`](data/online-integrations-audit.md) —
  the live third-party integrations and the limits each one
  puts on a query.

### Architecture and operations

- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — current
  architecture. Landing vs. studio hosts, the workspace, the
  board pipeline, reference data, engines, persistence,
  security boundaries.
- [`../AGENTS.md`](../AGENTS.md) — the maintainer's rules. Read
  this before making a structural change.
- [`../CLAUDE.md`](../CLAUDE.md) — companion to `AGENTS.md` for
  working as Claude.
- [`docs/operations/search-console.md`](operations/search-console.md) —
  the owner steps to register the landing host in Google
  Search Console.

### Third-party attribution

- [`../THIRD_PARTY_DATA.md`](../THIRD_PARTY_DATA.md) — every
  third-party dataset, its licence, and what Kingfisher does
  with it.
- [`../THIRD_PARTY_ASSETS.md`](../THIRD_PARTY_ASSETS.md) —
  every third-party asset, its licence, and where it lives in
  the repository.

### Design

- [`docs/ENGINES.md`](ENGINES.md) — every engine catalogue
  entry, its source, version, licence and how it is qualified.
- [`docs/design/`](design) — design system, piece proportions,
  macOS window chrome, the Kingfisher mark.

### Decisions

- [`docs/adr/`](adr) — Architecture Decision Records. Short,
  dated, signed. Each records one decision and what it
  replaced.

## Historical — phase reports and older RCs

These are records of work that has shipped. They are kept
because the reasons are still the reasons, but the **current**
state is the canonical section above.

- [`docs/reports/`](reports) — every phase handover, from
  Phase 13 to Phase 40. Each describes what a phase set out
  to fix, what it found, what it shipped and what remained.
- [`docs/release/1.0.0-rc.1.md`](release/1.0.0-rc.1.md) through
  [`docs/release/1.0.0-rc.5.md`](release/1.0.0-rc.5.md) — older
  release-candidate notes, kept for the change history. The
  current release notes are at
  [`docs/release/1.0.0.md`](release/1.0.0.md).
- [`docs/product/phase-*.md`](product) — per-phase
  product-side work records.
- [`docs/benchmark-reports/`](benchmark-reports) — the
  performance and capacity work each phase produced.
- [`docs/performance/`](performance) — the longer performance
  investigations.

## How to keep this index honest

When you add a new file under `docs/`, decide which section
it belongs in **before** you write it:

- **Canonical** — it describes the product as it is. It must
  be updated when the product changes. If the answer is "this
  is the latest of several", it does not belong in canonical
  and belongs in historical.
- **Historical** — it describes a past state. It is not
  rewritten to match the present. The date and the phase
  number in its title should make the historical nature
  obvious.

If a canonical file becomes stale, fix the file, do not move
it. If you are tempted to add a "Last updated" line, prefer
to leave the file's `git log` to speak.
