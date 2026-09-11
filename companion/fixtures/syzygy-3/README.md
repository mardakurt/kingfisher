# syzygy-3 — stub fixture for the tablebase-helper tests

This directory contains empty files named after real Syzygy
three-piece tablebases. The mock helper at
`companion/src/__fixtures__/mock-tbprobe-helper.mjs` reads the
filenames to determine the largest piece count (3) and then
answers probe requests from its in-memory dictionary.

The fixtures are not real tables and never will be: shipping
the actual 56 KB set in this repository would not change what
the tests prove, and would couple the test suite to Fathom's
build pipeline. The mock and the dictionary in `mock-tbprobe-helper.mjs`
are the contract the helper-process management relies on, and
they are kept small on purpose.

If the real tables are ever wanted for a manual certification
run, see `docs/operations/real-tablebase-cert.md`.
