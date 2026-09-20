# Team preparation: a small working room for serious chess

2026-09-20. Product direction and implementation plan. The existing implementation
is described in [team-hub.md](team-hub.md). “Implemented” below refers to the
shared application source, not a newly released Mac binary.

## Why Team exists

Preparation passes between people: a player and a second, a coach and a student,
or several analysts working toward the same event. A useful handover answers
four questions: what was asked, which board answers it, what remains uncertain,
and who needs to act next. Team keeps those answers beside Kingfisher's board
and engine. Its value is continuity of chess work, not a social feed.

An academy and a tournament team share this loop, but have different information
boundaries. An academy should not automatically expose every student's games to
every other student. A player's private preparation should not travel in a
school-wide packet. This distinction matters more than adding more role names.

## Research: what the sources actually support

These are first-hand descriptions, not a claim that all professionals follow one
routine. Recommendations in the following sections are Kingfisher design choices.

- **GM Noël Studer** describes gathering relevant opponent games, choosing an
  opening with the player, doing deeper research, and delivering a small set of
  digestible files. Player familiarity and limited review time matter; maximum
  analysis volume is not the goal.
  [How to prepare like a Grandmaster](https://nextlevelchess.com/how-to-prepare-like-a-grandmaster/).
- **GM Rustam Kasimdzhanov**, interviewed about working with Caruana, distinguishes
  ideas suitable for rapid/blitz from classical preparation and stresses knowing
  one's repertoire. That supports naming the intended time control and practical
  purpose instead of treating an engine evaluation as a universal recommendation.
  [ChessBase interview, 12 July 2020](https://en.chessbase.com/post/interview-rustam-kasimdzhanov-2020).
- **FM CheckRaiseMate** describes his own coaching setup: annotated games, a key
  takeaway, instructive positions to revisit, and separate White/Black repertoires.
  He specifically recommends restricting access to repertoire studies.
  [The four studies he uses with students, 28 April 2025](https://lichess.org/@/CheckRaiseMate/blog/the-4-lichess-studies-i-make-for-every-student/yRI4RLAh).
- **Gukesh**, in FIDE's pre-match interview, confirmed Gajewski's involvement but
  withheld further team details. This illustrates that confidentiality belongs
  in preparation workflows; it does not establish a particular software or
  security architecture.
  [FIDE interview](https://www.fide.com/gukesh-dommaraju-i-just-want-to-enjoy-the-experience/).

## Two daily workflows

### Coach and student

1. Coach creates an assignment: student, game or position, due date, short brief.
2. Student annotates their own thinking. Our suggested brief asks for candidate
   moves and uncertainties before using an engine, then separately explains
   what the engine check changed. This is guidance, not an enforceable exam mode.
3. Student hands in the board and sends a packet.
4. Coach receives it, chooses **To review**, optionally filters by student, and
   opens the latest board. The existing **Engine** tab supplies Stockfish and
   its normal controls. No second board or engine system is needed.
5. Coach returns a concrete correction or accepts the work and states the next
   practice task. The student revises and submits again if needed.

No accuracy grade, leaderboard, inferred ability score, or reward system is
needed. “Accepted” means a human accepted this work. It does not mean the player
has memorised it or that the engine has proven every line correct.

### Player and second

1. After pairings, player sets an opponent assignment and assigns it to the
   second. Add colour, event, round, local start time with zone, and the review
   time available. Today the latter details live in the editable brief.
2. Second opens the existing Preparation dossier. Record the source, date range
   and time control of the games; keep observed choices separate from guesses.
3. Agree a choice within the player's repertoire. Investigate critical replies
   and practical risks on the board. Keep the larger research tree in a study.
4. Hand in a reduced file: recommendation, critical alternatives, unresolved
   questions, what to remember, and estimated review time.
5. Player reviews the file, accepts it or requests a change. Use the existing
   game-day sheet for the few positions that need rehearsal.
6. After the round, annotate the actual game and create a follow-up assignment
   where preparation diverged. Repertoire updates remain an explicit decision.

This workflow also works for a player preparing alone: self-assign work, retain
sources and conclusions, and rehearse it. Team does not automate pairings or
infer an opponent's repertoire from an unverified account identity.

## Implemented in this iteration

| Addition            | Behaviour and implementation                                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suggested briefs    | `src/features/team/briefs.ts` contains authored, editable prompts for every existing assignment kind. Explicit insertion into an empty brief prevents overwriting authored work. No new schema or generated chess claims.                                     |
| Review queue        | `src/team/inbox.ts` derives **To review** from submitted work and the existing reviewer roles. A coach/player's own assigned work is excluded.                                                                                                                |
| Find work           | Search title, opponent or brief; filter by assignee; show personal work. Due dates sort first, oldest assignments break ties, undated work follows. Filters change the list, not the selected board or packet.                                                |
| Latest board        | A shortcut opens the newest board-bearing handover through the existing loader and its replacement confirmation. Historical boards remain accessible.                                                                                                         |
| Safer notes         | Draft notes stay with their assignment while switching threads. A successful write clears only the submitted draft; a failed write keeps it. Text notes no longer attach the board accidentally. Drafts are not persisted across reload or leaving the route. |
| Sharing explanation | The list explains that a packet exports all assignments, including archived ones, and the roster. Individual students and confidential preparation should use separate teams today.                                                                           |

All additions use existing theme tokens and native form controls. The layout
stays **assignment list → board → thread**, with Engine in the existing dock.

## Next increments, in dependency order — not implemented

### 1. Deliberate handover and review identity

Extend handovers with `basedOnHandoverId` and a board digest. Bind reviews to the
submission they examined, not merely the newest timestamp. Mark an acceptance
as superseded when a newer submission arrives. Concurrent submissions must both
remain visible; device clocks cannot decide which analysis is approved.

Track the loaded assignment and handover by IDs in the analysis document origin,
not by the title. Preview the board's origin before attachment. Preserve unsent
notes as local drafts across route changes and reload, include authored drafts
in backup, and detect stale writes.

Acceptance: two devices submit concurrently; neither board is lost, and a review
of one does not approve the other. Reopening the same board must not discard
unsubmitted annotations without confirmation.

### 2. Academy sharing with an explicit audience

Add an export preview listing the selected assignments, recipient members and
roster fields. Export only those records and required author references. Receiving
an incomplete packet must never delete omitted records. Version the packet
contract, validate all references, and exercise old/new packet compatibility.

Until that exists, separate teams are the available boundary. A local role label
is not authorization. Packets are plain files: recipients can copy them and author
names are not authenticated. Removing a member cannot revoke an existing copy.
Do not market current packet exchange as encrypted or access-controlled sharing.

If cloud delivery is added, first implement authenticated membership, server-side
read/write checks, invitation expiry and a documented retention model. Test that
one student cannot list, fetch or subscribe to another student's work. Transport
alone cannot provide those guarantees. End-to-end encryption would additionally
need key distribution, rotation, recovery and explicit limits on revocation.

### 3. Tournament brief and rehearsal

Promote frequently used brief fields into optional structured data: event, round,
start instant and time zone, player, assigned second, reviewer, review minutes,
source references, recommendation and open questions. Keep advanced fields folded
under **Round details**. Display **Player brief** above the research history.

Link that brief to existing preparation sessions and game-day positions using
stable IDs and canonical position keys. Do not build a second repertoire or
training scheduler. Keep “reviewed”, “accepted” and “rehearsed” distinct. Rehearsal
records must come from actual attempts, never from engine depth or comments.

Acceptance: the player can open a concise offline brief, reach each saved
position, rehearse it, and still inspect the underlying research and source.

### 4. Academy follow-up without administrative overload

Allow a coach to assign the same source exercise to several students, creating
separate threads and deliveries. Present the review queue, student filter and
next pending submission; defer attendance, billing and chat. A returned position
can create a linked follow-up task, retaining the original game and feedback.

Acceptance: a coach reviews several students in sequence without mixed drafts,
wrong-board attachments or cross-student exports. A student can see exactly what
to revise. Validate with a real coach and a player/second pair before claiming
professional adoption.

## Product success criteria

Observe whether users can complete the two loops without help: create a clear
brief, exchange it, identify the latest submission, inspect it with Stockfish,
return actionable feedback and find it again offline. Measure clicks and elapsed
time in consented usability sessions, not production telemetry. No fabricated
adoption, preparation-quality score or promised rating gain belongs in the UI.
