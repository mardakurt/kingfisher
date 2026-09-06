# 0049 — The desktop shell is Electron, and the reason is SharedArrayBuffer

**Status:** accepted (Phase 19)

## Context

Kingfisher runs in a browser and talks to an optional companion process the
user starts in a terminal and pairs by pasting a token. That is a reasonable
web product and an unreasonable desktop one: the phase brief's standard is that
a person should install Kingfisher and open databases, run native engines and
work offline without ever meeting a terminal.

So the shell has two jobs, and only two. It must run the companion — a Node
process that opens multi-gigabyte SQLite files and spawns native engines — and
it must render the application. Everything else is already built.

Two candidates were built rather than compared on reputation: a Tauri 2.11.4
application and an Electron 44.2.0 one, both on this machine, macOS 26.6 on
Apple Silicon.

## The measurements

Both spikes are reproducible; the probes are in the Phase 19 report.

|                                | Tauri 2.11.4                       | Electron 44.2.0                |
| ------------------------------ | ---------------------------------- | ------------------------------ |
| Empty application bundle       | **9.4 MB**                         | 307 MB of framework            |
| Web engine                     | WKWebView, `AppleWebKit/605.1.15`  | Chromium **152.0.7977.76**     |
| `crossOriginIsolated`          | **false**                          | **true**                       |
| `SharedArrayBuffer`            | **absent**                         | **present**                    |
| …with COOP/COEP declared       | still false                        | true                           |
| Node runtime for the companion | none; a sidecar                    | **Node 24.20.0, in the shell** |
| `node:sqlite` (`DatabaseSync`) | via a bundled `node` (**+119 MB**) | **works**                      |
| `worker_threads`               | via that same sidecar              | **works**                      |
| Cold build of the empty app    | 93 s of Rust                       | seconds                        |

Two of those rows decided it.

**Cross-origin isolation.** Kingfisher's browser engine is a multi-threaded
WebAssembly Stockfish, and multi-threaded WebAssembly needs `SharedArrayBuffer`,
which needs a cross-origin-isolated context. Under Tauri the page is served from
the `tauri://localhost` custom protocol, and `crossOriginIsolated` is `false`
there. This was re-measured with `app.security.headers` declaring
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` — the configuration that ought to
fix it — and it stayed `false`. A Tauri Kingfisher would silently fall back to
the single-threaded engine on the platform this phase calls first-class, and
"silently" is the word that matters: nothing in the product would say so.

**The companion is Node, and Electron is Node.** `companion/` is 28 modules
using `node:sqlite` and `worker_threads`. Electron 44 embeds Node 24.20.0 and
both work in it, verified by running them, so the companion is forked
unmodified. Tauri has no Node, so the same companion would need a bundled
runtime — 119 MB, which is most of Tauri's size advantage — or a rewrite in
Rust, which would be a second implementation of the database and engine layers
and is exactly the duplication this project treats as a defect.

## Decision

**Electron.** The application it renders is the same Next.js application the
browser runs, served by a Next standalone server the shell starts on a
loopback port it chose. No second renderer, no second router, no second copy of
any chess code.

The web version is untouched. `output: 'standalone'` and cross-origin isolation
are both opt-in through `KINGFISHER_DESKTOP_BUILD` and
`KINGFISHER_CROSS_ORIGIN_ISOLATION`, which only `scripts/build-desktop-web.mjs`
sets; with them unset `npm run build` emits exactly what it emitted before.

## What was given up, stated plainly

- **Size.** A Kingfisher.app is a few hundred megabytes rather than tens.
  Against 30 MB of engine assets and reference packs that a chess workstation
  ships anyway, and against a 119 MB Node sidecar on the other side of the
  comparison, this is the smaller cost than it looks.
- **A second web engine.** Shipping WKWebView would have been free coverage of
  a second renderer. It would also have been a renderer no test in this
  repository exercises: the Playwright suite is Chromium, and the visual gate
  that protects the board is Chromium's rasteriser.

## Consequences

- The shell owns the companion's lifetime. `desktop/src/services.mjs` states
  the shutdown contract and `services.test.mjs` tests it against real
  processes: SIGTERM first so the companion's own handler stops its engines,
  escalation if it will not go, and an IPC channel the companion watches so
  that a shell which is _killed_ rather than quit still takes its engines with
  it.
- Managed engines are downloaded to the user's application-support directory,
  not into the bundle: writing inside a signed `.app` invalidates the signature
  that let it launch.
- The hardened runtime needs `allow-jit` for the WebAssembly engine and
  `disable-library-validation` for native engines signed by their own projects
  or by nobody. This does not make them sandboxed, and
  [ADR 0041](0041-engine-trust-and-the-sandbox-we-do-not-have.md) still
  describes the trust model.
- The bridge between shell and application is one preload file and
  `src/desktop/bridge.ts`, which returns `null` in a browser. A feature that
  needed to know which identity it was running in, beyond "is there a native
  file dialog", would be a bug in this arrangement.
