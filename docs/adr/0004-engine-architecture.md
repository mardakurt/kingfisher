# 0004 — Engine behind a provider interface; WASM fetched at setup

**Status:** Accepted

## Context

Stockfish in WebAssembly is the right default: no install, no server, strong
enough for any human analysis. But it should not be the only possibility. A
serious user will eventually want a native binary at full strength, a shared
analysis server, or a different engine entirely (Leela plays differently enough
that comparing them is genuinely useful).

There is also a packaging problem. The `stockfish` npm package unpacks to 250 MB
because it ships every build variant. The builds are GPL-3.0.

## Decision

**Interface.** `EngineProvider → EngineSession → AnalysisHandle`, with
`EngineAnalysis` as the only thing the UI ever sees. UCI text never leaves
`engine/`. A native bridge or a remote server is a new provider, not a change
anywhere else.

**Packaging.** `scripts/install-engine.mjs` downloads exactly two builds
(~14 MB) into `public/engine/stockfish/` and writes a manifest. The directory is
git-ignored. When the manifest is missing, the provider reports itself
unavailable with the command to fix it — the application never pretends to
analyse.

**Threading.** The multi-threaded build needs `SharedArrayBuffer`, which needs
cross-origin isolation, which constrains what else the page may embed. So it is
opt-in via `KINGFISHER_CROSS_ORIGIN_ISOLATION=1`, and the provider picks the
threaded build at runtime when `crossOriginIsolated` is true.

## Consequences

- `npm install` stays fast and the repository stays small.
- Stockfish is never redistributed by this repository; the GPL obligation
  attaches to whoever bundles it. A future packaged build needs a deliberate
  licensing decision.
- One extra setup step, documented in the README and surfaced in the UI at the
  moment it matters.
- Protocol handling is pure and separately testable (`engine/uci.ts`), so a
  second UCI engine needs no new parsing code.
