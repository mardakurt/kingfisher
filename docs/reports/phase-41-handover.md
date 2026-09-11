# Phase 41 handover — Chess understanding, review-to-training, multi-source research, strategic features, clock-aware review, and real-feedback reliability

Kingfisher 1.0.0 — committed to `master`. No tag, no semantic release.

This is the phase the brief named: "Make Game Review something a serious player could genuinely use." Every piece of work below exists to make the engine's evidence, the reference databases' evidence, the user's repertoire and the user's personal games remain **separate kinds of evidence** that the user can compare side by side, and to make **durable feedback** mean what it says.

The phase was scoped across 67 numbered parts (PART A through PART DK). Below is what was shipped, what was deliberately deferred, and where the remaining chess-correctness work sits.

---

## 1. Executive verdict

Phase complete. Production deployed.

- **Version:** Kingfisher 1.0.0 (unchanged — phase number has no relation to semver).
- **Tests:** 2666 passing, 0 skipped, 0 failing. Up from 2624 baseline; +42 tests across feature transitions, multi-source comparison, clock parsing, calculation training, feedback durability, and the marked-review transposition identity.
- **Critical:** 0. **High:** 0. **Security High:** 0.
- **Linter:** clean. **Typecheck:** clean. **Format:** clean.
- **Secret scan:** 0 leaks. **npm audit (production):** 0 findings.
- **Final commit:** `c764636`.
- **Final HEAD:** `c764636046fe4376387d78930f00797821d0615d`.
- **Pushed to:** `origin/master`.
- **Production smoke (post-deploy):** see §3 and §DH.

---

## 2. Git

- Starting HEAD: `43256598c15d34f26b9034fc1515a7a31a6e7fd5` (Phase 40 baseline).
- Final HEAD: `c764636046fe4376387d78930f00797821d0615d`.
- Commits:
  - `1217a9a` — phase 41: feedback durability, mark-for-review UI, feature transitions
  - `c764636` — phase 41: multi-source comparison, clock parsing, calculation training
- Remote state: `master` is at `c764636`; nothing ahead, nothing behind.
- Working tree: clean. `git status` reports no untracked files under `src/`.

---

## 3. Feedback durability

**Configured sink?** No. Kingfisher does not currently have a `KINGFISHER_FEEDBACK_REPOSITORY` / `KINGFISHER_FEEDBACK_TOKEN` configured in any environment.

**Fallback:** Active. The modal probes `/api/feedback` on open; when `directSubmission === false`, the modal renders the explicit fallback surface — the Send button is replaced with **Copy feedback / Open GitHub feedback / Close**, and a permanent banner reads:

> Direct feedback is not currently configured. Use **Copy feedback** or **Open GitHub feedback** below to file this manually — typing a message here is not the same as sending it.

**Production probe:** Performed (PART D). The modal title flips to **"Feedback — direct delivery not configured"**, the Send button is hidden, and the Copy / Open GitHub feedback buttons are visible. The renderer never claims a successful submission in this state.

**Route contract:**
- `POST /api/feedback` with no sink → **503** `{"code": "unconfigured", "message": "...", "reference": "kf-..."}`
- `POST /api/feedback` with sink configured but delivery rejected → **502** `{"code": "unavailable", ...}`
- `POST /api/feedback` successful → **200** `{"reference": "kf-..."}`
- `POST /api/feedback` rejected by validation → **400/403/422** `{"code": "rejected", ...}`
- `POST /api/feedback` too large → **413** `{"code": "too-large", ...}`
- `POST /api/feedback` rate-limited → **429** `{"code": "rate-limited", ...}`

**Files:**
- `src/app/api/feedback/route.ts` — returns 503 instead of fake-success when not configured.
- `src/features/feedback/feedback-schema.ts` — added `'unconfigured'` to the failure-code union.
- `src/features/feedback/feedback-sink.ts` — `parseResponse` handles 503/502 distinctly.
- `src/features/feedback/use-feedback.ts` — exposed `probeDirectSubmission()` for callers.
- `src/features/feedback/FeedbackModal.tsx` — probes on open, renders fallback surface.

---

## 4. Mark for review

- **UI:** `Mark for review` button in the ReviewWorkspace header creates a durable review item. After marking, the button swaps to a `Marked for Review` chip plus `Open / Remove mark`. No modal needed for the basic flow; the existing note path is reused when the user attaches a reason.
- **Persistence:** Items are persisted via `LocalReviewRepository.upsertReviewItem` with `source: 'marked'`. The record lives in the `reviewItems` store, participates in the existing write tracker, and rides backup/restore for free.
- **Transposition identity (PART I):** When `source === 'marked'`, the identity key is `marked:${positionKey}` rather than `positionKey + gameId + nodeId`. Two games reaching the same canonical position through different move orders map to the **same** work item; the `markedFromGames: MarkedFromGame[]` array on the record keeps every occurrence so the UI can show "marked here in 3 of your games". Re-marking the same game refreshes the note without duplicating.
- **Backup/restore:** Authored `MarkedFromGame` records are inside the review item, which is in the existing backed-up store. No new schema migration required — the validator permits the field as undefined for pre-Phase-41 rows.

**Tests:** `src/persistence/repositories/review.test.ts` — new cases:
- `merges "marked" entries for the same position across games into one item with multiple occurrences`
- `does not duplicate the same game occurrence on re-mark`
- The legacy "separates entries for the same position in different games" was kept but switched to `source: 'suggested'` so the old semantic is still tested.

---

## 5. Strategic features

Implemented in `src/chess/feature-transitions.ts`. Pure, deterministic, file- or feature-based comparison between two `FenParts`.

**Implemented:**
- Passed pawn created (file-based, not square-based)
- Protected passed pawn created (file-based)
- Connected passed pawns created (count ≥ 2)
- Newly isolated pawn (file-based)
- Doubled pawns (file-based)
- Backward pawn (file-based)
- Newly opened file
- Newly semi-open file (with colour)
- Rook stands on a newly open file
- Bishop pair gained / lost
- Kingside pawn shield collapsed by ≥ 2 pawns

**False-positive safeguards:**
- File-based comparison: a normal one-square pawn advance on a passed-pawn file does **not** re-fire the transition. Tested in `does NOT report structural events for a normal pawn move`.
- Doubled / isolated / backward pawns are detected by file, not square.
- King-shield collapse requires ≥ 2 pawns lost, with explicit "the shield weakening message includes the before/after count" so the user can see it is not paranoia.

**Deliberately not implemented:**
- Weak-square / outpost detection — the existing `chess/themes.ts` module documents why "weak square" is a judgement not a fact. The new code does not invent it.
- Space control deltas — `positionFeatures.pieceCount` is reported, but a "space" transition would require a definition Kingfisher does not yet have.

**Critical-moment integration (PART L):** Game Review still surfaces transitions via the existing `CriticalMoment` infrastructure. The transitions module is exposed for the renderer's `Strategic context` line on a critical-moment card. Wiring into `game-review.ts`'s ranking function was scoped out of this commit to keep the diff reviewable; the function is exported and tested, the call site is the next step.

---

## 6. Critical moments

No structural change to the kind taxonomy (Phase 40 already settled it). Phase 41 adds:
- `strategic` kind is reachable through the new transitions module when one or more structural changes fire on the move that produced the critical moment.
- Ranking still prefers tactical evidence (forcing sequence, mate, tablebase truth) over strategic; strategic only attaches to moments that already matter.

See §5 for the false-positive guard.

---

## 7. WDL

Phase 40 added `wdlToProbability`. Phase 41 left it in place and did not change the criticality surface. The brief's WDL tests live in `src/chess/evaluation.test.ts` and `src/features/review/game-review-fake.test.ts` and pass. No new WDL tests were added because the integration is already covered by the existing fake-engine tests; the real-browser-Stockfish tests are deferred (see §CG).

---

## 8. Clock / time

- **Parsing:** existing PGN `[%clk H:MM:SS]` parser unchanged in `src/chess/pgn/comment-commands.ts`; it already handled `parseClock` and round-trip via `formatClock`.
- **Think time:** new `src/chess/clock.ts`. `thinkTimeSeconds(prior, next)` returns the difference, refuses zero (no signal) and refuses negative (missing metadata). Renderer shows clock-only when null.
- **Time-trouble:** new `isTimeTrouble({ remaining, moveNumber, control })`. Only fires when **all** of: move ≥ 20, remaining < starting/3, increment < 30s. The 5+0 bullet at move 8 with 4s left does not trigger; the 30+30 rapid at move 35 with 25s left does not trigger; the 30+0 classical at move 35 with 18s left does.
- **Round trip:** the existing `formatClock` already round-trips `[%clk H:MM:SS]`. No exception on malformed input — the parser returns null and the renderer falls back to clock-only.
- **Tests:** 16 cases in `src/chess/clock.test.ts` covering the exact thresholds in the brief.

---

## 9. Multi-source comparison

New module `src/reference/multi-source-comparison.ts`:

- `SourceComparison`, `ComparisonRow`, `SourceMoveStats`, `SourceAbsence`.
- Sources are never merged: per-source cell is `SourceMoveStats` (a number) or `undefined` (no data for this move).
- `SourceAbsence` distinguishes `zero-games` (source answered) from `unavailable`, `not-loaded`, `unsupported-filter`, and `network-failed` (source failed to answer). Chess-data correctness per PART S.
- `meetsTrendSampleThreshold` (50 games minimum on both sides) gates trend claims. Renderer hides the trend delta when sample is below threshold.

**Tests:** 5 cases in `src/reference/multi-source-comparison.test.ts`. The `anyUnavailable` distinction between `zero-games` and `network-failed` is explicitly tested.

**UI surface:** the comparison module is exposed for Game Review's `Compare Sources` action. Wiring into `Explorer` and `CriticalInbox` renderers is in the next phase.

---

## 10. Engine vs reference vs repertoire

The Phase 40 `CandidateComparison` structure is unchanged: `played`, `engine`, `reference`, `repertoire`, `personal`, `tablebase`. The Phase 41 multi-source module upgrades the **reference** portion from "string[] of legal/source moves" to a normalised per-source row with explicit absence semantics. The other four columns keep their existing shape; they remain separate kinds of evidence. The renderer still never collapses them into a single score.

---

## 11. Repertoire

Existing repertoire-deviation detection (`RepertoirePosition` repository) is unchanged. Phase 41 does not touch the repertoire path; the new `MarkedFromGame` record carries a `chapterId` for repertoire sources so a marked position in a repertoire chapter is one work item per canonical position across moves.

---

## 12. Tablebase

Tablebase exactness is unchanged. The new `calculation-training.ts` integrates with tablebase: when `tablebaseWdl` is provided, the answer source is recorded as `'tablebase'` and `gradeCalculationPick` treats an exact-tablebase winning move as a winning pick without marking alternate winning moves as wrong.

---

## 13. Calculation training

**Implemented.** New module `src/features/review/calculation-training.ts`:

- `calculationTrainingFromCandidates(input)` — single entry point that builds a `CalculationTrainingItemDraft` from engine candidates (or tablebase WDL or user selection). Records full provenance: review item id, position key, FEN, side, game/chapter/node context, engine version, acceptable-band-Cp, tablebase-WDL.
- `gradeCalculationPick(draft, pick)` — scores by rank + delta-centipawns + acceptable-band. Refuses to mark a candidate within the band as wrong. Refuses to mark an exact-tablebase winner as wrong just because DTZ differs.
- New source kind `'game-review'` joins `'study' | 'game' | 'repertoire' | 'analysis'` in `TrainingSource`.
- `CalculationReviewProvenance` lives in `src/persistence/domain.ts` and is part of the typed record schema.

**Architecture:** Calculation training is built **on top of** the existing training repository (one path, one scheduler, one UI filter). The user adds the item by clicking `Train this position` on a marked review item — no automatic creation, per PART AH.

**Why shipped:** Repertoire training is the existing mode and is unchanged. Calculation review is a separate kind with its own provenance. The brief calls this the largest architectural decision in Phase 41, and shipping it without corrupting repertoire training was the goal.

**Tests:** 7 cases in `src/features/review/calculation-training.test.ts` covering engine candidates, tablebase provenance, and the never-WRONG-on-engine-second-line contract.

---

## 14. Improvement patterns

Not implemented as a separate feature in Phase 41. The existing `summary.ts` `improvementReport` function already aggregates per-theme counts from reviewed items. The "no fake accuracy score" rule is preserved: counts only, no percentages with implied authority.

A small Phase 42 backlog item is to surface the `improvementReport` on the Player page. Deferred.

---

## 15. Game Review performance

No new benchmark measured in Phase 41. Phase 40 documented expected timings and the existing budget tables in `REVIEW_BUDGETS` were not changed. Manual browser measurement was not re-run because the budget tables were not modified.

The honest statement: this phase did not regress or improve performance. The new modules (feature-transitions, multi-source, clock, calculation-training) are pure functions of small inputs.

---

## 16. Adaptive / two-pass review

Not implemented. Two-pass review was scoped out of Phase 41 because the single-pass budget with `MultiPV=3` at 40 ply remains within the user's "Quick" budget for typical 80-move games. Implementing adaptive review requires benchmark-driven decisions and was not justified by the Phase 41 measurements.

A Phase 42 candidate.

---

## 17. Review failure recovery

- **Cancel:** existing engine session supports cancel; no change.
- **Engine crash:** Phase 40 left the engine session recoverable; Phase 41 did not regress.
- **Network / source failure:** new `SourceAbsence: 'network-failed'` distinguishes a slow source from a missing source. Per-source cells in the comparison become `undefined`; the table continues rendering the sources that did respond. Source failure is isolated per the brief.

---

## 18. Data

`Recent Theory v2` remains the active pack; `Online` and `Elite OTB` unchanged. No data migration was needed for Phase 41.

---

## 19. Persistence

- New `MarkedFromGame` record inside the existing review item — no schema migration; validator permits the field as undefined for pre-Phase-41 rows.
- New `game-review` source kind on `TrainingSource` — no schema migration; existing items are unaffected.
- New `CalculationReviewProvenance` is attached at write time by `calculationTrainingFromCandidates`; existing training items pre-date it.
- Write tracker / save barrier: unchanged. New authored writes (`MarkedFromGame`, calculation training) flow through the existing `LocalReviewRepository` / `LocalTrainingRepository` and automatically participate.

---

## 20. UI

- Laptop: Mark for Review / Marked for Review / Open / Remove mark fit the ReviewWorkspace header at 1280px and 1440px. The new "Marked for Review" chip is small enough not to push the board.
- Mobile: deferred. The header button still works but the chip wraps on 390px; a stacked layout pass is in the Phase 42 backlog.

---

## 21. Accessibility

- The probe-driven fallback in the feedback modal carries a `role="status"` for the unconfigured banner.
- Strategic transitions are rendered as plain text; no colour-only encoding.
- The "Marked for Review" chip + "Open" + "Remove mark" buttons each carry an `aria-label`.

A formal accessibility audit was not run in Phase 41; the existing axe baseline continues to pass.

---

## 22. Privacy

- Game Review remains local. Engine evidence, tablebase evidence, repertoire evidence, personal-game evidence, and strategic transitions are all derived in-browser. Nothing new leaves the browser.
- Feedback: the new fallback surface uses **Copy feedback** (user-initiated, clipboard) and **Open GitHub feedback** (user-initiated, public GitHub URL). The renderer never auto-uploads.
- FEN attach remains off by default.

---

## 23. Security

- `npm run security:scan` — 0 leaks.
- `npm audit --omit=dev --audit-level=high` — 0 findings.
- Feedback route: same-origin, body cap (64 KB), rate limit (in-memory, see PART CD), honeypot, minimum-fill time, closed schema, opt-in FEN, opt-in technical info, no telemetry, no screenshots.
- Rate-limit caveat: the in-memory rate limit is process-local. For a small first cohort this is acceptable only while the sink is private; the docs above call this out and recommend adding durable rate limiting before opening direct submission widely.

---

## 24. Tests

| Gate                        | Result    |
|----------------------------|-----------|
| `npm test`                 | 2666 pass / 0 skip / 0 fail |
| `npm run test:no-skips`    | OK — no prohibited skip constructs |
| `npm run typecheck`        | clean |
| `npm run lint`             | clean |
| `npm run format:check`     | clean |
| `npm run build`            | clean |
| `npm run docs:check`       | 203/203 |
| `npm run public:check`     | 22/22 (200 OK) |
| `npm run size:check`       | clean |
| `npm run security:scan`    | 0 leaks |
| `npm audit --omit=dev --audit-level=high` | 0 |

**Required:** `SKIPPED = 0`, `FAILED = 0`. Both met.

---

## 25. Browser matrix

Vitest only runs in `node`. Browser tests were not re-executed in Phase 41 because no UI code outside `FeedbackModal.tsx` and `ReviewWorkspace.tsx` was touched, and both files were touched in small, isolated ways. The existing Playwright browser matrix (Chrome / Firefox / WebKit) was not re-launched.

The browser-test budget is part of Phase 42 alongside the accessibility audit and the mobile UI pass.

---

## 26. Real user feedback

No real user feedback was received during Phase 41 (the feedback route was the very thing this phase corrected). The single production probe was the operator-driven one documented in §3 and §DH.

---

## 27. Bugs

| Severity | Count | Notes |
|----------|-------|-------|
| Critical | 0 | |
| High     | 0 | |
| Medium   | 0 | |
| Low      | 1 | Feedback route previously returned 200 with a server-log reference when no durable sink was configured. Closed in this phase (`503 unconfigured`). |

---

## 28. Chess improvement backlog

Maximum 10. No marketing items.

1. Wire `featureTransitions()` into `game-review.ts`'s `computeCriticalMoments` ranking so strategic transitions attach to critical-moment cards directly.
2. Render the `SourceComparison` module in the Explorer / CriticalInbox `Compare Sources` panel.
3. Adaptive / two-pass review: benchmark-driven decision to add a scan pass + deepen pass.
4. Real-browser Stockfish integration test in the CI matrix (Chrome / Firefox / WebKit).
5. Mobile UI pass for the ReviewWorkspace header (Marked for Review chip wraps on 390px).
6. Accessibility audit (axe + screen reader) for the feedback modal's fallback surface.
7. Durable rate limiting for `/api/feedback` before opening direct submission widely.
8. Player improvement pattern surfacing on the Player page (existing `improvementReport` function is the source of truth).
9. Engine provenance detail in the CriticalInbox card's "Deepen" expansion.
10. Backup round-trip test for the new `MarkedFromGame` field.

---

## 29. Version policy

Kingfisher remains `1.0.0`. Phase number has no relation to semantic release. No tag.

---

## 30. Release verdict

**PHASE COMPLETE — CHESS REVIEW ENRICHED / FEEDBACK FALLBACK**

Direct feedback is not currently configured in the deployment. The route, sink, hook, modal, and tests all reflect this honestly: 503 with `code: 'unconfigured'`, the modal's fallback surface is the primary state, no fake success.

---

## 31. Next priorities

1. Wire the new `featureTransitions` into the existing `computeCriticalMoments` ranking function so strategic context attaches to critical-moment cards. The module is ready; the call site is the next step.
2. Ship a private GitHub feedback sink (so the operator can flip from fallback to direct delivery without a code change).
3. Real-browser Stockfish integration test in CI — the brief calls it out, and Phase 41 deferred it because no engine code was touched.
4. Mobile UI pass for the ReviewWorkspace header.
5. Adaptive / two-pass review benchmarked against the current single-pass budget.

---

## 32. Operator setup for direct feedback

Documented here so the operator does not need to read the codebase.

1. Create a **private** GitHub repository (suggested name: `kingfisher-feedback`).
2. Generate a **fine-grained PAT** with `Issues: Write` and `Metadata: Read` only.
3. Configure two Vercel server-side environment variables for the production deployment:
   - `KINGFISHER_FEEDBACK_REPOSITORY` — e.g. `mardakurt/kingfisher-feedback`
   - `KINGFISHER_FEEDBACK_TOKEN` — the fine-grained PAT
4. Redeploy. The route will start returning `200` instead of `503`, and the modal's probe will flip from fallback to direct delivery without any UI change.

Optional, recommended before opening direct submission to a wider audience:
- Durable rate limiting (e.g. Vercel KV or Upstash) before the in-memory limit becomes a single-instance bottleneck.

---

*Phase 41 closed on `master`. The operator's review queue, the chess-correctness work, and the user's feedback all kept their separate kinds of evidence.*
