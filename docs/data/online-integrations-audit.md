# Online integrations — what was tested live, and what was not

Run 2026-09-06. The distinction this file keeps is the one that matters: a
**live** result is a real round trip that happened, a **contract** result is a
test against a recorded fixture, and the two are not interchangeable.

## Chess.com — live

The public API needs no authentication, so all of it was exercised for real
against `api.chess.com/pub`.

| Checked                                     | Result                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| Profile (`/player/hikaru`)                  | **200**, with `username`, `player_id`, `title`, `country`, `url`, `last_online` |
| Archive list (`/games/archives`)            | **200**, 152 monthly archives                                                   |
| One month's PGN                             | **200**, 1,514,401 bytes, 493 games                                             |
| `ETag` on the month endpoint                | **present**                                                                     |
| Conditional re-request with `If-None-Match` | **304, zero bytes**                                                             |
| Unknown player                              | **404**                                                                         |
| A month that does not exist yet (2099/01)   | **404**                                                                         |
| `content-type`                              | `application/vnd.chess-pgn`                                                     |

Every one of those is what `src/sync/chess-com-sync.ts` assumes. The 304 is the
load-bearing one: incremental sync is built on months being immutable and the
server saying so, and it does. Duplicate prevention is a property of the import
path rather than the API and is covered by `chess-com-sync.test.ts`.

**Not live-tested:** a 5xx from Chess.com, because it did not return one and
provoking one deliberately would be abusive. That path is contract-tested.

## Lichess — partly live, and the important half is not

| Checked                    | Result  |
| -------------------------- | ------- |
| Masters explorer, no token | **401** |
| Lichess explorer, no token | **401** |
| Public user API, no token  | **200** |

The 401s are the finding, and they are not a fault: Lichess requires
authentication for explorer requests, which is exactly why Kingfisher asks each
user for their own token rather than shipping a developer credential and one
shared rate limit. The check confirms the "Authentication required" state the
source picker shows is correct rather than a bug hiding behind an error
message.

**Not live-tested: OAuth PKCE, the authenticated explorer, and game sync.**
Those need a user to grant consent in a browser. No agent can give that consent
on somebody's behalf, so no claim is made here that they were exercised end to
end. They are contract-tested against fixtures in `src/database/providers/` and
`src/sync/lichess-sync.test.ts`, and `npm run smoke:lichess` will exercise them
for real when a person supplies `KINGFISHER_LICHESS_TOKEN`.

## Offline fallback

Neither service is allowed to blank the explorer. With no token, the source
picker reports the online sources as needing authentication and the bundled
Kingfisher Starter reference — which works with no network at all — remains
selectable and selected by default. `e2e/reference-sources.spec.ts` holds this.
