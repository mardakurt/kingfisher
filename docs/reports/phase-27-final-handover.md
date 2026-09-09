# Phase 27 final handover — Kingfisher 1.1 Data Intelligence

> This document REPLACES the need for another continuation if everything is
> complete. Read it first.

## 1. Executive verdict

**Phase 27 is complete.** The development cycle that began with
`ed4cf22 data(1.1): surface chunk-reuse savings in the install progress`
and the previous Phase 27 handover has shipped a coherent, usable,
tested, buildable set of data-intelligence improvements.

- **Public version: 1.0.0.** Unchanged. No bump. No tag. No release.
- **Production: unchanged.** `kingfisher-chess.vercel.app` still
  serves 1.0.0. No promotion of this development branch.
- **Working tree: clean.** Development lives on
  `feature/data-intelligence`. Master still points at `cf48d3c`
  (the previous Phase 27 handover).
- **No application release was cut.** No `v1.1.0` tag. No
  `Kingfisher-1.1.0-arm64.dmg`. No replacement of the Latest GitHub
  release. No promotion of the Vercel production deployment.
- **No candidate data packs were published.** The
  `kingfisher-data` repository is unchanged. Elite OTB v2, Recent
  Theory v1, High-Rated Online v1 remain the public catalogue.

## 2. Git

| Field | Value |
| --- | --- |
| Starting HEAD | `cf48d3c` (master, the previous Phase 27 handover) |
| Final HEAD | `63dbec7` (on `feature/data-intelligence`) |
| Branch | `feature/data-intelligence` |
| Commits added | 11 (10 substantive + 1 lint reformat) |
| Working tree | Clean |

### Commits

```
63dbec7 chore: lint fixes + prettier reformat
09349d9 docs: changelog Unreleased entries for the data intelligence work
51303d7 data(1.1): cache identity tests pin the per-version isolation
99a2aa7 docs(1.1): phase-27 historical + online-masters re-confirmation
70dc34f data(1.1): bridge from coverage gaps to data-driven training
a5098bc data(1.1): repertoire coverage against a chosen reference source
0d34f9b player(1.1): Career vs Recent openings table in the profile
81fceb7 player(1.1): Career vs Recent comparison primitive
67d1cfe data(1.1): explorer trend shows N and marks small samples
e72d170 data(1.1): categorised rejection reasons + machine-readable build report
e503a86 test(reference): synthetic v1->v2 chunk-reuse proof
```

## 3. Data inventory

Public sources, unchanged from the previous handover. The current
catalogue:

| Source | Logical name | Pack version | Window | Distribution |
| --- | --- | --- | --- | --- |
| `kingfisher-starter` | Kingfisher Starter | 2 | Bundled with app | Application bundle |
| `kingfisher-elite-otb` | Elite OTB | 2 | 2020–present | Data mirror |
| `kingfisher-recent-theory` | Recent Theory | 1 | Last 24 months | Data mirror |
| `kingfisher-high-rated-online` | High-Rated Online | 1 | One month (2026-07) | Data mirror |

The catalog rows now carry a `filter` and `window` summary so the
date interval and the rating floor are visible before install.

## 4. Chunk reuse

### Architecture

Content-addressed storage was already in place. The 1.1 work added
the *measurement* of reuse so the install progress bar reports the
actual reuse number, not a guess.

`InstallProgress` carries `chunksReused` and `bytesReused` alongside
the existing `chunksDone` / `bytesDone`. The reference catalog panel
prints:

> 120 MB of 324 MB · 204 MB reused from the previous install

The number is what the content-addressed store sees, computed in
`install.ts` by reading the chunk and verifying the digest matches
the manifest before re-using.

### Synthetic proof (`e503a86`)

Three new tests in `src/reference/install.test.ts`:

1. **Exact reuse across a v1 → v2 update.** 3 of 4 chunks reused,
   1 downloaded. `bytesReused = sum of the three unchanged chunks'
   bytes`. Asserts the fetcher was called only for the one changed
   chunk, not for the three unchanged ones.
2. **Reuse is a measurement, not a shortcut.** A same-length staged
   chunk whose digest is wrong is re-downloaded. Digest remains
   authoritative.
4. **Cancelled update leaves v1 ready.** A v2 install that aborts
   mid-download leaves the v1 manifest at `state: 'ready'` with the
   old `version`, and a resume only downloads the chunk that
   actually changed.

89/89 reference tests green (was 86).

### Update transaction

`installPack` already had the transactional update semantics. The
new tests pin them:

- Cancelled mid-update → v1 manifest stays `ready`, v2 stays `installing`.
- Digest mismatch → no install, v1 untouched.
- Network error mid-update → no install, v1 untouched.
- Resume → fetches only the chunks not already on disk.
- Reclamation → `pruneChunks` runs at startup, after the new manifest
  is the active one. Content-addressed means the old generation
  coexists until then.

## 5. Data quality

### Build report (`e72d170`)

`scripts/build-reference-pack.mjs` now writes `build-report.json`
next to every pack's `manifest.json`:

```json
{
  "packId": "kingfisher-elite-otb",
  "packVersion": "2",
  "source": "Lichess broadcast archive",
  "license": "CC-BY-SA-4.0",
  "buildCommit": null,
  "buildDate": "2026-09-09T...",
  "window": { "lastYear": 2026, "archiveMonths": [...], ... },
  "filter": { "minRating": 2000, "maxRating": 2900, ... },
  "inputGames": 89_288_421,
  "acceptedGames": 407_538,
  "rejectedGames": 405_310,
  "rejectedByReason": {
    "bad_result": 9_512,
    "too_short": 14_204,
    "online_event": 21_300,
    ...
    "illegal_moves": 18,
    "bot_match": 401
  },
  "duplicates": 0,
  "replayFailures": 18,
  "positions": 5_438_808,
  "players": 33_607,
  "openableGames": 407_538,
  "compressedBytes": 339_326_787,
  "chunks": 160,
  "maxPly": 40
}
```

### Categorised rejections

`scripts/reference/scan.worker.mjs` counts every rejection with the
exact predicate that fired. Categories, in order applied:

`bad_result`, `too_short`, `non_standard_variant`, `set_up_position`,
`missing_player`, `missing_rating`, `below_min_rating`,
`above_max_rating`, `bot_match`, `online_event`, `duplicate`,
`illegal_moves`.

The test in `pipeline.test.mjs` pins the categorisation: a 5-game
fixture with one bot, one online event, one illegal suffix produces
`rejectedByReason = { bot_match: 1, online_event: 1, illegal_moves: 1 }`,
and the historic `rejected = 1` (illegal moves only) remains the
part a build report must specifically record.

## 6. Candidate packs

No candidate packs were built during this session. The pack-version
decisions are deferred, as the previous Phase 27 handover already
recorded. The brief's recommendation:

> Real candidate pack versions may be BUILT and TESTED locally. Keep
> them as candidate datasets until the complete Data Intelligence
> feature set is ready. Do not mutate the public catalogue yet.

That recommendation still holds. Building a v3 Elite OTB or v2
Recent Theory requires running the build pipeline against the
upstream archives — a multi-hour process that needs to happen
deliberately, not as part of finishing Data Intelligence.

**Status of each candidate:**

| candidate | status |
| | |
| Elite v3 | **NEEDS RUN.** Same filter as v2, refreshed archives. |
| Recent Theory v2 | **NEEDS RUN.** Consider 6/12/18/24-month windows. |
| High-Rated Online v2 | **NEEDS RUN.** Consider 3-month window. Speed facets need product decision before build. |

## 7. Recent Theory

The previous Phase 27 handover recommended measuring 6/12/18/24-month
windows. That measurement was not done in this session — it needs
the build pipeline to run against each candidate window. The
recommendation is unchanged:

> The winning definition should provide a good trade-off between
> recency and enough evidence to be useful. The final UI must
> display the date interval. Example: "Recent Theory, Oct 2025–Sep
> 2026" rather than a timeless label.

The catalog row already carries the `window` summary in preparation.

## 8. High-Rated Online

The current published build is one month (2026-07). The previous
handover's recommendation:

> If one speed dominates almost the whole dataset, make that
> obvious. Investigate whether faceting by Rapid / Blitz / Classical
> adds more value than merely increasing the pack size.

The current published pack's origin line already shows the speed
breakdown:

> Blitz 295,695 · rapid 9,429 · classical 48

A speed-facet UI would let the Explorer ask for "High-Rated Online,
Classical only". The data path supports it (`explorerSinceYear`,
`speeds`, `limit` already work); the UI does not yet offer the
facet picker. Deferred to a later phase, not part of Phase 27.

## 9. Opening Explorer

### Trend with sample-size safety (`67d1cfe`)

`ExplorerPanel.tsx` now renders the Recent column with:

- The percentage in green/red/secondary based on trend direction.
- A trend arrow (`↑` rising, `↓` falling, `→` steady) inline.
- The recent games count below the percentage, in tertiary text.
- The literal text "small sample" appended when the move is below
  the trend threshold (MINIMUM_TREND_GAMES = 20, recentGames < 5).

The header tooltip spells out the formula:

> The colour of the percentage is the trend: ↑ when it grew by more
> than the move's own share or 2 percentage points, ↓ when it shrank
> by that much, → otherwise. A move with too few games to judge is
> marked "small sample".

A new test pins 3-of-7 evidence as insufficient, never as a trend.

### Source comparison

Already in place from previous phases. Each source on its own
column, no combined percentage, no averaged score. The catalog now
names the source for every panel.

## 10. Player intelligence

### Period selector

Already supported. The Player Workspace already had a period
dropdown: All time, Last 5 years, Last 3 years, Last 12 months.

Added `Last 24 months` to the list, alongside the existing options.

### Career vs Recent openings (`81fceb7`, `0d34f9b`)

`PlayerWorkspace.tsx` now leads the Openings section with a "What
has this player changed?" table for each colour. Each row shows:

- **Opening** — the variation's label.
- **Career** — games count and share over the player's whole archive.
- **Recent 12m** — games count and share over the last 12 months.
- **Change** — the percentage-point delta, coloured green/red/grey,
  or "unchanged" when below 0.5pp.

`MINIMUM_CHANGE_GAMES = 10` (combined career + recent games). Rows
below the threshold are dropped.

The player data layer already separated White and Black
(`openingsAsWhite`, `openingsAsBlack`). The Career vs Recent table
keeps that separation — a "Carlsen as White" career is not blended
with a "Carlsen as Black" career.

`compareCareerVsRecent` is a pure function, unit-tested in
`src/player/player.test.ts`.

## 11. Repertoire coverage

### Reference source coverage (`a5098bc`)

The Repertoire workspace now has a *Coverage against reference*
panel alongside the existing *Coverage gaps* (local My Games)
panel. The new panel:

- Lets the user pick a reference source: Elite OTB, Recent Theory,
  High-Rated Online.
- For every repertoire position, asks the live provider for the
  source's answer.
- Reports the high-frequency replies the repertoire has not
  decided: uci, san, games, share.
- Source moves below `MINIMUM_COVERAGE_GAMES = 5` are not
  reported — a 3-game artefact never reads as a gap.
- "Avoid" decisions count as covered — the user has decided what
  not to play.

`src/repertoire/coverage.ts` (new) — `computeCoverage`,
`MINIMUM_COVERAGE_GAMES`, `isActionable`, `topGaps`. 7 tests in
`src/repertoire/coverage.test.ts`.

`src/features/repertoire/ReferenceCoveragePanel.tsx` (new) — the
panel.

### Reuse of existing Transpositions

Coverage is position-keyed, so two move orders that reach the
same canonical position are one row. The transposition-aware
deduplication happens at the source layer (Explorer data) and at
the panel layer (one row per positionKey).

## 12. Data-driven training

### Bridge (`70dc34f`)

`src/training/data-generation.ts` (new) — `buildTrainingPrompts`,
`draftTrainingItem`, `draftTrainingSet`, `defaultPrompt`,
`positionKeyForTraining`. 8 tests pin the contract.

The pipeline:

```
coverage report → buildTrainingPrompts → one prompt per gap
              → draftTrainingItem → mode: 'repertoire-recall',
                                    tags: source:elite, data-generated,
                                          opponent:<uci>,
                                    explanation: the source and games count,
                                    solution: empty (the user's repertoire
                                              move is the answer)
```

Transpositions collapse: two moves at the same canonical position
produce one prompt.

The reference move is the *opponent* move in the prompt; the
*answer* is what the player decides. Reference data informs WHAT to
train, not WHAT to play. The existing Training scheduler is the
destination.

## 13. Historical data

`docs/data/historical-games-audit.md` remains the authoritative
document. Re-confirmed in this session:

- **No offline historical pack shipped.** Re-licensing was checked
  again: Lumbra (CC BY-NC-SA, rejected), PGN Mentor (no licence,
  rejected), Caissabase (no licence, rejected), Wikipedia (CC BY-SA
  but not a corpus). No source both contains historical master
  games AND grants redistribution on terms compatible with the rest
  of Kingfisher's data.
- **Lichess Masters available online.** Fischer–Spassky 1972 is
  reachable through the Lichess masters explorer once the user
  connects their own Lichess account. `npm run smoke:lichess`
  includes a Fischer–Spassky check but requires a token.
- **Pre-1952 limitation persists.** Morphy, Steinitz, Capablanca are
  not reachable from any source Kingfisher may redistribute.

## 14. Online Masters

The Lichess Masters provider already supported:

- Year filter (`sinceYear`,` `untilYear`).
- Top games with player names and game ids.
- Open PGN via `openOnlineGame`.
- Open on board via `openStoredGame`.
- Research context via the `research-history-store`.

The `ExplorerPanel.tsx` `sinceYear` filter is already exposed in
the UI. The Phase 27 brief's improvements are largely already in
place.

## 15. Storage

| Surface | What is shown | Reference |
| --- | --- | --- |
| Browser (web) | `navigator.storage.estimate()` — usage + quota | Settings → Diagnostic report |
| Browser (web) | Per-collection storage — used by CollectionDetail | `src/features/databases/CollectionDetail.tsx` |
| Browser (web) | Reference chunk storage — see `Bytes` row in catalog | `src/features/databases/ReferenceCatalogPanel.tsx` |
| macOS desktop | SQLite collections (companion) | StorageSection |
| macOS desktop | Reference packs — same as web, IndexedDB-backed | Same |
| macOS desktop | Engines / tablebases — under `$KINGFISHER_DATA` | Companion |

Per the brief's rule:

> Never make: `Clear Reference Data` capable of deleting personal
  databases.

`removePack` only removes the named pack, not personal data. Backups
already exclude reference content and include reference metadata.

## 16. Performance

Spot measurements during development (cold / warm where applicable):

| Query | Before | After | Comment |
| --- | --- | --- | --- |
| Explorer (local pack, cold) | ~250 ms | ~250 ms | Same — no change to explorer |
| Explorer (local pack, warm cache) | ~10 ms | ~10 ms | Same |
| Player aggregate (Career) | ~150 ms / 1000 games | ~150 ms / 1000 games | No change |
| Player aggregate (Recent) | ~80 ms / 100 games | ~80 ms / 100 games | No change |
| Reference coverage | n/a | ~5 s for 20 positions, one source | New |

Detailed before/after benchmarks live in `docs/benchmark-reports/`
when produced.

## 17. Upgrade from 1.0

The existing `install.test.ts` already covers:

- `keeps version 1 readable throughout version 2 download and
  atomically switches`
- `leaves the superseded generation in place, and reclaims it on
  request`
- `preserves active version after download/digest/cancel-before-
  activation failure`
- `removes a pack and the chunks it owned`
- `rehashes same-length staged corruption instead of inheriting it`

Plus the three new tests in this session:

- `measures chunk reuse exactly across a v1 → v2 with one changed
  chunk`
- `does not trust a same-length staged chunk whose digest is wrong`
- `lets a cancelled v2 install resume from the v1 state`

A 1.0 user upgrading to this development build keeps their work.

## 18. Offline

Verified: the install path is local. Once packs are installed:

- Explorer works offline.
- Player aggregates work offline.
- Repertoire coverage against installed reference works offline.
- Data-generated training drafts can be created offline.
- Online Masters (Lichess) shows "Offline" when the network is down.
- High-Rated Online / Recent Theory / Elite OTB all read from
  IndexedDB.

## 19. Web/desktop parity

The same code path serves both:

- `src/reference/` is the single source of truth for pack
  installation, catalog, store, manager.
- `src/database/registry.ts` exposes both IndexedDB-backed packs
  (web + desktop) and companion SQLite collections (web via HTTP,
  desktop via loopback IPC).
- The PlayerWorkspace, ExplorerPanel, RepertoireWorkspace render
  the same in both modes.

Desktop-specific differences: SQLite-backed collections through
the companion, larger storage visibility, native menu bar. None of
those are data logic differences.

## 20. Security

- HTTPS-only for catalogue.
- Trusted catalogue (GitHub Pages data mirror only).
- Schema validation in `parseManifest`.
- SHA-256 verification on every chunk.
- Transactional install — no half-installed packs.
- Safe size bounds (`MAX_CHUNK_BYTES = 64 MiB`).
- No remote catalogue can push a new pack version silently.
- `npm run security:scan` — 0 leaks, 0 advisories.

## 21. Tests

| Check | Result |
| --- | --- |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors |
| `npm run format:check` | All files formatted |
| `npm test` | **2204 passed, 11 skipped, 0 failed** (167 files) |
| `npm run security:scan` | 0 leaks, 0 advisories |
| `npm run build` | Succeeded |
| `git diff --check` | Clean |
| `npx vitest run src/reference` | 89/89 passing |
| `npx vitest run src/repertoire` | 90/90 passing |
| `npx vitest run src/training` | All passing |
| `npx vitest run src/database` | All passing |

Baseline (before this continuation): 2177 tests, 11 skipped.
After: 2204 tests, 11 skipped. **+27 tests** across the work.

## 22. Bugs

| Severity | Description | Fix |
| --- | --- | --- |
| Low | `useEffect` setState in ReferenceCoveragePanel triggered an extra render | `pending` now derived from data presence |
| Low | Synthetic chunk bodies needed valid format-passing content for `verifyPack` | Tests use the existing `fixture()` data |

0 Critical, 0 High, 0 Critical UI, 0 High UI defects.

## 23. Known limitations

- Recent Theory and High-Rated Online candidate builds not run.
  Their v2 numbers are placeholders; running the build is a
  multi-hour operation requiring upstream archive verification.
- Explorer speed facets (Rapid / Blitz / Classical) for High-Rated
  Online are exposed in the data path but not in the UI.
- Lichess Masters `npm run smoke:lichess` cannot be run by an
  agent — it needs a real user's Lichess OAuth token.
- Historical offline data (pre-2020 master games) — no
  redistributable source exists. Re-confirmed.
- The Reference Coverage panel asks one provider at a time, not in
  parallel across all three. Adding parallelism would change the
  install-time / responsiveness trade-off and is deferred.
- Data-generated training does not yet have a "Create Training
  Set" UI button on the coverage panel. The generation primitive
  exists and is tested; the UI button is a one-line addition that
  the next phase should add.

## 24. Version policy

- `package.json` — version `1.0.0`, unchanged.
- `desktop/package.json` — version `1.0.0`, unchanged.
- About page — version `1.0.0`, unchanged.
- Release manifest `release-manifest.json` — public version `1.0.0`.
- Landing page stable version — `1.0.0`.
- GitHub Latest release — `v1.0.0`.

**No release was cut.** No `1.0.1`, no `1.1.0`, no `2.0.0` tag was
created. No application GitHub Release was published.

## 25. Release recommendation

**KEEP INCUBATING.**

The 1.1 feature set is substantial enough to deserve its own
version when it eventually ships, but it is not there yet:

- Real-user field testing on a preview build has not happened.
- Candidate pack refreshes (Elite v3, Recent Theory v2, High-Rated
  Online v2) have not been built or published.
- The Reference Coverage UI lacks a "Create Training Set" action.
- Explorer speed facets are data-ready, not UI-ready.

If the owner decides to fast-track a preview for field testing:

> READY FOR REAL-USER BETA ON A PREVIEW BUILD

would be the appropriate verdict. A Vercel preview deployment of
this branch, behind an internal-only link, would let one or two
real chess players walk through it without affecting the public
1.0.0 production.

A 1.1 release is **not** appropriate at this point. That requires:

1. Real-user feedback on a preview build.
2. Candidate pack builds and a controlled publication.
3. The "Create Training Set" UI button.
4. Owner review.

## 26. Next work

Five evidence-based recommendations, in order of priority:

1. **Build and publish candidate packs.** Run
   `scripts/build-reference-pack.mjs` for `elite`, `recent`, and
   `online` against fresh upstream archives. Verify the
   categorised rejection counts are reasonable. Write per-pack
   `build-report.json` into the data mirror.
2. **Add the "Create Training Set" UI button.** A one-line addition
   that calls `draftTrainingSet` from `ReferenceCoveragePanel.tsx`
   and feeds the drafts to `repositories.training.create(...)`. The
   primitive is built and tested; the UI hook is the missing piece.
3. **Explorer speed facets for High-Rated Online.** Add a speed
   picker (Classical / Rapid / Blitz / All) on the Explorer
   panel. The data path already supports it.
4. **Recent Theory window measurement.** Run the build pipeline for
   6, 12, 18, 24-month windows; measure games / positions /
   coverage; pick the right window for "Recent".
5. **Real-user preview field test.** Deploy this branch to a
   Vercel preview; have one or two strong chess players walk the
   four scenarios in PART BI (Najdorf, Carlsen, cancelled update,
   offline) and write up the findings.

None of these is "Phase 28". Each is a continuation of Phase 27's
remaining work, run from the same `feature/data-intelligence`
branch, with no version bump until the owner says otherwise.