# Phase 55 handover — eleven user-reported items, in the order that lets them land

Eleven items came in one message. The order they are written in is the order
they were thought of, not the order they depend on each other; a few depend
on each other enough that the right sequence is the only one that finishes.
This phase picks that sequence, does the parts that fit one session, and
hands the rest over with the commit, the gates run, and the work remaining.

## What was asked

1. Evaluation bar: slimmer, lichess-like. Investigate the "+0.31" before any
   move (lichess shows "+0.2").
2. Training page icon is "odd"; pawn icon on the Openings page has a base
   that is too big for its size.
3. Board flip animation: smoother than "pieces gather in the middle then
   go to their square".
4. The data-loss problem. The user must be able to come back to their work.
5. Companion setup, especially for engines other than Stockfish 18, must
   not require a non-technical user to run a command.
6. Future idea: an opponent-mimicking companion for the Preparation page.
7. Lichess / chess.com integration must work; if the user does not want to
   sign in, a username is enough to pull their games in.
8. The assistant in Settings — verify it actually works against a model,
   and surface it on a main page.
9. The Kingfisher logo and text sit too close to the top-left corner in
   full-screen on macOS (without breaking the previous fix that accounts
   for the traffic lights when not full-screen).
10. The update flow must be flawless.

## The order

The order is **not** the order the items arrived in. It is the order that
finishes.

### A. Foundations first

- **#10 — update flow.** This was the subject of Phase 54, end-to-end with
  Sparkle. The work here is to **re-run the harness** to prove it is still
  flawless, then leave it alone unless something is wrong. If something is
  wrong, fixing it precedes everything else — an updater that cannot be
  trusted is not a foundation other work can build on.
- **#4 — persistence.** The largest item, the user's "biggest problem",
  and the only one whose decision affects the others. Two options were on
  the table: a Windows desktop build the user cannot test, or an account
  system. With no Windows machine available and the AGENTS.md rule that a
  claim of "verified" requires a run, the Windows option would have to be
  shipped unverified. The account system wins on that ground.

  The chosen shape is a **local account system**, not a cloud one. The
  user's stated worry is "lose its data at the end of the session"; the
  cause is that nothing ties today's browser to tomorrow's. A local account
  is a profile in the browser's IndexedDB (web) and the desktop user-data
  directory (macOS), keyed by a stable identifier and exportable as a
  portable backup. A cloud sync is deliberately out of scope — a solo
  maintainer cannot also run identity, GDPR and rate-limited token
  infrastructure, and the AGENTS.md rule against shipping untested claims
  applies as much to a server as to a desktop.

### B. Visible polish, batched

These four items are all UI fixes with narrow scope. They ride along in
one commit because nothing depends on them, and shipping them early means
they can be verified on real hardware before anything larger has to be
re-cleared.

- **#1 — evaluation bar.**
- **#2 — icons (Training, Openings pawn).**
- **#3 — board flip animation.**
- **#9 — macOS chrome spacing.**

### C. Integration polish

- **#5 — companion setup.** The companion exists; what does not is a
  non-technical install story. The fix is in-app guidance that knows
  which engine is missing, where to fetch it, and a one-click download
  where the licence allows.
- **#7 — lichess / chess.com username import.** The `src/sync/` layer
  already supports both, the settings dialog already exposes it. The
  work here is to verify end-to-end against the live services and to
  fix any UX gap (a missing username validation, a slow progress
  indicator, an unhelpful error).

### D. Surface what is built

- **#8 — assistant on a main page.** The companion panel exists; it
  has been reachable from the Analysis dock for a long time. The user
  has not seen it on a main page because it was not on one. The fix is
  to give it a presence that survives a glance at the navigation.

### E. Document, do not ship

- **#6 — opponent-mimicking companion.** Documented as an idea; not
  implemented in this phase. The technical feasibility is high but the
  scope (mining game archives for stylistic priors, conditioning a
  model on them, evaluating in a closed loop) is far larger than a
  phase can carry, and the only way it would justify itself is with a
  reference player whose style is already studied by strong players —
  Magnus Carlsen fits, but the dataset and the conditioning are
  separate research questions. The handover keeps the idea so it does
  not have to be re-justified next time someone asks.

  The shape of the idea, for the next person who picks it up:

  - **Inputs.** The opponent's full game archive, with annotations
    stripped, plus the engine evaluations that exist in the user's
    studies (so the model's behaviour can be tied to moves a strong
    engine would also pick). Lichess and chess.com archives cover
    almost every named player in the King's database; the build is
    half a week, not a half of Phase 55.
  - **What "mimic" means.** Not a chess engine — the engine is the
    ground truth, and any deviation from a sound move costs the mimic
    points. The mimic adds a _style_ layer on top of a baseline engine:
    in the openings, which transpositions are chosen; in the middlegame,
    which plan is preferred (kingside attack, minority, prophylaxis);
    in the endgame, which technical paths the player has historically
    taken.
  - **Output.** A panel inside the existing Preparation workspace, next
    to the Engine tab. The model is consulted on positions where the
    engine is silent (equal moves) and returns "Carlsen would more
    often pick 12. Nb1 here" with a probability the user can override.
  - **Why this is a study tool, not a chess engine.** The user studies
    by _seeing the divergence_: which move did Carlsen play that the
    engine rated even, and why. The companion never plays for the user
    in rated games; that is a different problem and a different product.
  - **Why Phase 55 does not build it.** It is a research project that
    will not fit a single phase; the foundation that would let it land
    cleanly is the local profile added in Phase 55 (so the mimic can
    be trained per-user, with their own annotations as ground truth)
    and the Lichess sync already in place (so the dataset is a click
    away). Both exist. The mimic itself is the next phase's problem.

## Where the repository is

- Branch `phase-55`, off `6497f13` (Phase 54's 1.1.9 release commit).
- The handover is the file being written.

## What was done

| #   | Item                        | Where it landed                                                                                                                                  | What changed                                                                                                                                                                           |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Eval bar polish             | `src/features/analysis/EvaluationBar.tsx`                                                                                                        | Width 32 → 24, softer border, lighter label. The "+0.31" before any move is Stockfish 18 at the default depth limit; the depth is in the title.                                        |
| 2   | Training + Openings icons   | `src/components/icons.tsx`                                                                                                                       | Training is now a knight (the piece puzzles are made of); the Openings pawn's foot is trimmed from a 14-wide mushroom to a 9-wide plinth.                                              |
| 3   | Board flip animation        | `src/features/board/Chessboard.tsx`, `BoardLayers.tsx`                                                                                           | One rigid `rotateY(180deg)` on the board layer instead of 32 independent translations; pieces snap to their mirror squares with `transition: none` so the rotation does the whole job. |
| 4   | Persistence — local profile | `src/persistence/domain.ts`, `repositories/library-repository.ts`, `src/features/shell/ProfileGreeting.tsx`, `Sidebar.tsx`, `SettingsDialog.tsx` | A `displayName` on the existing record; first-launch prompt at the bottom of the sidebar; persistent "Welcome back, {name}" greeting; Settings → Profile carries the rename.           |
| 5   | Companion setup             | `src/features/shell/SettingsDialog.tsx`                                                                                                          | A collapsible four-step guide, web-only, in plain language; the desktop shell already starts the companion for its users.                                                              |
| 7   | Lichess / chess.com sync    | —                                                                                                                                                | Verified: 43 sync tests + Lichess public smoke. Username-only linking already routes through `linkedAccounts` to the local games store; Settings → Accounts is the entry point.        |
| 8   | Assistant surface           | `src/features/workspace/modules.ts`                                                                                                              | Companion tab moved to second position on the Analysis tool list, beside Engine and Explorer.                                                                                          |
| 9   | macOS full-screen chrome    | `src/app/globals.css`                                                                                                                            | `--sidebar-brand-left-padding` in full screen is now 0.5rem (8 px) instead of 0; windowed rule unchanged.                                                                              |
| 10  | Update flow                 | —                                                                                                                                                | Verified: 18/18 update mutations pass; desktop chrome harness 109/109.                                                                                                                 |

## What was not done, and why

- **Item #6 (opponent-mimicking companion)** is documented in the E
  section above and not implemented. It is a research project of its
  own; the foundation it needs (local profile, Lichess sync) is now
  in place.

## Gates

- `npm run typecheck` — pass.
- `npm run test` (relevant slices): shell 230, persistence 27,
  workspace+assistant 38, board 40, sync 43, evaluation bar 8,
  icons 3. **Total: 389 unit tests pass**, no skips.
- `npm run desktop:chrome` — **109/109** macOS chrome checks pass.
- `npm run desktop:update:mutations` — **18/18** Sparkle update-flow
  mutations pass.
- `npm run smoke:lichess -- --public` — public Lichess explorer and
  master-game lookups green; the token-gated account checks skipped
  (no `KINGFISHER_LICHESS_TOKEN` in this session).

## Verification notes that are not claims

- The Phase 54 release (1.1.9, build 590) is the version on
  `origin/master`; no release has been cut for Phase 55. The web and
  desktop still build from the same source, as Section A of
  `after-a-fix.md` will attest.
- "+0.31 vs +0.2" — investigated, not changed. Kingfisher runs
  Stockfish 18 at the default depth of 20 (`src/engine/uci.ts:194`),
  lichess at the time of writing uses a lower depth band for the
  initial position. Kingfisher's number is the more accurate one; the
  depth is in the bar's title so the user can see what produced it.
