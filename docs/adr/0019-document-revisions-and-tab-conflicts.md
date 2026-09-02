# 0019. Document revisions, and what happens when two tabs disagree

Status: Accepted

## Context

Two Kingfisher tabs on one chapter is an ordinary thing to do — a study open
beside the game it came from, or simply a window someone forgot about. Until
Phase 6 both could write, and `saveChapter` was a read-modify-write: read the
record, replace its tree, put it back. Whichever tab saved last won, silently.

For a text field last-write-wins costs a few keystrokes. For a game tree it
costs a variation: an hour of analysis replaced by a version that never
contained it, with nothing on screen to say so.

A second, quieter problem sat behind it. The draft — the record that exists so
a refresh cannot lose unfiled work — was written _after_ the chapter. A chapter
write that threw, for any reason, took the session's work with it.

## Decision

**A revision on every chapter.** `ChapterRecord.revision` is an integer that
increments on every accepted write (schema version 4, backfilled to 0). A
workspace holds the revision it loaded and offers that one back when it saves.

**The check happens inside the write transaction.** Reading the current
revision, comparing it, and then writing leaves a window in which the other tab
commits; a check made in that window passes on data that is already stale by
the time the put lands. So `saveChapter` re-reads within the same readwrite
transaction and throws `StaleChapterWriteError` — carrying the winning record,
so the loser can offer it without a second read.

**The revision offered is the workspace's, not a fresh read.** Re-reading the
chapter immediately before writing would make every write trivially valid and
the check decorative.

**A BroadcastChannel announces accepted writes.** Not a protocol: no leader
election, no shared state, no merging. A tab says "chapter X is now at revision
N" and any tab holding an older copy decides for itself. A message that never
arrives costs nothing, because the revision check still refuses the stale
write — the announcement only makes the refusal earlier and kinder.

**A clean tab adopts; a dirty tab asks.** With no local edits there is nothing
to lose and taking the newer version is what anyone would choose, so it happens
silently. With local edits the user gets a bar offering to fork their work as a
copy or take the other version.

**Nothing is merged automatically.** Resolving two game trees means choosing a
winner at every divergence, and a wrong choice invents analysis nobody played.

**The draft is written first and marked `unsaved` until the chapter write
lands.** That ordering is what makes the work survive a refused or failed
chapter write, and it is also the signal crash recovery needs: a draft still
marked unsaved holds work the chapter does not.

## Consequences

A conflict is now visible, non-destructive and resolvable, and the common case
— two tabs, one of them idle — resolves itself without a prompt.

Recovery is only offered when the draft and the saved chapter actually differ.
A prompt that appears after every tidy session teaches people to dismiss it
unread, which is the habit that loses work the one time it mattered.

The cost is one more field to keep correct. Anything that rewrites a chapter
must move its revision on, or a workspace holding the old value will not notice
the change: `renameChapter` and `reorderChapters` do, and there are tests
asserting it. A reorder that leaves a chapter's position unchanged deliberately
does not, so ordinary reordering does not invalidate every open workspace.

This is not collaborative editing and is not a step toward it. It is the
minimum that stops one window destroying another's work.
