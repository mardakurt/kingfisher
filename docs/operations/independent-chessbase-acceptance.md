# Independent comparison protocol

Generate a new, small kit:

```sh
node scripts/chessbase-acceptance.mjs /tmp/kingfisher-chessbase-check
```

The kit contains source PGN, newly written CBH companions, SHA-256s, writer
loss counts and an acceptance JSON with all external checks marked not-run.
Open the CBH in a licensed ChessBase installation. Record its exact version,
OS and test date. Verify each listed field against source.pgn, attach screenshots,
then export from ChessBase and import that result into Kingfisher. Preserve the
original kit. Use the existing preservation matrix to account for losses;
self-readback does not substitute for this check. Engine evaluation and
Kingfisher training-question annotations are not supported by CBH export.

Have strong players perform the six tasks in acceptance.json in both products,
using the same permitted corpus, positions and engine budget. Counterbalance
which application is used first. Record rating, successful completion, errors
and elapsed seconds, with unavailable features recorded rather than assigned
made-up times. Keep participant identity private in any published report.
Do not announce superiority from a fixture export or one unrecorded session.

The user confirmed on 2026-10-02 that no licensed ChessBase installation or
comparison participants were available for this run. The kit and protocol are
implemented; independent interoperability and usability acceptance remain open.
Mac package certification, public artifact verification and Windows runtime
acceptance are separate gates, using the repository's documented harnesses.
