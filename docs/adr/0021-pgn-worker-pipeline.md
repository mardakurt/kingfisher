# 0021. PGN parsing behind a Worker, with an acknowledged batch pipeline

Status: Accepted

## Context

Phase 6 measured a 100,000-game import at about 57 seconds, of which about 45
were spent parsing PGN. All of it ran on the main thread. The position indexer
already had a Worker; the parser did not, so the tab froze for the length of a
serious import — no navigation, no board, and a progress indicator that could
not repaint to say how far it had got.

Two things made this more than "move it to a Worker".

The first is that Kingfisher has exactly one PGN grammar, and it has to stay
that way. A second parser written for the worker would drift from the one
ordinary loading uses, and the failure mode of that drift is a game that
imports differently depending on which door it came through — which is the
worst kind of bug this application can have.

The second is back-pressure. A parser in a Worker is faster than IndexedDB or
SQLite can accept what it produces. Posting batches as fast as they are parsed
puts a second copy of a very large database in the browser's message queue,
which is how an import that used to be slow becomes an import that runs out of
memory.

## Decision

**One grammar, made incremental.** `parseOneGame` stays the only implementation
of the grammar. `createPgnParser(source)` wraps it in a session that tokenizes
once and yields one game at a time, and `parsePgn` — the ordinary entry point
— is now a loop over that session. The worker drives the same session. There is
no second parser to keep in step.

**The worker prepares records, not just trees.** `normalizeGame` and `indexGame`
moved to `prepare-game.ts` so the worker can produce finished game records and
position indexes. Fingerprints and canonical position keys are therefore
computed by the same code whether an import is worker-driven or not, and the
main thread's remaining job is the transaction.

**Batches are acknowledged.** The worker posts a batch and then waits for an
`ack` before parsing the next one. Exactly one prepared batch is in flight at
any moment. This is the whole memory story: the queue cannot grow, because the
producer is blocked on the consumer.

**Cancellation terminates, then settles.** An abort terminates the worker
immediately — parsing, indexing and every future batch stop at once — but the
promise resolves only after the batch already being written finishes. Committed
batches stay committed and are reported as such; nothing is half-written, and
no worker is left running. `runPgnWorker` owns that lifecycle and is unit-tested
against a fake worker for both the acknowledged path and the cancel-mid-commit
path.

**A main-thread fallback stays.** Some embeddings refuse module workers.
`runPgnWorker` returns `null` when it cannot construct one, and the callers fall
back to the old in-line loop with its `scheduler.yield` cooperation. Slower, but
never absent.

**Total is not invented.** A streaming parser knows how many games it has
parsed and never how many are still to come. Progress therefore counts up and
says which stage it is in, rather than displaying a denominator of zero as a
percentage.

## Consequences

Parsing 100,000 games no longer blocks the tab: the browser test asserts the
longest main-thread gap stays under 500 ms while a 20,000-game file imports and
the user changes routes and plays moves.

Import also became 21% faster, but from an unrelated change made in the same
pass — `Position.advanceSan`, which hands the rules engine to the position a
move reaches instead of rebuilding it. After that, 95% of parse time is
`chess.js` generating every legal move to resolve one SAN token. Going further
means replacing the rules engine, which ADR 0003 and ADR 0004 keep possible and
which nothing measured in Phase 7 justified.

The import dialog can now be dismissed while the job continues, because the job
belongs to a store rather than to the dialog. Closing the dialog backgrounds it;
cancelling it is a separate, explicit button.

`ImportProgress.total` is 0 during a worker import. Anything rendering progress
must handle that rather than dividing by it.
