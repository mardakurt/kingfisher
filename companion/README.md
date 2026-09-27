# Kingfisher companion

An optional local service for what a browser cannot do:

1. run **native UCI engines** as real processes — the managed catalogue
   (`scripts/engine-catalogue.mjs`, installed from Settings → Engines) and
   engines the user registers — and lend them to another companion
   (`--serve-engines`, `docs/design/remote-engines.md`);
2. hold **SQLite** game databases far larger than IndexedDB is comfortable
   with, and import large PGN, compressed PGN and ChessBase files into them;
3. probe **local Syzygy tablebases** through a managed helper
   (`src/tbprobe-helper.mjs`, the `/tablebase/*` routes) when a folder is
   chosen; without one, tablebase answers come from the Lichess service.

It is not a server for the application. Kingfisher works completely without it;
the companion adds capabilities and never becomes a dependency of the UI. No
rendering, no chess logic, no application state lives here.

## Where it can be used

The companion answers **loopback origins only** (`allowedOrigins` in
`src/security.mjs`), which decides who can use it:

- **The Mac application** carries its own companion and starts it with
  the application. Nothing to install or pair; native engines are one
  click each in Settings → Engines.
- **A checkout served from `localhost`** (`npm run dev`, `next start`)
  pairs one from a terminal, as below.
- **The public site at `kingfisherchess.app` cannot.** A page from that
  origin is refused by design — the allowlist is one of the two things
  standing between a web page in your browser and your engines and
  files — and the Settings → Companion panel says so there instead of
  offering steps that cannot succeed. Native engines on the web are the
  Mac application's.

## Running it

```bash
npm run companion
```

It prints a pairing URL containing a session token. Paste that into
Settings → Companion. Nothing is stored on disk except the manifest of what you
have explicitly imported.

## Threat model

The companion runs native processes and reads files on your machine, so it is
treated as hostile-by-default surface:

- **Loopback only.** It binds `127.0.0.1`. It is not reachable from your
  network, and there is no option to make it so.
- **Token per run.** A 256-bit token is generated at startup and required on
  every request. It is never written anywhere except the terminal that started
  the process, so closing that terminal revokes access.
- **Origin allowlist.** Browser requests must come from a configured localhost
  origin. A page on another site cannot talk to it even if it guesses the port,
  and it answers CORS preflights only for allowed origins.
- **Paths only where a path is the point, and checked there.** Everything
  else is addressed by key: engines from the managed manifest or the custom
  registry, databases from the import registry. Two routes take a path, each
  with its own check: `POST /engine/register` accepts a binary only after it
  is a real executable and completes a UCI handshake (ADR 0036), and
  `POST /db/attach` opens a file read-only and refuses anything that is not
  already a Kingfisher collection. A large-file import reads the file the user
  chose and records only its basename, size and the user's own note.
- **No shell.** Processes are spawned with an argv array, never through a
  shell, and the binary is always one from the manifest.
- **No writes outside its own directory.** Collections, registries, managed
  engines and the tablebase helper live in the data directory —
  `companion/data/` in a checkout, the profile's own folder in the Mac
  application (`KINGFISHER_COMPANION_DATA_DIR`, set by `desktop/src/main.mjs`);
  nothing else on the filesystem is written.

What it deliberately does _not_ defend against: another program running as you
on the same machine. It cannot — that program could read the token from the
terminal or the process list. The boundary here is "a web page you visit
cannot reach your engines and files", which is the one that matters.
