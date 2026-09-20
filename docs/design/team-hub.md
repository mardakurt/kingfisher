# The Team hub — mutual analysis between a player and the people they work with

_Phase 74, 2026-09-20. Current: describes the feature as built at `/team`.
Sections 1 and 2 are the research and the decisions; sections 3–6 are the
design, written from the code (`src/team/`, `src/features/team/`,
`src/persistence/repositories/team-repository.ts`)._

The follow-up [Team preparation design](team-preparation.md) distinguishes the
implemented inbox and brief improvements from the remaining audience, review
identity and tournament-brief work. It uses first-hand sources and states the
limits of packet confidentiality.

## 0. The one-paragraph version

A **team** is a coach and their students, or a player and their seconds. Its
unit of work is an **assignment** — "annotate your round-3 game", "build the
Najdorf 6.h3 file for Thursday" — and its unit of exchange is a **handover**:
somebody hands the board in, somebody reviews it, on one board, with the
engine beside it. Handovers are written once and never edited, so two copies
of a team merge by adding, never by reconciling — and that is what lets a
team travel as a **packet file** between machines with no server, no
account and nothing leaving the device that the person did not choose to
send. The file is what seconds and coaches pass around today; Kingfisher
gives it a structure, a board and a review.

## 1. How the work is actually done — the research

The design follows what people who prepare professionally, and people who
teach at a high level, describe doing. Four accounts were read closely;
their common shape is the feature.

**A second's product is a digestible file, not the analysis.** GM Noël
Studer's account of preparing a player for a round is five steps: gather
the opponent's games (10–15 min), read their tendencies (15–30 min), choose
openings _with the player_ (10 min), analyse deeply (10 min – 2 h), then
"convert the chaotic analysis into neat, simple digestible tournament
files" — and the player reviews a short list ("Najdorf 6.h3 — 20 mins")
for under an hour. The player never sees the chaos; the second's deliverable
is the reduced file, and the player's job is to read it and decide.
([nextlevelchess.com](https://nextlevelchess.com/how-to-prepare-like-a-grandmaster/),
[thechessworld.com](https://thechessworld.com/articles/openings/opening-preparation-complete-guide/))

**Seconds are research assistants who hand off a finished product.** The
descriptions of what a second does converge: research the opponent's
games, prepare lines — sometimes to move 30 — do "the grunt work" and hand
the player "a finished product (or nearly finished)"; when the opponent
surprises the team, work through the night and hand over a new file in the
morning. The exchange is a handover of files, repeated every round.
([chess.com forum](https://www.chess.com/forum/view/general/what-does-a-gms-second-really-do),
[chess.com, Caruana interview](https://www.chess.com/news/view/fabiano-caruana-interview-carlsen-nepomniachtchi),
[chessbox.in](https://www.chessbox.in/players/the-key-role-of-seconds-in-world-chess-championships/))

**A coach and a student work through a shared study.** The Lichess coaching
practice is the clearest description of the academy loop: the coach keeps
per-student studies — games, flashcards, White and Black repertoires; the
student adds their games and annotations after play; the coach comments in
the same study and saves one key takeaway per game; positions the student
got wrong become the next set to solve. The cycle is _assign → student
annotates → coach reviews in place → the takeaway is kept_.
([lichess.org, CheckRaiseMate](https://lichess.org/@/CheckRaiseMate/blog/the-4-lichess-studies-i-make-for-every-student/yRI4RLAh),
[chess-grandmaster.com](https://chess-grandmaster.com/how-to-use-lichess-studies-to-improve-your-game/),
[chessnexus.in](https://www.chessnexus.in/chess-coaching-questions))

**The container everybody uses is a shared study or a file.** Lichess
studies are collaborative containers with members and chapters; the API can
import a PGN as a chapter but cannot create or manage a study, and a study
holds at most 64 chapters. ChessBase users share `.cbh` files and cloud
databases. In every case the unit that moves between people is _a game tree
with comments_, in PGN or a PGN-equivalent.
([lichess.org forum](https://lichess.org/forum/lichess-feedback/importing-a-pgn-into-a-private-lichess-study),
[github.com/lichess-org/api#157](https://github.com/lichess-org/api/issues/157))

Four things follow, and each is a design rule below:

1. The deliverable is **a board with notes**, reduced and readable — not a
   chat, not a document. Kingfisher already has that object: the move tree.
2. The exchange is **a handover**, repeated, in both directions. It needs
   an author, a time, a note and a board; it does not need to be edited
   afterwards, ever.
3. The reviewer's tool is **the same board with the engine beside it**, and
   the review is a second board with more notes.
4. The transport people already have is **a file**. A tool that requires
   everyone to be online in the same service at the same time is not the
   one that gets used the night before round six.

## 2. The decisions

**No server, no account.** Kingfisher promises that everything you author
lives in your browser or in the Mac application's own folder
(`docs/product/features.md` §13, `/privacy`). A hub that needed a Kingfisher
account would reverse that promise, need a database that does not exist,
and put a sync engine between a person and their analysis — a multi-phase
effort and a product decision, not a feature. The owner chose the
local-first design on 2026-09-20. Everything below is built so that a
transport that moves packets automatically — a shared folder, a server —
would need nothing here to change.

**The handover is immutable and id-keyed.** This is the load-bearing
decision. A thread is a set of handovers; two copies of a thread merge by
union. There is no conflict to resolve because there is nothing to edit.

**The board travels as PGN, verified.** PGN is what a second with ChessBase
or a coach with a Lichess study can open without Kingfisher. Every PGN is
replayed through Kingfisher's own rules before it is stored and before a
packet is accepted; a packet with one board that does not play is refused
whole, with the assignment named and the illegal move quoted.

**Evidence is derived, never claimed.** PGN carries a score (`[%eval]`) and
nothing about who produced it. At the moment of a handover Kingfisher reads
the tree and records, per engine, how many positions carry a stored
evaluation and at what depths. "1 of 3 positions evaluated · Stockfish 18
Lite, depth 27" and "3 positions · no engine evaluations recorded" are both
true statements, and a coach can tell them apart.

**Roles are labels, not permissions.** Whoever holds the file can edit it,
so a permission would be theatre. The role decides which button comes
first: a student or a second sees _Hand in what's on the board_; a coach or
a player — the people the work is _for_ — sees _Return with notes_ and
_Accept_. An assignment addressed to you shows the hand-in first whatever
your role.

**`me` never travels.** Which member an installation is, is a fact about
that installation. A packet strips it; a merge preserves it.

## 3. The model (`src/persistence/domain.ts`, schema v18)

```
TeamRecord        id, name, members[], me?, createdAt, updatedAt, revision
  TeamMember      id, name, role: coach | second | player | student, lichessUsername?
AssignmentRecord  id, teamId, title, kind, brief, setBy, assignedTo?, due?,
                  opponent?, myColor?, archived?, handovers[], createdAt, updatedAt, revision
  kind            game | opening | opponent | positions | other   (a label only)
  Handover        id, kind: hand-in | review | note, authorId, authorName, at, note,
                  pgn?, verdict?: accepted | needs-work, evidence?
  HandoverEvidence positions, evaluated, moves?, variations?, comments?,
                   engines[{ name, positions, minDepth, maxDepth }]
```

Two stores, `teams` and `assignments` (indexed by `teamId` and `updatedAt`),
added by migration 18 with a historical fixture that opens a real v17
profile and upgrades it. Both are in `PORTABLE_STORES`: a backup carries a
team and its threads, and the completeness test round-trips one.

**Status is derived, never stored** (`src/team/status.ts`): the last
hand-in and the last review, in time order, decide it.

| last event                      | status    | rail column |
| ------------------------------- | --------- | ----------- |
| nothing, or notes only          | To do     | To do       |
| a hand-in after the last review | Handed in | Handed in   |
| a review, verdict _needs-work_  | Returned  | To do       |
| a review, verdict _accepted_    | Accepted  | Accepted    |

## 4. The packet (`src/team/packet.ts`)

`<Team>-<YYYY-MM-DD>.kingfisher-team.json`, format `kingfisher-team-packet`
version 1: the team (without `me` and without revisions), every assignment
in it, when it was exported and by whom. Receiving one:

1. **Parse and refuse** anything that is not exactly a packet: wrong format,
   another version, a malformed record, an assignment from another team, a
   board that does not play. Refusal is whole and names the reason.
2. **Merge** (pure, `mergePacket`): the roster is a union by member id, the
   newer roster describing shared members; the assignment _as set_ (title,
   kind, brief, setter, assignee, due, archived) comes from the copy with the
   later `updatedAt`; the thread is a union by handover id, the copy already
   held kept. Unchanged assignments are not rewritten. Receiving the same
   packet twice reports "nothing new".
3. **Commit** in one transaction with a revision check on every record
   (`applyMerge`); a copy another tab moved in between refuses the merge,
   which is recomputed once against the live copy.

A team that does not exist locally is created by the packet with `me` unset;
the person is asked who they are before they can hand anything over.

## 5. The interface (`/team`)

One `WorkspaceFrame`, like every board route. Nothing is new to learn.

- **Header**: _New assignment_ (accent; disabled until you have chosen who
  you are), _Share packet_, _Receive packet…_, _Members…_, _New team_. The
  subtitle says the team, the member count, and who you are — or that you
  have not said.
- **Rail — Assignments**: search by title/opponent/brief, filter by assignee,
  choose _All work_, _To review_ (coach/player) or _Assigned to me_. Rows
  are ordered by due date, then creation time, with undated work last.
  Filters do not restrict packet exports. Within that view, three columns, _To do_, _Handed in_, _Accepted_.
  A row is the title, who it is for, the kind, _Returned_ when it came back,
  and the due date (_overdue_ once it has passed). Archived ones are hidden
  behind one toggle. A coach's inbox is the _Handed in_ column.
- **Board**: the canonical board. _Open on board_ on any handover puts that
  board on it, and a strip under the board says whose it is:
  "Round 3 game — Ana's hand-in, 20 Sept". A search that settles here is
  kept in the tree, as on Analysis, so a review carries its evidence.
- **Dock — Thread**: the assignment's facts and status, the brief (and, for
  an opponent assignment, _vs Rival · we have Black_ with **Open in
  Preparation** — the dossier of their games, one click away), then each
  handover as a card: author, what they did, when, the note, the evidence
  line ("14 moves · 3 variations · 5 comments · 6 of 21 positions evaluated
  · Stockfish 17, depth 20–26"), _Open on board_ and **Copy PGN** for
  whoever works in ChessBase or a Lichess study. The action box is
  **pinned under the thread**, so the button a coach reaches for thirty
  times an evening never scrolls away: a note, and the buttons for your
  role. A hand-in needs moves on the board — an empty board says so and
  offers _import a PGN_; a review may attach the board or not; a note
  carries no board. _Archive_ / _Unarchive_ is in the panel's header.
- **Brief starters**: _Use suggested brief_ inserts editable guidance for the
  selected assignment kind only when the brief is empty. _Open latest board_
  reaches the latest handover carrying a board without searching the history.
  Note drafts stay with their assignment while switching threads and clear
  only after a successful write; they are not saved across reloads.
- **Who are you?** is asked in place — one select and _That's me_ — the
  moment a team has a roster and no `me`, which is what a received packet
  produces.
- **What's new.** A row whose latest handover is by somebody else and later
  than the last time this device opened the thread carries a dot and counts
  in its column's heading ("Handed in · 3 · 2 new"). Opening the thread
  clears it. Which team and thread were open are remembered on the device
  too (`localStorage`; never in a packet).
- **Open on board asks first** when the board holds moves that were not
  opened from the thread and belong to no saved document — a hand-in about
  to be made is not a thing to lose to a misclick.
- **A packet can be dropped on the route** (the banner says so while it
  hovers); the Mac shell's window-level drop, which opens PGN and database
  files, is not consulted for it.
- **From any board route**, _Position → Hand in to the team…_ goes to Team
  with the board as it is — the board is one store — so a student who
  annotated on Analysis or in a study hands in from there.
- **Members…**: rename the team, the roster with roles and optional Lichess
  usernames, _This is me_, add, remove, and _Delete team from this device_
  (a packet that still holds it brings it back).

What a coach with thirty students does on a Tuesday: open Team, look at
_Handed in · 3 new_, click the first dot, _Open on board_, walk it with
Engine open, add comments in the move tree, type two lines, _Return with
notes_ — the button is where it was for the last one. Then _Share packet_
once, and send the file the way the academy already sends files.

What a second does the night before round five: the player's assignment
says _vs Rival · we have Black_; _Open in Preparation_ shows what Rival
plays against 1…e5 and what changed this year; the second builds the
file on the board with the engine, _Hand in what's on the board_, _Share
packet_. In the morning the player opens it, reads "38 moves · 9
variations · 12 comments · 31 of 58 positions evaluated · Stockfish 17,
depth 24–30", walks the lines, and _Position → Add to game-day sheet_ for
the three that matter.

## 6. What is deliberately not here

- **A server, an account, real-time presence.** See §2. The merge is built
  so that adding a transport later is adding a transport.
- **Export to a Lichess study.** Possible through the study import API, but
  it needs the `study:write` OAuth scope, and Kingfisher's sign-in asks for
  no scopes — a privacy claim that would have to change first.
- **A grade, a score, a streak.** A review is a verdict and notes. Nothing
  here turns analysis into a number.
- **Enforced permissions.** See §2; a label that looked like a lock would be
  a lie about a file.
- **Editing a handover.** Add another. The thread is the record.

## 7. Verification

- `src/team/*.test.ts` — status derivation, evidence, packet build / parse /
  merge, including: a board that does not play refuses the packet; `me`
  never travels and a smuggled one is dropped; the newer copy sets the
  assignment and the older does not; the same packet twice is a no-op.
- `src/persistence/repositories/team-repository.test.ts` — the repository
  against the in-memory database, including a coach → student → coach round
  trip through packets and a stale merge refused then recomputed.
- `src/persistence/schema/migrations.historical.test.ts` — a real v17
  profile upgraded to v18.
- `src/persistence/backup-completeness.test.ts` — a team and an assignment
  round-trip through a portable backup.
- `e2e/team.spec.ts` — two browser contexts (two IndexedDBs) as the coach's
  and the student's machines: create, assign, share, receive, say who you
  are in place, the empty-board hint, hand in from the board, share back,
  **drop** the packet on the coach's window, the _new_ marker set and
  cleared, a reload keeping the thread open, _Open on board_ asking before
  replacing unsaved moves, Copy PGN reaching the clipboard, return with
  notes, archive and unarchive, an opponent assignment linking into
  Preparation, _Hand in to the team…_ from Analysis, a tampered packet
  refused with its reason, the same packet twice, and the reset control's
  label and effect. Run three times in a row before it was committed.
