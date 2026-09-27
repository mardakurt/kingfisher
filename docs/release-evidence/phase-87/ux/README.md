# Phase 87 — before and after

Produced on 2026-09-27 with Chrome through Playwright, fresh browser
profiles, `next dev` from the baseline `0547f38` (port 3211, a worktree)
and from the Phase 87 master (port 3210).

- `before/`, `after/` — the same scripted views at each revision. The
  `analysis-game-<size>` pairs load one 42-ply game; `explorer-1280x720`
  loads a short game and opens the Explorer; `prep-*` prepares against
  Carlsen; `lib-preview` previews a Library game; `*-mbp13-*` and
  `*-large-*` are `scripts/capture-pages.mjs --seed` (200 bench games).
- `metrics-before.json`, `metrics-after.json` — `scripts/metrics.mjs`
  against each server: explorer rows and sideways overflow at 1280x720,
  Databases in view at 1280x800, create buttons on empty pages, and the
  preparation suggestions seen in the first four seconds.
- `analysis-geometry-{before,after}.txt` — `scripts/measure.mjs`: board
  frame and notation box at five window sizes.

To rerun, from the repository root with a dev server on the port:

```bash
node docs/release-evidence/phase-87/ux/scripts/metrics.mjs http://localhost:3210
```

`measure.mjs` and the capture scripts take an output directory and read
`http://localhost:3210`. The bench games are synthetic (`public/bench/`);
they exercise the layout, not chess evidence.
