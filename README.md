# Kingfisher

A local-first chess research workstation for serious players.

> **Public release · 1.0.0** (web stable · macOS Preview)
> No account. No telemetry. No subscription.

|                                                                                      |                                                                              |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 🌐 **[Launch the web app](https://studio.kingfisher-chess.vercel.app/)**            | Open in any modern browser. The Stockfish engine is in the page; no install. |
| 🍎 **[Download for macOS](https://github.com/mardakurt/kingfisher/releases/latest)** | Apple Silicon, code-signed. _Preview build — not notarized._                 |
| 📦 **[Source on GitHub](https://github.com/mardakurt/kingfisher)**                   | Releases, source, issue tracker, changelog.                                  |
| 📖 **[Changelog](CHANGELOG.md)**                                                     | What changed in each release.                                                |
| 🐛 **[Report a problem](https://github.com/mardakurt/kingfisher/issues)**            | Issue templates for bugs and feature requests.                               |

Engine analysis, opening databases, annotation and game trees in one interface,
built for someone who already knows what a Najdorf is and wants better tools —
not a tutorial, not a puzzle streak, and not a wrapper that prints `+0.34` and
calls it analysis.

## At a glance

- **Landing page** at <https://kingfisher-chess.vercel.app/>. One
  marketing surface, one canonical URL. The legacy
  `mardakurt.github.io/kingfisher-data/` redirects here.
- **Studio** at <https://studio.kingfisher-chess.vercel.app/>. The
  application, on its own origin, reachable directly without going
  through the landing page. Both URLs are served by the same Vercel
  project; the host header decides which surface the visitor sees.
  See [`docs/adr/00xx-optional-account-sync.md`](docs/adr/00xx-optional-account-sync.md)
  for the architecture rationale.
- **macOS app** as a `.dmg` on the
  [latest release page](https://github.com/mardakurt/kingfisher/releases/latest).
  Apple Silicon only. Right-click → Open → Open on the first launch — see
  [`docs/release/install-macos.md`](docs/release/install-macos.md).
- **Source** at <https://github.com/mardakurt/kingfisher>. Releases, source,
  issues and changelog live here.
- **Optional reference data** (Elite OTB, Recent Theory, High-Rated Online)
  installs in-app from a public data mirror — see _Databases → Reference
  sources → Install_ in the application.

## What it does

Opening research, engine analysis, large personal databases, repertoire
and review. A local-first workstation: nothing leaves your machine that
you did not put in the address bar.

|                         |                                                                                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Opening research**    | Compare Elite OTB, Recent Theory, and High-Rated Online _side by side_. The Explorer never produces a single "truth" score that quietly blends them.                                                             |
| **Engines**             | Stockfish 18 in the browser (sandboxed). Native Stockfish, Berserk, Halogen, Koivisto, Obsidian, PlentyChess, Stormphrax, Viridithas and Lc0 on macOS, with their digests verified and their licence on the row. |
| **Databases**           | Attach large personal collections (SQLite), search by position, structure, player, or claim. Copy, move, merge, dedupe, federate. Open positions and games back into the board.                                  |
| **Theory Book**         | 3,810 named positions with ECO codes, browsable. Explains a variation by name only; never invents an evaluation.                                                                                                 |
| **Players**             | 12,522 identities plus 106 historical figures. Diacritics, aliases, rapid typing, backspacing. Profile, what they play as White, what they play as Black, what changed recently.                                 |
| **Repertoire & review** | Add positions to repertoire, drill them, mark progress. Repertoire survives quit. Backup and restore work.                                                                                                       |
| **Local-first**         | No account required. No hidden telemetry. Studies, repertoire, training and notes are stored locally. The diagnostic report is local; the log file is local.                                                     |

## Privacy

Kingfisher is local-first. The application does not phone home. There
is nothing in the network panel during a normal session except the
engines and reference data you asked for. Diagnostics exports never
include Lichess tokens, API keys, full PGN libraries, or home-directory
paths — credentials are redacted at write time.

The web build is hosted on Vercel (when deployed) and the optional
reference data lives in the public
[mardakurt/kingfisher-data](https://github.com/mardakurt/kingfisher-data)
mirror. There is no client-side analytics on the landing page.

## Known limitations

- **macOS preview is not notarized** — a Developer ID Application
  certificate is the missing piece. Until then the install guide
  walks through right-click → Open.
- **No auto-update** — open Help → Check for updates, or browse the
  releases page.
- **Windows and Linux build but are unsupported** — the supported
  desktop platform is Apple Silicon.
- **macOS Intel** builds but has not been launched. The supported
  desktop architecture is arm64.
- **No games before 2020** in any first-party reference.
- **Chess960 is not supported**, deliberately.
- **Local Syzygy** needs table files the user supplies; the bundled
  probe only goes up to 3 pieces.

See [`CHANGELOG.md`](CHANGELOG.md) for the full list of release notes
and [`docs/release/install-macos.md`](docs/release/install-macos.md) for
the macOS install walkthrough.

## Development

See [`AGENTS.md`](AGENTS.md) for the project conventions, the
`scripts/` directory for the build and verification scripts, and
[`ARCHITECTURE.md`](ARCHITECTURE.md) for the deeper structure.

The default remote CI is the lightweight one in `.github/workflows/ci.yml`
(typecheck, lint, unit/integration tests, build). The heavy gates —
full Playwright suite, desktop packaging, engine fleet, long soak — are
deliberately manual; run them with `npm run release:verify:full`.

## License

Kingfisher source: [MIT](LICENSE). Reference data: see the licence
declared in each pack's manifest, in the
[kingfisher-data mirror](https://github.com/mardakurt/kingfisher-data).
Engines: each engine carries its own licence (GPL-3.0 or AGPL-3.0 in
the default catalogue); see [`docs/ENGINES.md`](docs/ENGINES.md).

---

# Kingfisher (the original product README)

A chess research workspace for players who study.

Engine analysis, opening databases, annotation and game trees in one interface,
built for someone who already knows what a Najdorf is and wants better tools —
not a tutorial, not a puzzle streak, and not a wrapper that prints `+0.34` and
calls it analysis.

## What you get on a fresh installation

Everything below works the moment the application opens, on an empty profile,
with no account, no download, no companion and no imported PGN. It is asserted
by `e2e/fresh-user.spec.ts`, which runs against genuinely empty browser storage
and is a release gate.

|                       |                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Engine**            | Stockfish 18, as WebAssembly in a Web Worker. Sandboxed by the browser.                                                                                                                                                                                                                                                                                                                                |
| **Opening Explorer**  | 172,376 broadcast games between rated or titled players (including online events), 2023–2026, as 246,870 position aggregates indexed through **twenty full moves**. On your machine, and it answers with the network off.                                                                                                                                                                              |
| **Opening knowledge** | 3,810 named positions with ECO codes, from the CC0 lichess-org dataset, replayed through Kingfisher's own rules code — so transpositions converge and depth wins. Browsable as a **Theory Book**: open the Sicilian, see the Najdorf under it, see the English Attack under that, and put it on the board without playing a move. **All openings** returns to the index while keeping the loaded line. |
| **Opening library**   | All of it, searchable by code, name, nickname, move sequence or position, with statistics, transpositions and model games on every entry.                                                                                                                                                                                                                                                              |
| **Games**             | 10,707 full elite game scores, openable on the board.                                                                                                                                                                                                                                                                                                                                                  |
| **Players**           | 12,522 player identities from the reference, plus a curated roster of 106 historical figures — the whole championship lineage from Steinitz to Gukesh, the women's lineage from Menchik to Ju Wenjun, and twenty-five players from before FIDE existed.                                                                                                                                                |
| **Opening book**      | Derived from the reference: how often strong players chose each move.                                                                                                                                                                                                                                                                                                                                  |
| **Board and pieces**  | Twelve board themes and ten piece sets, all with licences recorded.                                                                                                                                                                                                                                                                                                                                    |

And what it does _not_ ship: any game played before 2020. The open archive
Kingfisher builds from begins there, and no collection of classic games with
clear redistribution terms was found. Morphy is in the player catalog with no
games behind him, and the page says so. See
[`THIRD_PARTY_DATA.md`](THIRD_PARTY_DATA.md).

### Optional

- **Connect Lichess** — OAuth with PKCE, no token to paste, no scopes requested.
- **Connect Chess.com** — a username; the API is public.
- **Install a reference pack** — resumable, and verified chunk by chunk against
  the manifest's own digests. Three exist, all indexing through twenty full
  moves, and **none of them is published yet**: their catalog rows point at a
  data repository that has not been created, so pressing Install answers 404
  and says so. They are built and integrity-checked here; what is missing is a
  publisher, not code. See
  [`docs/data/reference-packs.md`](docs/data/reference-packs.md).
  - **Elite OTB**, the whole broadcast archive since 2020: 407,538 games,
    every one openable, 5,438,808 position aggregates, 339 MB.
  - **Recent Theory**, the last two years at a lower frequency threshold so
    rare and recent continuations survive: 44,200 games, 918,069 positions,
    34 MB.
  - **High-Rated Online**, Lichess games where both players are 2400 or
    better: 305,169 games, 315,668 positions, 86 MB. Overwhelmingly blitz —
    295,695 of them — and one month of it. It answers what strong players are
    playing online, which is not the same question as how a line scores over
    the board, and the row says so before you install it.

  Any address that serves a Kingfisher manifest can be installed from today —
  Databases → Reference sources → **Install from a URL** — through the identical
  verified path.

- **Install an engine** — Stockfish 19, Stormphrax 8, Viridithas 20, Halogen 16,
  PlentyChess 8 or Lc0, downloaded, digest-checked and UCI-tested without
  leaving the application. Capabilities are read from the engine rather than a
  table: three of those five ignore UCI `searchmoves`, and Kingfisher knows it.
- **Add a Polyglot `.bin`** — your own opening book.

---

## How it got here

The sections below are the record of what each phase set out to fix, kept
because the reasons are still the reasons. They are history, not a status line:
the current release is **1.0.0-rc.3**, and what it does and does not do is in
[`docs/release/1.0.0-rc.3.md`](docs/release/1.0.0-rc.3.md).

### Phase 15 — deep enough to prepare with

Phase 15's question was how far into a line Kingfisher keeps answering. It used
to be about move ten. The reference packs are rebuilt to index twenty full
moves, with a frequency threshold that falls with depth rather than one number
for the whole tree; there is a second installable source that answers "is
anybody still playing this" rather than "how has this scored"; and when the
position outruns the deepest position anybody has named, the explorer keeps
showing the opening it is in rather than going blank.

Thirty plies of a mainstream line on an empty profile is a release gate, not a
claim: `e2e/fresh-user.spec.ts` walks it and reads the opening identity after
every single ply.

### Phase 13 — useful before you add anything

Phase 13's question was not "what else can it do" but "what does it do on the
day you install it". The answer used to be: very little. The explorer had no
data until you imported a PGN, the Lichess sources had needed an API token
since April 2026, there was no way to obtain an engine from inside the
application, the player list only contained names you had already imported, and
the board — the one thing a chess program is for — rendered 307 pixels wide on
a 1280×720 laptop.

All of that is fixed, and the fresh-profile flow is a release gate rather than
a claim. What follows is the record of the twelve phases that built the
workstation underneath it.

### Phase 12 — the last four reasons to open something else

Phase 1 built the workstation, Phase 2 made the work durable, Phase 3 turned the
stored material into preparation, and Phase 4 gave it real engines, real artwork
and real scale.

Phase 5 made those parts one application: the engine, explorer, database,
tablebase, features and companion follow the position between routes through a
shared workspace context and a single tool dock, and every route draws the same
board through one pipeline.

Phase 6 made it something you can leave running for an afternoon. Chapters
carry a write revision, so two tabs cannot silently overwrite each other and a
refused write offers to fork rather than lose. The draft is written before the
chapter, so a failed write no longer takes the session with it, and unsaved
work found on startup is offered back rather than discarded. A data-integrity
scan reports what does not resolve and repairs only what is unambiguous.
Diagnostics produces a report you can paste into a bug thread without leaking a
token. Every gate runs in GitHub Actions, including the browser tests.

Phase 7 is about whether it gets out of the way. The opening explorer answers
an unfiltered question about a 100,000-game SQLite collection in 0.3 ms instead
of 129 ms, from a derived aggregate table the writer maintains transactionally;
filtered questions still read the source rows, because an all-time total cannot
honestly answer "Elo ≥ 2400". PGN parsing moved into a Worker behind an
acknowledged batch pipeline, so importing a hundred thousand games no longer
freezes the tab — you can navigate, move pieces and watch progress while it
runs, background it, and cancel it without losing what already committed.
Repertoire positions and training items now carry revisions like chapters do,
with the same two-choice conflict resolution. A study chapter can link the model
games, repertoire positions and training items it is about, without copying
them. Heavy feature surfaces load when opened rather than at startup, taking
about 7% off every route's initial JavaScript. And a persistent background
analysis queue will work through selected games with one engine, yield
instantly to interactive analysis, survive a restart, and store nothing but
final, factual engine answers — no accuracy score, no move labels.

Phase 8 changes the question from "is it fast" to "does it help you improve".
The answer is a workflow, not a dashboard. In `/review` you open one of your own
games with the engine, the explorer, the tablebase, the repertoire and the model
games **withheld** — visibly withheld, and by your own choice rather than
broken. You record what you actually considered: candidate moves entered on a
board, an evaluation estimate as a band or a number, a plan, what you
calculated. Only then do you reveal. What you wrote before the reveal is frozen
at that moment and can never be edited afterwards, because a "correction" made
after seeing the engine is a record of the engine's judgement wearing your name.
The comparison that follows is called a comparison: the engine is evidence, not
a verdict, and nothing is labelled a blunder, a mistake or brilliant.

Around that sit the pieces that make it compound over months. Critical positions
become a real queue with reasons attached — "suggested because engine evaluation
changed from +0.4 to −1.1" — that you accept, ignore or turn into training, not
a flood. Reviewed positions carry themes you choose, never themes derived from a
score, and the improvement summary counts them and drills into the actual
positions behind every number. Training sets group items by hand or by a saved
query, without copying anything.

Research got two new tools. Structural search asks where else you have had this
pawn structure, from a documented pawn-skeleton key that ignores every piece —
not an embedding, so a result can always explain itself. Preparation priorities
order the moves your repertoire has no answer to, printing every fact they are
ordered by rather than a score nobody can reconstruct.

And the measured limits Phase 7 named are gone. Filtered explorer queries on a
100,000-game SQLite collection dropped from ~132 ms to 0.4–2.7 ms, from exact
year/rating cells rather than buckets — a filter that excludes nothing returns
exactly what the unfiltered explorer returns, and a test says so. SQLite
collections can finally shrink: by selection, by an exact filter, or entirely,
in one transaction with the aggregates rebuilt for exactly what changed. A
20,000-node move tree was profiled before anything was virtualized, then
virtualized because it needed it, keeping nested variations, comments,
connectors and keyboard navigation intact. And an alternative rules engine was
benchmarked at 2.68× and **rejected**, because it bought that speed by
discarding variations, comments and NAGs.

Phase 9 asks whether a titled player could use Kingfisher as their primary
workstation, and builds the parts of a professional week that were missing.

Preparation is now for a _game_ rather than an opening. A session names an
opponent, a colour and a round; the dossier answers what they play, what has
changed recently and which move orders they use, with every figure followed by
the sample it came from and a warning when a window is too thin for its own
percentages. What comes out of hours of work is a curated game-day sheet —
positions you chose, with your reasons — that prints as a self-contained page,
copies as Markdown, and exports as PGN.

Calculation got its own workspace. Start one and the engine, explorer, database,
tablebase and repertoire are withheld; you enter the lines you actually look at
on a board that _advances_, so 1...Rd8 2.Qe2 walks the variation the way you
calculate it. The tree keeps its shape, because where your analysis forked and
which fork you never looked at is the useful part afterwards. Blindfold is a
control in the same panel, not a separate mode. On submission it becomes the
same frozen decision record self-analysis writes, so it feeds the same journal.

The journal now pays off. Two questions, both counts, both drillable: how far
your estimates sit from the evidence, and how often the engine's eventual first
choice was on your list. Reviewed positions can be scheduled to come back, using
the spaced repetition training already runs on — with a separate schedule,
because recalling a move says nothing about being able to rebuild the plan
behind it.

The repertoire shows its transpositions: every prepared move order that reaches
a decision, and the sentence that matters — editing it through any route changes
every route. Opening files gather the repertoire positions, chapters, model games
and training that belong to one subject. Model games can be worked through in
guess-the-move, which asks what the _player_ played rather than what the engine
prefers, and reports a difference rather than a mistake. There is an endgame lab
with a position library and local Syzygy through the companion, which reads your
tablebase directory to say exactly what it can answer and prints where every
proof came from.

And it got faster to drive. Position actions have one definition behind the
menu, the palette and the keyboard; a research trail says _where_ it goes back to
and restores the position; focus mode strips the chrome; a pasted FEN finds every
place that position is stored.

On the measurement side, Phase 8's import regression is a third smaller, an old
collection can be given its structural index in place without re-importing a
game, and the transposition graph went from 1,119 ms to 53 ms once it was
measured on a repertoire big enough to matter.

Phase 11 treats the whole thing as a release candidate, and spends most of its
effort trying to break ten phases of accumulated work rather than adding to it.

The data-safety work is the part that matters. Every historical schema version
now has a fixture that seeds a database the way a real installation at that
version would have, migrates it forward through the real upgrade path, and
checks the result for semantic equality — chapter trees, comments and variations
byte-identical, player keys backfilled without disturbing the fields beside
them, references and background jobs still resolving through their indexes. A
corrupted workspace layout can no longer take a route down: anything unknown,
absurd or NaN is dropped at load, and if rendering fails anyway the error screen
offers **Restore default workspace** without requiring you to reach Settings —
which was previously the only place that control existed.

Randomized testing arrived for the parts where hand-written fixtures only cover
what someone thought of. Sixteen fixed seeds generate legal games biased toward
captures, castling, en passant and promotion, branch variations off them, and
assert properties that must hold for any legal game: the tree stays
well-formed, every move is legal from its parent, PGN round-trips to the same
set of lines, replaying a move reuses its node rather than duplicating it, and
promoting or deleting a variation never leaves a malformed tree. Curated
SetUp/FEN fixtures cover castling both sides, all four promotion pieces,
checkmate, stalemate and threefold repetition, which random play reaches too
rarely to rely on.

And the release gate got stricter rather than kinder. Browser tests now run at
**zero retries**: a test that only passes on its second attempt is a bug, and a
gate that quietly re-runs it hides that bug instead of failing on it. Retries
still exist in a separate, manually-triggered, non-gating workflow, for telling
a flaky test apart from a broken one.

Three workflow gaps closed alongside that. **Any UCI engine** can now be
registered by path through the companion — validated as a real executable, then
made to complete a full `uci`/`uciok`/`isready`/`readyok` handshake before it is
trusted with a key, so a mistyped path is refused at registration rather than
during analysis. **Lichess and Chess.com accounts** can be linked by username
and their games pulled into the ordinary local collection: no Kingfisher
account, nothing uploaded, incremental against each API's real cursor, and
duplicate-free because a synced game goes through the same import pipeline and
the same fingerprint index as a pasted one. And a **position report** answers
"what do I know about this position" in one click, with every section naming its
source and no move ever labelled best — a highlighted move carries the rule that
selected it, with the sample threshold written into the label.

Phase 12 closed the four gaps that analysis had called genuine competitive
losses, and finished the reliability work Phase 11 deferred.

**Databases became a place you can work.** Games move between collections in all
four directions — browser to SQLite and back, SQLite to SQLite — paged, with
progress, cancellable, and never loading an archive into memory. A **move**
copies, asks the destination to confirm it holds the games, and only then
deletes: a destination that reports success and stores nothing leaves every game
where it was and says so. A **merge** counts the exact overlap first — 452 ms
across two hundred-thousand-game collections — so the dialog can say "68,893 new
games" rather than an estimate. **Duplicate search** across collections
separates byte-identical copies, which it offers to remove, from the same game
annotated two different ways, which it shows and refuses to resolve, because
there is no correct automatic answer to whose notes survive. Plus one query
across several collections with every row keeping its source, and named source
sets that reference rather than copy.

**Openings are classified, not copied from a tag.** 3,810 named positions from a
CC0 dataset, replayed through Kingfisher's own rules code and keyed by canonical
position identity — so transpositions converge without a special case, a
Sicilian that reaches a Najdorf is called a Najdorf, and a game with no `[ECO]`
tag gets a name. The imported tag is kept beside the computed one and the game
list says when they disagree.

**Players have a page.** `/player/…` for anybody in your collection: results per
colour, openings per colour with recent against historical, opponents, and ten
deterministic tendency metrics that each print the rule they applied and exclude
games that cannot answer rather than counting them as a "no". Every figure
carries its denominator. Nothing here produces an adjective. Any opening row is
one click from the board, and preparing against them is one click from the
header.

**Local tablebases need one folder.** Choose a Syzygy directory and the
companion builds and manages a Fathom-based probe helper that reads it — no
second service to start. Kingfisher still ships no decoder of its own, because a
wrong tablebase result is worse than none; Fathom is pinned by commit with its
digests recorded. Correctness is checked against known results, not asserted:
a rook against a bare king is won and cannot be dropped on the king's file, a
knight against one is drawn, and the opposition decides king and pawn.

The reliability work found five real things, listed in the performance notes,
including two controls that were nameless to a screen reader and two capabilities
the rewritten Databases screen had quietly dropped.

Where Kingfisher still trails ChessBase, En Croissant and ChessMonitor is
recorded honestly in
[`docs/product/pro-workstation-gap-analysis.md`](docs/product/pro-workstation-gap-analysis.md).
Four gaps remain and none is small: top-end scale past 500,000 games, opening
books an engine can consult, ChessMonitor's online rating analytics, and cloud
engine time.

Every number in those paragraphs is measured, reproducible and recorded with its
before-figure in
[`docs/performance/phase-12-pro-workstation.md`](docs/performance/phase-12-pro-workstation.md),
[`docs/performance/phase-11-release-candidate.md`](docs/performance/phase-11-release-candidate.md),
[`docs/performance/phase-9-preparation-and-scale.md`](docs/performance/phase-9-preparation-and-scale.md),
[`docs/performance/phase-8-study-and-research.md`](docs/performance/phase-8-study-and-research.md)
and
[`docs/performance/phase-7-speed-and-scale.md`](docs/performance/phase-7-speed-and-scale.md).

Everything is stored in your browser. There is no account, no cloud and no
sync, and the application works with the network off. An **optional** local
companion adds native engines and SQLite collections, the two native
capabilities shipped in Phase 4, and nothing depends on it. Tablebase evidence
currently comes from the separate Lichess Syzygy provider.

**Working today**

| Area                 | What you can do                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Board                | Drag or click to move, promotion picker, flip, eight board themes, five selectable open-source vector piece sets plus an internal recovery set, coordinates, move animation                                                                                                                                                                                                                                          |
| Game tree            | Nested variations, promote / promote-to-main-line, delete, truncate, undo & redo, keyboard navigation                                                                                                                                                                                                                                                                                                                |
| Annotation           | Comments, NAG glyphs, arrows and square highlights (right-drag), all surviving a PGN round trip                                                                                                                                                                                                                                                                                                                      |
| Engines              | Stockfish 18 in a Worker, Stockfish 19 natively; Lc0 and Stormphrax as native processes through the companion. MultiPV 1–5, live depth / nodes / nps, evaluation bar, stability and line-separation metrics, click any move to insert the line                                                                                                                                                                       |
| Two engines          | Run any two on one position and see where they agree, how far their lines run together, and how far apart their evaluations are. No combined score                                                                                                                                                                                                                                                                   |
| Tablebases           | Syzygy through lichess.org for any position of seven pieces or fewer: category, DTZ, DTM and the winning moves, kept in its own vocabulary rather than converted to centipawns                                                                                                                                                                                                                                       |
| Structure            | Counted, not judged: pawn islands, isolated, doubled, passed, connected passed and backward pawns, open and semi-open files, rooks on them, the bishop pair, material imbalance, castling and king shelter                                                                                                                                                                                                           |
| Companion (AI)       | Optional. Answers from an evidence packet the app builds — engine lines, database counts, your repertoire, the structure — and shows you the packet                                                                                                                                                                                                                                                                  |
| Move editing         | Right-click any move for comments, glyphs, variation reordering, "make this the main line", targeted deletion and copy                                                                                                                                                                                                                                                                                               |
| Marking              | Mark a position critical — opening, calculation, strategy, endgame or time trouble — and take it straight to a training item                                                                                                                                                                                                                                                                                         |
| Studies              | Notebooks of ordered chapters — create, rename, reorder, duplicate, delete; autosaved as you work; export a chapter or a whole study as PGN                                                                                                                                                                                                                                                                          |
| Games                | Import cancellable multi-game PGNs, paged indexed search, filters, sortable columns, bulk delete, model-game tags, and personal-game evidence                                                                                                                                                                                                                                                                        |
| Explorer             | Every kind of evidence for one position side by side: frequency, score, average Elo, recent-theory comparison, engine rank, repertoire role, your own results. Sources are never mixed, and there is no combined score                                                                                                                                                                                               |
| Databases            | IndexedDB for everyday collections; optional SQLite through the companion, measured at 100,000 games. Both use the same fingerprints and canonical position keys. SQLite collections can be pruned by selection or exact filter, emptied, or deleted — transactionally, with the aggregates rebuilt                                                                                                                  |
| Openings             | One board-led workspace combining local database moves, repertoire choices, personal results, engine evidence, and model games                                                                                                                                                                                                                                                                                       |
| Repertoire           | White/Black repertoires keyed by canonical position, editable move roles and notes, explicit opponent replies, coverage counts, local evidence, gap detection, and PGN export                                                                                                                                                                                                                                        |
| Preparation          | Exact-player reports with side/date/rating/ECO/result filters, profile facts, transposition-aware trees with frequency, score, average Elo and recency, prepared-vs-gap comparison, and a "My games" view of your own                                                                                                                                                                                                |
| Training             | Answer on the board or by band: repertoire recall, best move, candidate moves, evaluation bands, and plans, each checked against what you recorded; due/new/learning/mature queues with deterministic SRS                                                                                                                                                                                                            |
| Backup               | Versioned JSON export; authored-work or full-game backup; validated transactional merge and replace                                                                                                                                                                                                                                                                                                                  |
| Background work      | Queue games for analysis with one background engine: quick / standard / deep / custom presets, every move or after move N, pause, resume, cancel, retry failed, resumable across a restart. Stores engine, score, depth, nodes, time and PV — never a move label                                                                                                                                                     |
| References           | A chapter can link the model games, repertoire positions and training items it is about. Clicking one opens it; a deleted target reads "Missing reference" and the integrity scan offers to drop it                                                                                                                                                                                                                  |
| Saved filters        | Name a database filter set and get it back from a menu; recently used filter sets are remembered and named after what they select                                                                                                                                                                                                                                                                                    |
| Storage              | Estimated IndexedDB usage against the browser quota, SQLite collection sizes on disk, and counts of games, studies and training items. Estimates are called estimates, and nothing is ever deleted for you                                                                                                                                                                                                           |
| Search               | `⌘K` searches actions plus studies, chapters, games, players, repertoires, training items, model games, tags, decision records, critical positions, themes and training sets                                                                                                                                                                                                                                         |
| Import / export      | PGN and FEN in (format auto-detected) from a paste or a file, parsed in a Worker so the tab stays usable, backgroundable, cancellable without losing committed games; PGN, FEN, SAN and UCI out                                                                                                                                                                                                                      |
| Workspaces           | The same board and the same research tools in Analysis, Studies, Openings, Repertoire, Preparation and Training. Layout presets, a resizable dock, and the last tool remembered per route                                                                                                                                                                                                                            |
| Data sources         | `/databases` lists every provider with a real status — ready, authentication required, companion offline, rate limited, misconfigured — plus capabilities, game counts, measured latency and a connection test that validates the response, not just the transport                                                                                                                                                   |
| Lichess              | Masters, the Lichess database and the player explorer over `explorer.lichess.org`, connected with your own scope-free token. `401`, `403`, `404`, `429`, `5xx`, timeouts and schema changes each say what actually happened                                                                                                                                                                                          |
| Self-analysis        | Hide every computer source, record candidates on the board, an evaluation estimate, a plan and what you calculated, then reveal. Pre-reveal answers freeze permanently; the reveal compares, it never grades                                                                                                                                                                                                         |
| Review queue         | Critical marks become a filterable inbox — unreviewed, reviewed, converted to training — plus candidates the background engine suggests from stated facts: an evaluation swing, a change of top move, a repertoire deviation, a tablebase result change                                                                                                                                                              |
| Themes               | A starting taxonomy plus your own tags, assigned by hand and never derived from an engine score. The improvement summary counts them over 30/90 days or all time, and every count opens the positions behind it                                                                                                                                                                                                      |
| Training sets        | Group training items by hand, or by a saved query (theme, source, window). A set is membership, never a copy, so an item cannot drift out of sync with itself                                                                                                                                                                                                                                                        |
| Structure search     | Find the same pawn skeleton, the same structural signature, the exact position, or chosen facts — from documented, versioned, indexed keys rather than an embedding. Results state which kind of match they are                                                                                                                                                                                                      |
| Model games          | Discover them by exact position, pawn skeleton, opening or structural facts; sort by Elo, recency or closeness of match; step through one in a study mode with the engine off by default                                                                                                                                                                                                                             |
| Prep priorities      | The opponent moves your repertoire has no answer to, ordered by missing answer, rising recent frequency, then frequency — with every one of those facts, the model games, the training items and the last review printed on the row. No blended score                                                                                                                                                                |
| Preparation sessions | One opponent, one colour, one round. References your repertoires, studies, opening files and model games rather than copying them, so a session opened a week later shows what those records say now                                                                                                                                                                                                                 |
| Opponent dossier     | What they play, what changed between a historical and a recent window, and which move orders they use — each figure followed by its sample, each move order openable to the games it was seen in                                                                                                                                                                                                                     |
| Game-day sheet       | Curated by hand, ordered by you, printable as a self-contained page and exportable as Markdown or PGN. What you leave off is what makes the rest worth reading                                                                                                                                                                                                                                                       |
| Theory radar         | A position's move shares over all time, three years and twelve months. Labels name the database and never claim a novelty                                                                                                                                                                                                                                                                                            |
| Opening report       | One panel answering what the position is called and how far past the last named one it is, the variation brief, the branches worth the time with the numbers that ordered them, and one row per installed population with its own count. Nothing in it is combined. Where a SQLite collection can supply the games, it also counts where each piece went and which pawns advanced, naming the collection it replayed |
| Repertoire review    | A repertoire becomes prompts in the training queue that already schedules everything else — one per position however many move orders reach it, and running it twice adds nothing                                                                                                                                                                                                                                    |
| Calculation          | Evidence withheld while you enter the lines you actually look at, on a board that advances. Optional blindfold. Submitting writes the same frozen decision record self-analysis does                                                                                                                                                                                                                                 |
| Journal patterns     | How far your estimates sat from the evidence, and how often the engine's first choice was on your list. Counts with denominators, never a score, and every bar opens the positions behind it                                                                                                                                                                                                                         |
| Review schedule      | Bring a reviewed position back tomorrow, in a week, in three weeks, in two months, or let the scheduler decide. Separate from training, because recalling a move is not rebuilding a plan                                                                                                                                                                                                                            |
| Transpositions       | Every prepared move order that reaches a repertoire decision, and the fact that follows: they share one record, so editing through any route changes every route                                                                                                                                                                                                                                                     |
| Opening files        | One subject — “Black vs 1.e4, Najdorf” — gathering the repertoire positions, chapters, model games and training that belong to it. References, never copies                                                                                                                                                                                                                                                          |
| Guess the move       | Work through a master game one decision at a time. The question is what _this player_ played, so the engine stays out of it and a different move is reported as a difference, not a mistake                                                                                                                                                                                                                          |
| Endgame lab          | A library categorised the way you think about endgames, with the tablebase as referee and the engine as opponent. Local Syzygy through the companion, which reads your directory to say exactly what it can answer                                                                                                                                                                                                   |
| Candidates           | Ask the engine about the three moves you are choosing between, using UCI `searchmoves` where the engine reports support — and keep a line as evidence with its engine, build, settings, depth and node count                                                                                                                                                                                                         |
| Getting around       | One position-actions list behind the menu, the palette and the keyboard; a research trail that names where it goes back to and restores the position; focus mode; compact density; a pasted FEN that finds everywhere the position is stored                                                                                                                                                                         |
| Interface            | Responsive desktop/tablet/phone workspace, command palette (`⌘K`), keyboard-first navigation, dark and light themes, local-first preferences                                                                                                                                                                                                                                                                         |
| Custom engines       | Register any UCI executable by path through the companion. It must be a real executable and must complete a full `uci`/`uciok`/`isready`/`readyok` handshake before it is accepted; options and capabilities are then read from the engine itself, exactly as for a catalogue engine                                                                                                                                 |
| Linked accounts      | Link a Lichess or Chess.com username and pull those games into the ordinary local collection. Incremental per each API's own cursor, strictly serial where asked for, no account and nothing uploaded. Syncing twice imports nothing, because a synced game meets the same fingerprint index                                                                                                                         |
| Position report      | One click: opening, reference statistics, notable moves, tablebase, repertoire, model games, your games, structural themes, stored engine lines and your own journal history. Every section names its source; an empty one says why. No move is ever called best                                                                                                                                                     |

**Deliberately bounded.** IndexedDB collections are measured to 50,000 games and
SQLite ones to 500,000, where the opening explorer is still answered in 0.3 ms
from its derived tables but player and text search have grown to 67–141 ms.
Neither number is extrapolated to millions. Opponent
preparation uses at most the latest 1,000 matching games. Structural features
are counted, never scored — the application does not fabricate strategic labels,
and the assistant is forbidden from inventing numbers that are not in front of
it.

Nothing in the application fabricates chess data. When the engine is not
installed, the engine panel says so. When a database cannot be reached, the
explorer says so and offers your own games instead. The evaluation graph plots
only evaluations you actually saved, leaving unanalysed moves blank rather than
drawing a curve through them. "Saved" means a write completed; if storage
fails, the header says the work is not saved.

### Routes

| Route            | Purpose                                                                             |
| ---------------- | ----------------------------------------------------------------------------------- |
| `/analysis`      | Analyse a position or game. Opened games land here                                  |
| `/openings`      | Board-led opening research across evidence sources                                  |
| `/games`         | Your imported game collection: search, filter, sort, open                           |
| `/preparation`   | Opponent reports: their tendencies against your repertoire                          |
| `/databases`     | Collections, providers, connection health and imports                               |
| `/repertoire`    | The lines you intend to play                                                        |
| `/studies`       | Notebooks of chapters, each a full analysis workspace                               |
| `/training`      | Spaced recall over positions you recorded                                           |
| `/review`        | Self-analysis, the decision journal, the critical queue and the improvement summary |
| `/model-game`    | Step through a model game with the engine off, or guess the moves                   |
| `/opening-files` | One opening subject and everything already stored about it                          |
| `/endgame`       | The endgame library, with tablebase proof beside it                                 |
| `/players`       | Every player the installed reference sources know, plus the historical roster       |
| `/oauth/lichess` | Where a Lichess sign-in returns to. Not part of the workspace                       |

`/database` (singular) was opponent preparation, which read as data-source
management once real data-source management existed. It now redirects to
`/databases`, and preparation moved to `/preparation`; old bookmarks land
somewhere sensible rather than 404ing.

`/` still opens `/analysis` rather than `/recent`. Kingfisher already restores
the previous session there, so landing on Analysis _is_ continuing; putting a
list in front of it would add a click to the most common action.

### Where your data lives

Studies, chapters, imported game summaries/content, position indexes,
repertoires, model-game links, training schedules/history, chapter references,
background-analysis jobs, saved engine evidence, personal aliases, linked
online accounts, installed reference packs and their chunks, opening books, and
the active draft are stored in IndexedDB under `kingfisher`; saved and recent database
filters and preferences stay
in `localStorage` — including your Lichess token, which is never committed,
never logged and never included in a backup. It is scope-free and revocable
from Lichess, which is what makes browser storage an acceptable place for it.
Network requests occur only when you deliberately use a remote evidence
source: the Lichess explorer, the Lichess tablebase, an account you linked and
asked to sync, or an assistant endpoint you configured. Local database, engine,
repertoire, study, training and backup workflows remain offline.

A linked account stores a username and two sync cursors. It is not a login:
both providers serve public games without one, nothing is uploaded, and no
password or OAuth flow is involved. The Lichess token you may already have set
for the explorer is reused if present — it raises that API's rate allowance —
and sync works without it.

An analysis is always one of three things, and the header says which:

- **Untitled analysis** — kept as a draft so a refresh cannot lose it, but not
  filed anywhere. `Save to study` (`⌘S`) turns it into a chapter.
- **Study chapter** — yours, and autosaved as you work.
- **Database game** — source material. You can move and explore freely, but
  nothing writes back over the imported game; save a copy to a study instead.

---

Phase 10 is about shaping it around your own workflow without being able to
break it. A workspace is now a board plus three named regions — a side dock, an
optional lower panel, and the board column — and any module can be moved
between them from a menu, not only by dragging. Eight presets, layouts you can
name and save, and a reset that is two clicks from anywhere a layout can go
wrong: a bad arrangement should never mean clearing `localStorage` by hand.
Layouts are stored separately per device size, so arranging a phone cannot
overwrite a desktop.

Deliberately not a docking system. There is no pane tree and no floating
window, because the single most valuable thing on screen is the board, and any
system that lets it be dragged into a corner will eventually put it there by
accident. The board cannot be rearranged, and a test holds it above 400px on a
1440x900 screen.

Every board on every route now resolves one capability record, and concealment
is subtractive: Review, Calculation, Guess the Move and Training withhold the
evaluation, the legal-move hints and the stored annotations, and no call site
can turn any of it back on. A board whose artwork fails to render falls back to
the stock set rather than taking the route down.

Settings gained a search box — "threads", "piece set", "shortcut", "lc0" — and
each result explains the setting rather than just naming it. Every integration
says whether it works where you configured it, instead of sending you to
Diagnostics to find out. Settings and layouts export to a file that carries no
tokens, no keys and no addresses from your own network, and a test greps the
export for a real-looking credential to keep it that way.

Every keyboard command can be rebound, conflicts are reported rather than
silently allowed, and the reference dialog is the editor. The binding table is
now what the handler actually reads, so a documented shortcut is necessarily
one that fires — which was not previously true.

A saved endgame can be played out against the engine with the tablebase as
referee. It reports what the position is now worth — "The tablebase result
changed from Win to Draw on this move" — and never tells you that you blundered,
because it does not know that.

Player and metadata search over a 500,000-game SQLite collection are indexed
rather than scanned: a player prefix lookup went from 72–262 ms to under a
millisecond, and text search from a 127–137 ms tail to a flat 26–29 ms.

## Two identities

Kingfisher is one application with two ways to run it, sharing all of the same
code — the same board, the same rules, the same explorer, the same repertoire.

**In a browser.** Open it and study chess. Nothing to install, no companion, no
account; everything under "What you get on a fresh installation" above works on
an empty profile with the network off.

**As a Mac application.** One launch, no terminal. The shell starts the
companion for you and pairs it — there is no token to copy out of a terminal
window, because the process that minted it is the process that serves the page.
Native engines, SQLite collections of any size, Syzygy tablebases and a PGN
opened from the Finder all work, and quitting stops every native process the
session started.

```bash
npm run desktop:install    # once: the shell's own dependencies
npm run desktop            # build the web bundle and launch it
npm run desktop:dist       # Kingfisher.app and a .dmg
npm run desktop:smoke      # drive the real application and check seventeen things
npm run desktop:chrome     # the macOS window buttons, against every layout the app has
npm run desktop:engines    # install and search with every managed engine, inside the bundle
npm run desktop:suspend    # stop every Kingfisher process for 20 s, then resume it
npm run desktop:restart    # quit and reopen, and check the work is still there
npm run desktop:upgrade    # a previous release's profile, read by this build
```

The desktop shell is Electron, and that was a measured decision rather than a
default: Kingfisher's browser engine is a multi-threaded WebAssembly Stockfish,
which needs `SharedArrayBuffer`, which needs cross-origin isolation — and under
Tauri's WKWebView `crossOriginIsolated` is `false` even with COOP and COEP
declared, so the engine would have silently fallen back to one thread.
[ADR 0049](docs/adr/0049-the-desktop-shell.md) has the whole comparison,
including what it cost.

**What is and is not true of the desktop build today**, stated rather than
implied:

|                                     |                                                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| macOS arm64 — builds, installs, run | **yes**, and driven end to end by `npm run desktop:smoke` — 17 checks                                                                                                    |
| macOS x64                           | builds from the same configuration; **never launched**                                                                                                                   |
| Windows x64                         | **builds** in CI; never installed or launched, so **not supported**                                                                                                      |
| Linux x64                           | **builds** in CI; never installed or launched, so **not supported**                                                                                                      |
| Code signed                         | **yes** — hardened runtime, all six entitlements, signature valid                                                                                                        |
| Accepted by Gatekeeper              | **no** — signed with an _Apple Development_ identity, not a distribution one                                                                                             |
| Notarised                           | **no** — no ticket stapled                                                                                                                                               |
| Auto-update                         | **not implemented**, deliberately; see the release notes                                                                                                                 |
| `.pgn` file association             | declared, and **exercised** — a double-clicked PGN opens on the board                                                                                                    |
| Native engines, packaged            | **yes** — all six offered here, installed and searched inside the bundle; `npm run desktop:engines` — 25 checks                                                          |
| Local Syzygy tablebases, packaged   | **yes** — a real probe, asserted in the smoke run                                                                                                                        |
| Runs with the network cut           | **yes** — 23 of 23 offline checks                                                                                                                                        |
| Launch to a visible window          | **~630 ms** on an M3 Pro; `KINGFISHER_STARTUP_TRACE=1` prints the stages                                                                                                 |
| macOS window buttons                | **native**, placed by the shell at (14, 20); `npm run desktop:chrome` — 107 checks, geometry in [docs/design/macos-window-chrome.md](docs/design/macos-window-chrome.md) |
| Survives a suspend and resume       | **yes** — `npm run desktop:suspend`, 12 checks; an analogue of sleep/wake, not a real one                                                                                |

The bundle is properly signed: `Identifier=dev.kingfisher.app`, hardened
runtime on, `valid on disk`, `satisfies its Designated Requirement`. What it is
not is _distributable_. Notarised distribution needs a **Developer ID
Application** certificate, which is a different kind from either identity this
machine holds — _Apple Distribution_ is for the App Store, and _Apple
Development_ is for running on registered devices, which is what the current
signature is good for and no more.

---

## Getting started

**Node 24 or later**, which is what CI runs and what `.nvmrc` names. This is a
version floor rather than a preference: the companion reads SQLite through
`node:sqlite` and the reference pipeline decompresses through `node:zlib`'s
zstd, and neither built-in exists before Node 22. On Node 20 the suite does not
fail informatively — it reports fourteen files erroring on a missing module.

```bash
nvm use          # or any Node >= 24
npm install
```

```bash
npm run engine:install
```

```bash
npm run dev
```

Then open <http://localhost:3210>. The application opens directly into the
analysis workspace.

### About the engine download

`npm run engine:install` fetches two Stockfish 18 WebAssembly builds (~14 MB)
into `public/engine/stockfish/`. They are **not** committed and **not** an npm
dependency, because Stockfish is GPL-3.0 licensed and large. The application
runs without them — the engine panel reports that analysis is unavailable and
tells you how to fix it.

The single-threaded build is used by default and works everywhere. The
multi-threaded build needs `SharedArrayBuffer`, which needs cross-origin
isolation; enable it with:

```bash
KINGFISHER_CROSS_ORIGIN_ISOLATION=1 npm run dev
```

The engine provider then selects the threaded build automatically.

### About the opening explorer

**It works out of the box.** `public/reference/kingfisher-starter/` is a 9.5 MB
reference pack built from the Lichess broadcast archive (CC BY-SA 4.0), which
installs itself into this browser on first run and then needs no network at
all. It is the explorer's default source, and it is what the player library,
the opening library, model games and the derived opening book all read.

Lichess began requiring authenticated opening-explorer requests in April 2026,
so its Masters and Lichess sources need an account — but they are now an
_addition_ rather than a precondition. Settings → Accounts → **Connect
Lichess** does it with OAuth and PKCE: you approve on lichess.org and come
back connected, with no token to paste and no scopes requested. A personal
token is still accepted, folded away under Advanced, for scripted setups.

`docs/data/reference-packs.md` describes the pack format, the filters and how
to rebuild everything.

### About the Grandmaster Companion

The optional assistant accepts any OpenAI-compatible `/chat/completions`
endpoint. Configure its base URL, model and optional API key in Settings →
Assistant. Hosted providers work, as do local runners such as Ollama, LM Studio,
llama.cpp server and vLLM. Kingfisher sends the current labelled evidence packet
to that configured endpoint; no key ships with the app, and an unconfigured
assistant stays disabled without affecting the rest of the workstation.

---

## Scripts

| Command                                     | Purpose                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`                               | Development server on port 3210                                                 |
| `npm run build`                             | Production build                                                                |
| `npm test`                                  | Run the test suite                                                              |
| `npm run test:watch`                        | Tests in watch mode                                                             |
| `npm run test:e2e`                          | Playwright browser tests against a real dev server                              |
| `npm run test:e2e:ui`                       | The same suite in Playwright's interactive runner                               |
| `npm run benchmark`                         | The reproducible local benchmark group, with the environment in its output      |
| `npm run bench:sqlite`                      | SQLite companion import and query latency (needs a running companion)           |
| `npm run bench:pgn`                         | PGN parse throughput in browser-equivalent code                                 |
| `npm run bench:aggregates`                  | Filtered explorer, structure search and SQLite deletion at 100,000 games        |
| `npm run bench:rules`                       | The rules-engine replacement experiment (ADR 0028)                              |
| `npm run bench:preparation`                 | Dossiers, transposition graphs, the theory radar and journal analytics          |
| `npm run bench:player-search -- 500000`     | Player prefix and metadata search over a generated collection                   |
| `npm run bench:engines`                     | Native engine startup to `uciok`, `readyok` and a first line                    |
| `npm run bench:evidence`                    | Assembling and rendering a companion evidence packet                            |
| `npm run bundle:report`                     | Initial JavaScript per route, from a production build                           |
| `npm run smoke:lichess`                     | Opt-in live check that the Lichess API still matches the providers              |
| `npm run typecheck`                         | TypeScript, no emit                                                             |
| `npm run lint`                              | ESLint                                                                          |
| `npm run format`                            | Prettier                                                                        |
| `npm run format:check`                      | Verify formatting                                                               |
| `npm run engine:install`                    | Download the Stockfish WASM builds                                              |
| `npm run engines:install`                   | Install every engine for this platform (see [docs/ENGINES.md](docs/ENGINES.md)) |
| `npm run engines:digests`                   | Re-record the SHA-256 of every catalogue engine after adding or bumping one     |
| `npm run reference:build -- --pack starter` | Rebuild the bundled reference pack from the upstream archive                    |
| `npm run openings:build`                    | Rebuild the opening index from the vendored CC0 dataset                         |
| `npm run polyglot:constants`                | Regenerate the Polyglot book constants, verified against the published key      |
| `npm run companion`                         | Start the optional local companion                                              |

---

## Keyboard

The workspace is meant to be driven from the keyboard; press `?` in the app for
the full list, and to change any of them. Bindings below are the defaults.

|              |                                           |
| ------------ | ----------------------------------------- |
| `←` `→`      | Previous / next move                      |
| `↑` `↓`      | Previous / next variation                 |
| `Home` `End` | Start of game / end of line               |
| `E`          | Start or stop the engine                  |
| `D`          | Database explorer                         |
| `F`          | Flip the board                            |
| `1`–`6`      | Annotate `!` `?` `!!` `??` `!?` `?!`      |
| `C`          | Comment on this move                      |
| `⇧P` / `⇧M`  | Move variation up / promote to main line  |
| `⇧↑` `⇧↓`    | Reorder this variation among its siblings |
| `Delete`     | Delete this move and everything after it  |
| `X`          | Clear arrows and highlights               |
| `⌘Z` / `⇧⌘Z` | Undo / redo                               |
| `⌘S`         | Save this analysis to a study             |
| `⌘K`         | Command palette                           |

Every command except `Esc` can be rebound from the same dialog that lists them.
A binding already in use is reported before it is taken, with the choice to
replace it or cancel; `Esc` is fixed because it is the way out of every dialog
and out of focus mode.

On the board: right-drag draws an arrow, right-click highlights a square. Hold
`⇧` for red, `⌥` for blue, `⇧⌥` for yellow. In the notation window, right-click
any move for comments, glyphs, variation ordering and deletion.

---

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — layering, domain models, engine,
  database and persistence architecture, state, performance, testing.
- [`docs/adr/`](docs/adr) — short records of the decisions that shaped the
  codebase and why.
- [`docs/ENGINES.md`](docs/ENGINES.md) — the engines, their licences, how they
  are installed, and the obligations that come with them.
- [`THIRD_PARTY_ASSETS.md`](THIRD_PARTY_ASSETS.md) — every piece of artwork,
  who drew it, and under what licence.
- [`THIRD_PARTY_DATA.md`](THIRD_PARTY_DATA.md) — every chess _dataset_, its
  licence, what the build does to it, and — at greater length — the sources
  that were investigated and rejected for having no stated redistribution
  terms.
- [`docs/data/reference-packs.md`](docs/data/reference-packs.md) — the pack
  format, why it is sharded, what the filters exclude and why, and how to
  rebuild everything.
- [`docs/performance/phase-13-out-of-the-box.md`](docs/performance/phase-13-out-of-the-box.md)
  — measured board sizes before and after, cold start with the bundled
  reference installing itself, first explorer answer, pack build cost and route
  bundles.
- [`companion/README.md`](companion/README.md) — what the local companion does
  and its threat model.
- [`docs/performance/phase-9-preparation-and-scale.md`](docs/performance/phase-9-preparation-and-scale.md)
  — the transposition graph before and after it was measured, every Phase 9
  workflow path, the import regression Phase 8 recorded and how much of it came
  back, and what was deliberately not measured. `npm run bench:preparation`
  reproduces it.
- [`docs/performance/phase-8-study-and-research.md`](docs/performance/phase-8-study-and-research.md)
  — before-and-after measurements for the filtered explorer, structure search,
  SQLite deletion, the 20,000-node move tree, the explorer cache ceiling and
  the rules-engine experiment, plus what Phase 8 made slower and why.
  `npm run benchmark` and `npm run bench:sqlite` reproduce them.
- [`docs/performance/phase-7-speed-and-scale.md`](docs/performance/phase-7-speed-and-scale.md)
  — before-and-after measurements for opening aggregation, PGN import,
  main-thread responsiveness and route bundles, plus the performance budgets and
  what deliberately was not measured. `npm run benchmark` reproduces it.
- [`docs/performance/phase-6-companion-and-engines.md`](docs/performance/phase-6-companion-and-engines.md)
  — measured SQLite import and query latency at 10k and 100k games, native
  engine startup, and evidence-packet assembly. `npm run bench:sqlite`,
  `bench:engines` and `bench:evidence` reproduce them.
- [`docs/performance/phase-3-indexeddb.md`](docs/performance/phase-3-indexeddb.md)
  — measured 1k/10k/50k local-database behaviour and the thresholds it chose.
  `scripts/bench-indexeddb.js` reproduces the numbers in your own browser.

---

## Licensing note

This repository's own code carries no license header yet. The Stockfish builds
downloaded by `npm run engine:install` are **GPL-3.0-or-later** and are not
redistributed here; `chess.js` is BSD-2-Clause. If this project is ever
distributed as a binary bundling Stockfish, the GPL obligations apply to that
bundle and need a deliberate decision. See
[`docs/adr/0004-engine-architecture.md`](docs/adr/0004-engine-architecture.md).
