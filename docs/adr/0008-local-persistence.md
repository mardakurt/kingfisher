# 0008 — IndexedDB behind repositories, with no dependencies and explicit migrations

**Status:** Accepted

## Context

Phase 1 kept everything except preferences in memory. That is fine for a board
with an engine attached and useless for study: an hour of analysis died with the
tab. Phase 2 needs studies, chapters and an imported game collection to survive
a reload, a browser restart, and a schema change six months from now.

Three questions had to be answered together.

**Where.** IndexedDB is the only browser store that holds structured objects at
this size. `localStorage` is synchronous, string-only and capped around 5 MB —
a single imported tournament would exceed it, and every write would block the
main thread while the engine is running.

**With what.** Dexie was the obvious candidate and was rejected. The measured
need is five object stores, eight indexes and one schema version; Dexie's value
is in the query DSL and the live-query layer, neither of which this application
uses. The wrapper that replaces it is 170 lines, and it buys something a library
would have taken away: the transaction helper aborts on a thrown error and
translates `QuotaExceededError` into a sentence a chess player can act on. The
project already declines `clsx` and an icon package on the same reasoning.

**How exposed.** Not at all. Feature code sees `StudyRepository`,
`GameRepository` and `DraftRepository`; nothing above `src/persistence/`
mentions IndexedDB, and `src/chess/` does not know storage exists.

## Decision

```
src/persistence/
  schema/migrations.ts    versioned store and index definitions
  indexeddb/database.ts   the wrapper: transactions, errors, requests
  indexeddb/memory.ts     the same interface, in memory, for tests
  repositories/           StudyRepository, GameRepository, DraftRepository
  validation.ts           runtime guards at the storage boundary
```

Four decisions inside that shape are worth recording.

**Migrations are data, not a `switch`.** `MIGRATIONS` is an ordered array;
`applyMigrations(target, oldVersion, newVersion)` runs only the steps in
between. Deleting the database when types change is not a migration strategy —
it is data loss with extra steps — so the array only ever grows.

**Stored records are validated on the way out.** A record written by an older
build, or corrupted, is a plausible thing to find. `assertValid` rejects it with
a message naming what was unreadable, rather than letting a malformed tree reach
the board and crash the renderer.

**Identifiers are UUIDs, not positions.** `study-<uuid>`, `chapter-<uuid>`.
Chapter order is a separate integer field, so reordering a study rewrites six
small records and no identity changes. Games are the exception: a game's id is
derived from its content fingerprint, because two imports of the same game are
the same game.

**Writes are granular.** A chapter is one record. Nothing serialises the whole
application into a blob, so autosaving a chapter costs one small write however
large the rest of the database has grown.

## Consequences

- No new runtime dependency. `package.json` is unchanged by this phase.
- `MemoryPersistenceDatabase` implements the same interface, so repository,
  import-pipeline and round-trip tests run in Node with no fake IndexedDB.
- The wrapper is ours to maintain. It is small and covered by tests, and the
  interface is narrow enough that swapping in Dexie later would touch two files.
- `GameRepository.search` still reads every game record and filters in memory.
  That is honest at a few thousand games and will need cursor-based paging
  before it is honest at a hundred thousand; the interface already returns
  `{ games, total }` with `limit`/`offset`, so that change stays behind it.
