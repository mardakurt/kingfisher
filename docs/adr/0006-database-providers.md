# 0006 — One database interface, real implementations only

**Status:** Accepted

## Context

The brief asks for a database-provider abstraction with a mock first
implementation. It also asks not to build fake database features. Those pull in
opposite directions: a mock explorer full of invented percentages is exactly the
kind of fiction that makes a chess tool untrustworthy, because a percentage
looks like evidence whether or not it is.

## Decision

Build the interface as specified, and give it only real implementations.

- `LichessExplorerProvider('masters')` — over-the-board games between titled
  players.
- `LichessExplorerProvider('lichess')` — online games, rating-filterable.
- `LocalCollectionProvider` — the user's own imported games, indexed by
  position in `PositionIndex`.

Every provider returns the same normalized `ExplorerResult`. The panel cannot
tell them apart.

Importing a PGN opens the first game _and_ indexes every game in the file, which
is what makes the local provider immediately useful rather than an empty shell.

**Operational update, April 2026.** Lichess now requires authenticated opening
explorer requests. Phase 1 does not collect or persist access tokens. A 401 is
therefore surfaced as an explicit authentication boundary with a one-click
fallback to the local collection, rather than being misreported as downtime or
papered over with invented data. A future authenticated provider can satisfy
the same interface without changing the panel.

## Consequences

- The explorer shows real evidence only when its provider can authenticate;
  the local collection works from the first imported PGN.
- The remote providers need a connection. That is handled explicitly: an
  eight-second timeout, an offline-aware paused state, and a one-click switch to
  the local database. `networkMode: 'offlineFirst'` is set on the query, because
  `navigator.onLine` reports offline in enough working situations (captive
  portals, VPNs, embedded browsers) that trusting it means an eternal spinner.
- `PositionIndex` is in-memory and honest about its ceiling: a few thousand
  games. Millions belong behind a different implementation of the same
  interface — which is the point of having one.
