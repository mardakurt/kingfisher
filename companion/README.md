# Kingfisher companion

An optional local service for the three things a browser genuinely cannot do:

1. run **native UCI engines** as real processes (Lc0, Stockfish native, Berserk),
2. query a **SQLite** game database far larger than IndexedDB is comfortable with,
3. probe **Syzygy tablebases** from local files.

It is not a server for the application. Kingfisher works completely without it;
the companion adds capabilities and never becomes a dependency of the UI. No
rendering, no chess logic, no application state lives here.

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
- **No arbitrary paths.** Engines are launched only from the manifest that
  `npm run engines:install` wrote; databases only from paths the user imported
  through the companion itself. A path arriving in a request is looked up in
  that registry — it is never used to open a file directly.
- **No shell.** Processes are spawned with an argv array, never through a
  shell, and the binary is always one from the manifest.
- **No writes outside its own directory.** Import writes into
  `companion/data/`; nothing else on the filesystem is written.

What it deliberately does _not_ defend against: another program running as you
on the same machine. It cannot — that program could read the token from the
terminal or the process list. The boundary here is "a web page you visit
cannot reach your engines and files", which is the one that matters.
