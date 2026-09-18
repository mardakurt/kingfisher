# Phase 68 handover — the 1.2.0 release

The work that ships in 1.2.0, plus the gates it passed, plus the diff
between this commit and `origin/master`'s last public release (1.1.9).

## What was asked

The 1.2.0 release candidates came in three messages after the 1.1.9
release went out:

1. The toolbar disappeared in Phase 64. The Training icon under it
   was a placeholder shape from Phase 53 that survived 16 px only
   because nothing else was drawn there. The owner reported both.
2. The 1.2.0 desktop build failed the certify harness with two
   pre-existing issues from earlier phases:
   - `scripts/desktop-chrome.mjs` had `FULLSCREEN_BRAND_X = 0`,
     which Phase 64 changed to `14` to keep the 14 px design inset.
     Phase 64 updated every other place; this script was missed.
   - `e2e/prod-phase60.spec.ts` used `test.skip(true, ...)` — a
     conditional skip that the certify harness's `test:no-skips` gate
     rejects even when the skip is unreachable.
3. The owner asked for a board grid that has a definite height
   (Phase 66) and an eval bar that lives in the board column rather
   than competing with it for rail space (Phase 65). Both landed
   ahead of 1.2.0.

## What landed in 1.2.0

- Phase 67 — the toolbar is gone, and the Training icon is the new
  chess-knight design. The old icon read as a tent peg / snail at
  every size; the new icon is a wide plinth, a vertical body column,
  and a horse head whose silhouette — mane, ear notch, muzzle, eye —
  survives 16 px.
- Phase 66 — the board grid has an explicit `height` so a future
  addition that brought a third row would have something to fill
  the `1fr` row against.
- Phase 65 — the eval bar sits in its own column. The board's
  `aspect-square` matches its column's width, so the rail and the
  board never disagree about who is taller.
- Phase 64 — the Kingfisher brand keeps its 14 px design inset in
  macOS full-screen. The previous fix accounted for the traffic
  lights in non-full-screen and now this one accounts for them
  in full-screen.
- Phase 63 — companion setup overhaul, diagnostics badge, palette
  preview explained, linked-game side, inline rename. Backup export
  downloads; an assistant key cannot double-fire.
- Phase 62 — tour is openable, board chrome moves out of the way,
  icons redrawn. The "first-run" prompt is dropped.
- Phase 60 — manual backup is decoupled from auto-backup.
- Phase 59 — the eval bar's one-decimal format lands everywhere it
  should have.
- Phase 58 — twelve bug-hunt fixes, eval bar reads lichess-style.
- Phase 57 — `platform-parity` records the web-only delta,
  `CHANGELOG` records the eleven enhancements and the bug-hunt pass.
- The 1.2.0 preflight (the unblock at the end of the phase): the two
  certify-harness failures above were both addressed in
  `8af5de1 phase 68 (1.2.0) preflight: fix test:no-skips and
eval-bar-layout`, so the build is green.

## Gates

| Gate             | Command                               | Result                                 |
| ---------------- | ------------------------------------- | -------------------------------------- |
| Typecheck        | `tsc --noEmit`                        | clean, no output                       |
| Lint             | `eslint .`                            | clean, no output                       |
| Format           | `prettier --check .`                  | all files use Prettier code style      |
| Tests            | `vitest run`                          | 251 files / 3045 tests pass, 0 skipped |
| Certify          | `npm run desktop:certify`             | DESKTOP CERTIFIED                      |
| Notarisation     | `npm run desktop:trust:verify`        | GREEN                                  |
| DMG verification | `node desktop/scripts/verify-dmg.mjs` | passed                                 |

The full 1.2.0 publication sequence — `desktop:dist`,
`release:mac:notarize`, `desktop:public:verify` — was run during the
1.2.0 publication window; the results are recorded in
`docs/release/launch-kit.md` and `desktop/src/sparkle-bundle.mjs`.
The descriptor in `src/release/macos-download.json` is the bytes
that landed on the landing page and on the install page.

## Diff vs the last public release

The last public release was 1.1.9 (`6497f13`). 1.2.0 ships from
`d8dd818 phase 68 (1.2.0): bump version, draft release notes`. The
commits in between are exactly the phases above; the byte count of
the DMG goes from `171,978,530` (1.1.9) to `172,355,634` (1.2.0).

## Public claims

The public-claims ledger at `docs/product/public-claims.md` was
updated to name 1.2.0 as the current public release; every canonical
document (`README.md`, `SECURITY.md`, `docs/release/install-macos.md`,
`docs/release/launch-kit.md`, `docs/release/1.2.0.md`) was updated to
match. `npm run docs:check` runs the assertion at every CI build
that all four documents name the same version.

## Known follow-ups

These are tracked but not part of 1.2.0:

- A `docs/reports/phase-68-handover.md` was created as part of
  releasing 1.2.0; the doc gate checks for its existence, so the
  release cannot ship if it is missing.
- The web-only platform delta (the desktop shell adds the
  companion and native engines) is recorded at
  `docs/product/platform-parity.md`. Kingfisher 1.2.0 ships the
  same application code on both surfaces; the delta is in
  capabilities, not in features.
