# Third-party data

Chess _data_ — games, positions, players, opening names — rather than code or
artwork. Artwork is in [`THIRD_PARTY_ASSETS.md`](THIRD_PARTY_ASSETS.md);
engines are in [`docs/ENGINES.md`](docs/ENGINES.md).

The rule this project follows is the same one it applies to artwork: **data is
only vendored or installed once its licence has been read, the redistribution
terms confirmed, and the attribution recorded.** Two things make chess data
harder than it looks, and both are why this file exists:

- **"Chess moves are facts" is not a complete answer.** Individual game scores
  are facts and are not copyrightable. A curated, cleaned, structured
  _collection_ of several million of them is a different question — the EU
  database right protects substantial investment in obtaining and verifying a
  database, independently of copyright in its contents. Kingfisher therefore
  looks for an explicit licence on the collection, not just on the moves.
- **Most machine-readable chess data in circulation has no stated provenance.**
  Large PGN archives are habitually re-uploaded without a licence, and a
  repository described as a "mirror" tells you nothing about what it mirrors.
  Unstated terms are treated here the same as unusable terms.

---

## Lichess broadcast archive

| Field         | Value                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| Source        | lichess.org open database — <https://database.lichess.org/#broadcasts> |
| Files         | `lichess_db_broadcast_YYYY-MM.pgn.zst`, one per month from 2020-01     |
| Licence       | **CC BY-SA 4.0** — <https://creativecommons.org/licenses/by-sa/4.0/>   |
| What it is    | Games relayed by lichess.org from official over-the-board tournaments  |
| Upstream size | 1,186,335 games at the time of writing                                 |
| Verification  | `sha256sums.txt`, published by lichess.org alongside the archives      |

This is the source of every reference pack Kingfisher ships or installs.

Lichess states the licence on the download page itself: broadcast games are
released under CC BY-SA 4.0, separately from the CC0 that covers its other
exports. The distinction is deliberate on their side and is respected here.

### What the licence requires, and where Kingfisher does it

- **Attribution.** Every pack manifest carries
  `Lichess broadcast archive — lichess.org, CC BY-SA 4.0`, and the catalog and
  the explorer's source header both show the licence of the source a statistic
  came from. It is on screen next to the data, not only in this file.
- **ShareAlike.** A reference pack is an adaptation of the archive, so the
  packs Kingfisher distributes are themselves **CC BY-SA 4.0**. This covers the
  pack files (`public/reference/**` and any published pack), not Kingfisher's
  own source code, which is a separate work that reads them.
- **No additional restrictions.** Packs are plain gzip over documented plain
  text, with the format specified in `src/reference/pack.ts` and the builder in
  `scripts/build-reference-pack.mjs`. Anyone can rebuild or unpack them.

### What Kingfisher does to the data

`scripts/build-reference-pack.mjs` downloads the monthly archives, checks each
one against the published SHA-256, decompresses it, reads the headers and
movetext, and then:

- drops games without a decided result, shorter than the pack's minimum, played
  from a set-up position, or in a variant other than standard chess;
- admits a game on the ratings the archive stated, or — when it stated none —
  on both players holding a title, so that match and exhibition events between
  titled players are not silently excluded;
- **excludes any game where a stated rating exceeds 2900.** This is not a
  quality filter but a species filter: the archive relays engine tournaments
  (TCEC) and online-rated events alongside over-the-board chess, and no human
  has ever held a FIDE rating above 2882. Left in, engines would dominate every
  "strongest games here" list and make every recorded peak meaningless;
- deduplicates by a content hash of the game, because one game relayed into two
  broadcasts appears twice upstream;
- replays every game through Kingfisher's own rules code (`src/chess/`) and
  aggregates the result by position;
- builds a player table, merging two spellings **only** when the archive itself
  recorded the same FIDE identifier against both.

No move is altered, and no statistic is invented. Everything in a pack is a
count of games that are in the upstream archive.

### Packs built from it

| Pack                       | Distribution                                     | Contents                                                                                                                        |
| -------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `kingfisher-starter`       | Committed, ships with the app                    | The most recent 36 monthly archives, games rated 2200+ (or between titled players), with full scores kept for games rated 2600+ |
| `kingfisher-recent-theory` | Public data-only Pages site, installed on demand | The most recent 24 monthly archives, games rated 2400+ (or between GM/IM/WGM), full scores for games rated 2500+                |
| `kingfisher-elite-otb`     | Public data-only Pages site, installed on demand | The whole archive from 2020, games rated 2000+ (or between titled players), full scores for every accepted game                 |

All three are derived from the same upstream under the same licence. The
difference between them is a window and a threshold, not a different
provenance story, and each pack's own manifest carries the licence,
the attribution string and the SHA-256 of every upstream file it read.

`public/reference/kingfisher-starter/manifest.json` records the exact upstream
files and their digests that the committed pack was built from, so what is in
the repository can be traced back to specific published archives.

---

## Opening classification dataset

| Field       | Value                                                       |
| ----------- | ----------------------------------------------------------- |
| Source      | <https://github.com/lichess-org/chess-openings>             |
| Licence     | **CC0 1.0 Public Domain Dedication**                        |
| Vendored at | `data/openings/{a,b,c,d,e}.tsv`, byte-identical to upstream |

See [`data/openings/SOURCE.md`](data/openings/SOURCE.md) for the pinned commit
and entry count, and `THIRD_PARTY_ASSETS.md` for why this dataset rather than
one of the ECO tables transcribed from the Encyclopaedia or from ChessBase.

---

## Polyglot book constants

| Field        | Value                                                                                  |
| ------------ | -------------------------------------------------------------------------------------- |
| What         | The 781 Zobrist constants the Polyglot `.bin` book format is defined by                |
| Where        | `src/book/polyglot-constants.generated.ts`, written by `npm run polyglot:constants`    |
| Fetched from | `chess/polyglot.py` in [niklasf/python-chess](https://github.com/niklasf/python-chess) |
| Verified     | Against the format's own published key for the initial position, `0x463b96181691fc9c`  |

These numbers are not a design decision and not an expressive work: **they are
the format**. A `.bin` opening book keys its entries on a Zobrist hash computed
with this exact array, so an implementation using any other numbers could not
read a single book that exists. They are the same kind of artefact as a CRC
polynomial, a codec's quantisation table, or an ECO code — a constant that
interoperability requires and that has only one correct value.

They are _generated_ rather than pasted so that the check is part of the build:
the Polyglot specification publishes the hash of the initial position, and 781
numbers that reproduce it are by construction the right 781 numbers. If a
re-fetch ever returned a different array, `scripts/build-polyglot-constants.mjs`
refuses to write it. The nine published worked examples are asserted in
`src/book/polyglot.test.ts`, including the two that exist to pin down the
en-passant rule.

python-chess is GPL-3.0. That licence covers python-chess as a program;
Kingfisher does not include, link to or derive from any of its code — it reads
one constant table out of it, and could equally have read it from the format
specification or from any of the dozens of implementations that carry it.

---

## En Croissant interoperability fixture

`src/database/encroissant/__fixtures__/en-croissant-0.15.db` (256 KB) and its
`.truth.tsv` companion exist so that Kingfisher's reader for another program's
database is tested against a file that program actually wrote, rather than
against this project's reading of its documentation.

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| Produced by     | En Croissant 0.15.1, `src-tauri/src/db` — its own importer, move encoder and insertion path |
| Database format | version 1.0.0, as recorded in the file's own `Info` table                                   |
| Contents        | 60 games, 4,000+ moves, including castling, promotions and checks                           |
| Games from      | Lichess broadcast archive, `lichess_db_broadcast_2026-06.pgn.zst`                           |
| Games licence   | CC BY-SA 4.0 — Lichess broadcast archive, lichess.org                                       |
| En Croissant    | GPL-3.0-or-later, <https://github.com/franciscoBSalgueiro/en-croissant>                     |

`.truth.tsv` is En Croissant's own decoding of the moves it had just encoded.
It is the reference the decoder is checked against, because En Croissant stores
a move as an index into the list its rules library generates — so a decoder that
orders that list differently produces moves that are legal, plausible and wrong,
and only a comparison against that program's own output can catch it.

The games are redistributed here under CC BY-SA 4.0 with the attribution above.
No En Croissant source code is vendored; the fixture is data it emitted.

## Syzygy three-piece tablebase fixture

`companion/fixtures/syzygy-3/` (56 KB, ten files) exists so that Kingfisher's
Syzygy probing is tested against real tables rather than against empty files
named as though they were tables. Every earlier tablebase test wrote a
zero-byte `KQvK.rtbw` and checked that the _scanner_ read the material out of
the filename, which proves nothing about whether a position can be answered.
Phase 19 could not close that gap because the machine had no tables and said
so; `companion/src/tbprobe-real.test.mjs` closes it.

|                 |                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Contents        | The complete three-piece set: `KQvK`, `KRvK`, `KPvK`, `KNvK`, `KBvK`, WDL and DTZ each                                              |
| Downloaded from | <https://tablebase.lichess.ovh/tables/standard/3-4-5-wdl/> and `.../3-4-5-dtz/`                                                     |
| Verified        | SHA-256 of all ten files against the publisher's own `sha256` manifest at `tables/standard/sha256`                                  |
| Generated by    | Ronald de Man's Syzygy generator; the tables are computed results, distributed freely and mirrored by Lichess, sesse.net and others |
| Read by         | Fathom (MIT), built locally by `npm run tablebase:install` — see `companion/native/`                                                |

**Why these five and no more.** Three pieces is the smallest set that can
answer a real question, and it answers several: a rook against a bare king is
won, a knight or a bishop against one is drawn, and the three rook moves that
hang the rook are drawn while the position is won. Those are answers a reader
can check without a computer, which is the property that makes them worth
committing. Four- and five-piece tables are 900 MB and are not shipped; a user
who wants them points Kingfisher at a folder.

## Historical master games — audited, none shipped

No source was found that both contains historical over-the-board master games
and grants redistribution on terms compatible with the rest of this file.
Lumbra's Gigabase is CC BY-NC-SA with unstated provenance; PGN Mentor and
Caissabase state no licence at all. The full audit, the legal reasoning about
game scores and database rights, and what would change the answer are in
[`docs/data/historical-games-audit.md`](docs/data/historical-games-audit.md).

Kingfisher therefore ships no historical games, and no browse set offers a
player it has none for.

---

## Lichess standard rated games database

Used for the High-Rated Online reference. Definition, thresholds and the
measurements behind them are in `docs/data/high-rated-online.md`.

|              |                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------- |
| Source       | <https://database.lichess.org/#standard_games>                                                 |
| Licence      | CC0 1.0 — public domain dedication                                                             |
| Used for     | per-position aggregates over games where both players are 2400+, in classical, rapid and blitz |
| Not used for | bullet and ultrabullet, which are excluded; see the document above for why                     |

## Data deliberately **not** used

These were investigated and rejected. Recording the rejections matters as much
as recording the acceptances: without this list, the next person to look at the
problem repeats the research and may reach a laxer conclusion.

| Source                                                                  | Why not                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **FIDE player list** (`ratings.fide.com/download/players_list_xml.zip`) | Publicly downloadable, but FIDE publishes no licence for redistribution of the list as a dataset. It would have supplied federations and official ratings for the player catalog; Kingfisher builds that from the broadcast archive instead and simply does not show a federation. A downloadable file is not a licence. |
| **PGN Mentor**                                                          | Widely used collections of classic games, but the site states no redistribution terms. Explicitly out of scope for this project.                                                                                                                                                                                         |
| **`rozim/ChessData`**                                                   | ~10 GB of PGN, described upstream as a "PGN Mirror", with no licence file and no statement of what it mirrors. Unstated provenance.                                                                                                                                                                                      |
| **Kaggle / figshare "all games" archives**                              | Re-uploads whose licence field describes the uploader's intent rather than the origin of the data.                                                                                                                                                                                                                       |
| **ChessBase and Chess.com master databases**                            | Commercial databases. Not scraped, not queried in bulk, not redistributed. Chess.com's _public_ API is used for a user's own games and profile, which is what that API is for.                                                                                                                                           |
| **Lichess standard games export** (CC0)                                 | Genuinely open and enormous, but it is online amateur and titled-player blitz, not over-the-board tournament chess. It would make a fine separate pack one day; it is not a master reference and would be misleading presented as one.                                                                                   |

---

## Historical games: what is and is not available

Kingfisher's curated historical player catalog (`src/reference/legends.ts`) is
original factual work for this project: names, titles, championship years and
playing careers, compiled from general reference knowledge and carrying no
third-party text.

Their **games** are a different matter. The broadcast archive begins in 2020,
so Kingfisher ships real games for a former world champion only where that
player has appeared in a relayed event since then — which is why Anand,
Kramnik, Ivanchuk and Short have games in the starter pack and Fischer, Tal and
Morphy have none.

No collection of pre-2020 classic games with clear redistribution terms was
found. Rather than fill the gap from a source with unstated provenance, the
catalog states the count it actually has, including when that count is zero.
A player page that says "no games in your installed sources" is worth more than
one that shows games nobody can account for.
