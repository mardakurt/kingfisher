# Diagnostics and support reports

If something is going wrong and you want to tell us, the
diagnostics panel has the answer.

## Settings → Diagnostics

This is the screen the support team asks for. It has:

- **Data providers** — Kingfisher Starter, Masters, Lichess,
  Player, My games — each with state, last error and a Test
  button. The Test button re-runs the contract against the
  provider and tells you what came back.
- **Engines** — every configured engine with role, architecture,
  licence, and idle/running state. A stalled engine shows up here
  before it shows up on the board.
- **Services** — Local companion, Grounded assistant — with
  configuration status.
- **Data integrity** — Run integrity scan walks the local
  reference data and reports what it found.
- **Recovery** — Restart engines, Reconnect companion, Clear
  provider cache, Reset all layouts.
- **Support** — **Copy support information** (8 lines) and
  **Copy full diagnostic report** (the whole report). The first
  is what you paste into a GitHub issue; the second is what you
  attach if the maintainer asks for more.

## What the diagnostic report does *not* contain

- Lichess tokens, API keys, passwords, companion secret.
- Full PGN libraries, private Study content, user notes.
- Home-directory paths (they are removed even if the value was
  not registered as a Settings secret).
- URL credentials and query/fragment values.

URL credentials, query/fragment values and home-directory names
are removed at write time. The test in `e2e/reliability.spec.ts`
configures a fake token and asserts that the token is not in the
report — green.

## The local log file

Desktop only: `Show log in Finder` reveals
`~/Library/Application Support/Kingfisher/logs/kingfisher.log`.
The log is rotated at ~1 MB. The companion pairing token is
replaced with `[redacted]` before anything is written. Nothing
in the log is sent anywhere.

## "Check for updates"

Help → Check for updates queries the GitHub Releases API and
tells you whether a newer version is published. It does not
download or install. It does not send a request for the
running profile, the engine catalogue, or any other data. It
is a single `GET` to `api.github.com`.
