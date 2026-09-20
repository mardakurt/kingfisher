# Phase 74 handover — the reset control's name, and the Team hub

Two owner requests on 2026-09-20, after 1.2.5: a button whose label said the
opposite of what it did, and a "mutual analysis hub" for teams, academies
and a player with their seconds — with research first, and a design precise
enough to build. Both were built the same day on the maintainer's Mac from
`c454702` (the 1.2.5 handover). Order: the relabel first, because it is
four strings and separable; the hub last, because it adds a schema version,
a route, a domain module and a browser spec, and needed the research read
before a line was written.

## 1. Orientation

`git status` clean, `HEAD` = `origin/master` = `c454702`. The Phase 73
handover read; its gates re-run before editing (typecheck, lint, format,
3,134 unit tests, `docs:check` 344/344).

## 2. The reset control (enhancement 1)

`clearMoves()` in `src/stores/analysis-store.ts` truncates after the root and
moves the cursor to it: what survives is the tree's _starting_ position (the
initial one, or a set-up FEN), never the one on screen. "Clear the move tree
(keep this position)" therefore described the one thing the button does not
do. The behaviour is untouched; the label is now **"Clear the move tree —
back to the starting position"** in the four places it appeared — the
Position menu (`position-actions.ts`), the Analysis document menu
(`Toolbar.tsx`), the command palette (`useCommands.ts`) and the board
control (`BoardControls.tsx`), whose toast now says the same. `features.md`
§1 corrected. `e2e/team.spec.ts` clicks it by the new name and asserts the
moves are gone.

## 3. The Team hub (enhancement 2)

The research (four accounts of seconds' and coaches' practice, with sources),
the decisions and the design are in **`docs/design/team-hub.md`**; the
feature inventory entry is in `docs/product/features.md`. The short form:

- **Model** (`src/persistence/domain.ts`, schema **v18**, stores `teams`
  and `assignments`): a team is members with roles (labels, not
  permissions) and a local-only `me`; an assignment is a brief, a kind, an
  assignee, a due date and an **append-only thread of handovers** — hand-in,
  review (with a verdict), note — each with author, time, note, the board as
  **PGN** and an **evidence** summary derived from the tree (which engines
  evaluated how many positions at what depths). Status is derived from the
  thread, never stored. Both stores are in `PORTABLE_STORES`.
- **Packet** (`src/team/packet.ts`): the team and its work as a file;
  refused whole if any record is malformed or any board fails to replay
  through Kingfisher's rules; merged by union of handovers, newer copy for
  the assignment as set, union of the roster, `me` preserved; committed in
  one transaction with revision checks (`applyMerge`), recomputed once on a
  stale copy.
- **Route** `/team` (`src/features/team/`): one `WorkspaceFrame` — a rail in
  three columns (_To do_, _Handed in_, _Accepted_), the canonical board, a
  _Thread_ context panel whose first button depends on your role, header
  actions _New assignment_, _Share packet_, _Receive packet…_, _Members…_,
  _New team_. Engine snapshots are kept in the tree here as on Analysis.
- **The cloud-account question.** The owner asked how hard a Kingfisher
  account would be. Answer given: 8/10 — identity is cheap (Lichess PKCE
  exists), but there is no database, a two-way sync of authored work is a
  multi-phase effort, and `/privacy`, `/security` and `features.md` §13
  promise no account. The owner chose local-first with the packet; the
  merge is built so a transport that moves packets automatically needs
  nothing here to change.

### Found while building

- **Engine snapshots were Analysis-only.** `useEngineSnapshots` is mounted
  in `AnalysisWorkspace` alone, so on every other board route a settled
  search never reached the tree. Driving the hub in the browser, a review
  after Stockfish reached depth 28 said "no engine evaluations recorded" —
  true and useless. The Team route now mounts the hook; the frame does not
  (Review withholds evidence until a decision is committed by design).
- **An async-shaped method that threw synchronously.** The first
  `addHandover` validated its input before returning a promise, so a refused
  hand-in escaped every `.catch`; the repository test caught it. Now
  `async`, rejections only — the Phase 73 IDB-wrapper lesson, again.
- **The header fold at 1280 px** puts _Members…_ and _New team_ behind
  "More actions"; the spec reaches route actions through a helper that
  looks in the row first and the menu second.

### Driven in the browser (dev server, 1440 × 900)

Create team → Members (add Ana) → New assignment (for Ana, due 25 Sep) →
_This is me: Ana_ → 1.e4 e5 → Hand in ("3 positions · no engine evaluations
recorded") → _This is me: Coach_ → Clear the move tree (toast: "back to the
starting position") → Open on board (strip: "Round 3 game — Ana's hand-in,
20 Sept") → Engine to depth 27, stopped → Accept ("1 of 3 positions
evaluated · Stockfish 18 Lite WASM Multithreaded, depth 27") → Share packet
(`Academy-U16-2026-09-20.kingfisher-team.json`, 3.2 kB). No console
errors at any step. The receive side needs a file chooser the pane cannot
drive; it is exercised by the spec below.

## 3a. The second pass — used as a coach and as a student

The owner asked for the hub to be used as a real user would, and for it
to become a professional's first choice. The walk (dev server, 1440 × 900,
then the deployed site) found eleven rough edges; each is fixed and each is
in `e2e/team.spec.ts`:

1. **Merge defect.** `mergeAssignment` copied only the fields the newer
   copy _had_, so un-archiving, clearing a due date or removing an
   assignee never propagated through a packet; a stale `archived: true`
   stayed forever. The newer copy now sets the assignment whole.
2. No _Unarchive_. Added.
3. The action box scrolled with the thread. Pinned under it.
4. _Open on board_ replaced unsaved analysis silently. It asks, when the
   board holds moves that were not opened from the thread and belong to no
   saved document.
5. Nothing survived a reload and nothing said what was new. The team and
   thread you had open are remembered on the device; a row whose latest
   handover is somebody else's and later than your last look carries a dot
   and counts in its column heading.
6. "3 positions" said nothing about the work. The evidence line now leads
   with moves, variations and comments.
7. No path into ChessBase. _Copy PGN_ on every handover.
8. A packet dropped on the Mac window went to the PGN opener. The route
   receives a dropped `.json` itself and stops the window handler.
9. The subtitle truncated at 1440 px. Shortened.
10. "Who are you?" sent the person to a dialog. One select and _That's me_,
    in place, wherever the answer is missing.
11. An empty board disabled _Hand in_ with a tooltip. It now says so and
    offers _import a PGN_.

And two bridges for the professional case: an **opponent** assignment
carries the opponent and the player's colour, with _Open in Preparation_
(the dossier) one click away — and the second's file, opened on the board,
meets _Add to game-day sheet_ in the Position menu; and **_Hand in to the
team…_** in the Position menu on every board route, since the board is one
store.

## 4. Verification — `docs/operations/after-a-fix.md`, section A

```
A1   npm run typecheck            exit 0
A2   npm run lint                 clean
A3   npm run format:check         All matched files use Prettier code style
A4   npm test                     265 files, 3167 passed, 0 skipped
     npm run test:no-skips        No prohibited skip constructs
A5   npm run docs:check           344/344 checks passed
A6   git diff --check             clean
     npm run build                Compiled successfully; 34 static pages; /team emitted
A7   npm run test:e2e             314 passed (18.2 m), 0 failed, 0 flaky, retries 0
                                  (311 before; + e2e/team.spec.ts, + /team in the
                                  accessibility and universal-board matrices)
A8   npm run public:check         All 22 public link(s) responded successfully
```

New tests: `src/team/status.test.ts`, `evidence.test.ts`, `packet.test.ts`
(22), `src/persistence/repositories/team-repository.test.ts` (6, including
a coach → student → coach round trip and a stale merge refused then
recomputed), the v17 → v18 historical fixture, the backup-completeness
rows for both stores, and `e2e/team.spec.ts` — two browser contexts as two
machines, packets both ways, a tampered packet refused with its reason, the
same packet twice, the reset control. Each was watched failing at least
once while it was written (the illegal-move fixture, the synchronous throw,
the fold, the controlled radio).

A9–A14 are recorded in the commit that carries this report and in the
final message of the session; B (a Mac release) was **not run** — the Mac
1.2.5 is behind `master` and `docs/product/platform-parity.md` says so.

## 5. Remaining concerns

- **Section B is due.** Both changes are Mac-facing (a rail entry, two
  stores, a label); the next Mac release carries them. Nothing under
  `desktop/` changed.
- **The packet is the only transport.** By decision, not by omission
  (`docs/design/team-hub.md` §2, §6). Export to a Lichess study would need
  the `study:write` scope and a privacy-claim change first.
- **`~/Library/Caches/Kingfisher/`**, the release manifest on v1.2.2–v1.2.5,
  ESLint 10 and TypeScript 7: unchanged from Phase 73's list.
