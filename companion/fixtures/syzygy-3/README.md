# syzygy-3 — the complete three-piece Syzygy set

Ten real tables, 56 KB in all: `KQvK`, `KRvK`, `KPvK`, `KNvK`, `KBvK`, WDL
(`.rtbw`) and DTZ (`.rtbz`) each. Every file's SHA-256 matches the entry for
it in the publisher's own manifest at
`https://tablebase.lichess.ovh/tables/standard/sha256`, and
`companion/src/tablebase-fixture.test.mjs` pins those digests so the files
cannot drift.

They are real because what reads them is real: the packaged application's
probe helper (`kingfisher-tbprobe`, Fathom) opens these tables in
`npm run desktop:smoke -- --packaged` and is asked whether a rook against a
bare king is won. For a short while in Phase 40 the four WDL files were
replaced by four-byte stubs so that a mock helper could answer from a
dictionary; the mock still reads only the filenames and still works, but the
packaged probe read `stub` as a tablebase and reported no win, and
`THIRD_PARTY_DATA.md` went on describing a verified set. The tables are back
and the digests are asserted.

The mock helper at `companion/src/__fixtures__/mock-tbprobe-helper.mjs`
exists for the protocol tests; the real helper is built by
`npm run tablebase:install` and staged into the bundle by
`scripts/build-desktop-web.mjs`.
