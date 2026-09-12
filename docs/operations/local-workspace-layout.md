# Local workspace layout

Where Kingfisher files live on the maintainer's own machine, and what should
never be committed to the source tree. The phase-29 era ended with two folders
sitting beside the active project that looked like Kingfisher content but
contained a duplicate worktree — this document is the layout a phase handover
should expect to find on disk.

## Source repository

Exactly **one** Kingfisher source checkout, on `master`, pointed at
`github.com/mardakurt/kingfisher`. Path is whatever the maintainer chose at
clone time; the canonical one for this workspace is
`~/Desktop/Projects/chess&poker/chess/studying hub`. The clone is a regular
checkout, _not_ a worktree — Phase 29's secondary check-in
(`kingfisher-phase29-audit-storage`) was a worktree of this same repo and was
archived, not duplicated.

Things that belong in the source repo:

- `package.json`, `src/`, `tests/`, `public/`, `scripts/`, `docs/`,
  `desktop/`, `e2e/`, `marketing/`
- `vercel.json` and any other deployment manifests
- `.github/` — CI and the deploy workflow

Things that **must not** appear in the source repo:

- `node_modules/` — install via `npm ci`
- `.next/` — produced by `npm run build`
- `.engine-build/`, `.engine-fleet/`, `.archive-cache/`, `.packs/`,
  `.real-scale/` — reproducible caches, kept under `~/Library/Caches/Kingfisher/`
- `release-manifest.json` — generated, ignored
- `playwright-report/`, `test-results/` — Playwright outputs, ignored

The full list lives in `.gitignore` and `scripts/cache-paths.mjs`. When in
doubt, run `npm run data:cache:paths` to see where each cache is meant to
live.

## Cache directory

`~/Library/Caches/Kingfisher/` — large, reproducible, never committed.
Subdirectories follow the `cachePaths` table in `scripts/cache-paths.mjs`:

| Subdirectory      | Used by                                                | Override env var              |
| ----------------- | ------------------------------------------------------ | ----------------------------- |
| `archives/`       | upstream data archives                                 | `KINGFISHER_CACHE_DIR`        |
| `data-builds/`    | intermediate pack builds                               | `KINGFISHER_DATA_BUILD_DIR`   |
| `engines/`        | downloaded engine binaries                             | `KINGFISHER_ENGINE_DIR`       |
| `real-scale/`     | five-GB real-scale benchmark                           | `KINGFISHER_REAL_SCALE_DIR`   |
| `archive-cache/`  | Lichess archive scan cache                             | `KINGFISHER_ARCHIVE_CACHE`    |
| `packs/`          | candidate reference pack builds                        | `KINGFISHER_PACKS_DIR`        |
| `engine-build/`   | compiled engine sources                                | `KINGFISHER_ENGINE_BUILD_DIR` |
| `engine-fleet/`   | downloaded engine fleet                                | `KINGFISHER_FLEET_DIR`        |
| `legacy-archive/` | Phase-29 historical snapshot (archived, never rebuilt) | n/a                           |

Two more directories on the machine are the desktop build's and the
packaged application's, and are not under `Kingfisher/`:

- **`$TMPDIR/kingfisher-desktop-dist/`** — electron-builder's output when
  the checkout path contains a character it refuses (this one does).
  `npm run desktop:dist` removes the previous `dev` DMGs there before
  building; `preview` and stable DMGs are never removed automatically
  because they may have been published. Older `rc` images from earlier
  phases can be deleted by hand; everything there is reproducible.
- **`~/Library/Caches/kingfisher-desktop-updater/`** — where
  `electron-updater` keeps a downloaded update (`pending/`) for the
  packaged application; bounded to the newest archive on quit.
  Authored work is never here: it lives in
  `~/Library/Application Support/kingfisher-desktop/`.

The cache lives outside iCloud-synced locations on purpose. A multi-GB
engine build is the wrong thing to ask iCloud to mirror every time it
changes, and a stale iCloud placeholder is the wrong thing to start a build
from.

## Runtime user data

`~/Library/Application Support/kingfisher-desktop/` — the Electron desktop
shell's IndexedDB, cookies, GPU cache, code cache, and other state. This is
runtime application data, not workspace layout; **never** reorganise it from
this side. A phase that touches this directory is a phase that has lost the
plot.

## What should not appear in `~/Desktop/Projects/`

If a Kingfisher-related folder appears here that is not the source repo
itself, it is either:

- a leftover Phase-29 worktree (should not exist after this phase);
- a personal study directory the maintainer has chosen to keep there;
- a build/cache directory that has been misplaced (move it under
  `~/Library/Caches/Kingfisher/`).

`npm run workspace:audit` (added in this phase) reports any directory that
looks misplaced.

## Auditing the layout

```
npm run workspace:audit
```

Reports:

- the canonical repo path and HEAD;
- which cache directories exist (and which the user has not created yet);
- any directory under `~/Desktop/Projects/` that contains a Kingfisher
  marker (`.claude`, `package.json` with a Kingfisher manifest, `src/`
  with `app/`, `engine/`, `chess/`).

The script **does not** scan the entire home directory and **does not**
move or delete anything — it is a report.
