# 0018. Typed provider health, and Lichess as an authenticated source

Status: Accepted

## Context

Two separate problems presented as one symptom: "the databases do not work".

The Lichess opening explorer moved to `explorer.lichess.org` and now requires
authentication. Kingfisher still called `explorer.lichess.ovh` anonymously.
Both hosts answer `401` today, so every explorer query failed — but the UI
reported the failure as an empty result. A rate limit, an expired token, a
network outage and a genuinely empty position were indistinguishable: all four
rendered as "no games found".

The provider interface had no way to express any of that. It could return
results or throw, and the thrown error carried a sentence but no machine-
readable cause, so no caller could offer a remedy.

## Decision

**A typed health model.** `DatabaseError` carries a state — `ready`,
`loading`, `authentication-required`, `companion-offline`, `misconfigured`,
`rate-limited`, `network-error`, `unsupported`, `error` — alongside the HTTP
status where one exists. Providers optionally implement `health(signal)`,
which performs a real query and validates the response shape rather than
asserting that a fetch returned something. The `/databases` route renders
that state, the remedy and the measured latency.

Empty is only ever reported for a successful query that genuinely matched no
games.

**Lichess over `explorer.lichess.org`, with a personal access token.** The
explorer is treated as an authenticated source: a request without a token
fails as `authentication-required` before it is sent, rather than being
attempted and misreported. `401`, `403`, `404`, `429`, `5xx`, timeouts and
unparseable bodies each map to a distinct state and message.

A personal access token is the supported connection flow, not OAuth. An
Authorization Code + PKCE flow would be the nicer experience, but Kingfisher
is a local-first application with no server component to hold a redirect
endpoint, and shipping a half-working OAuth button is worse than a token field
that works. No scopes are required for explorer access.

## A note on the query layer

The typed states above are worth nothing if the UI never renders them, and for
a while it did not. TanStack Query's default network mode _pauses_ a query
when the browser claims to be offline: the query keeps `status: 'pending'` and
takes `fetchStatus: 'paused'`, which every panel drew as a loading message
that never resolved. An unauthenticated Lichess explorer therefore spun on
"Reading Masters…" instead of saying it needed a token.

`networkMode: 'offlineFirst'` looks like the fix and is not: it exempts only
the first attempt and still pauses the retry, so one failure is enough to
strand the panel. The client default is `always`, set once for every query —
most of them read IndexedDB, which has no opinion about the network, and
`navigator.onLine` is a poor oracle for the rest.

The explorer additionally renders `fetchStatus === 'paused'` as its own
honest state rather than as loading. That is belt and braces on purpose: a
spinner that never ends is a bad enough failure that the panel should not be
able to draw one even if the client default is later changed back.

## Consequences

Tokens live in `localStorage` on the device that entered them, are never
committed, never logged, and are excluded from workspace backups. This is
honest rather than secure: anything with script access to the origin can read
them. Explorer tokens are scopeless and revocable from Lichess, which is what
makes that trade acceptable — it would not be for a scoped token.

Contract tests cover the authenticated paths with a mocked transport, so the
suite needs no real credentials. The consequence is that a change to the live
response shape would pass CI; `health()` validating the shape at runtime is
what catches it, and it catches it in front of the user rather than in CI.
