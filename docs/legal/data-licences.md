# Data & licences

Every third-party data source Kingfisher ships, installs, or
queries — and the licence each one is used under. The
authoritative technical record is in each pack's manifest; this
page is the human-readable summary.

If you want to see the exact terms of a licence, the canonical
URLs are in the **Licence** column of each table. If a licence
is not present here, the data is Kingfisher's own.

## Bundled with the application

| Source                    | Contents                                                                                                      | Licence       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------- |
| `kingfisher-starter` pack | 206,451 elite broadcast games (over the board and online events), 300,413 position aggregates                 | CC BY-SA 4.0  |
| Lichess opening class.    | 3,810 named positions, ECO codes                                                                              | CC0 1.0       |
| Titled-player roster      | 8,339 GM, WGM, IM and WIM from Wikidata — people, never games (`public/data/players/`)                        | CC0 1.0       |
| Annotated classics        | J. R. Capablanca, _Chess Fundamentals_ (1921): fourteen games with the author's notes, from Project Gutenberg | Public domain |

The bundled pack ships as static assets in the application; the
opening classification is replayed through Kingfisher's own
rules code and the result is a generated TypeScript file. Both
are described in [`THIRD_PARTY_DATA.md`](../../THIRD_PARTY_DATA.md).

## Installed on demand

| Source                            | What it answers                                 | Licence      | Distribution       |
| --------------------------------- | ----------------------------------------------- | ------------ | ------------------ |
| `kingfisher-elite-otb`            | What was played in elite over-the-board games   | CC BY-SA 4.0 | Public data mirror |
| `kingfisher-recent-theory`        | What is being played recently                   | CC BY-SA 4.0 | Public data mirror |
| `kingfisher-recent-theory-narrow` | The same, over the last six months              | CC BY-SA 4.0 | Public data mirror |
| `kingfisher-high-rated-online`    | What 2400+ Lichess players are playing online   | CC0 1.0      | Public data mirror |
| `kingfisher-high-rated-rapid`     | Lichess rapid and classical, both players 2200+ | CC0 1.0      | Public data mirror |

The names and populations are the catalogue's own (`src/reference/catalog.ts`).

Every chunk is verified against the manifest's SHA-256 before
it is used; a failed verification is reported, the bytes are
discarded, and the user is told. See
[`docs/data/reference-packs.md`](../data/reference-packs.md)
for the exact upstream dates, ratings filters and shard sizes.

## Online queries the application makes

| Provider                 | When the application calls it                                                                                                          | Licence / terms             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Lichess Explorer         | Choosing a Lichess source in the explorer — it needs a connected Lichess account or a personal token; the built-in pack is the default | Lichess terms apply         |
| Lichess tablebase        | A position with few enough pieces, when no local Syzygy table answers                                                                  | Free for non-commercial use |
| Lichess cloud evaluation | The engine panel's _Lichess cloud_, off at the start of each session                                                                   | Lichess terms apply         |
| Lichess account          | _Connect Lichess_ (OAuth with PKCE, no scopes requested)                                                                               | Lichess terms apply         |
| Chess.com games          | Syncing a Chess.com username's public games (no sign-in; the public API)                                                               | Chess.com API terms         |

What each call sends is in the [privacy policy](privacy.md). The
CSP in `vercel.json` names these hosts but also allows any
`https:` host, so the code, not the policy, bounds the requests.

## Engine binaries

Engine binaries are not committed. They are downloaded on
demand by the application, recorded with a SHA-256, and
qualified by a real search before they are allowed to answer
a position. The full list and the licence each engine carries
is in [`docs/ENGINES.md`](../ENGINES.md).

## What is deliberately not used

These were investigated and rejected; the reasons are in
[`THIRD_PARTY_DATA.md`](../../THIRD_PARTY_DATA.md). The list is
preserved because the next person to look at the problem
should not have to repeat the work.

- FIDE player list (no redistribution licence)
- PGN Mentor (no stated terms)
- `rozim/ChessData` (no licence, no provenance statement)
- Kaggle / figshare "all games" archives (re-uploads with
  unclear origin)
- ChessBase, Chess.com master databases (commercial)
- The Lichess standard-games export **as an over-the-board
  reference** (CC0, but the population is online play). It is used
  for what it is: the two High-Rated Online packs, filtered by
  rating and pace and labelled as online.

## Affiliation

Kingfisher is not affiliated with, endorsed by, or sponsored
by Lichess, Chess.com, FIDE, ChessBase, Chessable, the
broadcast organisations whose games appear in the Lichess
archive, or any of the engine authors. The application
redistributes data only where the source's licence explicitly
permits it, and the licence, source and provenance of every
pack is recorded in that pack's manifest.
