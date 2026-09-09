# Phase 28 acceptance scenarios

> The four scenarios the brief calls for, with the verification
> status Phase 28 has actually achieved.

## Scenario 1 — Professional opening prep (PART CX.1)

> A player opens Kingfisher, opens a Najdorf line, walks the
> Explorer, sees a recent trend, opens the player profile, adds a
> repertoire response, creates a training set, quits.

**Status: not run end-to-end.** Each individual step in the chain
was completed and tested in this phase or an earlier one:

- Najdorf → Explorer (existing route, ✅)
- Recent trend (Phase 27, ✅: trend column with sample-size
  safety, `src/features/explorer/evidence.ts`)
- Player profile (Phase 27 Career vs Recent, ✅:
  `src/features/player/PlayerWorkspace.tsx`)
- Repertoire response (existing, ✅:
  `src/features/repertoire/AddToRepertoireDialog.tsx`)
- Create Training Set (Phase 28, ✅:
  `ReferenceCoveragePanel.tsx` "Create training set" button)
- Quit (existing, ✅: IndexedDB-backed persistence,
  `docs/product/work-continuity.md`)

The full scenario was not run in a browser because Phase 28's
autonomous scope does not include Playwright runs against the
preview deployment. **The pieces are individually verified; the
walkthrough is not.**

## Scenario 2 — Continuity (PART CX.2)

> A player creates a Study, closes the laptop, returns tomorrow.
> Work is there. Then: enables sync, signs in on a second device,
> work appears.

**Status: not run.**

The first half (close-laptop-return) is verified by
`docs/product/work-continuity.md` for the same browser, same
profile, same machine. The second half (sync) is not implemented
— it requires a Supabase project and the owner authorisation
documented in
[`docs/adr/00xx-optional-account-sync.md`](../adr/00xx-optional-account-sync.md).

## Scenario 3 — Large data (PART CX.3)

> A player uses Elite OTB online (no install), researches lines.
> Then installs for offline, observes cached-chunk reuse.

**Status: skeleton implemented, not wired.**

`src/database/providers/remote-reference.ts` is the streaming
provider skeleton. The investigation document
[`docs/data/streaming-reference-investigation.md`](../data/streaming-reference-investigation.md)
records what is needed to make it production-ready:

1. A Vercel origin that serves the data mirror at per-chunk URLs
   with `Accept-Ranges` advertised.
2. A registered provider in `database/registry.ts`.
3. A real-world cache-size measurement.

Until those happen, the catalog row shows "Available online"
but no provider answers. The user installs the pack as before.

## Scenario 4 — Offline (PART BI.4)

> A player disables the network, opens the studio, navigates every
> workspace, opens a Study, opens a Repertoire position, opens a
> Training item. Everything works.

**Status: documented, not run.**

`docs/product/work-continuity.md` documents which surfaces work
offline:

- Explorer (against installed pack): works
- Player aggregate: works
- Repertoire coverage (against installed reference): works
- Data-generated training drafts: works
- Online Masters (Lichess): shows "Offline" when the network is
  down
- High-Rated Online / Recent Theory / Elite OTB: all read from
  IndexedDB

A full browser run was not performed in this phase. The
assertions are architectural, not verified.

## Verification matrix

| Scenario              | Pieces         | Walked          | Notes                       |
| --------------------- | -------------- | --------------- | --------------------------- |
| 1 — Professional prep | ✅ all 6       | ⏳ not run      | Each piece has its own test |
| 2 — Continuity        | ✅ same-device | ⏳ cross-device | Sync layer not implemented  |
| 3 — Large data        | ✅ skeleton    | ⏳ end-to-end   | Wiring + benchmark deferred |
| 4 — Offline           | ✅ documented  | ⏳ browser run  | Architectural assertions    |

## What this section claims

**The pieces are tested individually; the scenarios are not
walked end-to-end in this phase.** A future phase would run the
walkthroughs in a real browser with Playwright, taking
screenshots and asserting on visible state. That is the proper
"LOOK AT THE UI" the brief requires. It is not in Phase 28's
autonomous scope.

The pieces themselves are real and tested:

- `npm test` — 2223 tests, 11 skipped, 0 failed.
- `npx vitest run src/reference` — 89/89.
- `npx vitest run src/repertoire` — 90/90.
- `npx vitest run src/features/databases/reference-source-state.test.ts` — 5/5.
- `npx vitest run src/database/providers/remote-reference.test.ts` — 5/5.
- `npx vitest run src/middleware.test.ts` — 13/13.
- `npx vitest run src/persistence/storage-persistence.test.ts` — 6/6.

## What I am NOT claiming

- "Scenario 1 works end-to-end in a real browser." It has not
  been walked.
- "Scenario 2's cross-device path is implemented." It is not.
- "Scenario 3's streaming provider is wired." It is not; only the
  skeleton.
- "Scenario 4 has been browser-verified." It has not.

These gaps are the work of a future phase that has access to a
real browser, a real network, and a real Supabase project.
