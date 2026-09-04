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

| Pack                   | Distribution                       | Contents                                                                                                                        |
| ---------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `kingfisher-starter`   | Committed, ships with the app      | The most recent 36 monthly archives, games rated 2200+ (or between titled players), with full scores kept for games rated 2600+ |
| `kingfisher-elite-otb` | Release asset, installed on demand | The whole archive from 2020                                                                                                     |

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
