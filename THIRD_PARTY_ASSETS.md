# Third-party assets

Everything in this file is somebody else's work, used under the licence named
against it. Kingfisher's own code is not covered here.

The rule this project follows: **an asset is only vendored once its licence has
been read, the redistribution terms confirmed, and the attribution recorded.**
"It came from an open-source project" is not a licence — a repository's code
licence and its artwork licence are frequently different, and in chess software
they usually are.

---

## Chess piece artwork

All ten sets live under `public/piece/<set>/` as twelve SVG files
(`wK wQ wR wB wN wP bK bQ bR bB bN bP`). They are used **unmodified**: the files
are byte-identical to their upstream sources, which keeps the attribution
honest and makes re-vendoring a newer version a straight copy.

| Set        | Author                      | Licence                                                                             | Source                                                                                            |
| ---------- | --------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Cburnett   | Colin M.L. Burnett          | [GPL-2.0-or-later](https://www.gnu.org/licenses/gpl-2.0.txt)                        | [Wikipedia](https://en.wikipedia.org/wiki/User:Cburnett/GFDL_images/Chess)                        |
| Merida     | Armando Hernandez Marroquin | [GPL-2.0-or-later](https://www.gnu.org/licenses/gpl-2.0.txt)                        | [lila `public/piece/merida`](https://github.com/lichess-org/lila/tree/master/public/piece/merida) |
| Chessnut   | Alexis Luengas              | [Apache-2.0](https://github.com/LexLuengas/chessnut-pieces/blob/master/LICENSE.txt) | [chessnut-pieces](https://github.com/LexLuengas/chessnut-pieces)                                  |
| Fantasy    | Maurizio Monge              | [MIT](https://github.com/maurimo/chess-art/blob/main/LICENSE)                       | [chess-art](https://github.com/maurimo/chess-art)                                                 |
| Spatial    | Maurizio Monge              | [MIT](https://github.com/maurimo/chess-art/blob/main/LICENSE)                       | [chess-art](https://github.com/maurimo/chess-art)                                                 |
| Celtic     | Maurizio Monge              | [MIT](https://github.com/maurimo/chess-art/blob/main/LICENSE)                       | [chess-art](https://github.com/maurimo/chess-art)                                                 |
| RhosGFX    | RhosGFX                     | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)                       | [RhosGFX](https://rhosgfx.itch.io/)                                                               |
| Kiwen Suwi | neverRare                   | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/)                           | [kiwen-suwi](https://github.com/neverRare/kiwen-suwi)                                             |
| Firi       | James Faure                 | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/)                           | [Firi-pieceset](https://github.com/jfaure/Firi-pieceset)                                          |
| MPChess    | Maxime Chupin               | [GPL-3.0-or-later](https://www.gnu.org/licenses/gpl-3.0.html)                       | [mpchess](https://github.com/chupinmaxime/mpchess)                                                |

Licence provenance for Cburnett and Merida was taken from
[lila's `COPYING.md`](https://github.com/lichess-org/lila/blob/master/COPYING.md),
which is the upstream distributor's own record of each set's author and terms.

### Obligations these licences create

- **GPL-2.0-or-later** (Cburnett, Merida). Copyleft. If Kingfisher is
  distributed with these files, the artwork must remain under GPL-2.0-or-later
  and recipients must be able to get the SVG sources — which they can, because
  the SVGs _are_ the source and they are in this repository, unmodified. The
  GPL applies to the artwork, not to Kingfisher's own code: the pieces are
  separate data files loaded at runtime, not a derivative of or linked into the
  application. Removing `public/piece/cburnett` and `public/piece/merida` leaves
  a working application with eight sets, so this is a severable dependency.
- **GPL-3.0-or-later** (MPChess). The same source-availability and severability
  reasoning applies, but this set remains under its own GPL-3.0-or-later terms.
- **Apache-2.0** (Chessnut). Permissive. Requires the licence notice and
  attribution, both of which are here and in Settings → Pieces.
- **MIT** (Fantasy, Spatial, Celtic). Permissive. Requires the copyright notice, which
  is retained inside the SVG files and recorded here.
- **CC0-1.0** (RhosGFX). The author dedicated the artwork to the public domain;
  attribution is retained here as provenance.
- **CC-BY-4.0** (Kiwen Suwi, Firi). Redistribution is permitted with author,
  source and licence attribution, all recorded here and in Settings → Pieces.

The files are vendored as the twelve upstream SVGs for each set. Kingfisher
does not alter path geometry or recolour them; it only chooses their directory
through the piece-set registry and renders the selected file as an image.

### Sets deliberately not used

Many well-known sets — Maestro, Staunty, Dubrovny, California, Cardinal, Gioco,
Fresca, Tatiana, Icpieces, Horsey, Anarcandy, Cooke, Monarchy, Caliente, Xkcd —
are **CC BY-NC-SA**. The non-commercial clause is incompatible with keeping
Kingfisher's distribution options open, and a licence that would have to be
revisited before the project could ever be sold, bundled or offered as a
service is a licence that does not belong in it. They were excluded for that
reason and not for quality.

Alpha, Companion, Leipzig, Chess7, Reillycraig and Riohacha are variously
"freeware", "free for personal non-commercial use", or carry no stated licence
at all. Unclear terms are treated the same as unusable terms.

Shahi is explicitly non-derivative. Not used.

---

## Board artwork

**None vendored.** All twelve board themes in `src/features/board/themes.ts`
are Kingfisher's own: flat colour pairs, with the three wood themes (Walnut,
Maple, Sand) adding a grain generated at runtime by `grainPattern()`. No
texture was sampled from ChessBase, Chess.com or any other application.

This was a deliberate choice after investigating the alternative. lila ships
wood and marble boards under AGPLv3+ as fixed-size JPEGs of 94–515 kB each.
Two problems made them the wrong dependency:

1. **They are raster.** A Kingfisher board is rendered anywhere between a 180px
   study thumbnail and a 900px analysis board, and Retina doubles both. A fixed
   texture has to be resampled for nearly every one of those sizes and will
   either blur or moiré; the generated SVG grain is correct at all of them.
2. **AGPLv3+ on artwork.** The network-use clause is written for programs, and
   its application to decorative image files bundled in a client is genuinely
   unclear. Taking on an ambiguous copyleft obligation for a wood texture, when
   a better-looking one can be generated in a kilobyte, is a poor trade.

The generated grain is deterministic (seeded per tone), so a board does not
change appearance between renders, and it costs no network request.

---

## Chess engines

Engine binaries are **not** committed. They are downloaded on demand by
`npm run engines:install`, which records what it fetched, from where, and under
what licence. See [`docs/ENGINES.md`](docs/ENGINES.md) for the full table and
the obligations each engine's licence creates.

---

## Opening classification data

`data/openings/{a,b,c,d,e}.tsv` are the five ECO volumes of
[lichess-org/chess-openings](https://github.com/lichess-org/chess-openings),
vendored byte-identical at commit `4b8622759e7ae6f93f011cc6c83a3823401ab45e`
(2026-08-04) — 3,810 named openings.

Licence: **CC0 1.0 Public Domain Dedication**. Upstream's own wording is that
the data set is a collection of facts and therefore in the public domain, with
CC0 applied to whatever curation effort might attract copyright. Redistribution
carries no conditions; the attribution here is a courtesy, not an obligation.

Two things are worth stating explicitly, because they are the reason this
particular dataset was chosen:

- **Nothing here derives from ChessBase.** Most machine-readable ECO tables in
  circulation are transcriptions of the Encyclopaedia's book text or of
  ChessBase's opening key. This one is curated independently and is the
  classifier lichess.org itself runs.
- **The files are not read at runtime.** `npm run openings:build` replays every
  line through Kingfisher's own rules code and writes
  `src/theory/opening-index.generated.ts`, keyed by canonical position identity.
  See [`data/openings/SOURCE.md`](data/openings/SOURCE.md).

---

## Syzygy tablebase decoding

`npm run tablebase:install` fetches four source files from
[jdart1/Fathom](https://github.com/jdart1/Fathom) at commit
`c9c6fef0dddc05d2e242c183acf5833149ab676d` and compiles them, together with
Kingfisher's own `companion/native/kingfisher-tbprobe.c`, into the probe helper
the companion manages.

Licence: **MIT**, © 2013–2018 Ronald de Man, © 2015 basil00, © 2016–2025 Jon
Dart. Redistribution and modification are permitted with the notice retained.

Not committed: the sources are fetched on demand and land in `engines/`, which
is ignored, alongside the engine binaries. The commit is pinned and the SHA-256
of every fetched file is recorded in `public/engine/tablebase.json`, so a build
can be told apart from one made against different source.

**Kingfisher contains no tablebase decoder of its own and will not.** Fathom
does every byte of Syzygy format handling; `kingfisher-tbprobe.c` is a FEN
parser, a request loop and a JSON writer. See
[ADR 0038](docs/adr/0038-a-managed-probe-helper-not-a-decoder.md) for why that
line is drawn where it is.

Tablebase _files_ are not distributed by anyone here. They are the user's, from
wherever they got them, and Kingfisher only reads the directory it is pointed at.

---

## Fonts

Inter and JetBrains Mono are loaded through `next/font/google`, which fetches
and self-hosts them at build time. Both are SIL Open Font License 1.1.

---

## The Kingfisher mark

`brand/kingfisher-mark.svg` and everything generated from it
(`src/app/icon.svg`, `src/app/apple-icon.png`, `public/icon-*.png`,
`src/features/shell/BrandMark.tsx`) are original work for this project, drawn
as plain geometry rather than traced from any photograph or existing logo.
Regenerate the rasters with `python3 scripts/render-brand-icons.py`.
