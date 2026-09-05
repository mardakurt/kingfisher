# Phase 15 audit and release evidence

An implementation ledger, not a release certificate. Everything here is either
a measurement with the command that produced it, or an open item. The source of
scope is the Phase 15 brief of 4 September 2026.

## Starting state

- `master` and `origin/master` at `5865656b9238e95b5243a14746daa5d51dce38f2`,
  clean.
- Existing release run
  [33915921784](https://github.com/mardakurt/kingfisher/actions/runs/33915921784),
  successful for that SHA.
- Initial unit suite: 115 files, 1,592 passing, 11 skipped. Typecheck, lint,
  formatting and production build passed.
- Browser suite: 154 passing, zero retries, 10.3 minutes.

## Defects found and what was done

Ordered by how badly each one could mislead a reader of Kingfisher's output.

| Area                | Finding                                                                                                                                                               | Resolution                                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine capabilities | Every native engine was assumed to honour UCI `searchmoves` because it is part of UCI. Running the fleet showed Viridithas 20, Halogen 16 and PlentyChess 8 ignore it | The companion's measured capability is now carried to the browser, and `UciSession` checks the returned move against the requested set and reports the mismatch         |
| Engine selector     | Berserk, Obsidian and Koivisto were added to the registry with Windows-only builds, so a Mac listed three engines that error when chosen                              | Definitions carry the platforms they publish for; the selector filters on the platform the companion reports. Lookup by id is unfiltered so running work keeps its name |
| Bundled reference   | The starter pack installed only if missing, so an existing profile kept a year-old, shallower table while this build's own data sat unused in its assets              | Start-up compares the shipped manifest's version and reinstalls from local assets when it differs                                                                       |
| Pack storage        | An update wrote a whole new generation of content-addressed chunks and nothing ever removed the old one — a 340 MB source updated monthly would cost 340 MB per month | `pruneChunks` at start-up, when no live reader can hold a superseded generation. Deliberately not during install, so another tab's open reader keeps working            |
| Catalog metadata    | The starter row advertised explorer depth 29 plies for a pack that had been rebuilt to 40                                                                             | The catalog test now asserts the row against the shipped manifest, so the two cannot drift again                                                                        |
| Engine list         | The browser engine appeared twice in Settings → Engines: once as its own row, once in the companion catalogue marked permanently unavailable                          | The companion's list excludes `kind: 'wasm'`, which it can neither install nor run                                                                                      |
| Update checks       | A failed update check set an error on every installed pack, so going offline turned every row red                                                                     | `PackInstallError` distinguishes `unreachable` from `invalid`; unreachable is silent, because nothing was learned                                                       |
| Build pipeline      | The scan cache was fingerprinted on all limits, so retuning a reduce-time threshold re-parsed 3 GB of archives                                                        | Only scan-time limits are fingerprinted. Retuning is now a one-minute reduce, which is what made the pruning measurements below affordable                              |
| Build pipeline      | `--reuse-scan` was parsed and never read                                                                                                                              | Removed; scan reuse is automatic and always was                                                                                                                         |
| Opening identity    | Classification stopped at the dataset's shortest-line depth, so a delayed transposition could be missed                                                               | Game-ply cap removed; the deepest classified ancestor is kept and labelled as such past the last named position                                                         |
| Engine licences     | PlentyChess recorded as MIT; Viridithas as AGPL-3.0-or-later                                                                                                          | Checked against each repository: GPL-3.0 and AGPL-3.0-only                                                                                                              |
| Pack distribution   | The Elite manifest URL pointed at a private repository's release assets, which redirect without CORS headers                                                          | Public data-only `mardakurt/kingfisher-data`, served over Pages with `access-control-allow-origin: *`. Verified end to end, including chunk digests                     |
| Pack install        | Install overwrote the active manifest before verification; a resumed chunk of the right length was accepted without rehashing                                         | Content-addressed staging, atomic activation, rehash on resume                                                                                                          |
| Pack reads          | A missing chunk read as an empty result, so a damaged pack answered "no games" instead of failing                                                                     | The reader verifies length and digest per chunk and raises                                                                                                              |

## Measurements

Every number below was produced by the command beside it on 5 September 2026.

| Command                                        | Result                                                                                                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run bench:opening-depth`                  | 3,810 named positions; median 9 plies, maximum 36 (18 full moves); 152 at ≥20 plies, 1 at ≥30, 0 at ≥40. A: 817, B: 772, C: 1,250, D: 614, E: 357              |
| `npm run bench:explorer-depth`                 | See `docs/data/reference-packs.md`. Most-played chain: starter 36 plies, Recent Theory 41, Elite 41                                                            |
| `npm run engines:verify`                       | 5 of 5 macOS arm64 engines installed, digest-checked, launched and interrogated. Full table in `docs/ENGINES.md`                                               |
| `npm run reference:build -- --pack starter`    | 172,376 games, 246,870 positions, 12,522 players, 12.3 MB, explorer depth 40 plies                                                                             |
| `npm run reference:build -- --pack recent`     | 44,200 games, 918,069 positions, 2,567 players, 33.8 MB, explorer depth 40 plies                                                                               |
| `npm run reference:build -- --pack elite`      | 407,538 games all with full scores, 5,438,808 positions, 33,607 players, 339.3 MB, explorer depth 40 plies                                                     |
| `node scripts/bench-player-search.mjs 1000000` | 1M metadata rows built in 56.3 s; exact-player median 44.2 ms / p95 921 ms; text `carlsen` median 70.1 ms / p95 1,074.2 ms. Synthetic metadata, not real games |

### Why the deep corpus percentages are a floor

`bench:explorer-depth` walks 31 hand-written theoretical lines. They are real
theory for the first twelve to fifteen moves; past that the continuations are
_legal_ rather than topical, because they were written from memory and repaired
against the rules engine until they were legal. A miss at 30 plies can
therefore mean "the pack is shallow" or "nobody has played this exact move
order", and the benchmark says so in its own output.

The **most-played chain** in the same report has no authoring risk: it takes
the pack's own commonest continuation at every step and counts how far that can
be repeated. Elite and Recent Theory both run to 41 plies, which is the
pipeline's `maxPly` cap rather than the end of their data.

## Open items

Stated as remaining work rather than filed as limitations.

- **High-rated online reference.** Not built. One month of the Lichess standard
  database is 29.05 GB compressed, measured downloading at 11.85 MB/s, and
  carries over 100 million games to parse before filtering. That is a
  build-machine job with a schedule. The pipeline needs a source entry, a pack
  definition and a rating filter, and no new concepts. The Lichess explorer's
  `lichess` database answers the same question live for a connected account.
- **Chess960.** Not supported, and now recorded as unsupported rather than left
  ambiguous: the rules code assumes standard castling squares. Engine
  `UCI_Chess960` support is measured and stored, so adding it is a question
  about Kingfisher rather than a survey of binaries.
- **Real-game million-row scale.** The 1M measurement above is synthetic
  metadata. The Elite pack's 407,538 real games with full scores is the largest
  real corpus measured end to end.
- **Lc0.** Catalogued as a `system` engine — located, not downloaded, because
  the project publishes no macOS or Linux release asset. Not live-tested in
  this phase; no capability is claimed for it.
