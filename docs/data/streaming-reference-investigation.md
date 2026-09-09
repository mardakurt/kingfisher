# Streaming reference data — Phase 28 investigation

> What we discovered, what we built, what is left.

## The question

Phase 28 BC asks whether Kingfisher can use a multi-hundred-megabyte
reference source like Elite OTB without downloading the whole
thing up front.

## What the pack format already supports

The investigation found the format was _designed_ for streaming.
Every chunk carries its own SHA-256 and lives at a stable path
on the data mirror:

```
shardOf(positionKey, shards.explorer)  →  shard number
chunkId('explorer', shard)             →  explorer-NNN.kfp.gz
```

A position that exists in an installed pack resolves to the same
chunk a remote provider would fetch. That property means a partial
remote cache is equivalent to part of an install: when the user
later installs the pack for offline use, every chunk already on
disk is reused. Phase 27's content-addressed store made this
work; Phase 28 wires it to a provider.

## What was built

`src/database/providers/remote-reference.ts` — a
`ChessDatabaseProvider` implementation that:

- Resolves the chunk for a position via `shardOf`.
- Fetches that chunk over HTTPS, with a SHA-256 acceptance check.
- Caches the chunk by content hash.
- Returns an `ExplorerResult` synthesized from the cached chunk's
  per-position row.
- Uses the same `decodeExplorerLine` decoder as the installed
  reader (`src/reference/reader.ts`), so the row format is
  shared.
- Returns a `cacheVersion` of `${id}@${version}`, the same shape
  as the installed provider — a remote v2 cache and an installed
  v2 are interchangeable as far as the cache keys are concerned.

`src/database/providers/remote-reference.test.ts` — 5 tests pin:

- The provider fetches and decodes a row.
- A a position the chunk does not contain returns zero games.
- The decoder used by the skeleton produces the same row as the
  installed reader.
- The cacheVersion is the same shape as the installed provider's.

The skeleton is **not** wired into `database/registry.ts` yet.
That wiring is the next-phase work because it requires a Vercel
domain that serves the data mirror at per-shard URLs with
`Accept-Ranges`.

## What the brief required, and where it stands

| Item                                           | Status                                                                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Audit current pack format for streamability    | ✅ done                                                                                                                             |
| Reuse installed chunk store from partial cache | ✅ content-addressed store already supports it; `RemoteReferenceProvider` writes to the same shape                                  |
| Trust model: HTTPS + manifest + SHA-256        | ✅ done in skeleton                                                                                                                 |
| Cached chunks vs Installed chunks separation   | ⏳ schema exists in `reference-source-state.ts`; UI badge added; full catalog wiring is a UI phase                                  |
| LRU cache eviction                             | ❌ skeleton uses a TTL only; LRU + bounded size in a later phase                                                                    |
| Streaming parser for partial chunks            | ❌ today's pack chunks are ≤64 MiB; "download then parse" is acceptable. A 10x-elite pack would need a streaming parser             |
| Performance benchmarks                         | ❌ deferred until a real data mirror is wired                                                                                       |
| Full UI integration                            | ❌ the catalog already shows Online/Cached/Installed badges; the explorer needs a `kind: 'remote'` provider wired into the registry |

## What is gated

Three things must happen before a remote provider ships:

1. **A real data mirror with per-chunk URLs.** Today's mirror at
   `mardakurt.github.io/kingfisher-data/reference-elite-v2/` already
   serves the chunks as static files. A Vercel deployment behind
   `studio.kingfisher-chess.vercel.app/data/...` with
   `Accept-Ranges` advertised would let the provider work in
   production.
2. **A registered provider.** `database/registry.ts` would add a
   `RemoteReferenceProvider` instance per reference source. The
   skeleton implements the contract; the registry wiring is a
   small addition.
3. **A real-world test.** Measure cold / warm cache size for a
   typical research session (Phase 28 CY item 3). A 30-minute
   research session against Elite OTB should not exceed the brief's
   web cache ceiling (256 MB).

## What's deferred to a future phase

- Tiered data design (PART BM-BN): separating full-game payloads
  from explorer aggregates so the streaming source ships a small
  shard and the user fetches a specific game on demand. Today's
  pack format already has the shape for this (`kind: 'game'` is
  a separate chunk kind); the remote provider skeleton does not
  yet route game-fetches. Adding it is a small extension when
  needed.
- Compression benchmarks (PART BO): gzip vs Brotli vs zstd. The
  current format uses gzip, which is universally supported by
  `DecompressionStream` in every browser this app supports. The
  brief says "Do NOT switch format simply because another
  algorithm compresses 8% smaller" — so this stays an
  investigation, not a change.

## Conclusion

The streaming architecture is **design-correct** for Kingfisher's
pack format. The skeleton proves the contract and pins the tests.
The remaining work is wiring, not redesign. The skeleton is a
sufficient basis for the next phase to wire the registry, the
catalog row, and the explorer source without further design.

## References

- Phase 28 brief, parts BC through BL.
- Phase 27 final handover — `docs/reports/phase-27-final-handover.md`
- `src/reference/pack.ts` — pack format
- `src/reference/reader.ts` — installed pack reader
- `src/reference/manager.ts` — installed pack lifecycle
- `src/database/types.ts` — provider abstraction
