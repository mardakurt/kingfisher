# Privacy

What Kingfisher does with the data it touches, and — as
importantly — what it does not. This page is the user-facing
privacy policy. The technical security policy is at
[`SECURITY.md`](../../SECURITY.md).

## Short version

Kingfisher is **local-first**. Studies, repertoire, training,
notes, recent work and preferences are stored in the browser
profile or in the desktop application's local profile directory.
Nothing about you or your work is sent to a Kingfisher server,
because there is no Kingfisher server.

- **No account.** You do not sign in. There is no sign-in to
  sign in with. The application does not know who you are.
- **No telemetry.** No analytics, no error reporting service, no
  session replay, no "is the user still here?" pings. The web
  build does not load any third-party script.
- **No cookies.** The web build does not set any cookie.
  Application state lives in `localStorage` and IndexedDB,
  scoped to the origin.
- **No advertising.** Nothing on the page or in the application
  is, was, or will be an advertisement.
- **No client-side fingerprinting.** No canvas fingerprint, no
  font enumeration, no hardware concurrency probes, no timezone
  sniff, no IP-to-country map, no "we know it's you because of
  your machine."

What leaves your machine is what you put in the address bar, and
the parts the brief below describes as part of the product. The
diagnostic export deliberately redacts the parts that could
identify you or your accounts; see [Settings → Diagnostics]
inside the application for the exact redaction list.

## In detail

### Local storage

**User-authored data** — your studies, chapters, repertoire
moves, training items, model games, recent positions, notes and
preferences — is stored in the browser or in the desktop
profile. It is held under the application's own storage key and
never read by another origin. The structure is documented in
[`AGENTS.md`](../../AGENTS.md) and the schema is versioned.

A `localStorage` entry holds the small key/value preferences
(theme, piece set, board theme, sound level, last-active route).
The contents are visible in the browser's developer tools and
are an inert JSON object with no PII beyond what you yourself
typed (a study name, a repertoire name).

The bulk of your work is in **IndexedDB**. IndexedDB is
origin-scoped, so a profile on `kingfisher-roan.vercel.app` is
not the same database as one on `kingfisher-chess.vercel.app`
or one on `localhost`. If you move between them, the work does
not move with you — the supported way to move work between
machines and profiles is the **Settings → Database → Export
backup / Import backup** flow, which produces and consumes a
versioned JSON file under your control.

### Reference cache

When you use the Explorer or a pack query, the application
caches the response bytes in IndexedDB so a second query of the
same shard does not redownload. The cache is byte-budgeted and
is cleared on a fixed schedule. The cached bytes are not
attributed, are not exported with your work and are not
considered user data. They are technical infrastructure for the
product.

The cache is the same `localhost`-only database as everything
else; it does not sync.

### Network requests

The web and desktop builds do not phone home. The **only**
outbound network calls the application makes are the ones the
product needs:

- **Lichess** (when you sign in or query Lichess-hosted
  resources): `lichess.org`, `api.chess.com`,
  `tablebase.lichess.ovh`, `explorer.lichess.ovh`. Each call is
  made because the user asked for the answer. Sign-in uses OAuth
  with PKCE and no scopes beyond "read your games"; the token
  is stored in IndexedDB and never leaves the device.
- **The public data mirror** at
  `mardakurt.github.io/kingfisher-data` for reference-pack
  manifests and chunks. Every chunk is verified against the
  manifest's SHA-256 before it is used. A failed verification
  is reported and the bytes are discarded.
- **The application's own origin** for the static assets
  (Stockfish WASM, piece art, the marketing/landing assets,
  the app code itself).

The Content-Security-Policy in `vercel.json` is the enforced
allow-list. Any other host is refused at the browser layer,
and the desktop companion's loopback server is a separate
trust boundary with its own authentication.

### Cookies and trackers

The web build sets **no cookies** in the strict sense: no
`Set-Cookie` response header, no `document.cookie` writes, no
`httpOnly` session. The application uses `localStorage` and
IndexedDB instead. The browser may still hold its own state
(service worker cache, IndexedDB) which is required for the
product to work across reloads.

No third-party tracker, analytics or advertising tag is loaded.
A network panel open during a normal session will show Lichess
(if you have signed in or queried Lichess), the data mirror
(if you have used a reference source) and the application's
own origin. Nothing else.

### Hosting

The web build is hosted on Vercel. Vercel sees every request
the way any hosting provider does, and the request log will
contain the IP address you connected from, the URL you
requested and the user agent your browser sent. Vercel's own
data-handling is described in their privacy policy; the
Kingfisher project does not put anything additional in those
logs. There is no Kingfisher-side server processing them.

### Account status

There is no Kingfisher account, no sign-in, no profile, no
email capture, no mailing list. If a Kingfisher-controlled
account is ever added, this page will be updated before any
data is collected.

### Sync status

**Cross-device Sync is not currently available.** Your work
lives on the machine you created it on. To move work between
machines: _Settings → Database → Export backup_ on the source
machine; _Settings → Database → Import backup_ on the
destination machine. The backup file is portable JSON and is
under your control at all times.

### Children

Kingfisher is not directed at children. The application does
not knowingly collect information from children, because it
does not collect information from anyone.

### Changes

If a future Kingfisher change affects this policy, the change
will be listed in [`CHANGELOG.md`](../../CHANGELOG.md) and this
page will be updated before the change ships.

### Contact

There is no Kingfisher-controlled inbox for privacy requests.
For a security issue, see [`SECURITY.md`](../../SECURITY.md).
For a non-security question, open an issue on
[GitHub](https://github.com/mardakurt/kingfisher/issues).
