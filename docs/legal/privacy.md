# Privacy

What Kingfisher does with the data it touches, and — as
importantly — what it does not. This page is the user-facing
privacy policy. The technical security policy is at
[`SECURITY.md`](../../SECURITY.md).

## Short version

Kingfisher is **local-first**. Studies, repertoire, training,
notes, recent work and preferences are stored in the browser
profile or in the desktop application's local profile directory.
Signed out, nothing about you or your work leaves your machine.
Signed in to the optional account, a copy of your authored work is
kept in that account so it reaches your other devices — nothing
else, and only yours to read.

- **No account required.** Everything works without signing in,
  and signed out the application does not know who you are. An
  optional account keeps your work on more than one device; the
  section _Optional account_ below says exactly what it stores and
  where.
- **Page views and load times are counted, and that is all.** The
  website uses Vercel Web Analytics and Vercel Speed Insights. For
  each page view it records the page path, the referrer, and what
  the request already carries (the country the connection comes
  from, the browser and operating-system family, the device
  class); for each page load it records the timings your browser
  already computes (the Core Web Vitals) with the connection type
  and device class. Neither sets a cookie or stores an identifier
  on your device; Vercel derives a per-day visitor hash on its
  side and discards the address. Query strings and fragments are
  stripped before anything is sent, so a position in a URL never
  leaves your browser. Nothing about your chess is ever part of
  either. No telemetry beyond that: no error-reporting service,
  no session replay, no "is the user still here?" pings. The Mac
  application loads none of this.
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

### Optional account

You may create an account on kingfisherchess.app with an email
address and password (and with Google where the sign-in page offers
it). Then, and only while you are signed in:

- **Stored in your account:** your email address and, with Google,
  the name Google supplies; and a copy of your authored work —
  studies and chapters, unsaved analysis, repertoires, training
  cards and progress, preparation, opening files, journal and
  review, saved searches, pinned lines, stored engine results,
  puzzle history, the positions you analysed — and your display, board and engine preferences.
- **Only if you switch it on:** your newest 2,000 games in My games,
  when you turn on _Sync My games on this device_ on the Account page.
  It is off by default, and set separately on each device.
- **Never stored there:** other imported game collections, reference
  packs, engines, API tokens and keys, and settings that describe
  your machine.
- **Who can read it:** no other account. The database itself
  refuses every other account (row-level security), not just the
  application. As with any hosted service, the person who runs the
  Kingfisher project has administrative access to the database; it
  is not read, analysed or shared, and it is used only to keep the
  service running.
- **Where:** Supabase, the service that runs the account database,
  in its Seoul, South Korea region (`ap-northeast-2`).
- **Account emails** — confirming your address, resetting a
  password — are sent through Resend from
  `accounts@kingfisherchess.app`. Resend receives your email address
  and the message, nothing else.
- **Your session** is kept in the browser's local storage, not in
  a cookie.
- **Deleting your account** (_Account → Delete account_) removes
  the account and every copy of your work stored in it. Work on
  your own device stays there.
- Before anything on a device is uploaded for the first time, you
  are asked.

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
origin-scoped, so a profile on `kingfisherchess.app` is not the
same database as one on `localhost`, in another browser, or in
another browser profile. Signed out, the work does not move
between them by itself; signed in, your authored work follows your
account (see _Optional account_). The other way to move work between
machines and profiles is the **Settings → Database → Export
backup… / Choose backup to restore…** flow, which produces and consumes a
versioned JSON file under your control.

### Reference cache

When you use the Explorer or a pack query, the application
caches the response bytes in IndexedDB so a second query of the
same shard does not redownload. The cache is byte-budgeted and
is cleared on a fixed schedule. The cached bytes are not
attributed, are not exported with your work and are not
considered user data. They are technical infrastructure for the
product.

The cache is origin-scoped like everything else, and it does not
sync.

### Network requests

The web and desktop builds do not phone home. The **only**
outbound network calls the application makes are the ones the
product needs:

- **Lichess** (when you sign in or query Lichess-hosted
  resources): `lichess.org`, `explorer.lichess.org`,
  `tablebase.lichess.ovh`; **Chess.com** (`api.chess.com`) when you
  sync a Chess.com account. Each call is made because the user asked
  for the answer. The engine panel's _Lichess cloud_ section, off at
  the start of every session, sends each position you visit to
  `lichess.org/api/cloud-eval` while you have it on, and nothing else. Sign-in uses OAuth with PKCE and requests no scopes;
  the token is kept in memory for the session, and in `localStorage`
  only while _Remember_ is on, and never leaves the device.
- **The public data mirror** at
  `mardakurt.github.io/kingfisher-data` for reference-pack
  manifests and chunks. Every chunk is verified against the
  manifest's SHA-256 before it is used. A failed verification
  is reported and the bytes are discarded.
- **unpkg.com** (`unpkg.com/stockfish@18.0.8`), only when you choose
  _Stockfish 18 (full network)_: the 113 MB evaluation network is
  fetched from that npm package mirror the first time and kept by your
  browser afterwards. The request carries no identifier of yours, and
  the bytes are refused unless they hash to the SHA-256 recorded in
  Kingfisher.
- **A service you configure yourself.** If you give _Settings →
  Assistant_ an endpoint, the evidence you ask it to explain is
  sent there, and so is a score-sheet photo you choose to have
  read. Nothing goes to it unless you set it up and ask, and
  Kingfisher does not choose or know what that service is.
- **The account service** — Supabase (`*.supabase.co`), only
  when you sign in or are signed in: signing in and out, and copying
  your authored work to and from your account, including a live
  connection that tells this device when another one changed
  something. Signed out, nothing is sent there.
- **Google** (`accounts.google.com`), only when you choose
  _Continue with Google_: Google asks you to approve sharing your
  email address and name with Kingfisher, and nothing else is
  requested.
- **The application's own origin** for the static assets
  (the standard Stockfish WASM, piece art, the marketing/landing assets,
  the app code itself).
- **GitHub Releases** for the macOS desktop build's update
  feed. The macOS application's **Check for Updates…** menu
  item is the only thing that issues this request, and it
  only issues the request when the user clicks the menu item
  (a one-time, information-only request also runs at launch,
  to relabel the menu when a newer release is available).
  Sparkle, the update engine, fetches `appcast.xml` from
  `https://github.com/mardakurt/kingfisher/releases/latest/download/`,
  and reads the version, the length and the EdDSA signature of
  the update ZIP; the signature is checked against the public key
  baked into the application's `Info.plist` once the ZIP is
  downloaded, before it is installed. The user must click
  **Install Update** before the bytes leave GitHub; the
  updater does not run on a timer. If the user picks
  **Later**, nothing is downloaded and no further request is
  made. The updater never reads or writes the renderer
  side: the renderer has no `fetch` and no filesystem
  access; the main process is the only place network and
  disk happen. (For installs that predate Sparkle — 1.1.0
  through 1.1.7 — the engine is `electron-updater` and the
  request is `latest-mac.yml`; the behaviour is the same.)

The Content-Security-Policy in `vercel.json` names these hosts,
but it also allows any `https:` host, because two of the calls
above choose their host at run time (the full-network engine's
mirror and a service you configure). So it is the code, not the
policy, that limits where requests go — and the code makes no
call beyond this list. Scripts, styles and frames are restricted
to this origin. The desktop companion's loopback server is a
separate trust boundary with its own authentication.

### Cookies and trackers

The web build sets **no cookies** in the strict sense: no
`Set-Cookie` response header, no `document.cookie` writes, no
`httpOnly` session. The application uses `localStorage` and
IndexedDB instead. The browser may still hold its own state
(service worker cache, IndexedDB) which is required for the
product to work across reloads.

No advertising tag and no cross-site tracker is loaded. The only
measurements are Vercel Web Analytics and Speed Insights,
described above, served from this origin. A network panel open
during a normal session will show this origin (including
`/_vercel/insights/view`, the page-view beacon, and
`/_vercel/speed-insights/vitals`, the load-timing beacon),
Lichess (if you have signed in or queried Lichess), Chess.com (if
you have queried Chess.com), the data mirror (if you have used a
reference source) and the account service (if you are signed in).
Nothing else.

### Hosting

The web build is hosted on Vercel. Vercel sees every request
the way any hosting provider does, and the request log will
contain the IP address you connected from, the URL you
requested and the user agent your browser sent. Vercel's own
data-handling is described in their privacy policy; the
Kingfisher project does not put anything additional in those
logs. The optional account is kept by Supabase (see _Optional
account_), and in-app feedback passes through this site's own
endpoint (see _Feedback_); nothing else runs on a Kingfisher server.

### Account status

A Kingfisher account is optional. Without one, there is no
sign-in, no server-side profile, no email capture and no mailing
list. With one, what it stores, where, and who can read it is
described under _Optional account_ above; the email address
is used to sign you in and for messages about the account, never
for a mailing list.

### Sync status

Signed in, your work is copied to your account and follows you
to every device you sign in on (see _Optional account_).
Signed out, it lives on the machine you created it on. Either
way you can move it yourself: _Settings → Database → Export
backup_ on one machine and _Choose backup to restore…_ on the
other. The backup file is portable JSON and is under your control
at all times.

### Feedback

The in-app Feedback dialog sends a single submission only when
you press _Send feedback_. Nothing is uploaded automatically. The
submission carries the category you picked, the message you typed
(up to 4,000 characters), the board position only when you tick
_Include current position_ (off by default), and a short
technical block (version, surface, browser, viewport, storage
state) only when you tick _Include technical information_ and
preview it. It never carries your games, studies, repertoire,
training, notes, preferences, credentials or file paths.

Where it goes: to this site's own server, never from your browser
to anyone else, and the server forwards it. **Today it forwards
it to ntfy.sh**, a public notification service, under a topic
only the maintainer knows; it is also written to the server log.
The server can instead open an issue in a private GitHub feedback
repository (a token scoped to that repository alone), or keep
submissions in its log only, in which case the dialog also offers
an "Open GitHub feedback" button for a pre-filled issue. The
endpoint enforces same-origin requests, a 64 KB body limit, a
per-address rate limit, a minimum form-fill time and a honeypot
field. If the destination changes, this section changes with it.

### Children

Kingfisher is not directed at children. Signed out, it collects
nothing from anyone; the optional account stores an email address
and the work its owner syncs, and Kingfisher does not knowingly
hold an account for a child.

### Changes

If a future Kingfisher change affects this policy, the change
will be listed in [`CHANGELOG.md`](../../CHANGELOG.md) and this
page will be updated before the change ships.

### Contact

To delete your account and everything stored in it, use _Delete
account_ on the Account page; nothing else needs to be asked for.
There is no Kingfisher-controlled inbox for privacy requests.
For a security issue, see [`SECURITY.md`](../../SECURITY.md).
For a non-security question, open an issue on
[GitHub](https://github.com/mardakurt/kingfisher/issues).
