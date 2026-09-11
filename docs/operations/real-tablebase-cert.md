# Real-Syzygy certification run

Phase 40 closed the previous "skipped when no helper is built"
gate on the tablebase tests with a deterministic protocol-level
test against a Node script that speaks the same line-oriented
JSON protocol as Fathom's `kingfisher-tbprobe`. The mock is
small, the dictionary is audited, and `npm test` does not skip.

The remaining question — that the protocol-level answers agree
with what the real three-piece tables produce — needs a real
binary and a real tablebase directory. That is what this
document records. Run it before any release that ships a change
to the tablebase code path.

## What this run proves

1. The mock and the real binary produce the same answer for the
   same FEN.
2. The ready banner (`largest`) the real binary reports matches
   the piece count of the directory.
3. The real binary's "I don't have that" responses come back
   fast enough that the UI does not freeze.
4. The helper recovers from a real-binary crash (send SIGKILL,
   retry a probe).

## What this run does NOT prove

- Anything about the seven-piece or larger tables — only the
  three-piece set fits in the test environment and in this run.
- Anything about online / remote Syzygy providers — those are
  exercised by the network-dependent integration tests that
  live in `companion/` and which the public:check also covers.

## Prerequisites

- Node 24 (the engine Kingfisher ships with).
- `cmake` and a C compiler on `PATH`. Apple LLVM on macOS,
  gcc on Linux, MSVC on Windows.
- 60 KB of disk for the three-piece tables and the built
  `kingfisher-tbprobe` binary.

## Procedure

1. Fetch the upstream Lichess three-piece tablebase set:

   ```
   mkdir -p ./engines/tablebase/syzygy-3
   cd ./engines/tablebase/syzygy-3
   for piece in KRvK KNvK KBvK KPvK KQvK; do
     for ext in rtbw rtbz; do
       curl -fL "https://tablebase.lichess.org/tables/standard/${piece}.${ext}" \
         -o "${piece}.${ext}"
     done
   done
   cd -
   ```

2. Build Fathom's MIT-licensed `tbprobe` helper:

   ```
   git clone https://github.com/jdart1/Fathom /tmp/fathom
   cc /tmp/fathom/tbprobe.c -o ./engines/tablebase/kingfisher-tbprobe
   ```

3. Configure the helper for the cert run:

   ```
   export KINGFISHER_TEST_SYZYGY="$(pwd)/engines/tablebase/syzygy-3"
   export KINGFISHER_TEST_USE_REAL_TBPROBE=1
   ```

4. Run the helper tests with the real binary:

   ```
   npm test -- companion/src/tbprobe-helper.test.mjs
   ```

5. Cross-check the dictionary assertions against the real
   tables:

   ```
   npm test -- companion/src/tbprobe-real.test.mjs
   ```

   This is the file that asserts the dictionary carries the
   answers the real tables would give. With a real binary the
   tests still pass (the dictionary is identical), but the run
   should also be done by hand against the binary to confirm
   the dictionary is right.

6. Hand-run each FEN the dictionary covers against the real
   binary:

   ```
   printf '8/8/8/4k3/8/8/8/K2R4 w - - 0 1\n' \
     | ./engines/tablebase/kingfisher-tbprobe \
            --path=./engines/tablebase/syzygy-3
   ```

   Compare the output JSON to the entry in
   `companion/src/__fixtures__/tbprobe-answers.mjs`. Repeat for
   each FEN in the dictionary.

7. Kill the helper while a probe is in flight (open another
   shell):

   ```
   pkill -9 kingfisher-tbprobe
   ```

   The test that calls `helper.probe(...)` after a manual
   `helper.stop()` (`comes back after the process is stopped`)
   is the one that catches a helper that fails to restart.

## Recording

Append a dated entry to `docs/operations/real-tablebase-cert.md`
under `## Certification log` summarising:

- date
- operator
- Fathom commit
- helper build hash (`shasum -a 256 engines/tablebase/kingfisher-tbprobe`)
- tablebase digests (`shasum -a 256 engines/tablebase/syzygy-3/*.rtbw`)
- any divergence between dictionary and real answer
- verdict: PASS / FAIL

A FAIL blocks the release. PASS records the run and ships.

## Certification log

(empty — first run after Phase 40 lands is recorded here.)
