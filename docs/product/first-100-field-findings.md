# First-100 — Field findings

A ledger of real reports from real users. Each row is one
report. Reports are added when the maintainer receives them and
closed when the matching fix is shipped.

A row is never speculative. If no real report has arrived yet,
this file is the headings and a single line that says so, and
nothing else.

## Conventions

- `ID` is `WF-NN`, where `W` is the wave and `NN` is a
  zero-padded sequence in that wave (e.g. `W1-01`).
- `surface` is `web`, `pwa`, or `desktop`.
- `classification` is one of `BUG`, `DATA`, `FRICTION`,
  `PERFORMANCE`, `MISSING_CAPABILITY`, `ENHANCEMENT`, `SECURITY`.
- `severity` is one of `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`,
  `IMPROVEMENT`.
- `status` is one of `open`, `in-progress`, `fixed`,
  `wont-fix`, `duplicate`. A `duplicate` points at the row it
  duplicates.

## Columns per row

- ID
- wave
- surface
- classification
- severity
- reporter (initials only)
- reproduction
- root cause
- status
- fix commit
- regression test

## Wave 1

No real reports received during this phase. Wave 1 is ready
to start; the maintainer will populate rows here as reports
arrive.

## Wave 2

No real reports received during this phase.

## Wave 3

No real reports received during this phase.
