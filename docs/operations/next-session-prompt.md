# Phase 85 — make the ChessBase verdict YES, on the Mac, with evidence

_Written 2026-09-24 at the end of Phase 84 for the next agent, who works on
the maintainer's Mac. Paste the "Brief" section as the session's first
message, or tell the agent: "Read `docs/operations/next-session-prompt.md` and
do all of it."_

---

## Brief

You are continuing **Kingfisher** on the maintainer's own Mac. Phase 84
ended with an explicit verdict — **"Is Kingfisher at the functional level of
ChessBase for serious research and preparation? NO"** — and four named
blockers. Your job is to turn that verdict into **YES**, and the only way you
are allowed to do that is by closing every blocker in code, data and running
evidence. A YES you cannot prove is a NO, and writing it would be the worst
outcome of this phase: `CLAUDE.md` says "Never write that something is
verified unless you ran it", and every previous handover that claimed more
than it ran has been caught.

This is a long phase. Do not reduce its scope because one context window was
not enough; leave a precise handover instead (`CLAUDE.md` → "If you run out of
room").

### Read first, in this order

1. `CLAUDE.md` and `AGENTS.md` — the non-negotiable rules (chess.js boundary,
   position identity, one board, populations never merged, every setting has
   a consumer, provenance, the move invariant, engines, persistence, the
   desktop's five rules, release commands, honesty).
2. `docs/reports/phase-84-handover.md` — especially §0 (two sessions on one
   phase and how they were reconciled), §3 (the gap matrix), §4 (evidence and
   what was **not** run), §5 (the verdict and the four blockers), §6 (what
   remains).
3. `docs/product/chessbase-parity-audit.md` and
   `docs/design/chessbase-parity-features.md` — the workflow comparison and
   the rules and non-goals of every Phase 84 feature.
4. `docs/product/market-research.md` §3 (complaints, with sources, including
   §3.8 on how serious players prepare), §4, §5.
5. `docs/data/historical-games-audit.md` — which game sources Kingfisher may
   redistribute, and why several were rejected. **Read it before touching any
   corpus.**
6. `docs/release/macos-trusted-release.md`, `docs/deployment.md`,
   `docs/operations/after-a-fix.md`, `docs/release/1.3.0.md`.

### The state you inherit (verify every line of it — do not trust it)

- `origin/master` is at `e0ea197` ("release: prepare Kingfisher 1.3.0"): the
  other session's Phase 84 — merge into one tree, the repertoire scan, the
  Lichess cloud evaluation, position history, the Library over any database,
  chapter questions and worksheets, the One Kingfisher design, 1.3.0 release
  preparation.
- `origin/claude/wizardly-franklin-qre1bd` is at `85c1e89` (or later): master
  merged in (`780f513`), plus where-the-game-leaves-the-source, deep analysis,
  move search over companion databases (and its speed-up), results in their
  own tab, the preparation count fix, the explorer layout fix, a navigation
  regression spec, and the docs (handover, audit, features, CHANGELOG,
  research). **It has not been merged into master.**
- **1.3.0 is prepared but not published.** `src/release/macos-download.json`
  still names `Kingfisher-1.2.6-arm64.dmg`, build 714; `docs/release/1.3.0.md`
  says "Released 2026-09-24". One of those is wrong until a release happens.
- **Master's CI has been red for at least five pushes** (runs 209–213 of
  `.github/workflows/ci.yml`), before Phase 84's branch existed:
  - `desktop/src/sparkle-updater.test.mjs` — two tests assert a message that
    is only reachable on macOS; on Linux the module answers "Sparkle, which
    is macOS only" first (`desktop/src/sparkle-updater.mjs` ~line 179 vs
    ~191).
  - `src/performance/move-search.test.ts` ("theme", 5 s per 10,000 games) and
    `src/features/search/openings.test.ts:129` (< 60 ms) — wall-clock budgets
    that shared runners miss. Measured in Phase 84: theme 0.41–0.52 ms/game
    on the branch, 0.66 on master's scanner, on a 4-core container.
- **Linux visual baselines** (`e2e/visual.spec.ts-snapshots/*-linux.png`) were
  last committed in Phase 74 (`6281e03`), before the Phase 82 redesign; all 20
  fail. The Darwin ones were last regenerated in `bc11cb0` (Phase 83) and
  predate master's One Kingfisher redesign and the branch's engine-panel rows.
- **Never run against this code:** any packaged Mac gate
  (`desktop:certify` and everything under it), the Firefox/WebKit e2e matrix,
  `desktop:update:real`, and a 1.3.0 DMG through `desktop:public:verify`.

---

## Part A — Put the Mac and GitHub in the same state (do this first)

The owner's canonical checkout is `~/Desktop/Projects/chess&poker/chess/studying hub`
(`docs/operations/local-workspace-layout.md`). Confirm it; if it is somewhere
else, use that and say so.

1. **Look before you touch.**
   ```bash
   cd "<checkout>"
   git status
   git stash list
   git log --oneline -15
   git branch -vv
   git remote -v
   git rev-parse HEAD origin/master
   ```
   Uncommitted work in the tree is normal (`CLAUDE.md`) — it may be a previous
   agent's unfinished work or the owner's own. **Do not discard, reset or
   `checkout --` anything you have not read.** For each modified or untracked
   file: read the diff, decide whether it is (a) already on GitHub in an
   equivalent form, (b) real unfinished work, or (c) a generated artefact that
   `.gitignore` should cover. Commit (b) on a branch named
   `local/<date>-<what>` and push it; delete (c) only if it is reproducible and
   listed in `docs/operations/local-workspace-layout.md`; report (a). Write
   down what you found — it goes in the handover.
2. **Fetch and fast-forward master.**
   ```bash
   git fetch --all --prune
   git switch master
   git pull --ff-only          # must be a fast-forward; if not, stop and report why
   ```
   Local commits on master that are not on `origin/master` are someone's
   work: push them to a branch, never discard them, and report them.
3. **Merge the Phase 84 branch into master.** The owner has asked for local
   and GitHub to be equal and for the remaining work to be finished; that is
   the authority to merge `claude/wizardly-franklin-qre1bd`. Do it through a
   pull request if the owner prefers review (ask once), otherwise locally:
   ```bash
   git switch master
   git merge --no-ff origin/claude/wizardly-franklin-qre1bd
   ```
   It should merge without conflicts (the branch already contains master).
   Before pushing master, run the gates in Part B on the merged tree. **No
   force push, ever** (`CLAUDE.md`).
4. **Install everything the Mac needs** and record versions:
   ```bash
   node -v && npm -v
   npm ci
   npm run desktop:install
   npm run engine:install
   npm run desktop:sparkle:fetch && npm run desktop:sparkle:bridge
   ```
5. **Prove the two are equal** at the end of Part A and again at the end of
   the phase:
   ```bash
   git fetch --all --prune
   git status                      # clean
   git rev-parse HEAD origin/master   # identical
   git log --oneline origin/master..HEAD   # empty
   git log --oneline HEAD..origin/master   # empty
   ```
   Put that output in the handover. Delete merged remote branches only if the
   owner agrees.

---

## Part B — Make master green, then keep it green

Run on the merged tree, on the Mac, and record every number:

```bash
npm test
npm run test:no-skips
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run benchmark
npm run docs:check
git diff --check
npm run test:e2e
```

Then fix what is red — properly:

1. **The two Sparkle tests.** They must pass on Linux CI and on the Mac
   without being skipped (`npm run test:no-skips` forbids it, and AGENTS.md:
   "a capability the environment lacks is asserted as a deterministic
   fallback, never skipped"). Make the platform an injected input of
   `desktop/src/sparkle-updater.mjs` (as `packaged` already is), have the two
   tests pass `platform: 'darwin'`, and add a test that on `linux`/`win32` the
   answer is the macOS-only reason. Revert once to see each test fail.
2. **The two wall-clock budgets.** Do not raise a number until it passes.
   Measure what the budget protects (the design target: 10,000 games in 10 s
   for a move search), then make the test measure it robustly — warm-up, the
   median of several runs, a budget stated per game with a documented margin
   — and prove on CI (not only locally) that it passes and that a genuine 3×
   regression still fails it (introduce one, see it fail, remove it).
3. **Visual baselines.** Regenerate the Darwin chrome baselines on the Mac
   with `npm run visual:baselines`, **inspect every changed image by eye**
   (the engine panel now has a Lichess cloud row and a Deep analysis row), and
   commit them. Produce the Linux baselines from `.github/workflows/visual-review.yml`'s
   artefact (the Phase 82/83 handovers describe this), inspect, commit. The
   visual spec must pass on CI.
4. **Firefox and WebKit.** Run `KF_E2E_MATRIX=1 npm run test:e2e` (or
   `test:e2e:matrix`) once and fix or file every failure.
5. **The live-site specs.** `e2e/prod-phase60.spec.ts` loads
   kingfisherchess.app; in the Phase 84 container it failed only because a
   TLS proxy stood between Chromium and the site. On the Mac it must pass;
   if it does not, it is a real finding about the deployed site.
6. **The Vercel deployment.** `npm run deploy:status` (or the Vercel
   dashboard) — the merged master must build and deploy on Vercel from a
   clean checkout (Phase 80 found a source file only one machine had).
7. **Push master and watch CI to green.** Do not write that CI is green while
   it is still running (`CLAUDE.md`). Link the run.

---

## Part C — The Mac jobs nobody could run in Phase 84

All of these against **one** `Kingfisher.app` built from the merged master,
from a clean checkout (`desktop:dist` refuses a dirty tree for publishable
channels):

```bash
npm run desktop:dist                          # dev channel first
npm run desktop:certify                       # every packaged gate
npm run desktop:smoke -- --packaged
npm run desktop:chrome -- --packaged
npm run desktop:restart -- --packaged
npm run desktop:suspend -- --packaged
npm run desktop:engines -- --packaged
npm run desktop:walk -- --packaged --seed=46 --actions=1000
npm run desktop:walk -- --packaged --seed=7 --actions=300 --faults
npm run desktop:menus
npm run desktop:engine-chaos
KINGFISHER_ACCEPTANCE_BINARY=".../Kingfisher.app/Contents/MacOS/Kingfisher" npm run desktop:soak:leaks
npm run desktop:soak                          # 30 minutes
KINGFISHER_DESKTOP_PREV=<1.2.6 out> npm run desktop:upgrade
node desktop/scripts/verify-dmg.mjs <dmg>
```

In the packaged app, by hand as a player, and with screenshots:

- the Deep analysis row (start, stop mid-run, add to the analysis, undo);
- Explorer → "This game against …" with the built-in pack and with a
  companion collection;
- the Library's move search over a companion database;
- merge into one tree from the Library and from the Explorer (new tab);
- the Lichess cloud evaluation (it needs the network — say so if offline);
- chapter questions, solving them, sending misses to Training, the worksheet.

If a harness reports a timeout, read `<profile>/logs/kingfisher.log` before
writing "harness limitation" (`CLAUDE.md`).

**Releasing 1.3.0** is an outward, public act: ask the owner before you
publish anything. When they say yes, follow
`docs/release/macos-trusted-release.md` exactly (credentials from
`~/.kingfisher-release/env.sh`; `release:mac:notarize`, `release:mac:appcast`,
`release:mac:publish`), update `src/release/macos-download.json` (the only
file that names the public DMG), then run
`npm run desktop:public:verify -- --landing --full` and
`npm run desktop:update:real` (Sparkle and the 1.1.7 `electron-updater`
path), and update every place that states the current version and DMG:
`AGENTS.md` ("The current marketing version is ...", "macOS stable DMG"),
`README.md`, `docs/release/install-macos.md`, `public-claims.md`, so
`docs:check` passes against the new descriptor. Until that has happened,
correct `docs/release/1.3.0.md`'s "Released"
line so it is not false. If the release includes this phase's work, it is a
new version with its own notes — never replace the bytes of a published asset.

---

## Part D — Close the four blockers

The verdict can only become YES when each of these is closed and **measured**.
Design each in `docs/design/` before building it (the project's habit, and
the reason its features hold). Keep every AGENTS.md rule; in particular:
provenance is never lost, populations are never merged, the chess.js
boundary, one board, the move invariant, and "do not fake data".

### D1 — A reference corpus a professional can prepare from

ChessBase's strength is Mega Database: 11.7 million games, an annotated
subset, weekly updates. Kingfisher has about a million games aggregated in
packs, no annotations, and no per-game dates or ratings in the packs.
Close it on three fronts:

1. **Bring your own licensed database, at ChessBase scale.** Kingfisher
   already reads CBH/CBV read-only (`src/database/chessbase/`,
   `docs/data/chessbase-archive-format.md`) and can import into a companion
   SQLite collection. A ChessBase user who owns Mega Database must be able to
   point Kingfisher at it and prepare from it. Make that work at scale:
   stream the import in the companion (not the browser) so ten million games
   import without holding them in memory; keep the source's annotations
   (comments, variations, NAGs) — the annotated subset is the point; record
   provenance (file, version, licence named by the user). **Acceptance:** a
   real CBH of at least one million games (ask the owner for one they own;
   if none is available, say so — do not fabricate one) imports on the Mac
   with time and peak memory recorded, and the explorer, Library, position
   page, preparation and the opening report answer from it. Never write to
   the source file (AGENTS.md "Interoperability").
2. **Dated, rated packs.** The pack format keeps one aggregate per position
   and no per-game years or ratings, which is why the Opening Report's
   "pioneers", "popularity by year" and "results by Elo class" cannot be
   answered from a population. Design pack format v2: per-position counts by
   year and by rating band (as the recent split already is), first/last game
   references; migrate the build (`scripts/build-reference-pack.mjs`,
   `scripts/reference/packs.mjs`) and the reader; rebuild the packs from
   their verified upstreams (seekable zstd — use `zstdFrameStream()`; reject
   games on their headers — `readGames(file, { accept })`). **Acceptance:**
   the Opening Report shows popularity by year, first game and results by Elo
   class from the Starter pack and from Elite OTB, each labelled with its
   population; a test fails if a figure mixes populations.
3. **A bigger freely licensed population.** The Lichess standard database is
   CC0 (online play); the broadcast archive is CC BY-SA 4.0 and begins in 2020. Build a large high-rated pack (e.g. 2200+ classical/rapid, several
   years) and extend the broadcast packs as far as they go, with licences in
   `THIRD_PARTY_DATA.md`. **An annotated master corpus is a licensing
   decision**, not a coding one: list the candidates with their exact terms
   in `docs/data/historical-games-audit.md` and ask the owner; never ship a
   source that audit rejects.

4. **Kept current.** Mega Database is updated weekly. Make the pack build a
   scheduled, reproducible pipeline (a GitHub Actions workflow or a
   documented local command) that rebuilds the broadcast-based packs from
   each new upstream month, verifies the upstream digests, publishes to the
   data mirror with a new manifest version, and lets an installed
   Kingfisher see and install the update (the pack manager already verifies
   chunks). **Acceptance:** one real update cycle run end to end, and the
   installed app picking up the new version.

The corpus blocker is closed when a serious player can answer every ChessBase
reference-database question — top games, novelties, popularity, pioneers, Elo
classes, annotated model games — from either a population Kingfisher ships or
the database they already own, with speed measured at ≥ 1 million games.

### D2 — Search speed at millions of games

Phase 84 made the Library's move search (material, theme, route, comment)
work over a companion database by reading each game's indexed main line:
~340 games/s on 30,000 real Lichess games (dev server, 4-core container). That
is a night for ten million games; ChessBase answers in seconds with an index.

- Index what can be indexed in the companion's SQLite: a material signature
  per position (the "R v B held two positions" rule must stay exact), the
  theme claims (a claim index already exists: `structure_claims`), and a
  per-game piece-trajectory table for routes. Answer header + index queries
  in SQL; fall back to the linear read only for comment text (or use FTS on
  comments). Keep `exportPage`'s modes and the equivalence test
  (`src/features/games/library-source.test.ts`) — an indexed answer must equal
  the replayed answer.
- Move the linear fallback into companion worker threads so the browser is
  not the bottleneck.
- **The rest of the database at the same scale.** Header search (player,
  event, dates, Elo band), the explorer over a companion collection, the
  position page, the preparation report and duplicate finding were measured
  to 500,000 games in earlier phases. Measure each at 10,000,000 (or the
  largest real database available) and fix what does not answer in seconds.
- **Acceptance, on real data on the Mac:** a material, a theme and a route
  query each answer in **≤ 10 s over 1,000,000 games** and **≤ 60 s over
  10,000,000** (or state the measured numbers and keep D2 open), with the same
  hits as the linear read on a 30,000-game sample. Use the Lichess archive
  (CC0; verify its SHA-256 against `database.lichess.org/standard/sha256sums.txt`)
  or the owner's own database.

### D3 — Engine tooling that runs unattended

- **Deep analysis that survives the night.** Today it lives in the page
  (`src/features/engine/deepen-store.ts`). Persist the job (tree so far,
  frontier, options) so a reload, a sleep (`desktop:suspend`) or a quit
  resumes it; on the Mac run it on a native engine through the companion so
  it continues while the window is closed; a morning report on next launch.
  **Acceptance:** an 8-hour run on the packaged app with a suspend in the
  middle, a quit/relaunch, and a report at the end; `desktop:suspend` and
  `desktop:restart` extended to cover it.
- **Remote engines on the player's own machines.** A companion on another
  Mac or PC on the LAN (token-paired, TLS or an explicit trust step, the
  engine's identity and host shown on every line). This was already on the
  research's "Later" list. **Acceptance:** two real machines, one analysing
  for the other, a disconnect mid-search handled as a failed session
  (AGENTS.md: a process that fails to acknowledge a stop is not reused).
- **Monte Carlo (practical W/D/L).** Engine-vs-engine playouts from a
  position with fixed short limits, reported as "N playouts at X ms: W/D/L"
  with the engine named — never as an evaluation. **Acceptance:** unit tests
  with a scripted engine; an e2e with the browser Stockfish.
- **Cloud engine.** ChessBase rents engine time on its servers. Kingfisher's
  answer is the remote engine above (the player's own hardware, including a
  rented cloud machine the player runs a companion on) plus the labelled
  Lichess cloud evaluation. Prove that path with a real cloud VM running the
  companion and a native engine, analysing for the Mac over the internet
  with the pairing token and TLS. A hosted Kingfisher engine service would
  need a server, accounts and billing — ask the owner; it is a product
  decision, not a gap to close silently.
- **Shared analysis (ChessBase's Let's Check).** ChessBase pools engine
  evaluations from all its users on a server. Kingfisher has none and sends
  nothing without being asked. Offer the owner two honest options and build
  the one they choose: (a) import and export of stored engine evidence
  between Kingfisher users as a file (the Team packet already travels this
  way), or (b) a server-side pool, with the privacy policy, opt-in and
  provenance per evaluation.

### D4 — Windows

`docs/design/windows.md` records the audit: the shell's shutdown was fixed
for Windows, but no Windows build has been produced or run. **This needs a
Windows machine and a code-signing certificate, which only the owner can
provide. Ask at the start of the phase.** With them: produce the build, run
the smoke, restart, suspend, engines and walk harnesses on Windows, sign it,
and publish nothing without the owner. Without them, D4 stays open and the
verdict cannot honestly be an unqualified YES — say that, do not hide it.

### Smaller gaps from the Phase 84 matrix — close them too

- **Batch departure (Novelty Annotation over a collection)**: run
  `src/theory/departure.ts` over every game of a selection, write the facts in
  one job with progress and stop, with a report.
- **Opening Report parity**: once D1.2 lands, the report's pioneers,
  popularity chart, Elo-class results and instructive games from each
  population, each labelled; strategic traits only as the counted themes
  already defined (no generated prose).
- **Training questions**: optional points and a timer per question
  (ChessBase's training annotation), recorded per attempt.
- **Explorer first moment**: for a moment after load the explorer resolves to
  Lichess Masters before the built-in pack registers
  (`src/features/explorer/ExplorerPanel.tsx`, `providers[0]`). Resolve to the
  preferred installed source or show "loading sources", never a different
  source.
- **Cloud databases / sharing**: decide with the owner whether a hosted share
  (a study or a file by link) is in scope; Kingfisher has no server today and
  that is a product decision, not an oversight. If yes, build it with the
  privacy policy, `/privacy`, `public-claims.md` and `docs:check` updated.
- **Handing work to ChessBase users.** Kingfisher reads CBH/CBV and never
  writes to an existing file (AGENTS.md). Writing a **new** CBH file from a
  study or a collection is allowed by that rule: the encoder that reproduces
  ChessBase's bytes for 421 games already exists for the reader's tests. Ship
  it as an export, verified by reading the result back with Kingfisher's
  reader and, if the owner has ChessBase, by opening it there.
- **Everything else Phase 84 left** (`docs/reports/phase-84-handover.md` §6),
  and the open items of the Phase 82 and 83 handovers that still hold on the
  merged master (check each: the landing product image, a page's
  unsubmitted form state across a tab switch).

### What ChessBase does that Kingfisher refuses by design

Some ChessBase features break rules in `AGENTS.md`, not for lack of code: the
Style Report's adjectives and the Error Report's "Blunder Elo" (a grade with
no population behind it — `src/preparation/style.ts`), Identify Player
(de-anonymising online accounts — `market-research.md` §3.5), AI commentary
presented as analysis (its own reviewer found it contradicting the engine),
"main line" and "best" labels from one database, and a combined figure across
populations. **Do not build these to reach YES**, and do not count their
absence against the verdict: the verdict asks whether a serious player can do
the work, and Kingfisher answers each of those questions with facts (the
dossier, the style measurements, the deviation and departure reports, the
engine). If the owner wants any of them, they must change `AGENTS.md` first,
in writing; then build it honestly labelled. The ChessBase shop, Magazine and
twenty years of courses are an ecosystem, not a feature, and are out of scope.

---

## Part E — Test like a serious user, recorded

Run each workflow end to end in the **packaged** app and in the browser, with
the dataset named, the times measured and screenshots kept
(`docs/release-evidence/phase-85/`):

1. **Opening preparation**: search an opening → statistics from two
   populations → variations → model games → merge them into a file → deep
   analysis of the critical position → add lines to the repertoire → notes.
2. **Opponent preparation**: a real player with games in a large database
   (D1) → preparation report → opening tendencies → recurring positions
   (position page) → candidate lines → game-day sheet.
3. **Game analysis**: import a game → engine and deep analysis → where it
   leaves the reference → annotate variations → whole-game check → save.
4. **Professional research**: a deep opening tree with many variations on a
   ≥ 1M-game database → compare populations → engines → historical games →
   organised in a study without losing context (tabs).
5. **Coaching**: build a chapter with questions → publish the worksheet →
   solve it as a student → misses to Training → review.
6. **Edge cases**: 20,000-node trees, 10M-game searches (or the largest
   available), offline, companion killed mid-query, engine killed mid-deep
   analysis, a reload inside every autosave window you can find.

---

## Part F — The verdict, defined before you start

Write this table into the handover **before** building anything, then fill
it in at the end. YES requires every row to be met with evidence a person can
re-run. "Partially" is NO.

| #   | Criterion                                                                                                            | Evidence required                                    |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | A ≥ 1M-game database the player owns or Kingfisher ships answers explorer, novelty, preparation and report questions | import log, times, screenshots, e2e/harness          |
| 2   | Opening Report: popularity by year, pioneers, Elo classes from a population                                          | unit + e2e, population labels asserted               |
| 3   | Material/theme/route search: ≤ 10 s at 1M, ≤ 60 s at 10M (or the owner accepts the measured numbers in writing)      | benchmark script, real data, equivalence test        |
| 4   | Deep analysis survives reload, suspend and quit; runs overnight                                                      | 8-hour run log, `desktop:suspend`/`restart` extended |
| 5   | Remote engine on a second machine, with failure handling                                                             | two-machine run log                                  |
| 6   | Monte Carlo playouts, labelled                                                                                       | tests + e2e                                          |
| 7   | Windows build runs the desktop harnesses                                                                             | harness output from a Windows machine                |
| 8   | Master green on CI (unit, e2e, visual) and every packaged Mac gate green on one build                                | CI run links, `desktop:certify` output               |
| 9   | The six Part E workflows done end to end without a blocker                                                           | evidence folder                                      |
| 10  | Header search, explorer, position page, preparation and duplicates answer in seconds at 10M games                    | benchmark output on real data                        |
| 11  | Reference packs update on a schedule and an installed app picks the update up                                        | one real update cycle, logs                          |
| 12  | A remote engine on a cloud VM analyses for the Mac over the internet                                                 | run log with host and engine identity                |
| 13  | Batch departure, Opening Report parity, question points/timers, explorer first moment, CBH export all shipped        | tests + e2e per item                                 |

If a row is blocked by something only the owner can supply (a licence, a
Windows machine, a certificate, a second machine, a database they own), **ask
for it early**, record the answer, and if it does not come the verdict is NO
with that row named. Shared analysis (Let's Check) and hosted sharing are
owner decisions: record the decision, and if the owner puts them in scope,
add a row for each. Do not redefine a row to make it pass. Do not count a
feature as present because a button exists.

Then answer, separately: **in which specific areas does Kingfisher
meaningfully surpass ChessBase?** — only with evidence.

---

## Working rules for this phase

- `git status`, `git log --oneline -25`, `git rev-parse HEAD origin/master`
  before editing anything; again before every push.
- Coherent commits with the _why_ in the body (the defect and what it cost);
  no commits for features that were not implemented; **no force push**; end
  every commit message with the attribution lines the session asks for.
- For every regression test that matters, revert the implementation once and
  see it fail (AGENTS.md "A test that cannot fail proves nothing").
- Stub the boundary, never the thing under test.
- Keep `README.md`, `ARCHITECTURE.md`, `THIRD_PARTY_DATA.md`,
  `THIRD_PARTY_ASSETS.md`, `docs/product/features.md`, the parity audit, the
  design record, `CHANGELOG.md` (Unreleased) and `docs/README.md`'s index true.
  `npm run docs:check` must pass (on the Mac `.vercel/project.json` exists, so
  345/345 is expected).
- Anything public — a release, the landing, the descriptor, deleting a
  branch, a hosted service — asks the owner first.
- If you run out of room: commit, push, and write
  `docs/reports/phase-85-handover.md` with the commit, what was audited, found,
  fixed and run, the verdict table as it stands, and precisely what remains.

## Deliverables

1. Local checkout and GitHub equal (Part A, step 5 output in the handover).
2. Master merged, pushed and green on CI (links).
3. Every packaged Mac gate run on one build (outputs), and 1.3.0 published or
   its notes corrected, per the owner.
4. D1–D4 and the smaller gaps closed, or each named as open with the reason.
5. `docs/reports/phase-85-handover.md` with the Part F table filled in, the
   final report (market, ChessBase strengths, gaps, what was built, beyond
   ChessBase, remaining weaknesses), and the verdict **YES** or **NO** —
   YES only if every row is met.
