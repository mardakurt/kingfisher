# 0035. A synced game is an imported game

Status: Accepted

## Context

Kingfisher could query Lichess for opening statistics but had no way to get a
player's own games in except by exporting a file from the site and pasting it,
and it knew nothing about Chess.com at all. That is a real gap for the audience
this application is for: the games a professional most wants indexed, searched
and prepared against are their own, and their own games are online.

The obvious way to build this is a sync engine: fetch games as JSON, map them
onto a record, write them to a store, and give that store its own duplicate
rule and its own position index. Every part of that would be a second
implementation of something that already exists, and the second implementation
is the one that drifts. A duplicate rule that disagrees with the import
dialog's produces a library where the same game appears once or twice
depending on how it arrived.

The two providers are also genuinely different, and pretending otherwise would
have cost correctness. Lichess takes an epoch-millisecond `since` cursor and
returns exactly what is newer. Chess.com has no timestamp cursor at all: games
are published as monthly archives, and the only incremental unit available is
the calendar month.

## Decision

**Sync owns no game model.** A provider's only job is to produce PGN. That PGN
goes to `importGames` — the same function the paste-a-file dialog calls — which
parses, indexes and fingerprints it exactly as it would a file from disk.

The consequence that matters: syncing the same account twice imports nothing
the second time, and there is no deduplication logic anywhere in the sync
feature. The `fingerprint` unique index has enforced one row per game since
schema version 1, and a synced game is subject to it because it is not a
special kind of game. The tests assert this directly rather than assuming it.

**Each provider gets the cursor its API actually has.** Lichess stores
`lastGameTimestamp` and asks for one millisecond past it. Chess.com stores
`lastSyncedMonth`, skips every settled month before it, and re-fetches that
month because a month that was still in progress at the last sync will have
gained games. Forcing one cursor shape onto both would have meant either
re-downloading a decade of Chess.com archives on every sync, or inventing a
timestamp Chess.com does not publish and silently skipping games.

**Cursors advance only after the import they describe has landed.** A cursor
written before the write turns a failed import into permanently skipped games —
the one failure mode of an incremental sync that a user can neither detect nor
recover from.

**No credential is required, and the one that exists is reused rather than
requested.** Both APIs serve public games anonymously. A Lichess token raises
that API's rate allowance, so if one is already set for the explorer it is
sent; nothing asks for a new one, and nothing stops working without it.

## Consequences

A synced game is searchable, explorable and preparable the moment it lands,
because it is stored by the code every other game is stored by. Provenance
beyond the PGN's own tags is not currently kept — a game from Chess.com and a
game pasted from a file are indistinguishable once imported. That is a real
limitation, and the honest place to record it is here rather than in a field
that half-exists.

Chess.com asks API clients for a descriptive `User-Agent` containing contact
details. A browser will not let a page set one — `User-Agent` is a forbidden
header for `fetch` — so Kingfisher cannot comply while syncing from the
browser. Requests are strictly serial, which is the part of their guidance
that can be honoured, and this is documented rather than quietly ignored.
