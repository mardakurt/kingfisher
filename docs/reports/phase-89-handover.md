# Phase 89 — a player's own games, and what the report was saying about them

Phase 89 picked up an unfinished Phase 88→89 piece of work — a collection-backed
Opening Report — audited it, found two false claims in it, fixed a harness defect
Phase 88 had recorded and declined to fix, and re-verified the packaged
application that no handover had verified since 1.3.3.

It was a verification and defect-finding session with one feature completed on
the way through. Nothing here renumbers, reopens or resets earlier work.

```
branch   master
start    2857625  "Record passing final CI and live 1.4.0 release verification"
commits  076bb47  Read a player's own collection in the Opening Report
         6e9f0c6  Stop grading a player's own games against theory
         3d5ba6d  Name the games that ended in no result the report can count
status   clean
```

## 1. What was inherited, and what was wrong with it

The tree carried an uncommitted collection-backed Opening Report: a bounded,
read-only read of a companion collection at one position, rendered beside the
existing reference-pack history sections. The design was sound and the storage
cost was genuinely nil, which is why it survived review — `positionHistory`
issues one `SELECT`, writes no table, no index and no persistent cache, and
returns about 17 kB.

Two claims in it were false, and both are the kind this project treats as
defects rather than untidiness.

### Defect 1 — a player's own archive was graded against theory (severity: false claim)

`roleOf(id, index)` fell through to `index === 0 ? 'reference' : 'contrast'`. A
selected collection was appended to the source list, so its role was decided by
how many reference packs the player happened to have installed:

- with a pack installed, the collection became `contrast`, and the report
  printed **"compared for disagreement"** beside the reader's own games;
- with none installed, it became `reference` — the population whose frequencies
  define the opening's **critical branches**.

The second is the serious one: it quietly redefines theory as whatever that
person has in their archive. Neither reading is true, and neither was chosen by
anything the player did.

The proof is the mutated build's own output, captured from the real application
in a browser:

```
Plan evidence E2E — 3 gamescompared for disagreement
```

Three games of the player's own, asserted to disagree with theory.

**Fix.** A fourth role, `own`: reported, compared against nothing. It travels on
the source entry rather than being inferred from an id, so it is stable
whatever else is installed. It still contributes a frequency reason — how many
of their games reached this position is a fact about the reader — and the two
comparisons in `critical-branches.ts` stay _named_ (`recent`, `contrast`) rather
than defaulted, so a role added later is compared by nothing until somebody says
so.

### Defect 2 — outcome columns that did not add up (severity: unexplained shortfall)

A collection's "Results by Elo class" line could show fewer outcomes than games,
with nothing saying why. The cause is a real difference between the two
populations rather than a slip:

- the pack's tally is a three-way ternary, so a game with no recorded result
  (`*`) is filed as a **Black win**, and a pack's three columns always add up;
- the companion classifies only the three results a game can actually end in, so
  its columns need not.

A player comparing the two side by side saw a shortfall nobody had named.

**Fix on the collection side.** Those games are counted and the report states
how many are in no column, which is the treatment `unrated` games already had.
The count is taken per game rather than inside the tally, because the tally
runs once for the year and once for the band and a game with both a year and a
rating reaches it twice — caught by asserting that the difference between the
game count and the three columns _equals_ the reported figure.

**Not fixed on the pack side, deliberately.** See §4.

### And one gap closed rather than left

The selected collection was component state, so every reload silently put the
report back on reference packs and asked the player a question they had already
answered — in the one workflow where they are walking an opening and
repeatedly checking their own games. It is now a preference, with a
`settings-contract.ts` row, and the three states are kept apart: `null` is
"never decided" and follows the Explorer source, `''` is the decision "packs
only". Collapsing those two would have made the Explorer default into a silent
override of a choice the player had made.

### Two smaller ones, in the same files

- a missing pioneer score said "its score is not carried by **this pack**",
  for populations that are not packs;
- a sample with no dated game claimed the _collection_ records no dated game
  here, when only the bounded sample was read — which is how a capped read
  becomes a statement about a million games. Both now distinguish the sample
  from the population, as the popularity section already did.

## 2. Phase 88's recorded follow-up, closed

Phase 88 recorded a walk failure it diagnosed correctly and declined to fix:

> `action-threw: could not click "OK": Can't get window 1 of process 1 … Invalid
index. (-1719)` — seed 46, step 83. Three later runs of the same seed were
> clean.

`dismissUpdateDialog` threw the stale Accessibility error when the window left
between `findWindow` and `clickButton`. That is the harness losing a race with a
Sparkle dialog that had already gone, recorded as a defect in the application.

**Fix.** Re-resolve before calling it a failure, and treat a vanished window as
the outcome. Deliberately narrow: an _offered_ update is still a finding even
when the window disappears, because its default button installs the bundle under
test, and a window that is still present is still a finding. The walk now also
prints `window had already gone` rather than passing over it in silence.

## 3. Gates

Every command in `docs/operations/after-a-fix.md`, on the final tree. Numbers
are from the runs, not from expectation.

| Command                 | Result                                            |
| ----------------------- | ------------------------------------------------- |
| `npm test`              | **3,930 passed / 3,930**, 364 files, 0 skipped    |
| `npm run typecheck`     | clean                                             |
| `npm run lint`          | 0 problems                                        |
| `npm run format:check`  | all matched files use Prettier style              |
| `npm run test:e2e`      | **448 passed / 448**, 28.2 m, 0 failures, 0 flaky |
| `npm run benchmark`     | heaviest route `/studies`, every stage exit 0     |
| `npm run test:no-skips` | OK                                                |
| `npm run docs:check`    | **359 / 359**                                     |
| `git diff --check`      | clean                                             |

`format:check` **failed** on the inherited work and was the one gate the
previous run had not reached; it is the reason §1's code could sit uncommitted.

### Packaged macOS

`npm run desktop:pack` on `3d5ba6d` — the final code state — signed with
`Developer ID Application: Metin Arda Kurt (3B5CYF9DQ4)`, hardened runtime on,
`CFBundleVersion` 1013.

**Not notarised**: the builder reported `notarize options were unable to be
generated`, as no Apple API key is configured in this environment. This is a
signed dev artifact, it is not published, and it is not a release. The public
DMG remains 1.4.0 build 1007 and does **not** contain any of this.

**The tree was not clean at build time**, so the bundle's recorded dirty flag
is true. The only uncommitted file was `docs/product/parity-ledger.md`, a
Markdown record that is not part of the bundle, so the application code inside
the artefact is exactly `3d5ba6d`. A clean-tree rebuild is one signing pass away
if the flag itself matters.

Two artefacts were built, deliberately. The first (build 1012, at `6e9f0c6`) was
verified and then found to predate the last commit; rather than report packaged
evidence for code that was not the shipped code, the package was rebuilt at the
final commit and the smoke gate re-run against that.

| Gate                                   | Artifact   | Result                                        |
| -------------------------------------- | ---------- | --------------------------------------------- |
| `desktop:smoke -- --packaged`          | 1012, 1013 | **17 / 17** on both                           |
| `desktop:chrome -- --packaged`         | 1012       | **109 / 109**                                 |
| `desktop:restart -- --packaged`        | 1012       | **7 / 7**                                     |
| `desktop:walk -- --packaged --seed=46` | 1012       | **0 findings**, 0 console errors, 200 actions |

The walk's `update-dialog` action really did raise Sparkle's window and dismiss
it (step 189, verdict `up-to-date`), so the path the harness fix touches was
exercised in the bundle rather than merely unit-tested.

## 4. Open, and not fixed here

1. **A reference pack files a game with no recorded result as a Black win.**
   `build-reference-pack.mjs` tallies
   `result === '1-0' ? white : result === '1/2-1/2' ? draws : black`, so `*`
   becomes a Black victory. That is a false claim about a game, and it is the
   reason the two populations' columns disagree. Correcting it changes pack
   bytes: every pack needs rebuilding and re-digesting, which is a data phase
   with network downloads — not something to slip into a fix commit, and not
   something to do on a disk the maintainer has asked to keep small. Recorded in
   `docs/design/chessbase-parity-features.md` with that reason attached.
2. **Real-scale timing and complete-corpus equivalence for the collection
   report.** The bounded read is proven correct against fixtures and against the
   row/postings layout differential, but no million-game collection was measured,
   and none was generated. The parity ledger row stays `partial`.
3. **A reference pack rebuild** is the remaining work on defect 2's pack side,
   and it is a data phase rather than a code change.
4. **60 inert `focus:outline-none` utilities** remain, carried from Phase 88's
   judgement that removing them was more churn than the defect warranted.

## 5. What this session did not do

- No data was added, imported or generated. Nothing was downloaded. The only
  disk movement was build output: the repository's `.next` cache is 5.9 GB and
  `desktop/dist` holds 929 MB of 1.0.0–1.2.1 DMGs, both pre-existing and
  git-ignored. Flagged, not deleted — those are the maintainer's artefacts.
- Chess rules, move decoding, engine evidence identity, source separation and
  the read-only ChessBase/En Croissant contracts were not touched and not
  re-audited; nothing in this phase reached them.
- No release, publish, notarisation or descriptor change was attempted. The
  marketing version is still 1.4.0 and the public DMG is still build 1007.
- Assessment item 2's continuity half — returning from a game to the same row,
  page and query — was found to be **already implemented in Phase 87** and
  already covered by `e2e/library-continuity.spec.ts`. It was not rebuilt. Only
  its scale measurement remains open, and that is item 2 above.
