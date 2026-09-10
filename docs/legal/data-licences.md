# Data & licences

Every third-party data source Kingfisher ships, installs, or
queries — and the licence each one is used under. The
authoritative technical record is in each pack's manifest; this
page is the human-readable summary.

If you want to see the exact terms of a licence, the canonical
URLs are in the **Licence** column of each table. If a licence
is not present here, the data is Kingfisher's own.

## Bundled with the application

| Source                    | Contents                                                  | Licence      |
| ------------------------- | --------------------------------------------------------- | ------------ |
| `kingfisher-starter` pack | 172,376 over-the-board games, 246,870 position aggregates | CC BY-SA 4.0 |
| Lichess opening class.    | 3,810 named positions, ECO codes                          | CC0 1.0      |

The bundled pack ships as static assets in the application; the
opening classification is replayed through Kingfisher's own
rules code and the result is a generated TypeScript file. Both
are described in [`THIRD_PARTY_DATA.md`](../../THIRD_PARTY_DATA.md).

## Installed on demand

| Source                         | What it answers                               | Licence      | Distribution       |
| ------------------------------ | --------------------------------------------- | ------------ | ------------------ |
| `kingfisher-elite-otb`         | What was played in elite over-the-board games | CC BY-SA 4.0 | Public data mirror |
| `kingfisher-recent-theory`     | What is being played recently                 | CC BY-SA 4.0 | Public data mirror |
| `kingfisher-high-rated-online` | What 2400+ Lichess players are playing online | CC0 1.0      | Public data mirror |

Every chunk is verified against the manifest's SHA-256 before
it is used; a failed verification is reported, the bytes are
discarded, and the user is told. See
[`docs/data/reference-packs.md`](../data/reference-packs.md)
for the exact upstream dates, ratings filters and shard sizes.

## Online queries the application makes

| Provider          | When the application calls it                                            | Licence / terms             |
| ----------------- | ------------------------------------------------------------------------ | --------------------------- |
| Lichess Explorer  | _Explorer → Online_ (a user opt-in, not the default for installed packs) | Public, no key needed       |
| Lichess tablebase | _Endgame tablebase_ (a user opt-in, when a position falls to few pieces) | Free for non-commercial use |
| Lichess account   | _Sign in with Lichess_ (PKCE OAuth, no scopes beyond "read your games")  | Lichess terms apply         |
| Chess.com account | _Sign in with Chess.com_ (public API by username)                        | Chess.com API terms         |

The CSP in `vercel.json` is the network allow-list; any host
not on it is refused at the browser layer.

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
- Lichess standard-games export (CC0, but the population is
  amateur online blitz — not the question an over-the-board
  reference is for; not a fit for what the packs are meant to
  answer)

## Affiliation

Kingfisher is not affiliated with, endorsed by, or sponsored
by Lichess, Chess.com, FIDE, ChessBase, Chessable, the
broadcast organisations whose games appear in the Lichess
archive, or any of the engine authors. The application
redistributes data only where the source's licence explicitly
permits it, and the licence, source and provenance of every
pack is recorded in that pack's manifest.
