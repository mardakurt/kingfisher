# Phase 27 handover — Kingfisher 1.1 Data Intelligence

> The transition from "Kingfisher 1.0 has shipped" to
> "Kingfisher 1.1's data layer is more useful, more
> honest, and easier to keep current — and the remaining
> 1.1 work is a continuation, not a new phase."

## Status: PHASE 27 IS NOT COMPLETE

This phase is large. The brief asks for first-party
pack version upgrades, chunk-reuse, a fresh data-quality
audit, a "Player 2.0" with career-vs-recent, an "Explorer
2.0" with trends, repertoire coverage from data, data-
driven training, a historical-data licence audit, online-
masters improvements, and a Data Center UX — all in a
single autonomous phase. The 1.0 follow-up was supposed
to be small releases; this brief is not. This handover
documents what was completed in this session, what is in
flight, and what the next agent should pick up under the
same Phase 27.

## 1. Executive verdict

- **1.1 is NOT released.** Production runs 1.0.0.
- Master stays releasable as 1.0.0 throughout; all 1.1
  work is additive and small enough to revert.
- The first two user-visible 1.1 improvements are live on
  master: the data inventory document and the visible
  chunk-reuse savings in the install progress bar.
- 0 Critical, 0 High, 0 Critical UI, 0 High UI defects.
- The 1.0 baseline remains intact: 2177/2188 tests pass,
  11 skipped, 0 fail. `npm run security:scan` is clean.
  `npm run typecheck` and `npm run lint` are clean. The
  20/20 public-link gate is green.

## 2. Completed in this session

| Item                                                | Where                                               |
| --------------------------------------------------- | --------------------------------------------------- |
| Data inventory document (PART C)                    | `docs/data/data-inventory.md`                        |
| Chunk-reuse savings surfaced in the install UI (PART O) | `src/reference/install.ts`, `src/features/databases/ReferenceCatalogPanel.tsx` |
| Targeted reference-pack unit suite re-run           | `npx vitest run src/reference` → 86/86 green        |
| Type and lint stay green                            | `npm run typecheck` + `npm run lint` → clean         |

The data inventory records, for every source Kingfisher
knows about, the values the manifests actually published
today: pack id, name, version, build date, licence,
upstream files and their digests, population, counts, and
distribution path. It is the basis for the next pack-
version decisions and for the historical-data licence
audit.

The chunk-reuse change is small but real: when a user
upgrades an installed pack, the install progress bar now
prints

```
120 MB of 324 MB · 204 MB reused from the previous install
```

so a user upgrading Elite v2 to v3 sees the actual delta
they are about to download, not an opaque counter. The
underlying reuse is content-addressed storage that was
already in place from earlier phases; the new code just
measures it and reports it.

## 3. NOT completed — required continuation

The remaining 1.1 work is in the brief under PART C
through PART CN. The following is a deliberately explicit
list of what the next agent should pick up under the same
Phase 27 — no Phase 28.

### Data quality and packs

- **PART D — Data quality metrics in the build.** The
  script already counts `seen / kept / rejected / opened`
  per upstream file. Promote these from internal counters
  to manifest fields (e.g. `counts.rejected`, `rejectedBy`
  by reason). Make the data inventory link to a per-build
  provenance document.
- **PART E — Legal replay validation.** Add a manifest
  field `counts.replayFailed` and surface it in the data
  inventory.
- **PART F — Within-pack deduplication.** Verify the
  current dedupe identity; document it in
  `docs/data/builds/`.
- **PART I — Freshness audit.** Recompute the "last
  included game date" for each live pack and write it into
  the inventory.
- **PART J — Elite v3 build.** Decide whether the
  upstream has enough new content to justify v3. The build
  command is unchanged; the pack version is the only
  metadata change.
- **PART K — Recent Theory definition.** State the
  exact date window in the manifest (e.g. "Mar–Sep 2026")
  and show it in the application.
- **PART L — High-Rated Online v2.** Decide whether the
  current single-month build is the right window; consider
  rolling 3 months.
- **PART M — Speed facets.** Expose Classical / Rapid /
  Blitz as separate explorer columns for the high-rated
  online source.

### Pack update UX

- **PART Q — Reuse test.** A focused synthetic test
  that installs v1, then v2 with 3 of 4 chunks identical,
  and verifies only 1 chunk is downloaded and 3 are
  counted as reused. The plumbing is already there; the
  test is not.
- **PART S — Data Center UX.** The "Update available"
  badge already exists. Add the upgrade action button
  with the savings number next to it.
- **PART T — Update metadata trust.** Document the
  threat model and confirm that new pack versions are
  introduced only by a Kingfisher app release.
- **PART W — Data Health.** Surface the existing
  Ready / Updating / Failed / Not Installed states
  consistently. Most are already wired.
- **PART BA — Study / Report reproducibility.** When a
  report stores a data-derived statement, record the
  source version next to it.

### Player / Explorer / Repertoire

- **PART X — Explorer 2.0 columns.** Average rating,
  last-played, when metadata permits. Reuse the existing
  source-comparison panel.
- **PART Y — Opening trends.** Compare
  baseline frequency vs recent frequency, per source, per
  move. Expose the formula, not a single "hotness" number.
- **PART AA — Source comparison 2.0.** Already mostly
  there. Add the divergence highlight.
- **PART AD — Player Career vs Recent.** Add a period
  selector (All / Last 12 months / Last 24 months) to the
  player profile. The data layer already returns the
  most-recent N; the UI needs the selector.
- **PART AG — Player recency deltas.** Show
  "career 62% vs recent 84%" on a single row, with the raw
  denominator.
- **PART AH — Player source provenance.** The stats row
  must show the source the percentage is from. Already
  true for source comparison; verify the per-player stats
  are also labelled.

### Repertoire coverage and data-driven training

- **PART AJ–AL — Repertoire coverage panel.** Reuse the
  existing Explorer query to surface opponent replies the
  repertoire does not yet have a decision for. Source the
  reply from a user-selected pack, surface the games
  count, and offer "Add response / Study / Train" actions
  that go to the existing Repertoire / Study / Training
  routes.
- **PART AN–AP — Data-driven training.** Generate a
  static training set from the uncovered positions. Reuse
  the existing Training infrastructure; do not introduce
  a new scheduler.
- **PART AP — Transposition dedup.** Confirm the
  training set is keyed by canonical position; multiple
  move orders collapse to one prompt.

### Historical and online

- **PART AT–AU — Historical source audit.** Re-check
  candidate pre-2020 sources against the official
  redistribution licence. Document accepted / rejected
  in `docs/data/historical-audit.md`. Acceptable outcome:
  no offline historical pack.
- **PART AV — Online Masters improvements.** Year
  filter, top games, return-to-position, save-to-study
  where provider terms allow. Do not bulk scrape.

### Data Center / UX / storage

- **PART BC — Web storage quota.** Estimate and warn
  before installing on web.
- **PART BD — Desktop storage breakdown.** Show
  reference data, user databases, engine storage,
  tablebases separately.
- **PART BE — Old-pack removal.** Offer
  "Remove previous version" after a successful update,
  using the existing chunk-reuse-aware reclaim.

### Tests, CI, and release

- **PART BI / BJ — Pipeline tests.** Add fixtures for
  the rejection cases the brief lists (duplicate game,
  partial date, malformed PGN, illegal castling, etc.).
  Wire them into `npm test`.
- **PART BK — Pack update tests.** Synthetic v1 → v2
  with unchanged / changed / removed / new chunks; assert
  the downloaded-byte count and the ready-or-not state.
- **PART BO — Query performance benchmarks.** Run the
  cold / warm benchmark suite and record the before /
  after numbers.
- **PART CG / CH — CI cost policy.** Document what
  runs automatically vs manually; the existing
  `release-build.yml` policy is the template.

## 4. Application

| Field        | Value                                                                 |
| ------------ | --------------------------------------------------------------------- |
| Starting ver | 1.0.0                                                                 |
| Final ver    | 1.0.0 (unchanged on master; 1.1 deferred to continuation)            |
| Commit       | `ed4cf22`                                                             |
| Vercel       | `kingfisher-chess.vercel.app` — production 1.0 build                 |
| GitHub       | `v1.0.0` is the current Latest release                               |

## 5. Data inventory (PART C)

Written to `docs/data/data-inventory.md`. Records, for
every source:

- source id, display name
- online / offline
- licence id, name, URL, attribution
- upstream, retrieval date, transformation
- pack version, build date
- games, openable games, positions, players
- distribution path
- update mechanism

## 6. Chunk reuse (PART O–R)

Plumbing is already content-addressed by SHA-256. The 1.1
additions:

- `InstallProgress` now carries `chunksReused` and
  `bytesReused`.
- The Databases / Reference Data install progress bar
  shows the reuse number in plain text.
- The store already reclaims only chunks that no installed
  pack still references.

## 7. Reuse savings (PART BB)

Recorded as zero in this session. A focused v1 → v2
synthetic test (PART BJ) is the next step; it will
populate the table with the actual numbers once
introduced.

## 8. Tests

Local:

| Check                          | Result                       |
| ------------------------------ | ---------------------------- |
| `npm run typecheck`            | 0 errors                     |
| `npm run lint`                 | 0 errors                     |
| `npm test`                     | 2177 pass, 11 skipped, 0 fail |
| `npx vitest run src/reference` | 86 / 86 green                |
| `npm run security:scan`        | 0 leaks, 0 advisories        |

Remote CI: not triggered by this commit. The Phase 26 CI
policy stays.

## 9. Known limitations (current)

- All Phase 26 limitations still hold: macOS Preview (not
  notarized), no auto-update, no custom domain, no Windows
  / Linux desktop.
- The 1.1 work above is unfinished; the next agent should
  continue Phase 27, not invent a new phase.

## 10. Release verdict

**1.1 READY — NO**, the 1.1 release gate has not been run.
1.0.0 remains the current Latest release.

## 11. Next steps for the next agent

The next agent should treat this handover as the
continuation document and continue Phase 27 in the
following order:

1. PART C refine — add `counts.rejected`,
   `counts.replayFailed` to the build and to the manifest.
2. PART Q synthetic test — prove the reuse savings with
   a v1 → v2 fixture. Once that test exists, the table
   in this handover can be filled with real numbers.
3. PART K / L / M — write the explicit time-window string
   into the Recent and Online manifests.
4. PART X / Y / AA — Explorer 2.0 columns and trends.
   Reuse the existing source-comparison panel.
5. PART AD / AG / AH — Player Career / Recent / Source
   provenance. Small UI work on the existing panel.
6. PART AJ–AP — Repertoire coverage + data-driven
   training. Reuse the existing Training infrastructure.
7. PART AT / AU — Historical source audit. Acceptable
   outcome: no offline historical pack.
8. Run the 1.1 release gate, cut `v1.1.0`, publish a
   normal GitHub release, deploy to Vercel, verify
   `/releases/latest` still resolves to the application
   (not a reference data release).

The model after that remains:

> Filed Issue → reproduce → test → fix → point release.

No Phase 28.
