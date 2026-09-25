# Remote engines — an engine on another of the player's machines

Phase 85, D3. ChessBase rents engine time on its servers. Kingfisher's answer
is the player's own hardware: a second Mac or PC on the desk, or a cloud
machine they rent and run a companion on. No Kingfisher server is involved.

## Shape

```
browser ──HTTP (loopback, token)──► local companion ──TLS-PSK──► engine host (companion)
                                         │                              │
                                   its own engines                its engines only
```

- The **engine host** is an ordinary companion started with
  `--serve-engines` (`npm run companion:engine-host`). It listens on the
  network, on its own port, and offers **only** its installed engines: no
  databases, no files, no tablebases, no installs. Its loopback interface for
  its own browser is unchanged.
- The **local companion** connects to it and lists the host's engines beside
  its own, each named `<engine> · on <host label>`. The browser needs nothing
  new: a remote engine is an engine in `/status`, started, fed and streamed
  through the same `/engine/*` routes.

## Pairing and the channel

The host prints one pairing code when it starts:

```
kingfisher-engines://<address>:<port>/#k=<43-character key>
```

The key is 32 random bytes, new each time the host starts unless
`KINGFISHER_ENGINE_HOST_KEY` names a file that keeps it. The code is pasted into
_Settings → Engines → Remote engine hosts_ on the other machine; that is the
explicit trust step. The key never travels: it is the **pre-shared key of the
TLS session** (TLS 1.2, `PSK-AES256-GCM-SHA384`), so the channel is encrypted
and both ends are authenticated by it. A wrong key fails the handshake, before
a byte of protocol. There are no certificates to generate, pin or expire, and
the same code works on a LAN and over the internet.

The local companion keeps the code in `remote-engine-hosts.json` in its data
directory, file mode 0600. It is a credential for the player's own machine.

## Protocol

Newline-delimited JSON over the TLS socket, one line at most 64 kB:

| from   | message                           | meaning                                         |
| ------ | --------------------------------- | ----------------------------------------------- |
| client | `{type:'hello'}`                  | first message                                   |
| host   | `{type:'welcome', host, engines}` | the host's name and its engines' keys and names |
| client | `{type:'start', ref, engine}`     | start an engine; `ref` matches the answer       |
| host   | `{type:'started', ref, session}`  | or `{type:'failed', ref, error}`                |
| client | `{type:'send', session, line}`    | one UCI command                                 |
| host   | `{type:'line', session, line}`    | one line of engine output                       |
| host   | `{type:'end', session}`           | the engine exited                               |
| client | `{type:'stop', session}`          | stop and forget the session                     |
| both   | `{type:'ping'}` / `{type:'pong'}` | every 15 s; 45 s of silence ends the connection |

## Failure is a failed session, never a reused one

`AGENTS.md`: a process that fails to acknowledge a stop is not reused, because
its late `bestmove` would be read as evidence about the next position. A lost
connection is the network form of that, and is treated the same way:

- **The host** stops every engine the connection started the moment the
  connection closes, for any reason.
- **The local companion** ends every session on that connection: it emits
  `#error The connection to <host> was lost.` and then the end of the stream,
  which the browser's engine session reads as a failed session. It does not
  reconnect a session; a new search starts a new one.
- The host's name is written into the engine's own `id name` line
  (`Stockfish 18 · on studio-mac`), so every evaluation's engine identity says
  where it was computed, in the panel, in saved evidence and in exported files.

## What was run, and what was not

`companion/src/remote-engines.test.mjs` runs a real host and a real client in
one process over a real TLS socket, with a scripted UCI engine: pairing, a
search streamed through, a wrong key refused, a disconnect in the middle of a
search ending the session on both sides and killing the host's engine process.

The brief's acceptance — **two real machines**, and **a cloud VM over the
internet** — was not run: the owner had neither available in Phase 85. Until it
is, this is a capability tested on one machine over loopback, and is described
as that.
