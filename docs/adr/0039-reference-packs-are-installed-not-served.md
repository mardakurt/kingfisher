# 0039. A reference pack is installed, not served

Status: Accepted

## Context

Phase 13's premise is that a fresh Kingfisher has chess data. That means
shipping a reference — 175,000 games as position aggregates, player rows and
full game scores, 9.5 MB compressed — and then deciding how the application
gets at it.

The obvious answer is to serve it. Put the files under `public/`, fetch the one
you need, done. It is less code, it needs no schema change, and the browser's
HTTP cache does the caching for free.

The second question is what shape the data takes. A single file is simplest and
puts a low ceiling on how much data Kingfisher can ever ship: a source that has
to be loaded whole cannot grow past what a tab can hold.

## Decision

**Sharded by a hash of the key.** A pack is a manifest plus gzip chunks, each
holding the entries whose key hashes into it. Answering "what is played in this
position" reads one chunk of a few hundred kilobytes, whichever pack it is —
which is what makes the size of a source stop mattering. The 175,000-game
bundled pack and the 422,000-game installable one cost the same per query.

**Installed into IndexedDB, including the bundled one.** The pack that ships
with the application is written into storage on first run from the
application's own static assets, exactly as a downloaded pack is.

**Chunks are stored compressed, exactly as fetched.** They are decompressed on
read, not on write.

**All or nothing.** The manifest is written as `installing` before any chunk is
fetched, each chunk's SHA-256 is checked before it is stored, and only a
complete verified set flips to `ready`.

## Consequences

The bundled pack could have been read straight from `/reference/` and it is
worth being explicit about what the extra code buys, because "we install our
own static files" reads like ceremony:

- **Offline.** A static asset is fetched over the network like any other. An
  explorer reading one stops working on a train, which is exactly the situation
  the bundled source exists for. `e2e/reference-sources.spec.ts` blocks every
  non-local origin and asserts the explorer and the engine both carry on.
- **One code path.** A source that every fresh profile uses, reached by a route
  no downloaded pack takes, would have been the one source no test of
  installation, verification, failure, resumption or removal ever exercised.
  Installing it means the machinery is exercised on every fresh profile, by
  every user, before anything optional is ever installed.

Storing chunks compressed buys a third of the space and, more usefully, keeps
the stored bytes byte-identical to what the digest in the manifest covers. An
installation is therefore re-verifiable _at any time_, not only while it is
being written. `verifyPack()` reports which chunks no longer match and repairs
nothing: silently re-downloading data a user has been citing is a change of
evidence nobody was told about.

The cost is a schema migration, an installer, a progress model and a failure
model — about 600 lines. The first install is 632 ms after the application
becomes interactive, and it happens once.

`DecompressionStream('gzip')` is native everywhere; `zstd` is not, in any
browser tested. That is why the _upstream_ archives, which are `.zst`, are
decompressed by the build script and never by the browser.
