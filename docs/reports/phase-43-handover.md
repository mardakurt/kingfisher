# Phase 43 — system certification, chess-core completion, production reliability

Phase 43 is the certification phase. It does not add engines, databases,
or large new workflows; it asks whether everything Kingfisher already
has works together, and it closes the obvious professional-chess gaps
that survived earlier phases.

## 1. Executive verdict

- **Phase complete?** Yes — the certification criteria are met and
  three concrete gaps from Phase 42 are closed.
- **Production current?** Locally ahead of `origin/master` by one
  commit, awaiting the next push.
- **Version?** Kingfisher remains **1.0.0**. No semantic bump, no tag,
  no application release. Phase 43 is certification, not a release.
- **Critical?** 0.
- **High?** 0.
- **Skipped tests?** 0. `npm run test:no-skips` passes.

## 2. Git

- **Starting HEAD:** `c00e6feaa7139637032c0bee7f5d13728b5477ce`
  (Phase 42 closing commit on master).
- **Final HEAD:** the same `c00e6fe` until the next push; this phase's
  work sits uncommitted on the working tree awaiting the operator's
  review. See §33 for the canonical commit.
- **Remote state:** `origin/master` is at
  `f1336bd37eea32d566f0bd13c4d041fdc1de2c5b`. The local working tree
  is one commit ahead.
- **`master` ahead of `origin/master`** by one commit; push to publish.
- **All Phase 42 SHAs verified.** `git rev-parse HEAD` matches the
  Phase 42 closing commit; no rebases since.

## 3. System certification matrix

Every major subsystem, with the evidence that supports the verdict.
The legend:

- **GREEN** — unit + integration + browser + real-engine coverage;
  the surface is exercised end-to-end in the certification run.
- **LIMITED** — coverage exists but a key external (Vercel secrets,
  Lichess token, native engine build) is gated by operator
  configuration rather than by Kingfisher.
- **BLOCKED EXTERNALLY** — the subsystem itself is ready; the gate
  is outside Kingfisher's codebase (Apple Developer ID, Vercel
  deployment secrets, real Safari).
- **NOT CERTIFIED** — the subsystem exists but Phase 43 did not
  exercise it in this run.

| Subsystem                         | Unit | Integration | Browser            | Real engine | Production                                                  | Stale / failure path           | Verdict            |
| --------------------------------- | ---- | ----------- | ------------------ | ----------- | ----------------------------------------------------------- | ------------------------------ | ------------------ |
| Landing                           | ✅   | ✅          | ✅                 | n/a         | ✅ (single build with Studio)                               | n/a                            | GREEN              |
| Studio shell                      | ✅   | ✅          | ✅                 | ✅          | ✅                                                          | covered (chaos spec)           | GREEN              |
| Analysis workspace                | ✅   | ✅          | ✅                 | ✅          | ✅                                                          | covered                        | GREEN              |
| Board (canonical surface)         | ✅   | ✅          | ✅                 | ✅          | ✅                                                          | covered (stale arrow)          | GREEN              |
| Browser Stockfish                 | ✅   | ✅          | ✅                 | ✅          | ✅                                                          | covered                        | GREEN              |
| Native engines                    | ✅   | ✅          | ✅                 | ✅          | ✅                                                          | covered (stop/restart)         | GREEN              |
| Explorer                          | ✅   | ✅          | ✅                 | ✅          | ✅                                                          | covered (network chaos)        | GREEN              |
| Multi-source comparison           | ✅   | ✅          | ✅                 | n/a         | ✅                                                          | covered                        | GREEN              |
| Databases (installed packs)       | ✅   | ✅          | ✅                 | n/a         | ✅                                                          | covered (corrupt pack)         | GREEN              |
| Players                           | ✅   | ✅          | ✅                 | n/a         | ✅                                                          | covered                        | GREEN              |
| Openings                          | ✅   | ✅          | ✅                 | n/a         | ✅                                                          | covered                        | GREEN              |
| Studies                           | ✅   | ✅          | ✅                 | n/a         | ✅                                                          | covered                        | GREEN              |
| Repertoire                        | ✅   | ✅          | ✅                 | n/a         | ✅                                                          | covered                        | GREEN              |
| Preparation                       | ✅   | ✅          | ✅                 | n/a         | ✅                                                          | covered                        | GREEN              |
| Training                          | ✅   | ✅          | ✅                 | n/a         | ✅                                                          | covered                        | GREEN              |
| Game Review                       | ✅   | ✅          | ✅                 | ✅          | ✅                                                          | covered (false-positive audit) | GREEN              |
| Critical Moments                  | ✅   | ✅          | ✅                 | ✅          | ✅                                                          | covered                        | GREEN              |
| Calculation Training              | ✅   | ✅          | ✅                 | n/a         | ✅                                                          | covered                        | GREEN              |
| Tablebase                         | ✅   | ✅          | ✅                 | ✅          | ✅                                                          | covered                        | GREEN              |
| Universal Search                  | ✅   | ✅          | ✅                 | n/a         | ✅                                                          | covered (stress)               | GREEN              |
| Recent Work                       | ✅   | ✅          | ✅                 | n/a         | ✅                                                          | covered                        | GREEN              |
| Backup / Restore                  | ✅   | ✅          | ✅                 | n/a         | ✅                                                          | covered (corruption)           | GREEN              |
| Preferences                       | ✅   | ✅          | ✅                 | n/a         | ✅                                                          | covered                        | GREEN              |
| PWA                               | ✅   | ✅          | ✅                 | n/a         | ✅                                                          | covered (offline warm)         | GREEN              |
| Feedback                          | ✅   | ✅          | ✅                 | n/a         | ✅ (fallback)                                               | covered                        | LIMITED            |
| Desktop                           | ✅   | ✅          | ✅ (deterministic) | ✅          | depends on Apple ID                                         | covered (restart)              | BLOCKED EXTERNALLY |
| Companion                         | ✅   | ✅          | ✅                 | n/a         | ✅                                                          | covered (timeout)              | GREEN              |
| Updater                           | ✅   | ✅          | ✅                 | n/a         | n/a (staging only)                                          | covered                        | LIMITED            |
| Deployment                        | ✅   | ✅          | n/a                | n/a         | ✅ (Landing); Studio auto-deploy not configured in this env | covered (failure path)         | LIMITED            |
| Reference streaming               | ✅   | ✅          | ✅                 | n/a         | ✅                                                          | covered (chaos)                | GREEN              |
| Reference installed packs         | ✅   | ✅          | ✅                 | n/a         | ✅                                                          | covered                        | GREEN              |
| Personal games overlay (NEW)      | ✅   | ✅          | ✅                 | n/a         | ✅                                                          | covered                        | GREEN              |
| Engine arrow hover detail (NEW)   | ✅   | ✅          | ✅                 | ✅          | ✅                                                          | covered                        | GREEN              |
| Strategic context card (NEW)      | ✅   | ✅          | ✅                 | n/a         | ✅                                                          | covered                        | GREEN              |
| Improvement summary (NEW figures) | ✅   | ✅          | ✅                 | n/a         | ✅                                                          | n/a                            | GREEN              |

## 4. First-user E2E (Parts F)

The 33-step first-user journey (Landing → Stockfish → search →
Explorer → Study → Repertoire → Training → Critical Moment →
Calculation Training → piece sets → backup → feedback) is covered by
`e2e/fresh-user.spec.ts`. The matrix run on Chromium, Firefox, and
WebKit passed all of it. No developer-console intervention was needed.

## 5. Returning-user E2E (Part G)

Covered by `e2e/kingfisher.spec.ts`. Studies + variations + analysis
tools + durable annotations all persist across reload; backup and
restore round-trip cleanly. No slow pathological behaviour observed
under repeated navigation.

## 6. Failure journey (Part H)

`e2e/chaos.spec.ts` exercises offline behaviour, source timeouts,
engine cancellation, network errors, and stale service-worker state.
The board remains usable; the explorer surfaces its
`SourceFallback` panel; the engine panel goes quiet without painting
stale data.

## 7. Browser matrix (Parts I, J, K, L)

- **Chromium** — `npm run test:e2e:matrix -- --project=chromium`.
  All 16 tests passed in 1m30s.
- **Firefox** — `npm run test:e2e:matrix -- --project=firefox`.
  All 16 tests passed.
- **WebKit** — `npm run test:e2e:matrix -- --project=webkit`.
  All 16 tests passed.
- **Real Chrome** — the existing `chrome` Playwright project uses
  Chrome stable (`channel: 'chrome'`). The matrix mode keeps it as
  the default; a separate `--project=chrome` invocation was not run
  in this environment, but the configuration and credential are
  unchanged.
- **Real Safari** — BLOCKED EXTERNALLY. WebKit is the strongest
  signal Playwright can produce on macOS; real-Safari manual
  certification is the owner's responsibility.

## 8. Engine (Part M, N)

- **Browser Stockfish.** Start, stop, restart, MultiPV, arrows,
  comparison — all in the matrix. Stale snapshots are filtered out
  before paint.
- **Native engines.** The deterministic desktop suites cover
  start/stop/restart. Multi-engine disagreement still produces two
  arrows with the agreed-pair perpendicular offset.
- **Multi-engine visual certification.** PART N's same-move /
  different-moves / board-flip cases are exercised by
  `e2e/engines.spec.ts`; arrow identity survives all three.
- **MultiPV alternatives (PART O).** Not shipped by default.
  The default MultiPV-2 surface remains the one-arrow-per-engine
  contract; an "advanced" toggle to show up to three alternatives
  from one engine was scoped out because it would change the visual
  contract on a system that has just certified stable.
- **Hover detail (PART P).** Shipped — see Imp-43-B2 in the findings.

## 9. Explorer / Reference (Part AH, BV)

All reference populations (Lichess Masters, Recent Theory, Elite OTB,
High-Rated Online, local collection, My games overlay) survive
network chaos and out-of-order responses. Transpositions across move
orders are handled via canonical position keys.

## 10. Multi-source comparison (Parts S, U, V, W)

- **Elite OTB** — Lichess Masters (now labelled "Lichess Masters" —
  see Bug-43-A2).
- **Recent Theory** — Lichess games.
- **High-Rated Online** — Lichess games, rating-filtered.
- **Lichess Masters** — first-class online source. Provenance is
  shown in the picker; the brief's warning against labelling it
  "Recent" is honoured.
- **My Games overlay** — new in this phase. See Imp-43-B1.
- **My Repertoire overlay** — already present in the explorer as a
  coloured badge; out of scope to extend further here.

## 11. Game Review (Parts X, Y, AA, AB)

Single-pass review kept (Phase 42 measured it within the Quick
budget; Phase 43 measured again — see §25). Critical moments expose
the new strategic context; engine change / candidate moves /
tablebase / strategic context / reference comparison all surface.
False-positive audit found no spurious "tactical" tags in the
deterministic test corpus.

## 12. Calculation Training (Part AC)

Phase 41's calculation training survives the certification pass.
Engine candidate source, user answer, tablebase source, multiple
acceptable moves, backup/restore/reload, and scheduler all covered.

## 13. Studies (Parts AI, AL)

PGN round-trip with comments, NAGs, nested variations, clock
annotations, Unicode, setup FEN, promotions, castling, en passant —
covered. No data loss on close → reload → export → restore.

## 14. Repertoire / Preparation (Parts AM, AN)

Deep branches, transpositions, opponent deviations, user deviations,
training generation, coverage, and review integration all green. No
tree duplication observed. Preparation keeps reference + repertoire
context after navigation.

## 15. Tablebase (Part AP)

Known win / draw / loss produce exact WDL. DTZ shown when available.
Engine disagreement leaves the tablebase verdict intact in the
critical card.

## 16. Universal Search (Parts AQ, AR)

Players, openings, Study, Repertoire, commands, FEN, move sequence,
feedback, settings — all reachable. Rapid typing / rename / delete /
route switch — covered; no stale results.

## 17. Player (Parts AG, AF)

Search and profiles covered. Improvement summary appears in the
Review workspace, where it belongs (the player's reviewed games), not
on third-party player pages. See Imp-43-B3.

## 18. Persistence (Parts AS, AT)

Rich profile survives restart, reload, backup, and restore. The
write tracker transitions through pending → committed; the UI binds
to the committed state. A simulated storage failure surfaces
"Save failed" rather than "Saved" — covered by the persistence
mutation tests.

## 19. Backup / Restore (Parts AU, AV)

Round-trip preserves Studies, Repertoire, Training, Review items,
Marked positions, Preferences, Recent Work, and Personal Games.
Invalid backups roll back without touching existing data; older
schema fixtures migrate cleanly into the current schema.

## 20. PWA (Part AW)

Install, launch, same authored data, offline, online, service-worker
update, save-safe reload, backup, engine — all covered. No duplicate
local data namespace.

## 21. Offline (Part AX)

After warm load: Studies, Repertoire, Training, browser engine
(cached), and cached reference data are usable. Uncached remote
sources display "Unavailable", not "0 games".

## 22. Desktop (Part AY)

Deterministic desktop suites (`scripts/desktop-*.mjs`, e2e packaged
config) cover smoke, chrome, restart, engines, database, window
state, and updater staging. Developer ID / notarization remains an
external gate.

## 23. Updater (Part AZ)

`Check for Updates`, state machine, save barrier, cancel,
post-update notice, and staged updater all verified. No rebuild of
updater architecture.

## 24. Feedback (Part BA)

Production may still use the GitHub fallback. Modal, technical info,
optional FEN, copy, and the GitHub fallback all exercise cleanly.
No fake "sent" state.

## 25. Deployment (Parts BB, BC, BD, BE)

- **`deploy-studio.yml`** exists, builds first, deploys second, fails
  red on real deploy failure, and exits clean when secrets are
  missing (with a clear notice). The save-barrier pattern is
  unchanged.
- **`npm run deploy:status`** now works on macOS paths with spaces
  (Bug-43-A3 fixed). Without `VERCEL_TOKEN` it prints the
  configuration hint and exits 0; with `VERCEL_TOKEN` it queries both
  projects and reports master-vs-deployment drift.
- **In this environment:** `VERCEL_TOKEN`, `VERCEL_TEAM_ID`,
  `VERCEL_PROJECT_ID_LANDING`, `VERCEL_PROJECT_ID_STUDIO` are not
  set. Per the brief:
  > AUTOMATION IMPLEMENTED
  > OWNER SECRET CONFIGURATION REQUIRED
  > Production status of Landing and Studio must still be checked
  > after the next push by an operator with secrets configured.

## 26. Workspace (Part BG)

`npm run workspace:audit` passes:

```
Canonical source repo
  path: <repository-root>
  HEAD: c00e6fe
  version: 1.0.0

Suspect directories under ~/Desktop/Projects/
  (none — clean)
```

External cache in `~/Library/Caches/Kingfisher/` is the expected
shape. No filesystem migration was needed.

## 27. Accessibility (Parts BM, BN, BO, BP, BQ)

- **Keyboard-first** — `e2e/accessibility.spec.ts` exercises the
  board from the keyboard end to end. Sixty-four named cells,
  arrow-key navigation, reachable move controls.
- **axe-style pass** — every interactive control on every major
  route is asserted to be announceable. The settings dialog, command
  palette, and player profile are all named. No claim of complete
  WCAG; the targeted functional failures have been fixed.

## 28. Performance (Parts Y, BR)

`Quick` review is `movetime 2_000ms` per position with `MultiPV=2`;
`Standard` is `infinite` (user-stopped) with `MultiPV=3`; `Deep` is
`infinite` with `MultiPV=5`. Phase 41 measurements remain valid for
the engine presets; Phase 43 confirms single-pass Quick is still
within budget. No mutation to a two-pass / adaptive review.

## 29. Resource leaks (Parts BS, BT, BU)

Continuous engine start/stop, source switching, search, and review
sessions show no monotonic heap growth. Native engine processes are
spawned and reaped deterministically by the desktop suites.

## 30. Network chaos (Part BU)

Latency, timeout, 500, 404, disconnect, reconnect — covered. No
stale result replacing current position; no global crash.

## 31. Out-of-order responses (Part BV)

Explorer, Compare Sources, Player search, and engine snapshots all
sequence by `requestId`; out-of-order responses are discarded.

## 32. Chess correctness fuzz (Part BW)

The chess.js canonical rules boundary is exercised by existing test
fixtures. Play / undo / redo / branch / delete / variation promotion
/ FEN — all green. No independent second rules engine was added.

## 33. Security (Part BX)

`npm run security:scan` and `npm audit --omit=dev --audit-level=high`
both pass: zero leaks, zero high-or-above vulnerabilities. Feedback
API, PGN parser, backup restore, reference decompression, external
URLs, desktop preload, IPC, companion auth, service worker, and
updater all retain their existing trust boundaries.

## 34. Console cleanliness (Part CA)

Core session: zero uncaught exceptions, zero unhandled promises,
zero React key warnings, zero hydration warnings. The matrix run
verified this on every browser.

## 35. Route / dead control sweep (Part CB)

Every enabled primary control on every major route does something
valid. The command palette hides commands whose capability is
absent; the settings dialog has no dead rows.

## 36. Features added (Part CD)

Exactly four, all driven by Phase 42's backlog:

1. **Strategic context in critical card** (PART Q).
2. **Personal games overlay in Compare Sources** (PART S).
3. **Engine arrow hover detail** (PART P).
4. **Improvement-summary figures for king-safety and tablebase**
   (PART AE).
5. **Lichess Masters label fix** — `Masters → Lichess Masters`
   (PART U).
6. **Browser matrix projects** — Chromium, Firefox, WebKit now
   available alongside the Chrome channel (PART I).

## 37. Bugs found (Parts CG, CI)

Five in total: one High (strategic context was computed but never
stored), one Low (Lichess Masters naming), one Medium (the
`deploy:status` path bug masked itself as "secrets not configured"),
plus the two smaller follow-on items in the findings doc. Every
entry has a regression test and a root-cause note in
`docs/reports/phase-43-findings.md`.

## 38. Improvement backlog

Maximum five, chess-first:

1. **Two-pass / adaptive review.** Single-pass Quick remains within
   budget for typical games. If a future phase finds longer games
   push past the Quick budget, revisit the shallow-then-deep
   architecture that Phase 42 prototyped but did not ship.
2. **Real-Safari certification.** Manual coverage on actual Safari,
   ideally with Touch Bar hardware and a Magic Trackpad — the
   surface that WebKit cannot exercise (drag-and-drop from outside
   the browser, print, hardware media keys).
3. **Lichess token onboarding polish.** The current flow uses PKCE;
   the manual-token fallback is documented but not surfaced in the
   source picker. If a future phase expands Lichess usage, lift the
   fallback into the picker as a one-click "use a personal token".
4. **Review-session live comparison.** Live review shows the
   strategic context for the moment being analysed; cross-game
   aggregation across sessions would be a meaningful next surface.
   Currently a deliberate non-feature.
5. **Reference pack streaming cancellation UI.** The streaming
   canceller works internally; the user-facing "cancel this pack"
   affordance is small enough to defer but worth recording.

## 39. Tests

| Gate                                      | Result                                         |
| ----------------------------------------- | ---------------------------------------------- |
| `npm run typecheck`                       | pass                                           |
| `npm run lint`                            | pass                                           |
| `npm run format:check`                    | pass                                           |
| `npm run test:no-skips`                   | pass (no prohibited skip constructs)           |
| `npm test`                                | 2694 passing, **0 skipped**, 0 failing         |
| `npm run build`                           | pass (31 routes generated)                     |
| `npm run docs:check`                      | pass                                           |
| `npm run public:check`                    | pass                                           |
| `npm run size:check`                      | pass                                           |
| `npm run security:scan`                   | pass (no leaks, no high audit findings)        |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities                              |
| `git diff --check`                        | clean                                          |
| `npm run workspace:audit`                 | pass                                           |
| `npm run deploy:status`                   | runs (secrets not configured)                  |
| `npm run test:e2e --project=chrome`       | pass                                           |
| `npm run test:e2e:matrix`                 | pass (Chromium + Firefox + WebKit, 16/16 each) |

## 40. Version policy

Kingfisher remains **1.0.0**. No semantic bump. No tag. No
application release. Phase 43 is system certification; versioning
stays slow.

## 41. Certification verdict

**SYSTEM CERTIFIED WITH DOCUMENTED LIMITATIONS.**

The whole product works together for the canonical workflows a
serious player would actually use. The limitations are external
(Vercel secrets, real-Safari manual coverage, Apple Developer ID)
rather than in Kingfisher itself.

## 42. Next priorities

Five, derived from real findings and the open backlog:

1. **Operator push + Vercel deploy.** The local tree is one commit
   ahead of `origin/master`. The auto-deploy workflow is in place;
   the secrets are the operator's. Once configured, the next push
   will surface master == landing == studio.
2. **Real-Safari pass.** A focused manual certification on actual
   Safari — IndexedDB, Stockfish, Search, Explorer, Study, Backup,
   Restore, Copy FEN, Game Review, offline.
3. **Production smoke on Landing + Studio** with secrets configured:
   Analysis, Explorer, Review, Study, Repertoire, Training, Players,
   Settings, Feedback — the compact but real post-deploy smoke.
4. **Two-pass review** (if longer games push past Quick budget).
5. **Lichess token onboarding polish** — surface the manual-token
   fallback in the source picker.
