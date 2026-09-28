# Test fixtures

`bench-1k.pgn` — one thousand synthetic games (players, events and moves are
generated, not real), written on 2026-09-01 by `scripts/generate-pgn.mjs` at
seed 20260901. The unit tests of the query model and the companion's posting
index, and the Library continuity browser test, compare their answers against
an exhaustive read of these exact games, so the bytes are committed rather
than regenerated: the generator has changed since, and a regenerated file
would silently change what those tests hold.

It was once read from `public/bench/`, which is generated and git-ignored; the
tests passed on the machine that had the file and failed on every clean
checkout, CI included. `npm run docs:check` now fails when a test reads an
ignored path.
