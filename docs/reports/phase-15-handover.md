# Kingfisher — Phase 15 handover

Written 5 September 2026, after the release gates and the completed GitHub
Actions run. This describes the whole product as it stands, not only what
Phase 15 changed. Where a number appears, the command that produced it is
named; where something was not measured, it says so.

---

## 1. Executive status

**What Kingfisher is.** A local-first chess research workspace that runs in a
browser, stores everything in IndexedDB, and reaches native engines and SQLite
collections through an optional companion process on the same machine. It
ships with its own reference database, its own opening index and its own
engine, so it is useful before anything is imported, connected or downloaded.

**Is Phase 15 complete?** The chess-substance goals are met and measured. The
one part of the brief that is not delivered is a high-rated _online_ reference
pack, and the reason is stated with numbers rather than filed as a limitation:
see §29. Everything else in Parts B through AE was either done or found not to
need doing, and the audit ledger in `docs/product/phase-15-audit.md` records
each item with its evidence.

**Can a strong player use it without external databases?** Yes, and this is now
a release gate rather than a claim. On a profile with zero games, zero accounts
and zero companion databases, `e2e/fresh-user.spec.ts` walks thirty plies —
fifteen full moves — of the commonest continuation, reads the opening identity
after _every_ ply, and requires statistics still to be rendering at the end. It
passes. Driven by hand, the Najdorf English Attack at move fifteen shows
thirteen games, two candidate moves with scores and average ratings, and two
openable elite model games (Firouzja–Vachier-Lagrave, Cheparinov–Duda).

**Could a professional use it as a primary study workstation?** For opening
work, engine work, repertoire and preparation — yes. Two things would still
send them elsewhere: no games before 2020, and no cloud engines. Both are
covered honestly in §28 and §29.

### The Magnus test, answered

| Question                                                                  | Answer                                                                                                                                                                                              |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explore theory 15–20 full moves deep without going empty or vague?        | **Yes.** Measured: the most-played chain runs 36 plies on the bundled pack and 41 on Elite and Recent Theory, where 41 is the build's own ply cap.                                                  |
| Compare elite OTB, recent theory and strong online practice?              | **Partly.** Elite OTB and Recent Theory are installed packs and are compared side by side, never merged. Strong online practice needs a connected Lichess account; there is no offline pack for it. |
| Reach model games from those positions?                                   | **Yes.** Every explorer position carries the strongest games that reached it, and they open on the board from the pack rather than a web link.                                                      |
| Compare their own repertoire against the reference?                       | **Yes.** Coverage is reported as the share of reference replies that are prepared, with the unprepared ones listed by frequency.                                                                    |
| Choose among several genuinely strong engines?                            | **Yes.** Five installable in one click on macOS arm64, all verified live; nine catalogued across platforms.                                                                                         |
| Compare engines without stale results?                                    | **Yes**, and it is a browser test: an engine stopped and restarted leaves no stale evaluation.                                                                                                      |
| Use a neural engine properly?                                             | **Not verified.** Lc0 is catalogued as a located engine, not a downloaded one, and was not live-tested this phase. No capability is claimed for it.                                                 |
| Are versions and settings attached to saved evidence?                     | **Yes.** A kept line stores the engine, its UCI-reported build, settings, depth, nodes and time.                                                                                                    |
| Use Kingfisher immediately?                                               | **Yes.**                                                                                                                                                                                            |
| Install large reference data in one click?                                | **Yes.** Elite OTB (339 MB) and Recent Theory (34 MB), resumable, verified, no file to find.                                                                                                        |
| Search millions of games comfortably?                                     | **Not proven at that scale.** The largest _real_ corpus measured is 407,538 games. A one-million-row player search was measured on synthetic metadata. See §25.                                     |
| Still use their own databases?                                            | **Yes.** PGN import, IndexedDB collections and companion-hosted SQLite are unchanged.                                                                                                               |
| Prepare, analyse, study, calculate and update repertoire without leaving? | **Yes.**                                                                                                                                                                                            |

---

## 2. Git and GitHub

|                 |                                                                    |
| --------------- | ------------------------------------------------------------------ |
| Repository      | `https://github.com/mardakurt/kingfisher` (private)                |
| Data repository | `https://github.com/mardakurt/kingfisher-data` (public, data only) |
| Branch          | `master`                                                           |
| Starting HEAD   | `5865656b9238e95b5243a14746daa5d51dce38f2`                         |
| Final HEAD      | `9b401d93864532879f210fd42fb37a15b14c9a40`                         |
| Commits         | 10                                                                 |
| `origin/master` | equal to local `master`                                            |
| Working tree    | clean                                                              |

Commits, oldest first:

```
e72f1a7  feat: index reference positions to twenty full moves
fbb8d51  feat: add a recent-theory reference, and serve packs where a browser can read them
57dfece  fix: stop a reference pack going stale, and from growing for ever
3adabda  feat: keep the opening name when the position outruns the last named one
0029a28  feat: expand the engine fleet, and pick a binary this cpu can actually run
6897e09  fix: never present a search the engine did not actually run
94141e1  test: make fifteen full moves on a fresh profile a release gate
e88700a  docs: record the phase 15 audit, with the commands behind every number
c9c87ac  docs: correct the fresh-install figures against the rebuilt packs
e07eea6  docs: record why the pruning threshold falls with depth
9b401d9  fix: reclaim pack storage without reading the pack
         docs: hand over Phase 15 with its evidence
```

The handover commit is documentation only; the last commit to touch
application code is `9b401d9`, and that is the tree the run in §27 gated.

Nothing was force-pushed. The data repository received two commits: Recent
Theory v1, and Elite OTB v2 with v1 withdrawn.

---

## 3. Route inventory

| Route            | Purpose                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `/`              | Entry; redirects into the workspace.                                                                                                      |
| `/recent`        | Recent work — open documents, pinned material, drafts recovered from a previous session.                                                  |
| `/analysis`      | The main workspace: board, move tree, engine, explorer, notes, and every other tool in one dock.                                          |
| `/openings`      | The opening library — search by ECO, name, nickname, move sequence or position, with statistics, transpositions and model games.          |
| `/opening-files` | Long-form opening documents assembled from positions, lines and games.                                                                    |
| `/studies`       | Studies and their chapters, with autosave, draft recovery and cross-tab revisions.                                                        |
| `/repertoire`    | Position-keyed repertoire decisions, coverage against reference populations, gaps and review state.                                       |
| `/preparation`   | Opponent preparation sessions: dossier, move orders, theory radar, game-day sheet.                                                        |
| `/players`       | Player library — reference identities plus a curated roster of 106 historical figures.                                                    |
| `/player/[id]`   | One player: career, openings by colour, results, and their games in the installed sources.                                                |
| `/games`         | Game lists across every enabled source, with filters and paging.                                                                          |
| `/model-game`    | One reference game opened on the board, with its provenance.                                                                              |
| `/databases`     | The data catalog: collections, transfers, cross-database search, duplicates, and the reference-source list with install and verification. |
| `/database`      | A single collection's detail view.                                                                                                        |
| `/review`        | Self-analysis and the decision journal, with concealment.                                                                                 |
| `/training`      | Training sets and spaced repetition.                                                                                                      |
| `/endgame`       | Endgame library and tablebase work.                                                                                                       |
| `/oauth/lichess` | The PKCE redirect target. Holds no token of its own.                                                                                      |
| `/dev`           | Internal diagnostics; not part of the product surface.                                                                                    |

---

## 4. Core architecture

**Chess domain.** `src/chess/` owns rules, FEN, SAN, PGN, the game tree,
evaluation, structure and themes. `chess.js` is used behind a `Position`
boundary and never leaks: `Position` is immutable, returns `Result` values
rather than throwing, and `advanceSan` exists so that parsing a hundred
thousand games does not construct and re-parse a board per move. A rules
feasibility experiment (`npm run bench:rules`) re-tests whether the boundary
still earns its keep; the current verdict is REJECT replacement, recorded with
its reasoning, because a direct `chess.js` loader does not preserve variations
or NAGs.

**Game tree.** Immutable, node-keyed, with variations, comments, NAGs and
annotations. Positions are identified by a canonical position key so that
transpositions converge without a special case.

**Board.** One rendering pipeline for every surface — the main board, previews,
PV previews, position setup and Play From Here — so a board bug is fixed once.

**Workspace.** A shared workspace context carries the position between routes;
one tool dock, eighteen tools, and layouts the user can switch.

**Persistence.** IndexedDB with a versioned migration chain, chapter write
revisions for cross-tab safety, drafts written before chapters, and an
integrity scan that reports what does not resolve and repairs only the
unambiguous. Reference packs live in the same database as content-addressed
chunks.

**Companion.** An optional local Node process that starts engine processes,
opens SQLite collections and forwards Syzygy probes. It is paired with a token;
it is the only path to anything the browser cannot do itself.

**Workers.** PGN parsing, position indexing and reference scanning run off the
main thread.

**Providers.** Every queryable thing — packs, collections, SQLite, Lichess,
Chess.com — is a `ChessDatabaseProvider`, and `useSourcesFor(capability)` is
the one function a surface uses to decide what to ask. Sources are never
merged.

---

## 5. Opening knowledge

Measured by `npm run bench:opening-depth`, dataset digest `7f89480db32abc46`.

|                         |                                                                          |
| ----------------------- | ------------------------------------------------------------------------ |
| Named positions         | 3,810                                                                    |
| Source                  | lichess-org/chess-openings, CC0, replayed through Kingfisher's own rules |
| Maximum depth           | 36 plies (18 full moves)                                                 |
| Median depth            | 9 plies                                                                  |
| Positions at ≥ 20 plies | 152                                                                      |
| Positions at ≥ 30 plies | 1                                                                        |
| Positions at ≥ 40 plies | 0                                                                        |
| ECO A                   | 817                                                                      |
| ECO B                   | 772                                                                      |
| ECO C                   | 1,250                                                                    |
| ECO D                   | 614                                                                      |
| ECO E                   | 357                                                                      |

**These numbers are the ceiling of the naming convention, not of Kingfisher.**
No open dataset names positions at move twenty, because chess does not name
them: the deepest formally named position anywhere in the published table is
eighteen full moves in, and half of all named positions are inside move five.
Rebuilding the index against a bigger source would not change that.

What Phase 15 changed is what happens _past_ that ceiling. Classification keys
on position, not move order, so transpositions converge and depth wins. The
deepest classified ancestor is retained and displayed as the _last_ classified
opening, with its ancestry made explicit — family on one line, qualifiers under
it:

```
B90   Last classified: Sicilian Defense
      Najdorf Variation → English Attack
```

Previously a position past the last named node showed nothing. The
classification ply cap that could miss a delayed transposition into a named
position is also removed.

Declared and computed metadata are both kept. A PGN's own `[ECO]` is never
overwritten; `attributeOpening` reports agree / differ / only-declared /
only-computed / unclassified, and compares on ECO rather than on names, because
"Ruy Lopez" and "Spanish Game" are the same opening and flagging that would
flag most of a normal import.

---

## 6. Opening Explorer

Six sources. None is ever merged with another; a statistic always names the
population it came from.

| Source                 | Type               | Licence       |   Games | Positions | Max ply | Filters                     | Full games            | Updates                              |
| ---------------------- | ------------------ | ------------- | ------: | --------: | ------: | --------------------------- | --------------------- | ------------------------------------ |
| Kingfisher Starter     | Bundled, offline   | CC BY-SA 4.0  | 172,376 |   246,870 |      40 | rating, year, recent window | 10,707                | With the application                 |
| Elite OTB              | One-click, offline | CC BY-SA 4.0  | 407,538 | 5,438,808 |      40 | rating, year, recent window | 407,538 — all of them | Versioned directory, check + install |
| Recent Theory          | One-click, offline | CC BY-SA 4.0  |  44,200 |   918,069 |      40 | rating, year, recent window | 18,151                | Versioned directory, check + install |
| Lichess Masters        | Online             | Lichess terms |       — |         — |       — | date                        | Links out             | Lichess                              |
| Lichess (rated online) | Online             | Lichess terms |       — |         — |       — | rating band, speed, date    | Links out             | Lichess                              |
| Lichess Player         | Online             | Lichess terms |       — |         — |       — | player, date                | Links out             | Lichess                              |
| Local collections      | Imported           | The user's    |       — |         — |       — | everything                  | Yes                   | The user                             |
| Companion SQLite       | Local              | The user's    |       — |         — |       — | everything                  | Yes                   | The user                             |

The three Lichess sources have required an authenticated request since April
2026 — verified again on 5 September 2026, when the unauthenticated masters and
lichess endpoints both returned HTTP 401. That is precisely why the packs
matter: without them a fresh profile has no explorer at all.

**Depth, measured** by `npm run bench:explorer-depth`, which replays 31
hand-written theoretical lines through the application's own rules:

|                          |  Starter | Recent Theory | Elite OTB |
| ------------------------ | -------: | ------------: | --------: |
| 10 plies (5 moves)       |   100.0% |        100.0% |    100.0% |
| 20 plies (10 moves)      |    64.5% |         54.8% |     74.2% |
| 30 plies (15 moves)      |    10.3% |          6.9% |     20.7% |
| 40 plies (20 moves)      |     0.0% |          0.0% |     25.0% |
| Median continuous answer | 22 plies |      21 plies |  24 plies |
| Most-played chain        | 36 plies |      41 plies |  41 plies |

**Read the last row, not the fourth.** The corpus was written from memory: it
is real theory for the first twelve to fifteen moves and _legal but not
necessarily topical_ after that, because illegal moves were repaired against
the rules engine rather than looked up. A miss at 30 plies can therefore mean
"the pack is shallow" or "nobody has played this exact move order", and the
benchmark says so in its own output. The 30- and 40-ply percentages are a
floor.

The most-played chain has no authoring risk in it: start from the initial
position, take whatever the pack says is the commonest continuation, repeat.
It is the literal experience of a player clicking the top row. Recent Theory
and Elite both run out at 41 plies, which is the build's own `maxPly` cap
rather than the end of their data; the starter's 36 is a real frequency limit.

**Presentation.** Move, games, frequency, White/draw/Black split, score,
average Elo, recent share, last played, and a trend — each shown only where the
selected source supports it. Trends are stated as facts ("share increased from
12% to 21%"), never as claims about what the main line now is. Model games sit
under the table and open on the board from the pack rather than linking out.

**Navigation.** Play a move, back, forward, breadcrumbs, opening root,
transposition routes, move comparison, model games, add to repertoire, create
training, save to study.

---

## 7. Reference databases

|                      | Starter                                                     | Recent Theory                         | Elite OTB                            |
| -------------------- | ----------------------------------------------------------- | ------------------------------------- | ------------------------------------ |
| Type                 | Bundled with the build                                      | One-click install                     | One-click install                    |
| Size                 | 12.3 MB, 88 chunks                                          | 33.8 MB, 80 chunks                    | 339.3 MB, 160 chunks                 |
| Games                | 172,376                                                     | 44,200                                | 407,538                              |
| Openable full scores | 10,707                                                      | 18,151                                | 407,538                              |
| Player identities    | 12,522                                                      | 2,567                                 | 33,607                               |
| Positions            | 246,870                                                     | 918,069                               | 5,438,808                            |
| Years                | 2023–2026 (36 months)                                       | 2024–2026 (24 months)                 | 2020–2026 (79 months)                |
| Rating population    | 2200+ or titled; full scores 2600+                          | 2400+ or GM/IM/WGM; full scores 2500+ | 2000+ or titled; full scores for all |
| Licence              | CC BY-SA 4.0                                                | CC BY-SA 4.0                          | CC BY-SA 4.0                         |
| Provenance           | Lichess broadcast archive, per-file SHA-256 in the manifest | as Starter                            | as Starter                           |

All three are the same pipeline over the same upstream; the difference between
them is a window and a threshold, not a different provenance story. Each
manifest carries its licence, the attribution string, the transformation
applied, and the SHA-256 of every upstream archive it read.

**What they are not.** Broadcast coverage is not a census of over-the-board
chess. A game is in these packs because somebody relayed it through Lichess.
The catalog rows say so rather than implying completeness, and no pack contains
a game played before 2020.

---

## 8. Data pipeline

```
monthly upstream archive
  → verify against the digest lichess.org publishes (not one we computed later)
  → decompress zstd frame by frame
  → parse PGN
  → reject: undecided result, too short, set-up position, non-standard
  → reject: any stated rating above 2900 — a species filter, not a quality one
  → reject: BOT titles, and explicit engine/online event labels
  → deduplicate by content hash (one game relayed twice appears twice upstream)
  → replay every move through Kingfisher's own Position
  → aggregate per position, with a second set of counters for the recent window
  → build the player table, merging spellings only on a shared FIDE identifier
  → shard by a hash of the key, gzip, write a manifest with a digest per chunk
  → publish to a versioned directory on the public data site
```

Two Phase 15 changes to the pipeline itself:

**The scan cache is fingerprinted only on limits the scan applies.** `minGames`
and its relatives are reduce-time thresholds; including them meant that trying
a different one re-parsed 3 GB of archives to produce byte-identical rows.
Retuning is now a one-minute reduce, which is what made the pruning
measurements in ADR 0046 affordable to make rather than guess. Completed scans
are cached per archive under `.archive-cache/` and survive interruption.

**The frequency threshold falls with depth.** See
`docs/adr/0046-a-frequency-threshold-that-falls-with-depth.md` for the decision
and the measured cost of each setting, including the one rejected on size.

Rebuilding is one command per pack. A full Elite build is about 45 minutes on
twelve cores with the archives cached, and needs roughly 5 GB of scratch space.

---

## 9. Engines

Produced by `npm run engines:verify` on macOS arm64 (Apple silicon, CPU
features `neon`), 5 September 2026. Every row below was installed from its
official release, checked against a digest committed to this repository,
launched, and asked what it could do.

| Engine      | Version | Licence          | Source             | Runs as            | MultiPV | WDL | searchmoves | Threads | Hash | Syzygy | UCI_Chess960 | Tested live         |
| ----------- | ------- | ---------------- | ------------------ | ------------------ | ------- | --- | ----------- | ------- | ---- | ------ | ------------ | ------------------- |
| Stockfish   | 17.1    | GPL-3.0-or-later | official-stockfish | WebAssembly Worker | yes     | yes | yes         | limited | yes  | no     | no           | yes, every CI run   |
| Stockfish   | 18      | GPL-3.0-or-later | official-stockfish | native             | yes     | yes | yes         | yes     | yes  | yes    | yes          | **yes**             |
| Stormphrax  | 8.0.0   | GPL-3.0-or-later | Ciekce             | native             | yes     | yes | yes         | yes     | yes  | yes    | yes          | **yes**             |
| Viridithas  | 20.0.0  | AGPL-3.0-only    | cosmobobak         | native             | **no**  | no  | **no**      | yes     | yes  | yes    | yes          | **yes**             |
| Halogen     | 16.0.0  | GPL-3.0-or-later | KierenP            | native             | yes     | no  | **no**      | yes     | yes  | yes    | yes          | **yes**             |
| PlentyChess | 8.0.0   | GPL-3.0          | Yoshie2000         | native             | yes     | no  | **no**      | yes     | yes  | yes    | yes          | **yes**             |
| Berserk     | 14      | GPL-3.0          | jhonnold           | native             | —       | —   | —           | —       | —    | —      | —            | no (no macOS build) |
| Koivisto    | 9.0     | GPL-3.0          | Luecx              | native             | —       | —   | —           | —       | —    | —      | —            | no (no macOS build) |
| Obsidian    | 16.0    | GPL-3.0          | gab8192            | native             | —       | —   | —           | —       | —    | —      | —            | no (no macOS build) |
| Lc0         | —       | GPL-3.0-or-later | LeelaChessZero     | native, located    | —       | —   | —           | —       | —    | —      | —            | **no**              |

A dash means the check was never run. It is deliberately not the same mark as
"no".

Binary digests recorded at install, e.g. Stockfish 18 on darwin-arm64:
`bc0cac905ecdf2147fe22055c733bcd999b1e3f7c399fbaf7fb9055786563590`.

**Platform matrix.** darwin-arm64, darwin-x64, linux-x64, linux-arm64 and
win32-x64 are each known per engine. Install is never offered where no
compatible artifact exists, and the row says which of the three reasons
applies: no build for this platform, no build published at all, or no verified
digest recorded.

**CPU capability selection.** Several projects publish generic, SSE4, AVX2,
BMI2, AVX512 and NEON builds of the same version, and installing the wrong one
is not a slow engine but a process that dies on an illegal instruction. The
companion reads the CPU's own feature flags — `/proc/cpuinfo` on Linux,
`sysctl machdep.cpu` on macOS, `neon` assumed on arm64 — and takes the fastest
build whose stated requirements it can prove are met. An unproven feature is
not consent: unknown means the generic build, or no Install button.

**Two licences were wrong and are corrected** against the projects' own
repositories: PlentyChess was recorded as MIT and is GPL-3.0; Viridithas was
recorded as AGPL-3.0-or-later and is AGPL-3.0-only.

**The version claim is real.** Native Stockfish is 18, confirmed by its own
`id name`. The browser build stays at 17.1 because that is what the WebAssembly
ecosystem publishes, and it is labelled 17.1 everywhere.

---

## 10. Neural engines

Lc0 is catalogued as a `system` engine: the project publishes no macOS or Linux
release asset Kingfisher can download, so it is _located_ on the machine
(`lc0` on the path) rather than installed, with per-platform instructions for
getting it.

**It was not live-tested this phase, and no capability is claimed for it.**
The row shows dashes rather than a capability table. Network weights are not
managed: there is no Installed / Recommended / Custom network picker, no weight
download and no checksum for one, so an Lc0 without weights would be an Lc0
that does not run. The catalogue does not show it as Ready on that basis — it
shows "Not on this machine" until the binary is found.

This is the largest engine-side gap and it is stated as one, not hidden.

---

## 11. Engine safety — the actual trust boundary

Three levels, and the wording is deliberate.

- **Browser** — the WebAssembly build in a Web Worker. Sandboxed by the
  browser, which is a real sandbox.
- **Managed** — an engine Kingfisher downloaded, digest-checked and installed.
  **Not sandboxed.** It is an ordinary native process with the user's
  permissions. The trust panel says exactly that, and a test asserts the words
  are still there. A SHA-256 proves the bytes match what was recorded; it is
  not a signature and does not establish who built them.
- **Custom** — a binary the user pointed at by path. Same absence of a sandbox,
  plus no digest anybody recorded.

Downloads are bounded (512 MiB) and extracted with an explicit member name, no
shell and no wildcards. An engine that fails its UCI conversation is discarded
from its staging directory and never registered; a failed update never removes
the working engine it was replacing.

---

## 12. Engine analysis features

Presets map to transparent settings and nothing else — there is no "Grandmaster
mode". MultiPV, candidate comparison via `searchmoves`, PV preview that
advances without moving the main board, a background analysis queue that is
resumable and yields to interactive work, two-engine comparison with agreement
and PV divergence reported, and Play From Here isolated from the analysis until
the user asks to analyse it.

**Kept evidence** stores the engine id, the name the engine reported over UCI
(which carries the build), settings, search limit, MultiPV, any `searchmoves`
restriction, depth, nodes, time and a timestamp. A number you can still
interpret in a year, rather than a bare `+0.34` in a comment.

**Engines never play from their own book.** `setoption name OwnBook value
false` goes to every engine that declares it, at session construction, before
any caller configuration — because a book move arrives instantly with no search
behind it and the panel would report it as an evaluation at depth 0.

**The Phase 15 correctness fix.** Kingfisher assumed every UCI engine honoured
`searchmoves`. Three of the five installable on macOS do not. Candidate
comparison would therefore have run a search of the whole position and
presented it as a comparison of the moves the user chose. Now the capability
comes from the companion's own measurement, _and_ the session checks the move
that came back against the moves it asked about — because an engine can accept
the restriction and ignore it silently, and only the answer proves what
happened. The panel says which occurred.

---

## 13. Databases

IndexedDB collections and companion-hosted SQLite, presented as one catalog.
Copy, move, merge and dedupe between them; merge previews the overlap before
writing; move deletes from the source only after the destination confirms it
holds the games. Federated search across every enabled source, with player,
position, structure, strategic-theme and text search, saved filters, and an
integrity scan that reports what does not resolve.

Phase 15 changed one thing here, and it was a bug: the orphan scan read _every
chunk of every installed pack_ to produce a list of pack ids — 340 MB of
deserialisation on a machine with Elite installed. It now reads keys.

**Backups** contain user-authored data and configuration: studies, chapters,
drafts, repertoires, training, reviews, decisions, model-game links, study
references, the analysis queue, engine evidence and linked accounts, with games
as an opt-in. Reference packs are deliberately excluded — they are hundreds of
megabytes of reproducible data. Secrets are excluded by an allow-list with a
test that fails if a preference whose name looks like a credential is added.

---

## 14. Player and preparation

The player library holds every identity in the installed sources plus a curated
roster of 106 historical figures — the championship lineage from Steinitz to
Gukesh, the women's lineage from Menchik to Ju Wenjun, and twenty-five players
from before FIDE existed. Where a roster entry has no games in the installed
packs, the page says none rather than hiding the person: the open archive
begins in 2020, and Morphy is in the catalog with nothing behind him.

Identity merging follows one rule: two spellings become one player only when
the archive recorded the **same FIDE identifier** against both. That is the
source stating they are one person, not Kingfisher guessing from a resemblance.
A name appearing with two different identifiers keeps neither.

Preparation gives an opponent dossier, opening usage by colour, move-order
fingerprints, a theory radar over three windows, a game-day sheet and
favourites.

---

## 15–19. Repertoire, studies, review, training, endgame

**Repertoire** is keyed on position, so transpositions converge. Decisions
carry roles, coverage against a chosen reference population, gaps ranked by how
often the reference plays them, preparation priorities, review state, cross-tab
revisions and export. Coverage is stated factually — the share of reference
replies that are prepared, with the unprepared ones listed by frequency — and
there is no single mysterious health score.

**Studies** have chapters, autosave, draft recovery, cross-tab revisions,
references, exports and Position Report integration. A chapter carries a write
revision, so two tabs cannot silently overwrite one another and a refused write
offers to fork rather than lose. The draft is written before the chapter, so a
failed write does not take the session with it.

**Review and calculation** cover self-analysis, the decision journal,
concealment, the calculation tree, blindfold work, critical positions and
review scheduling.

**Training** covers training sets, spaced repetition, scheduling and analytics.

**Endgame** covers the endgame library and Syzygy tablebases. Capability is
derived from the files present rather than from a setting: pointed at a
directory, the companion reads which material configurations exist and reports
the real piece limit, and says when DTZ is unavailable even though WDL is not.
Kingfisher does not implement Syzygy decompression itself — the probe is
delegated, because a silently wrong endgame assessment is the worst possible
bug in a tool whose claim is that a tablebase result is proof.

---

## 20. Online integrations

|                          | Status                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lichess authentication   | OAuth 2.0 with PKCE, no token to paste, no scopes requested. Live-tested in earlier phases; not re-tested this phase.                            |
| Lichess opening explorer | Requires an authenticated request. **Re-verified 5 September 2026**: the unauthenticated `masters` and `lichess` endpoints both return HTTP 401. |
| Lichess game sync        | Reuses the import pipeline. Not live-tested this phase.                                                                                          |
| Chess.com sync           | Username only, public API, and months that have not changed are not re-downloaded. Not live-tested this phase.                                   |
| Tablebase                | Local Syzygy through the companion; remote lookups have a deadline and a truthful failure.                                                       |
| Offline                  | A browser test switches the network off and requires the explorer to keep answering from the installed pack. It passes.                          |
| Rate limits              | `Retry-After` is parsed and surfaced; a rate-limited explorer says so and does not empty the workspace.                                          |

The authenticated Lichess smoke test lives outside CI as an opt-in script, on
purpose: CI installs no credentials.

---

## 21. Appearance

Unchanged from Phase 14 by policy. Twelve board themes, ten piece sets, all
with licences recorded; a compact professional design system of rows rather
than cards; responsive layouts from mobile to large desktop, with the board the
largest thing on the screen at every width. The Phase 15 data and engine rows
use the existing system — `/databases` is a list of facts, not a marketplace.

The only visual change this phase is the explorer's opening line, which now
carries two lines instead of one so that a deep variation's qualifier is
readable rather than truncated. The visual gate passed unchanged otherwise.

---

## 22. Past-phase audit

Verified this phase by running the suites that cover each area and by driving
the product by hand. "Regression found" means something that was broken before
Phase 15 started, or that Phase 15 broke and then fixed.

| Phase | Major capability                                              | Verified                   | Regression found                                              | Fix                                                                                                                           |
| ----- | ------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1     | Board, rules, game tree, PGN                                  | yes — unit + browser       | no                                                            | —                                                                                                                             |
| 2     | Studies, chapters, autosave, drafts                           | yes — browser              | no                                                            | —                                                                                                                             |
| 3     | IndexedDB persistence and migrations                          | yes — unit + browser       | no                                                            | —                                                                                                                             |
| 4     | Engines, artwork, scale                                       | yes — browser + live fleet | **yes** — every native engine assumed to honour `searchmoves` | Capability measured and the result checked                                                                                    |
| 5     | One workspace, shared position, tool dock                     | yes — browser              | no                                                            | —                                                                                                                             |
| 6     | Cross-tab safety, integrity, diagnostics, CI                  | yes — browser              | no                                                            | —                                                                                                                             |
| 7     | Performance and scale                                         | yes — `npm run benchmark`  | no                                                            | —                                                                                                                             |
| 8     | Study and research tools                                      | yes — browser              | no                                                            | —                                                                                                                             |
| 9     | Preparation and scale                                         | yes — browser              | no                                                            | —                                                                                                                             |
| 10    | Review, calculation, training                                 | yes — browser              | no                                                            | —                                                                                                                             |
| 11    | Release-candidate hardening, migration fixtures               | yes — unit                 | no                                                            | —                                                                                                                             |
| 12    | Player identity, competitor gap analysis                      | yes — browser              | no                                                            | —                                                                                                                             |
| 13    | Out-of-the-box: bundled pack, engine installs, player library | yes — browser + by hand    | **yes**, four                                                 | Catalog advertised the wrong depth; pack URL had no CORS; the bundled pack never updated; the browser engine was listed twice |
| 14    | Professional visual finish, visual gate                       | yes — visual gate green    | no                                                            | —                                                                                                                             |

Phase 13's four are the substantive ones and are described in §23.

---

## 23. Bugs found beyond the explicit brief

Ordered by how badly each could mislead somebody reading Kingfisher's output.

1. **Engines were assumed to honour `searchmoves`.** Three of five ignore it.
   Candidate comparison would have shown a whole-position search as a
   comparison of the user's chosen moves. Fixed at two levels: measured
   capability, and a post-hoc check of the move that came back.
2. **The bundled reference never updated.** It installed only when missing, so
   a profile created before a rebuild kept answering from older, shallower data
   while this build's own pack sat unused in its assets. Nothing was broken
   enough to say so. Fixed by comparing the shipped manifest's version at
   start-up.
3. **Pack storage grew without bound.** An update wrote a whole new generation
   of content-addressed chunks and nothing removed the old one — 340 MB per
   update, for ever. Fixed by reclaiming at start-up, where no live reader can
   hold a superseded generation.
4. **Reclaiming read what it was freeing.** The first version of the fix asked
   the index for the chunk _records_ to read their ids, deserialising twelve
   megabytes on every page load. It took CI's browser down twenty-five times.
   Fixed with a keys-only index read; the orphan scan and pack removal had the
   same shape and were fixed with it.
5. **The catalog advertised the wrong depth.** The starter row said 29 plies
   for a pack rebuilt to 40. The test that was supposed to catch this
   hard-coded the same numbers; it now asserts the row against the manifest the
   build actually ships.
6. **The browser engine appeared twice in Settings** — once as its own row,
   once in the companion's catalogue marked permanently unavailable.
7. **Three Windows-only engines appeared in a Mac user's engine selector**, and
   erroring on selection was the only way to find out.
8. **Going offline turned every pack row red.** A failed update check was
   reported as a fault in the pack. Nothing had been learned, so nothing should
   have been claimed.
9. **`--reuse-scan` was parsed and never read** — an advertised build flag that
   did nothing.
10. **The scan cache was fingerprinted on limits the scan does not apply**, so
    retuning a frequency threshold re-parsed 3 GB of archives to produce
    byte-identical rows.
11. **The README quoted data counts that were three artifacts out of date.**

---

## 24. Performance

All figures from this machine (Apple silicon, `node v24.14.0`, darwin-arm64) on
5 September 2026, by the command named.

| Measurement                                                    | Result                                                                  | Command                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------- |
| Explorer shard read, Elite (2.3 MB compressed → 6.4 MB)        | 15 ms gunzip + 14 ms index, 54,896 rows                                 | direct measurement                |
| Explorer query, cold shard                                     | ~30 ms plus digest verification                                         | derived from the above            |
| Evidence packet assembly                                       | 0.004 ms median, 0.503 ms worst                                         | `bench:evidence`                  |
| Explorer aggregate insert, 100k games / 1M positions           | 10,039.9 ms                                                             | `bench:aggregates`                |
| Hot position via aggregates                                    | 0.0 ms median, 0.2 ms worst                                             | `bench:aggregates`                |
| Elo ≥ 2400 filtered query                                      | 2.6 ms median                                                           | `bench:aggregates`                |
| Same-pawn-skeleton search                                      | 34.7 ms median                                                          | `bench:aggregates`                |
| PGN parse, 100k games (26.1M chars)                            | 36,172.9 ms — 2,764 games/s                                             | `bench:pgn`                       |
| Import, 10k games                                              | 3,105 ms — 3,221/s                                                      | `bench:collections`               |
| Copy 10k games                                                 | 3,488 ms — 2,867/s                                                      | `bench:collections`               |
| Merge preview, 10k                                             | 18 ms                                                                   | `bench:collections`               |
| Duplicate search, 20k games                                    | 23 ms                                                                   | `bench:collections`               |
| Opponent dossier                                               | 4.8 ms                                                                  | `bench:preparation`               |
| Transposition routes to one position                           | 54.0 ms at scale                                                        | `bench:preparation`               |
| Player search, 1M synthetic rows                               | exact 44.2 ms median / 921 ms p95; text 70.1 ms median / 1,074.2 ms p95 | `bench-player-search.mjs 1000000` |
| Large tree, 20k nodes                                          | create/save 88.5 ms, render 338 ms, navigation 164 ms                   | browser                           |
| Heaviest route bundle                                          | `/review`, 350.6 kB gzipped over 21 scripts                             | `bundle:report`                   |
| Total client JavaScript                                        | 3,186.4 kB across 95 files, including every lazily loaded chunk         | `bundle:report`                   |
| Ten-cycle soak heap                                            | 70.6 MB; 1 worker, 1 observer, 16 listeners, 0 intervals                | `e2e/soak.spec.ts`                |
| Pack install, Recent Theory 33.8 MB over the public Pages site | ~25 s including verification, cancel and resume                         | by hand                           |
| Full unit suite                                                | 4.0–5.7 s                                                               | `npm test`                        |
| Full browser suite                                             | 8.5 minutes locally, 17–18 minutes on CI                                | `npm run test:e2e`                |

The soak heap figure is worth one line of context: it was 84.1 MB before the
reclamation fix and 70.6 MB after, which is the same regression that was
crashing CI, visible from the other end.

Reference data is outside the JS bundle entirely — it is fetched as static
assets and stored in IndexedDB — so growing the bundled pack by 30% cost the
first paint nothing.

---

## 25. Scale — exactly what was measured

|                                | Largest measured                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| Real game database, end to end | **407,538 games** with full scores (Elite OTB), built, published, installed and queried |
| Position index                 | **5,438,808 positions** (Elite OTB)                                                     |
| Reference pack                 | **339.3 MB** in 160 chunks                                                              |
| Games parsed in one run        | 1,186,338 seen, 409,278 kept (the Elite scan)                                           |
| Synthetic player-search rows   | 1,000,000 metadata rows                                                                 |
| Local collection benchmarks    | 100,000 games / 1,000,000 indexed positions                                             |
| Game tree                      | 20,000 nodes                                                                            |

**No extrapolation.** The brief asked for a million real games and that is not
what was measured. 1,186,338 games were _parsed_ during the Elite build, and
407,538 of them survived the filters into a queryable pack. The million-row
player search used synthetic metadata with minimal scores and is reported as
such. Nothing here supports a claim about ten million games.

---

## 26. Tests

|                      |                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit and integration | **1,641 passing, 11 skipped**, across **121 files**                                                                                                                   |
| Browser (Playwright) | **155 passing**, zero retries, 8.5 minutes locally                                                                                                                    |
| Visual               | 22 compositions across six viewports and both themes, gated on Linux baselines                                                                                        |
| Property / fuzz      | `src/chess/fuzz.test.ts` plus the rules feasibility experiment                                                                                                        |
| Migration            | historical schema fixtures through every version to `DATABASE_VERSION`                                                                                                |
| Engine               | `npm run engines:verify` — the whole fleet installed and interrogated live                                                                                            |
| Data pack            | manifest validation, transactional install, cancel, resume, digest mismatch, truncation, quota, update, reclamation, and a test that reclamation does not deserialise |
| Soak                 | ten-cycle workload with worker, observer, listener, interval and cache accounting                                                                                     |
| Typecheck            | clean                                                                                                                                                                 |
| Lint                 | clean                                                                                                                                                                 |
| Format               | clean                                                                                                                                                                 |
| Build                | clean                                                                                                                                                                 |
| `git diff --check`   | clean                                                                                                                                                                 |

New this phase: `src/engine/uci-session.test.ts`, `src/engine/registry.test.ts`,
`src/reference/manager.test.ts`, `src/reference/catalog.test.ts`,
`companion/src/cpu.test.mjs`, `scripts/reference/pipeline.test.mjs`, the deep
fresh-profile browser gate, and three additions to
`src/reference/install.test.ts`.

One note on method. The reclamation-cost test was written, seen to pass, and
then **verified by reverting the implementation to check that it fails**. It
did not fail on the first attempt — the assertion was targeting a call that a
formatting change had moved — so the test was worthless until that was found.
A test of this shape is worth nothing until it has been seen to fail.

---

## 27. CI

Final completed run: **[33957319432](https://github.com/mardakurt/kingfisher/actions/runs/33957319432)**, commit
`9b401d93864532879f210fd42fb37a15b14c9a40`.

| Job                                                       | Result                        | Duration |
| --------------------------------------------------------- | ----------------------------- | -------- |
| Quality (typecheck, lint, format, unit tests, whitespace) | **success**                   | 2:05     |
| Production build                                          | **success**                   | 0:57     |
| Visual gate (Linux)                                       | **success**                   | 2:33     |
| Browser tests                                             | **success** — 155 passed      | 18:11    |
| Visual baselines (Linux)                                  | skipped (generated on demand) | —        |

**Retries: 0.** No test in that run passed on a second attempt; the suite
reports `155 passed (17.3m)` with no flaky line.

The run before it, [33955503716](https://github.com/mardakurt/kingfisher/actions/runs/33955503716),
failed with 25 browser tests dying rather than asserting — 20 of them reporting
"Target page, context or browser has been closed". That was the reclamation
regression in §23.4, which local runs could not reproduce because this machine
had the memory to absorb it. The soak test's heap figure caught it from the
other end once the fix was in: 84.1 MB before, 70.6 MB after.

Playwright retries stay at **0** for the release workflow, unchanged: a browser
test green only on its second attempt is flaky, and flaky-but-green is not a
passing gate. `e2e-diagnostic.yml` is the separate, non-gating, manually
triggered workflow that runs the same suite _with_ retries, for telling "flaky"
apart from "broken" without weakening the gate. The Phase 14 visual gate is
intact and passed unchanged.

---

## 28. Competitor gap analysis

Against **ChessBase 18** with Mega Database, **En Croissant 0.15**, and
**ChessMonitor**, as documented by each at the time of writing. The bar for
"stronger" is deliberately high: having a checkbox for the same concept is not
stronger.

| Capability                                  | ChessBase                           | En Croissant                 | ChessMonitor      | Kingfisher                                                | Verdict                                                                 |
| ------------------------------------------- | ----------------------------------- | ---------------------------- | ----------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| Reference data out of the box               | Mega Database, ~10M games, paid     | None bundled; user downloads | Own online data   | 172k games bundled, 407k one click                        | **Kingfisher stronger** on setup; **weaker** on total size              |
| Historical games (pre-2020)                 | Complete                            | Whatever the user finds      | Online only       | **None**                                                  | **Kingfisher weaker**                                                   |
| Opening explorer depth                      | Deep                                | Depends on the user's file   | Shallow           | 20 full moves indexed, measured                           | Equivalent                                                              |
| Multi-source comparison without merging     | Merges freely                       | Per-database                 | n/a               | Never merged; each statistic names its source             | **Kingfisher stronger**                                                 |
| Recency as its own population               | Filters a big base                  | Filters                      | Recent by design  | A separate pack, labelled as a recency source             | Different by design                                                     |
| Engine breadth                              | Fritz family + any UCI              | Any UCI, with a downloader   | None              | 9 catalogued, 5 one-click on macOS, capabilities measured | Equivalent to En Croissant; **stronger** than ChessBase on transparency |
| Engine capability detection                 | Table-driven                        | Reads options                | n/a               | Asked, measured and re-checked in the answer              | **Kingfisher stronger**                                                 |
| Cloud / remote engines                      | Sold                                | No                           | No                | **No**                                                    | **Kingfisher weaker**                                                   |
| Analysis evidence you can re-read in a year | A number in a comment               | PV storage                   | n/a               | Engine, build, settings, limit, depth, nodes, time        | **Kingfisher stronger**                                                 |
| Repertoire training                         | Yes                                 | Yes                          | Yes               | Position-keyed, transposition-aware, factual coverage     | Equivalent                                                              |
| Player preparation                          | Strong                              | Basic                        | Strong analytics  | Dossier, move orders, theory radar, game-day sheet        | Equivalent                                                              |
| Player analytics                            | Good                                | Basic                        | **Best in class** | Good                                                      | **Kingfisher weaker** than ChessMonitor                                 |
| Database management                         | Deep and old                        | Good                         | n/a               | Copy, move, merge, dedupe, federated search, integrity    | Equivalent                                                              |
| Database conversion / interop               | CBH, PGN                            | Own SQLite, PGN              | n/a               | PGN and companion SQLite; **no En Croissant adapter**     | **Kingfisher weaker**                                                   |
| Opening books (Polyglot/CTG)                | CTG                                 | Polyglot/PGN/EPD             | No                | Polyglot `.bin`, kept apart from the explorer             | Equivalent                                                              |
| Position setup / play from position         | Yes                                 | Yes                          | No                | Yes, isolated until asked to analyse                      | Equivalent                                                              |
| Batch / background analysis                 | Yes                                 | Yes                          | No                | Resumable queue that yields to interactive work           | **Kingfisher stronger**                                                 |
| Puzzles and gamified training               | Yes                                 | Some                         | Yes               | Deliberately not built                                    | Different by design                                                     |
| Ease of setup                               | Install, licence, download database | Install, then find data      | Sign up           | Open it                                                   | **Kingfisher stronger**                                                 |
| Offline use                                 | Yes                                 | Yes                          | **No**            | Yes, and it is a browser test                             | **Kingfisher stronger** than ChessMonitor                               |
| Cost                                        | Paid, recurring for data            | Free                         | Subscription      | Free                                                      | **Kingfisher stronger**                                                 |
| Platform                                    | Windows (Mac limited)               | Desktop app                  | Web               | Any modern browser; companion optional                    | **Kingfisher stronger**                                                 |

**En Croissant interoperability was investigated and not implemented.** Its
SQLite schema is public, so an adapter is feasible, but it was not written and
therefore not tested against a real database, and claiming compatibility that
has never been run against real data is exactly the kind of claim this project
avoids. It is the highest-value remaining interop item.

---

## 29. Known limitations

Genuine remaining limits. Nothing that Phase 15 was asked for and skipped is
hidden here — the open items from the brief are in the audit ledger and are
repeated below where they belong.

1. **No games before 2020.** The open archive Kingfisher builds from begins
   there, and no collection of classic games with clear redistribution terms
   was found. The player catalog contains Morphy with nothing behind him and
   says so. The pack format is ready for a Classics or World Champions pack;
   nothing will be fabricated to fill it.
2. **No high-rated online reference pack.** Lichess publishes the data openly
   under CC0, but as monthly dumps of every rated game: one recent month is
   **29.05 GB compressed**, downloading at a measured **11.85 MB/s** — 41
   minutes of transfer — and carrying over 100 million games to parse before
   filtering to the 2200+ subset. That is a build machine with a schedule, and
   the pipeline needs only a source entry, a pack definition and a rating
   filter to do it. In the meantime the Lichess explorer's `lichess` database
   answers the same question live for a connected account, listed as its own
   source rather than folded into a pack.
3. **Lc0 is not live-tested and its networks are not managed.** No capability
   is claimed for it, and it shows as "Not on this machine" until located.
4. **No Chess960.** The rules code assumes the standard castling squares. This
   is now recorded as unsupported rather than left ambiguous, and each engine's
   `UCI_Chess960` support _is_ measured and stored, so adding it later is a
   question about Kingfisher rather than a survey of binaries.
5. **No cloud or remote engines.** There is a provider boundary that a remote
   UCI service would fit, and deliberately no disabled UI pretending otherwise.
6. **A million real games is not proven.** The largest real corpus measured end
   to end is 407,538 games. See §25.
7. **Backups do not carry reference-pack metadata.** They correctly exclude the
   hundreds of megabytes of pack data, but they also do not record _which_
   packs were installed, so a restore cannot offer to reinstall them. The
   catalog shows them as installable, which covers the case in practice but is
   not the same thing.
8. **No En Croissant database adapter.** See §28.
9. **The deep end of the explorer benchmark is a floor, not a measurement.**
   The hand-written corpus is topical for twelve to fifteen moves and legal
   thereafter. The most-played-chain metric alongside it has no authoring risk
   and is the one to read.
10. **Only the bundled pack updates itself.** Elite and Recent Theory require a
    check and a click, on purpose — they are large downloads and that should be
    the user's decision.

---

## 30. Recommended next steps

Three, in order.

1. **Field-test it, rather than adding to it.** Kingfisher now has enough depth
   that the next real information comes from a strong player using it for a
   fortnight of actual preparation, not from another feature. The specific
   things to watch: whether 20 full moves is deep enough in practice, whether
   Elite's 339 MB is an acceptable download, and whether "Last classified"
   reads correctly to somebody who did not implement it.
2. **Build the high-rated online pack on a build machine.** It is the one
   substantial data gap, the pipeline already does everything it needs except
   the download, and it is what would let a player compare elite OTB against
   strong online practice offline. It is a scheduled job, not a design problem.
3. **Write the En Croissant SQLite adapter and test it against a real
   database.** The highest-value interoperability item, and the one that makes
   switching to Kingfisher cost nothing for the users most likely to try it.

What not to do next: add features to make the list longer. The Magnus test is
not whether Kingfisher has more menu items than ChessBase. It is whether
leaving it would make a player's preparation worse — and the honest answer, for
opening work and engine work, is now yes.
