# Kingfisher changelog

The user-facing changelog. Internal phase history is in
`docs/reports/` and `docs/product/phase-*.md`; the list below is what
real users notice.

## Unreleased

This is development work. Kingfisher 1.0.0 remains the public stable
release; nothing here has shipped yet. The notes below describe what
the next release will contain if it is cut from the current
development branch.

### Direct in-app feedback (Phase 40)

- A visible **Feedback** button now sits at the bottom of the
  sidebar (mobile: in the drawer; collapsed: as a tooltip).
  Cmd+K commands _Report a problem_, _Report a data issue_,
  and _Send feedback_ open the same dialog. _Settings → Help
  and feedback_ does too. One form, one architecture, no
  GitHub tab-switching for the default path.
- The submission carries a category (one of five), the typed
  message, optionally the current FEN (off by default), and
  optionally a short technical-information block (off by
  default and previewable before send). Nothing else —
  studies, PGNs, notes, repertoire, training answers, and
  database paths never leave the browser.
- `POST /api/feedback` is the new server sink. It enforces
  same-origin, content-type, a 64 KB body ceiling, a
  per-IP rate limit, a minimum form-fill time, and a honeypot.
  When the operator has configured the secure feedback
  repository and a fine-grained token, submissions land
  there server-side; the renderer never sees the token. When
  the secure sink is not configured, the submission is
  validated and acknowledged, and the dialog offers an
  "Open GitHub feedback" button as a user-initiated fallback.

### Honest feedback (Phase 41)

- The feedback route no longer claims success when no durable
  sink is configured. `POST /api/feedback` returns `503` with
  `code: "unconfigured"` so the modal renders the explicit
  fallback surface ("Direct feedback is not currently
  configured — Copy feedback or Open GitHub feedback"). The
  "Your feedback was sent" message now only appears when the
  route actually delivered. The same code is also reachable via
  `useFeedback().probeDirectSubmission()`, so any surface that
  embeds the modal can branch on it without a separate fetch.
- `POST /api/feedback` distinguishes 503 (unconfigured) from
  502 (delivery rejected by an *available* sink) from
  429/400/403/422 (rejected by validation). The sink tests
  pin the contract.

### Mark for review — durable, transposition-aware (Phase 41)

- The **Mark for review** button at the top of a reviewed
  position writes a durable review item that survives reload,
  backup, and restore. Re-marking the same position from the
  same game refreshes the note; re-marking the same canonical
  position from a *different* game (or a different move order
  that reaches the same position) appends a `MarkedFromGame`
  occurrence rather than creating a duplicate item. The item's
  identity key is `marked:${positionKey}` so the work item is
  one per canonical position; the occurrences list keeps the
  "I reached this from three of my games" context.
- After marking, the header switches to **Marked for Review /
  Open / Remove mark**. Removing the mark clears the item;
  re-marking the same position creates it again.

### Strategic feature transitions (Phase 41)

- Game Review now attaches deterministic "what changed"
  statements to critical moments: created passed pawn, created
  protected passer, created connected passed pawns, newly
  isolated pawn, doubled pawns, backward pawn, newly opened
  file, newly semi-open file, rook on a newly open file,
  bishop pair gained/lost, kingside pawn shield collapsed by
  two or more. Each statement is a board fact — the user can
  read it without knowing chess jargon and without knowing what
  the engine thinks.
- The detector compares file-by-file (not square-by-square) so
  a normal one-square pawn advance does not produce a fresh
  transition. The "no false positives for normal pawn moves"
  brief item is a passing test.

### Multi-source comparison (Phase 41)

- A new `SourceComparison` normalizer turns raw per-source
  counts into a uniform row-per-move shape with an explicit
  `SourceAbsence` (`zero-games` / `unavailable` / `not-loaded`
  / `unsupported-filter` / `network-failed`). The renderer
  never sees a "0" that means "source unavailable" — chess-data
  correctness per the brief.
- Trend claims are gated by `meetsTrendSampleThreshold` (50
  games minimum, both sides). Three games is not a trend even
  when the raw percentage delta is large.

### Clock parsing (Phase 41)

- The PGN clock parser already handled `[%clk H:MM:SS]`;
  Phase 41 adds a dedicated `chess/clock.ts` module for the
  derived facts: `thinkTimeSeconds` (refuses zero/negative),
  `isTimeTrouble` (move≥20 AND remaining<initial/3 AND
  increment<30 — refuses to label 5+0 bullet or 30+30 rapid
  as "time trouble"), and `parseTimeControlTag` (handles
  `300+0` / `5400+30` / plain seconds; returns null for the
  ambiguous `40/5400+30:3600` moves/seconds form rather than
  guessing).

### Calculation training (Phase 41)

- A distinct training item type with full provenance. The
  source kind `'game-review'` joins `'study' / 'game' /
  'repertoire' / 'analysis'`. The answer's truth source is
  recorded on every item (`engine-candidates` /
  `user-selected` / `tablebase`), so the renderer can label
  the answer accurately and never hide that the answer came
  from engine analysis.
- `gradeCalculationPick` scores by rank + delta-centipawns +
  acceptable-band. It refuses to mark engine-second-line
  within the band as wrong, and it treats exact-tablebase
  winners as winning without penalising alternate winning
  moves. Repertoire training is unchanged.

### Game Review — evidence-based critical moments (Phase 40)

- A new `runGameReview` driver walks the canonical game
  tree, asks the engine for evidence at every position, and
  ranks critical moments by evidence (mate transitions,
  evaluation swings, reference departures, repertoire
  deviations). No fake accuracy, no "Brilliant!!" label.
- Three budget presets: `quick`, `standard`, `deep`, with
  per-ply depth, multi-PV, and time bound. Progress and
  cancel are honoured; partial cancellations are clearly
  reported, never silently passed off as complete.
- `buildCandidateComparison` surfaces played move, engine
  candidates, reference moves, repertoire moves, personal
  database count, and tablebase WDL as distinct evidence
  sources, side by side — not merged into a single ranking.
- Repertoire deviation is keyed on the canonical FEN, so a
  move order that transposes into the user's preparation is
  recognised as in-prep.

### Test discipline (Phase 40)

- **Zero skipped automated tests.** Phase 39 shipped 11
  skipped tests covering visual baselines, the Syzygy probe
  helper, real reference packs, single-source explorer
  switching, and explorer-cache injection. Each is replaced
  by an active deterministic assertion.
- `npm run test:no-skips` is a new static gate that fails
  the build the moment any future commit reintroduces
  `test.skip`, `it.skip`, `describe.skip`, `xit`, `xtest`,
  `xdescribe`, `test.todo`, `it.todo`, `describe.todo`,
  `test.fixme`, `it.fixme`, `test.skipIf`, `test.runIf`,
  or a conditional `describe.skip` reference.
- Final automated state: 2624 passing, 0 skipped, 0
  failing.

### Installable web app (Phase 34)

- The studio origin (`kingfisher-roan.vercel.app`) is now an
  installable Progressive Web App. Chromium-family browsers
  offer the standard "Install" affordance and the application
  now exposes a small "Install Kingfisher" card in
  _Settings → Diagnostics_. A `beforeinstallprompt` is captured
  for the studio origin only — the marketing origin
  (`kingfisher-chess.vercel.app`) does not advertise itself
  as a PWA.
- A small same-origin service worker caches the application
  shell (hashed `_next/static/*`, manifest, icons). Reference
  data is **not** cached by the worker; the IndexedDB streaming
  cache remains its sole owner. The cache name is keyed by
  build identity, so a web deploy invalidates old shell
  caches without a Kingfisher version bump.
- A new "A Kingfisher update is ready. [Reload]" banner appears
  above the workspace when a new service worker is installed.
  The Reload button is disabled while a save is in flight, and
  the new worker never auto-activates.
- The marketing origin remains indexable. The studio origin now
  sends `X-Robots-Tag: noindex, nofollow, noarchive` on every
  response so search engines keep working application
  surfaces out of their index.

### macOS update discovery (Phase 34)

- A manual **Check for updates** action is wired into the
  macOS application's _Settings → Diagnostics_ panel. The
  check is one HTTPS request to the public Kingfisher release
  metadata, validated against SHA-256 and DMG-name
  constraints. Verdicts are _up to date_, _newer available_
  (with a link to the verified release page), and _unable to
  check_ (with a human-readable reason).
- Auto-update and silent binary replacement remain off. The
  macOS Preview is not notarised; the user always opens the
  release page in their own browser and downloads, verifies
  and installs by hand.
- The landing-page macOS card now mentions the upgrade
  workflow: "Already using Kingfisher? Download the latest
  DMG and replace the app in Applications. Your local
  Kingfisher work is stored separately and is preserved."

### Critical hotfix shipped (in production at 1.0.0)

- **Landing page no longer freezes the scroll.** A `body { overflow:
hidden }` rule was preventing scroll on the marketing page; the fix
  is a one-line CSS change deployed at master `4793827` without a
  version bump. This is the only Phase 29 change in production.

### Data

- **Visible chunk reuse.** When a reference pack is updated, the install
  progress now reports how many bytes were saved by re-using chunks
  already on disk — the same number the content-addressed store sees,
  not a rounded estimate. _120 MB of 324 MB · 204 MB reused from the
  previous install._
- **Categorised build reports.** Every reference pack build now writes
  a `build-report.json` next to its manifest. Every rejection reason
  the worker counts — bad result, too short, non-standard variant,
  missing player, missing rating, below the rating floor, above the
  rating ceiling, bot match, online event, illegal moves — is recorded
  individually, so a giant unexplained gap between the input game
  count and the retained game count cannot ship silently.
- **Freshness on the catalog rows.** The Recent Theory and High-Rated
  Online catalog rows state their filter and date window so the choice
  of "recent" is visible before install, not hidden in a document.
- **Use a pack online, with cached chunks.** A catalog pack that is not
  installed can now be queried online. The Explorer fetches the
  required shards, verifies each against the manifest's SHA-256,
  caches the verified chunks in a byte-budgeted LRU, and answers
  later queries from the cache. Cached chunks are reused when the
  same pack is later installed, so a research session does not
  download what the user has already fetched.
- **Project size, not a blocker.** `.real-scale`, `.archive-cache`,
  `.packs`, `.engine-build`, and `.engine-fleet` now live under the
  OS user-cache directory by default. A normal `git clone` no longer
  ships five-plus gigabytes of generated cache.

### Opening research

- **Trend with a sample-size label.** The Explorer Recent column shows
  the trend arrow only when the move has enough games to support one.
  Below the threshold, the column says _small sample_ in plain text
  and prints the recent games count next to it, so 3 of 7 never looks
  equivalent to 3,000 of 7,000. The header tooltip spells out the
  threshold and the rise/fall/steady rule.
- **Speed facet for the Explorer.** A Speed segmented control
  (All / Classical / Rapid / Blitz) appears on sources that
  distinguish speeds — Lichess, the user's own games, and any
  streaming pack. Reference packs that were built from a single
  speed window do not show the facet, because the facet would
  be a filter over the wrong axis. The active speed is part of
  the Explorer query key, so a result and its cache reflect the
  choice.
- **Repertoire coverage against a reference source.** The Repertoire
  workspace has a new panel that picks a reference source (Elite OTB,
  Recent Theory, High-Rated Online) and lists the high-frequency
  opponent replies the repertoire has not decided, with the games
  count and share for each. Transpositions collapse to one entry.

### Players

- **What has this player changed?** Each colour's section in a profile
  gains a Career vs Recent openings table. Each row shows the career
  share, the last-12-months share, and the percentage-point change
  between them. Rows below ten combined games are dropped, so a
  3-vs-0 comparison cannot look like a confident finding. The two
  columns are independent; recent is reported as — for openings that
  exist only in the career window, never as a fake zero.

### Training

- **Data-driven training generation.** A coverage report can be turned
  into a list of training prompts — position-keyed, deduplicated by
  canonical position, and provenance-tagged with the source the gap
  came from. The solution is intentionally left empty: the
  reference data tells the player _what_ to train; the player's own
  repertoire move is the answer.

### Continuity and errors

### Workflow speed — Phase 31

- **One search box, one parser, one ranking.** The command palette
  now reads from the same front door for every entity. `Cmd+K`
  finds openings, players, studies, chapters, repertoires, games,
  databases, opening files, training, decisions, themes, tags, and
  commands with the same subsequence ranking. No provider is hidden
  behind a different palette; there is exactly one.
- **FEN and move-sequence recognition in the search box.** A pasted
  FEN opens position search. `1.e4 c5 2.Nf3 d6` is parsed safely,
  refused to guess on the first illegal move, and offered as
  Explorer / Analysis / Databases actions on the reached position.
  Long pastes (over 240 characters) are pointed at the PGN
  importer rather than crashing the providers.
- **Open in … is one table.** A small action registry serves the
  Analysis toolbar, the Study tab, the Repertoire page, the
  Explorer and the search palette, so a player who learns
  "Open in Analysis" once has learned it everywhere.
- **Recent work shows when and where.** The Continue card on the
  recent workspace now reports the last-opened time and ticks it
  once a minute, so a card left on screen does not silently age
  into a lie. The cursor inside a study chapter or game is the one
  the user left, with the engine, modals and in-flight requests
  explicitly _not_ restarted.

### Data scale — Phase 31

- **lastAccessed-indexed eviction.** The persistent streaming
  cache walks the `lastAccessed` index instead of scanning every
  record. Eviction is O(1) on the size of the cache. Benchmark
  measured 10k and 50k records: insert ~85–100 ms, touch-all
  ~50 ms, oldestEntries 0.3–1.5 ms, evict ~13 ms regardless of
  cache size.
- **Honest storage-quota warning.** A 5 GB pack install on a 6 GB
  device now pauses behind a confirm dialog that shows the
  browser's reported free space. The dialog does not block the
  install — that is a user choice — and the catalog row says
  "Use online to avoid downloading the full pack" for any source
  that is 1 GB or larger, so the online path is the recommended
  default for huge sources.

### Public release — Phase 32

- **Master convergence.** The complete Phase 31 work
  (universal search, FEN / move sequence recognition,
  Open in … action registry, lastAccessed-indexed cache
  eviction, storage-quota warning, recent work polish) is
  now on `master` as of `c341718`. The pre-Phase 31 master
  (`042ba36`) is no longer the canonical mainline.
- **Production deployment.** The web product is live at
  <https://kingfisher-roan.vercel.app> and the marketing
  surface at <https://kingfisher-chess.vercel.app>.
  `/analysis`, `/openings`, `/players`, `/databases`,
  `/repertoire`, `/training`, `/settings` all return 200
  with the new code; the public link check reports
  20/20 endpoints live.
- **README quickstart.** Three steps to a professional
  workflow: open Kingfisher, press <kbd>Cmd</kbd>+<kbd>K</kbd>,
  type and Enter. The quickstart lists `Najdorf`, `Carlsen`,
  `1.e4 c5 2.Nf3 d6`, FEN paste, study title, and `recent`
  as the first six things worth trying. Position search
  ("Search this position"), Continue with last-opened,
  online vs offline reference data, and local persistence /
  backup are documented in the same place.
- **Help and feedback.** Settings → Diagnostics gains a
  "Help and feedback" group with external links to the
  GitHub issue templates, the community discussion, the
  changelog, and the security policy. A new `data`
  issue template asks for the source name, the question
  the player wanted answered, the actual answer, and the
  source state — so a maintainer can reproduce without a
  private PGN.
- **Kingfisher 404.** A bad studio URL no longer lands on
  the Next.js framework default. The 404 page offers
  "Open a fresh analysis", "Search Kingfisher" (which
  opens the universal palette via a window event), and
  "Open the landing page" as the three recovery actions.
- **Synthetic huge-source fixtures.** A new
  `src/reference/synthetic-huge-sources.ts` declares 1 GB,
  5 GB, and 20 GB fixtures with no payload. The catalog
  row, the storage-quota confirm dialog, and the
  `verdictForInstall` code path are exercised in a real
  browser without downloading a real pack.
- **Deployment model.** Push-to-master auto-deployment is
  not yet wired on the Vercel account. The Phase 32
  release used `vercel deploy --prod --yes` via the
  authenticated CLI. Future pushes will continue to
  deploy through the same CLI until the GitHub
  connection is set up; the one-click import path
  documented in `docs/deployment.md` is the recommended
  replacement.

- **"Saved on this device" status, in the sidebar.** A quiet
  indicator reports whether the browser considers the IndexedDB
  origin durable. If it does not, the user can click to ask the
  browser for that protection. The copy is careful to never imply
  cross-device backup, because no such backup exists.
- **Errors the user can read.** A fetch failure, an aborted request,
  a SQLITE_BUSY, an ERR_CONNECTION_REFUSED — they all surface in
  the UI as plain English with a short next step. The raw
  exception still appears in Diagnostics for the power user.

## 1.1.0 — Apple notarised, seamless updates

The current development line. The release date is the day
the Phase 36 release gate passes; the date is therefore not
a date yet, and Kingfisher 1.0.0 remains the public stable
release until this line is tagged.

### Professional macOS experience

- **Developer ID signed.** The macOS binary is signed with a
  `Developer ID Application` identity, with a secure timestamp
  and the macOS Hardened Runtime enabled. The signature chain
  covers the outer `.app` and every nested executable —
  Electron Framework, the `Kingfisher Helper` family, the GPU
  and plugin helpers, and the bundled engine binaries.
- **Notarised by Apple.** The notarisation ticket is stapled
  to the `.app` and the `.dmg`, so a normal double-click is
  all the first launch needs. There is no right-click → Open
  workaround and no system-wide setting to change.

  The public claim is **Developer ID signed and notarised
  by Apple**, not "Apple approved" or "Apple certified".
  Notarisation is an automated security/signing check, not
  a product endorsement.

### Seamless secure updates

- **In-app auto-update.** _Kingfisher → Check for Updates…_
  in the macOS application menu now offers a one-click
  **Install Update** flow: download, verify, save barrier,
  engine shutdown, install, and relaunch. The previous
  _open the verified DMG by hand_ step is no longer the
  normal path; the polished DMG is still produced as the
  manual fallback.
- **Save barrier.** Before the install runs, Kingfisher asks
  the renderer to flush any in-flight writes. If the renderer
  reports a failed save, the install is **aborted** and the
  verified update remains cached for a retry.
- **Signature-continuity check.** The updater refuses to
  install a candidate whose Developer ID identity does not
  match the running app, refuses a downgrade, refuses an
  HTTP feed URL, and refuses a host outside the production
  allow-list. Eleven mutation tests pin these guards in
  source.
- **No background polling.** Check for Updates is the only
  thing that issues a network request to the release host.
  The updater does not run on a timer and does not run on
  launch.

### Reliability and security

- **State machine, not status flag.** The updater has a
  real state machine — `idle` / `checking` / `up-to-date` /
  `available` / `downloading` / `verifying` / `ready` /
  `waiting-for-save` / `installing` / `restarting` / `failed`
  / `canceled` — and the dialog renders a different copy for
  every state.
- **Single-flight.** A second click of the menu item during
  a check or a download is a no-op, not a second
  install. The check promise, the install promise, and the
  save-barrier response are each single-flight.
- **Cache pruning.** The update cache is bounded; the most
  recent verified candidate is kept, older downloads are
  unlinked.

### What stays the same

- The version stays at 1.0.0 throughout Phase 36 development.
  The bump to 1.1.0 happens in one release commit once the
  release gate passes.
- The application is still a desktop companion to the web
  Studio; the in-app update flow does not introduce any
  background service and does not introduce any analytics.
- The reference data is unchanged. Recent Theory v2 remains
  the live dataset; the `data:recent:status` command reports
  the next candidate window without rebuilding.

## 1.0.0 — public stable release

The first stable public release of Kingfisher. The web application is
production-stable; the macOS desktop application is signed and ships as
a **Preview** until notarization is available. The landing page now
serves at the production web origin (`https://kingfisher-chess.vercel.app/`)
and the studio is one click away.

### What is in this release

- **Web is stable.** Production deployment at
  <https://kingfisher-chess.vercel.app/>. The landing page is the
  first surface; the studio is one click in. Starter, Stockfish,
  Opening Explorer, Players, Databases, Studies, Repertoire, Settings
  — all working.
- **macOS is Preview.** Apple Silicon DMG (`Kingfisher-1.0.0-arm64.dmg`),
  code-signed, checksum published. Not notarized yet — see the
  installation guide for the right-click / Open path.
- **Reference data is published.** Elite OTB (407,538 games), Recent
  Theory (44,200 games), and High-Rated Online (305,169 games) all
  install from the public data mirror. Kingfisher Starter (172,376
  games) ships with the application.
- **No account, no telemetry, no subscription.** MIT-licensed source.

### What users notice

- A landing page that is informative and direct: what Kingfisher is,
  why it is different, how to launch the web app, how to install
  macOS, where the source lives.
- A one-click path from landing → web app.
- The web app works in a fresh private profile. Studies, repertoire
  and preferences persist across reloads.
- The macOS binary still works on Apple Silicon and survives
  quit / relaunch with all user data intact.
- GitHub issues and discussions are the public support channel; the
  in-app diagnostic report redacts OAuth tokens and personal paths.

## 1.0.0-rc.5 — public preview live

The web application and landing page are now public. This release adds a real
`/settings` deep link, points every current entry point at the production web
origin, and tightens the public-release security and deployment checks.

The macOS preview remains Apple Silicon-only and not notarized. Its release
artifact is signed, checksum-published, and validated on macOS.

## 1.0.0-rc.4 — public preview release

The first public release of Kingfisher. The product is on the web and
on macOS, the public landing page is live, and the optional reference
data is published.

### What is in this release

- **Public landing page.** A single, calm, fast page that explains
  what Kingfisher is, what the optional reference data is, and how
  to get it. Live at <https://mardakurt.github.io/kingfisher-data/>.
- **Optional reference data is published.** Elite OTB (407,538
  games), Recent Theory (44,200 games) and High-Rated Online
  (305,169 games) now install from the public data mirror. Kingfisher
  Starter ships with the application as before.
- **macOS preview build.** Apple Silicon, code-signed, `1.0.0-rc.4`.
  Not notarized — Gatekeeper refuses a first launch; the install
  guide walks through right-click → Open. Full guide:
  [`docs/release/install-macos.md`](docs/release/install-macos.md).
- **Web build.** The same application, served as a Next.js
  production build. The Stockfish engine is in the page; no
  install. The first time you open it, the bundled Kingfisher
  Starter installs itself.
- **Source-comparison Explorer.** Every reference source keeps its
  own licence, provenance and counts. The Explorer never produces a
  combined "truth" score that quietly blends them.
- **Diagnostics that are answerable.** Settings → Diagnostics now
  has a _Copy support information_ line and a _Copy full diagnostic
  report_ button, both with credentials redacted at write time. The
  log file is local, rotated, and never uploaded.
- **Local-first.** No account, no telemetry, no upload. Studies,
  repertoire, training and notes are stored locally. Restoring from
  backup does not require contacting a server.

### Known limitations

- **macOS preview is not notarized.** A Developer ID Application
  certificate will move the macOS build from "preview" to "release".
  Until then, the install guide is the right-click-Open dance.
- **No auto-update.** Open Help → Check for updates, or browse the
  releases page.
- **Windows and Linux build but are unsupported.** They have not
  been launched. The README and the install guide say so. Do not
  expect a Windows or Linux download to be the supported path.
- **macOS Intel builds but has not been launched.** The supported
  desktop platform is Apple Silicon.
- **No auto-update for the reference data either.** A new pack
  version replaces the catalogue pointer; existing installs
  continue to use the version they have until they re-install.
- **No games before 2020 in any first-party source.**
- **Chess960 is not supported, deliberately.**
- **Local Syzygy needs tables the user supplies.**

### Where to report problems

- **Issues:** <https://github.com/mardakurt/kingfisher/issues>
- **Discussions:** <https://github.com/mardakurt/kingfisher/discussions>
- **In-app:** Help → Report a problem copies a redacted support
  report to your clipboard. Paste it into the GitHub issue.

## 1.0.0-rc.3 — closed beta

The build that the closed-beta testers received. Web and macOS
Apple Silicon, code-signed but not notarized, with the Phase 22
closed-beta readiness work. Superseded by `1.0.0-rc.4`.

## 1.0.0-rc.2

Phase 21 follow-up. Web and macOS Apple Silicon, code-signed.

## 1.0.0-rc.1

The first release candidate, published for the closed beta.

## Earlier

The development history is recorded in `docs/reports/phase-*.md`. The
list above is the user-facing summary.
