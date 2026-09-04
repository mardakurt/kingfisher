# 0042. PKCE instead of a pasted token

Status: Accepted
Supersedes the authentication half of ADR 0018.

## Context

ADR 0018 concluded that Kingfisher would ask users to create a Lichess personal
access token, on the reasoning that a proper OAuth flow needs a client secret
and a browser application cannot keep one.

That reasoning was wrong. OAuth's Authorization Code flow with **PKCE** exists
precisely for public clients — applications with no backend and no secret to
keep. Lichess supports it, and their own documented example for client-side
apps uses it.

The cost of the mistake was a papercut on every installation: to see a Masters
statistic you had to leave the application, find the token page, choose the
right options, copy a secret and paste it back.

## Decision

Settings → Accounts has one button. Kingfisher generates a verifier and an S256
challenge, sends the browser to `https://lichess.org/oauth`, and exchanges the
returned code at `https://lichess.org/api/token` with the verifier and no
secret.

**No scopes are requested.** Everything Kingfisher does with the token —
identify the account, query the opening explorer, download public games — works
with a token that carries none.

**The callback is its own route.** `/oauth/lichess`, outside the application
shell, so a URL carrying `?code=` can never be mistaken for an ordinary
navigation and the code is consumed and stripped from the address bar before
anything else renders.

**The personal token stays**, folded under "Advanced", for scripted and
air-gapped setups.

## Consequences

The security of PKCE for a client like this rests on two things, and both are
enforced rather than assumed: a verifier that never leaves the browser until
the exchange, and a `state` that proves the response answers _this_ request. A
mismatched state is refused rather than repaired. The verifier is consumed as
it is read, because an authorization code is single-use.

Disconnecting revokes the token with Lichess as well as forgetting it locally,
and forgets it locally _first_ — a revoke that cannot reach the network must not
leave a token still working in this browser.

**What was verified.** The authorization request was made against lichess.org
for real and accepted: it answers 303 to the sign-in page with every parameter
preserved. The token exchange needs a human to approve a consent screen with
real credentials, which this work did not have. It is contract-tested instead —
every byte sent, and every refusal shape — and live authenticated success is not
claimed anywhere.
