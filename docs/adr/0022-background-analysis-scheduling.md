# 0022. Background analysis: one engine, the foreground wins, and only final answers are stored

Status: Accepted

## Context

Kingfisher analyses one position very well. Reviewing a tournament means
analysing sixty, and doing that by hand — click a move, wait, click the next —
is the kind of work software is for.

Every obvious design for it is wrong in a way that matters here.

Running several engines at once makes the board unusable, which defeats the
purpose: the user queued this work precisely so they could keep studying.
Storing every `info` tick would write thousands of rows per game to record one
answer. Labelling moves "Mistake" or "Blunder" would have the application assert
a chess judgement it cannot defend from a single engine at a fixed time limit,
and Kingfisher's whole position is that it shows evidence and leaves the
conclusion to the player. And a queue that lives in memory is a queue that
silently discards an hour of engine time when a tab closes.

## Decision

**Jobs are records, not promises.** `analysisQueue` is an IndexedDB store
(schema version 7). One job per game, carrying the engine, preset, MultiPV,
limit, position strategy, `nextIndex` and `totalPositions`. `nextIndex` is
advanced transactionally after each position's evidence is saved, so a job
resumes exactly where it stopped, including across a restart.

**One background engine, and the loop claims work rather than being given it.**
`claimNext` moves the oldest `queued` job to `running` inside one readwrite
transaction. A single module-level loop runs at a time. Concurrency is not a
setting because a second background engine on ordinary hardware costs more in
foreground responsiveness than it buys in throughput.

**The claim is released by the loop, never by the interrupter.** This was the
mistake worth recording. Writing the job's status from the code that interrupts
the engine looks natural and is a bug: the interruption can land while
`claimNext` is still in flight, so there is no job to write about, and a record
the database already marked `running` is stranded — invisible to `claimNext`
and unable to resume. The loop's own `finally` runs for every claimed job on
every exit path, so it is the only honest place to say what happened:
`completed`, `failed`, `paused` when the user stopped it, `queued` when the
foreground took the engine.

**Interactive analysis wins, immediately.** Starting either interactive engine
stops the background one and releases its job to `queued`. The loop resumes when
the foreground engine stops. "Immediately" needs stating: `AnalysisHandle`
guarantees its promise settles but not that it settles soon — tearing down a
session whose search is still queued leaves it waiting up to ten seconds for a
`bestmove` that will never arrive — so the loop races the engine's answer
against a one-shot abort signal and stops waiting the moment it is interrupted.

**Nothing starts by itself.** On launch, jobs left `running` by a closed tab are
recovered to `paused` — truthful, resumable, and not analysing. Heavy engine
work then waits for the user to press Resume. A stale-owner heartbeat window
keeps this from stealing a job a live sibling tab is genuinely working on.

**One row per position, holding the final answer.** `engineEvidence` stores the
engine id and reported name, score, depth, nodes, time, the principal variation
and a timestamp, keyed by job and node. No intermediate ticks. No derived
labels, no accuracy score, no classification. Opening an analysed game applies
the stored evaluations to its tree, so the evaluation graph plots the positions
that were actually analysed and leaves the rest blank — the same rule the rest
of the application follows.

**Draining is not interrupting.** When `claimNext` finds nothing, the loop
clears the standing intent and stops. An earlier version re-entered the loop
from its own unwind hook, which turned an empty queue into a permanent spin on
IndexedDB.

## Consequences

The queue survives a reload and resumes; the browser test pauses it, reloads,
resumes, takes the engine for interactive analysis, gives it back, and then
asserts the stored evidence rows — engine name, depth, PV and score — rather
than the label on screen.

Throughput is deliberately unimpressive and not advertised. One engine at a
fixed limit is what it is; the number would depend entirely on the engine and
the preset, so no figure is published.

Jobs whose game was deleted, and evidence whose job or game is gone, are found
by the integrity scanner and offered for removal — dead pointers only, like
every other repair (ADR 0020).

There is no distributed coordination between tabs beyond the claim transaction
and the heartbeat. Two tabs both told to run the queue will interleave jobs
rather than duplicate one, which is enough; anything more would be a protocol,
and this is not the place for one.
