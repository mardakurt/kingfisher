# Phase 16 — full-codebase audit

What was actually inspected, what it found, and the command behind each claim.

This is an audit record, not a summary of intentions. Where something was not
examined, or could not be examined in this environment, it says so.

## Inventory

`git ls-files` — **926 tracked files** on 5 September 2026.

| Area                         | Files | Notes                                             |
| ---------------------------- | ----: | ------------------------------------------------- |
| `src/`                       |   503 | application, domain and unit tests                |
| `public/`                    |   211 | piece sets, icons, engine assets                  |
| `docs/`                      |    67 | 48 ADRs, performance, design, product, reports    |
| `e2e/`                       |    62 | 61 Playwright specs plus fixtures                 |
| `scripts/`                   |    35 | benchmarks, builders, engine and pack tooling     |
| `companion/`                 |    20 | the local native process                          |
| `data/`, `brand/`, `.github` |    10 | datasets, brand assets, CI workflows              |
| root config / docs           |    18 | build, lint, test config and the top-level guides |

`src/` by area — `features/` 216, `persistence/` 61, `chess/` 34,
`database/` 29, `app/` 26, `engine/` 24, `reference/` 19, `theory/` 14,
`stores/` 12, `components/` 10, `tablebase/` 8, `sync/` 7, `book/` 7,
`repertoire/` 6, then `ui/`, `training/`, `preparation/`, `lib/`, `companion/`,
`assistant/`, `player/`, `hooks/`, `performance/`.

`src/features/` covers 31 areas, the largest being `shell` (27), `review` (21),
`workspace` (20), `analysis` (15), `board` (12), `databases` (11) and
`explorer` (9).

## Static health

Scanned across `src`, `companion` and `scripts`:

| Construct                        | Hits | Verdict                                                                                  |
| -------------------------------- | ---: | ---------------------------------------------------------------------------------------- |
| `TODO` / `FIXME` / `HACK`        |    0 | none                                                                                     |
| `@ts-ignore` / `ts-expect-error` |    0 | none                                                                                     |
| `as any` / `: any`               |    0 | every textual hit is prose in a comment ("the same as any other engine"). No real casts. |
| `eslint-disable`                 |    4 | all read; all deliberate and documented — see below                                      |
| `new Worker`                     |    5 | import pipeline and engine workers                                                       |
| `BroadcastChannel`               |    1 | cross-tab revision updates                                                               |
| `EventSource`                    |    4 | companion engine streaming                                                               |
| `AbortController`                |   18 | remote and provider calls                                                                |

The four lint suppressions were each read in full:

- `piece-sets/index.tsx` — `no-img-element` for an external piece asset. Correct;
  these are not Next-optimisable.
- `explorer/useExplorer.ts` — `exhaustive-deps`, because `filters` is a fresh
  object per render and the effect depends on its serialised form, which _is_
  in the dependency array. Correct.
- `endgame/ConversionPanel.tsx` — `exhaustive-deps`, deliberately narrowed so an
  unrelated preference change cannot re-trigger the engine's reply, with a
  `replying` guard against double-fire. Correct, and documented in place.
- `persistence/useWorkspacePersistence.ts` — `exhaustive-deps` on a mount-once
  autosave session that must not be torn down mid-edit. Correct.

**No dead state, write-only preference, unsafe cast or suppressed failure was
found.** This is an unusually clean codebase for its size.

## Query cache keys (Part W)

Every `queryKey:` in `src/` was enumerated and read.

Position-derived keys fall into two groups, and both are right:

- Keys answering from a **switchable reference source** carry the source and its
  cache version — `['explorer', sourceId, sourceVersion, fen, filters]`,
  `['theory-radar', sourceId, cacheVersion, fen, currentYear]`,
  `['tablebase', provider.id, fen]`.
- Keys answering from the user's **own** work carry only the canonical position
  key — `['position-context', key]`, `['transpositions', key]`. Correct: the
  answer does not depend on which reference source is selected.

The second group cannot express its own inputs, so every mutation that changes
one has to say so. `invalidatePositionContext` is called from the games,
repertoire, training and model-game invalidators, and from the profile editor —
the last because a player's aliases are what "My games" _means_, and without it
the count computed before they said who they are would stand. That path was
checked and is present, with the reasoning recorded next to it.

**No stale-chess-statement defect was found in the cache layer.**

## Defects found and fixed in this pass

### A dead engine could answer for a live position

`src/engine/uci-session.ts`, `src/engine/companion/transport.ts`,
`src/engine/stockfish/worker-client.ts`.

UCI output carries no request identity, so any gap between "this process is
finished with us" and "we stopped listening to it" is a window in which stale
output is read as evidence about the position now on the board. Three such
windows existed:

1. An unacknowledged `stop` abandoned the search but **kept the process**. The
   next search reused a process still owing a `bestmove`, and that late line was
   counted against the new position.
2. A companion-reported crash (`#error` / `#exit`) was recorded by the transport
   but never reached the session, so a search whose engine had already died
   stayed pending with its last `info` standing in the panel as though still
   being refined.
3. Neither transport's `waitFor` could be woken by anything but a matching line
   or its timeout — and both clear their listeners on shutdown. A waiter on a
   dead engine therefore could not be woken at all, and sat for its full ten or
   twenty seconds with the session's command queue blocked behind it. A crashed
   engine read as a frozen panel rather than a failed one.

Fixed; covered by `src/engine/uci-adversarial.test.ts` and
`src/engine/transport-liveness.test.ts`. Both suites were run against the
previous implementation: 9 of 11 and 5 of 6 fail, the liveness ones by hanging
to the test timeout, which is the stall itself.

The root side to move is now derived by replaying the requested moves through
`Position` rather than by counting them, so a request carrying a move the
position does not allow is refused instead of silently inverting every score.

### A backup omitted most kinds of authored work

`src/persistence/backup.ts`.

`PORTABLE_STORES` was written when the workspace had studies, repertoires and
games, and was never revisited as later phases added places to author things.
**Preparation sessions, opening files, endgame positions, pinned engine lines,
source sets and player identities were all absent.** A backup taken before a
reinstall looked complete and silently restored a workspace missing most of the
work done since.

All six now round-trip, each validated by the checker its store already had, so
a malformed record is refused before the restore touches existing work. Older
backups stay restorable: a store a backup predates is skipped rather than
treated as empty — otherwise this fix would itself have erased work when
replacing from an older backup. Covered by
`src/persistence/backup-completeness.test.ts`.

### A castling move that was not castling

Fixed in `e83a9be`, before this pass; recorded here because it is the most
serious defect the phase found. Given `4k3/8/8/8/8/8/8/R4K1R w KQ - 0 1` — white
king on **f1**, rooks on a1 and h1, both rights set — the rules engine offered
`O-O-O`, played it by sliding the king f1→d1, and left both rooks where they
were. An illegal move presented as legal, in a position the setup dialog could
build and a PGN `[FEN]` tag could carry. Kingfisher's own FEN parser now checks
the claim. See ADR 0047 and `src/chess/variant-contract.test.ts`.

### The system engine was never interrogated

`scripts/verify-engine-fleet.mjs`. Lc0 is located on the path rather than
downloaded, and the fleet check skipped it, leaving its capability row as dashes
for ever — indistinguishable from "never asked". It now goes through the same
interrogation as a downloaded binary. An absent system engine is reported as
absent, not as a failure, so the exit code stays meaningful on CI runners.

## Lc0 — live verification (Part L)

Run on this machine, 5 September 2026, Apple M3 Pro.

Directly:

```
$ printf 'uci\nisready\nposition startpos\ngo nodes 500\n' | lc0
Loading weights file from: /opt/homebrew/Cellar/lc0/0.32.1/libexec/42850.pb.gz
Initialized metal backend on device Apple M3 Pro
info depth 5 seldepth 12 nodes 452 score cp 28 pv e2e4 c7c6 d2d4 ...
bestmove e2e4 ponder c7c6
```

And through Kingfisher's own `ManagedEngines.install('lc0')`:

```
catalogue kind = system | available = true
binary       : /opt/homebrew/bin/lc0
reportedName : Lc0 v0.32.1+git.dirty
capabilities : multipv ✓ searchmoves ✓ wdl ✓ syzygy ✓ threads ✓ hash ✗ chess960 ✓
checks       : handshake ✓ isready ✓ search ✓ stop ✓ multipv ✓
               searchmoves ✓ wdl ✓ syzygy ✓ malformed ✓
```

`hash: false` is correct — Lc0 has no `Hash` option; it is a neural engine.

**Ready, on the definition that matters: binary + usable network + a completed
search.** The weights were auto-discovered and the Metal backend initialised
without configuration. This is one machine and one platform; it is not a claim
about Windows or Linux, which were not tested here.

## Chess960 (Part M)

**Not supported, deliberately, and the refusal is enforced rather than
documented.** `src/chess/variant-contract.test.ts` asserts the stronger claim
that matters to a player: Kingfisher will never offer a castling move it cannot
legally make, and refuses a position claiming one rather than guessing. It
rejects Shredder-FEN castling fields (`HFhf`) instead of misreading them as
`KQkq`, and a PGN carrying such a position falls back to the standard start and
records why.

Engine `UCI_Chess960` capability is _recorded_ — it is a fact about the engine —
which is what would make adding the variant later a question about Kingfisher
rather than a survey of nine binaries.

## What this pass did not cover

Stated plainly rather than left to inference:

- **No million-game real dataset** was imported or measured in this environment.
- **No live Lichess or Chess.com round trip** was performed here; those paths are
  covered by the e2e contract specs against fixtures, not against the real
  services.
- **Lc0 was verified on darwin-arm64 only.**
- The React render-cost profiling of Part V was not repeated in this pass; the
  Phase 14 and 15 measurements stand unchallenged but also unrefreshed.
