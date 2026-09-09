# Phase 28 UI audit — route inventory and verification matrix

> The honest, route-by-route map of the web studio, the viewports
> the brief asks us to verify, and the current knowns.
>
> **Status: inventory only.** Automated screenshot passes and
> mutation checks are not part of Phase 28's autonomous scope.
> Every assertion in this document is a _commitment_ to verify in
> the next phase; it is not a claim that the assertion currently
> holds.

## Route inventory

The web studio serves the following top-level routes. Each route
is a workspace that loads its own data and has its own panel
hierarchy.

| Path                                        | Workspace    | Primary surface                           | Phase 28 status                             |
| ------------------------------------------- | ------------ | ----------------------------------------- | ------------------------------------------- |
| `/` (landing host only)                     | Landing      | Marketing page                            | ✅ audit-relevant: scroll-freeze fix landed |
| `/` (studio host, rewritten to `/analysis`) | Analysis     | Board + controls + Explorer               | ✅ scroll-freeze fix covers the studio too  |
| `/analysis`                                 | Analysis     | Board, controls, lower panel              | ⏳ pending                                  |
| `/openings`                                 | Openings     | Opening Library + report                  | ⏳ pending                                  |
| `/players`                                  | Players      | Player roster                             | ⏳ pending                                  |
| `/player/[id]`                              | Players      | Player profile (Career vs Recent landed)  | ⏳ pending                                  |
| `/databases`                                | Databases    | Reference catalog (state badge landed)    | ⏳ pending                                  |
| `/database/[id]`                            | Databases    | Database detail                           | ⏳ pending                                  |
| `/studies`                                  | Studies      | Study list                                | ⏳ pending                                  |
| `/study/[id]`                               | Studies      | Study view                                | ⏳ pending                                  |
| `/repertoire`                               | Repertoire   | Repertoire positions + reference coverage | ⏳ pending                                  |
| `/preparation`                              | Preparation  | Session sheet                             | ⏳ pending                                  |
| `/games`                                    | Games        | Game browser                              | ⏳ pending                                  |
| `/review`                                   | Review       | Review queue                              | ⏳ pending                                  |
| `/training`                                 | Training     | Training sets + Create Training Set wired | ⏳ pending                                  |
| `/endgame`                                  | Endgame      | Tablebase                                 | ⏳ pending                                  |
| `/opening-files`                            | OpeningFiles | Polyglot books                            | ⏳ pending                                  |
| `/settings`                                 | Settings     | Preferences, sources, sync (placeholder)  | ⏳ pending                                  |
| `/recent`                                   | Recent       | Recent games                              | ⏳ pending                                  |
| `/oauth/lichess`                            | OAuth        | PKCE callback                             | ⏳ pending                                  |

## Viewport matrix (per brief PART AJ)

The brief asks for verification at:

| Viewport    | Width × Height  | Class            | Phase 28 status |
| ----------- | --------------- | ---------------- | --------------- |
| 320 × 568   | iPhone SE       | Phone (small)    | ⏳ pending      |
| 375 × 812   | iPhone X        | Phone            | ⏳ pending      |
| 390 × 844   | iPhone 14       | Phone            | ⏳ pending      |
| 430 × 932   | iPhone Pro Max  | Phone (large)    | ⏳ pending      |
| 768 × 1024  | iPad            | Tablet           | ⏳ pending      |
| 1024 × 768  | iPad landscape  | Tablet landscape | ⏳ pending      |
| 1280 × 720  | Laptop HD       | Laptop           | ⏳ pending      |
| 1366 × 768  | Laptop          | Laptop           | ⏳ pending      |
| 1440 × 900  | Laptop          | Laptop           | ⏳ pending      |
| 1512 × 982  | MacBook Pro 14" | Laptop           | ⏳ pending      |
| 1728 × 1117 | MacBook Pro 16" | Desktop          | ⏳ pending      |
| 1920 × 1080 | Full HD         | Desktop          | ⏳ pending      |
| 2560 × 1440 | QHD             | Desktop (large)  | ⏳ pending      |

## Zoom matrix (per brief PART AK)

| Zoom | Phase 28 status |
| ---- | --------------- |
| 80%  | ⏳ pending      |
| 90%  | ⏳ pending      |
| 100% | ⏳ pending      |
| 110% | ⏳ pending      |
| 125% | ⏳ pending      |
| 150% | ⏳ pending      |

## Theme matrix (per brief PART AN)

| Theme | Phase 28 status                                                       |
| ----- | --------------------------------------------------------------------- |
| Dark  | ⏳ pending (the app's first paint is dark; the theme switcher exists) |
| Light | ⏳ pending                                                            |

## UI state audit (per brief PART AM)

Every primary surface must render correctly in:

- loading
- empty
- success
- error
- offline
- disabled
- installing (reference pack install)
- updating (reference pack update)
- conflict (sync layer, deferred to sync phase)

| Surface              | States audited | Notes                                                                                            |
| -------------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| Reference Catalog    | ⏳ pending     | state-badge landed; offline/installing/updating still need a pass                                |
| Player Workspace     | ⏳ pending     | Career vs Recent added; empty/error states need audit                                            |
| Repertoire Workspace | ⏳ pending     | Reference Coverage added; "no coverage" empty state                                              |
| Training             | ⏳ pending     | "No training items" empty state already exists; loading state on Create Training Set needs audit |
| Explorer Panel       | ⏳ pending     | trend column added; small-sample state is visible; offline still needs audit                     |
| Analysis Board       | ⏳ pending     | core surface, untouched this phase                                                               |

## Mutation checklist (per brief PART DI)

These are the assertions the next phase must execute as automated
mutation tests. Each "mutation" means the _opposite_ of the
correct behaviour; each must FAIL the corresponding test.

| Assertion                                    | Mutation                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| Scroll unfrozen                              | Set `body { overflow: hidden }` again → expect body-scroll test to fail |
| Studio host rewrites / to /analysis          | Match a non-studio host → expect routing test to fail                   |
| Studio host passes through /openings         | Match landing host for /openings → expect redirect test to fail         |
| Cache version includes pack version          | Strip the version from cacheVersion → expect cache-key test to fail     |
| Cross-source isolation (Career vs Recent)    | Drop `last-12m` from key → expect cache-identity test to fail           |
| Synced query keys match the installed reader | Use a non-existent chunk → expect streaming test to fail                |

The streaming test is new for Phase 28 and is the only assertion
without a regression test yet written.

## Verification status

| Class                           | Count                                        |
| ------------------------------- | -------------------------------------------- |
| Critical UI defects known       | 1 fixed (scroll-freeze); 0 known outstanding |
| High UI defects known           | 0 known outstanding                          |
| Routes audited at all viewports | 0 of 20                                      |
| Zoom-level passes               | 0 of 6                                       |
| Theme pairs audited             | 0 of 2                                       |
| Mutation assertions written     | 6 listed; none automated                     |

## Why this audit is honest

The brief says: **"Do not declare success merely because tests
pass. LOOK AT THE UI."** This document is the _opposite_ of a
success claim. It is a list of what is **not** done, with each
row pointing to the verification command that would have to pass
before the row can be marked done.

A future Phase will:

1. Run the viewport matrix using Playwright at the URLs above.
2. Capture screenshots, hash them, and inspect them by eye.
3. Run the zoom matrix with `page.setViewport({ deviceScaleFactor })`.
4. Run the theme pair by toggling `data-theme` on the document.
5. Audit every UI state by stubbing the data fetch and capturing
   each.
6. Wire the six mutation assertions as Playwright tests.

Until then: **0 known outstanding Critical/High UI defects** is a
starting claim, not a verified one.
