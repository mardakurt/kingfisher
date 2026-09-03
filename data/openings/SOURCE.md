# Opening classification dataset

| Field           | Value                                                                 |
| --------------- | --------------------------------------------------------------------- |
| Source          | https://github.com/lichess-org/chess-openings                         |
| Upstream commit | `4b8622759e7ae6f93f011cc6c83a3823401ab45e`                            |
| Upstream date   | 2026-08-04                                                            |
| Licence         | CC0 1.0 Public Domain Dedication                                      |
| Redistribution  | Permitted without condition; attribution recorded here as a courtesy. |
| Files           | `a.tsv` … `e.tsv`, one per ECO volume, byte-identical to upstream     |
| Entries         | 3,810 named openings                                                  |

Upstream states: "As a collection of facts, this data set is in the public
domain. Considerable effort was spent curating and cleaning the data. Insofar
as that qualifies for copyright, the work is released under the CC0 Public
Domain Dedication."

## Why this dataset and not another

ECO codes themselves are a classification scheme, not a copyrightable work, but
most machine-readable ECO tables in circulation are transcriptions of the
Encyclopaedia's own book text or of ChessBase's opening key, and carry that
provenance with them. This one is curated independently, is the classifier
lichess.org itself runs, and its licence is explicit. Nothing here is derived
from ChessBase data.

## What Kingfisher does with it

`scripts/build-opening-index.mjs` replays every `pgn` column through
Kingfisher's own rules code and writes `src/theory/opening-index.generated.ts`,
keyed by Kingfisher's canonical position identity. The generator is the only
consumer of these files; the application never parses TSV at runtime.

Re-vendoring is a straight copy of the five files followed by
`npm run openings:build`, and the check in `openings.generated.test.ts` fails if
the generated index and the vendored source have drifted apart.
