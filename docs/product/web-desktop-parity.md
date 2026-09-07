# Web and desktop, feature by feature

Kingfisher runs in a browser and as a Mac application, and they are the same
application: `desktop/` serves the same Next.js build the browser loads, and
the whole surface between shell and page is one preload file plus
`src/desktop/bridge.ts`. This table is the check on that claim.

**The rule it enforces.** Core chess behaviour is identical, because it is
literally the same code — the rules, the tree, position identity, the Theory
Book, the repertoire and the review schedule have no idea which identity they
are in. A difference is legitimate only where a native capability exists that a
browser does not have, and every such row says what the capability is.

A row that said "desktop only" for something a browser could do would be a bug
in the arrangement. There are none, and the fourth column is what makes that
checkable rather than asserted.

**How to read the evidence column.** A named spec is a browser test; a named
smoke check is one of the assertions in `npm run desktop:smoke`, which drives
the packaged application. "Same code path" means the feature has no branch on
identity at all — the strongest evidence available, and it is a claim the
`e2e/` suite proves in the browser and the smoke run proves is present in the
shell.

---

## Core chess

Nothing here differs, and nothing here may.

| Feature                    | Web | Desktop | Expected difference | Evidence                                                          |
| -------------------------- | :-: | :-----: | ------------------- | ----------------------------------------------------------------- |
| Board, pieces, coordinates | ✅  |   ✅    | none                | `visual.spec.ts`, `piece-proportions.spec.ts`; smoke: board drawn |
| Legal moves, check, mate   | ✅  |   ✅    | none                | `src/chess/**` unit suite; same code path                         |
| Position identity          | ✅  |   ✅    | none                | `position-key` unit suite; same code path                         |
| Move tree and variations   | ✅  |   ✅    | none                | `kingfisher.spec.ts`; same code path                              |
| PGN read and write         | ✅  |   ✅    | none                | `kingfisher.spec.ts`; smoke: a PGN opens onto the board           |
| Theory Book                | ✅  |   ✅    | none                | `theory-book.spec.ts`; same code path                             |
| Variation Brief            | ✅  |   ✅    | none                | `variation-brief.spec.ts`; same code path                         |
| Opening classification     | ✅  |   ✅    | none                | `src/theory/**` unit suite; same code path                        |
| Repertoire and review      | ✅  |   ✅    | none                | `repertoire-review.spec.ts`; same code path                       |
| Studies and chapters       | ✅  |   ✅    | none                | `phase8.spec.ts`; same code path                                  |
| Training and recall        | ✅  |   ✅    | none                | `phase10.spec.ts`; same code path                                 |
| Review and decisions       | ✅  |   ✅    | none                | `phase11.spec.ts`; same code path                                 |
| Endgame                    | ✅  |   ✅    | none                | `phase9.spec.ts`; same code path                                  |
| Opening Report             | ✅  |   ✅    | none                | `opening-report.spec.ts`; same code path                          |
| Command palette, shortcuts | ✅  |   ✅    | none                | `kingfisher.spec.ts`; same code path                              |
| Backup and restore         | ✅  |   ✅    | none                | `phase11.spec.ts`; same code path                                 |

## Data and sources

| Feature                       |       Web       |   Desktop   | Expected difference                                                                   | Evidence                                          |
| ----------------------------- | :-------------: | :---------: | ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Starter Explorer (bundled)    |       ✅        |     ✅      | none — it ships in the build both load                                                | `fresh-user.spec.ts`; smoke: offline routes       |
| Installable reference packs   |       ✅        |     ✅      | none                                                                                  | `reference-sources.spec.ts`                       |
| IndexedDB collections         |       ✅        |     ✅      | none                                                                                  | `phase7.spec.ts`; same code path                  |
| Source comparison, no merging |       ✅        |     ✅      | none                                                                                  | `source-comparison.spec.ts`                       |
| Lichess Masters / rated       |       ✅        |     ✅      | none                                                                                  | `chaos.spec.ts`; same code path                   |
| SQLite collections            | ◐ via companion | ✅ built in | The desktop starts and pairs its own companion; the web asks a person to run one      | smoke: companion already paired                   |
| Open a collection by path     |        ✗        |     ✅      | A page cannot turn a chosen file into a _path_, and the companion opens files by path | `desktop/src/files.test.mjs`; `/db/attach`        |
| En Croissant import           |  ◐ typed path   | ✅ Browse…  | Same import; the desktop can pick the file natively                                   | `en-croissant.spec.ts`; `bridge-contract.test.ts` |

## Engines

| Feature                   |       Web       |   Desktop   | Expected difference                                                            | Evidence                                      |
| ------------------------- | :-------------: | :---------: | ------------------------------------------------------------------------------ | --------------------------------------------- |
| Stockfish in the browser  |       ✅        |     ✅      | none, and the desktop is cross-origin isolated so it is threaded there too     | `engines.spec.ts`; smoke: `SharedArrayBuffer` |
| Managed native engines    | ◐ via companion | ✅ built in | A browser cannot start a process; the companion does, and the desktop owns one | `engines.spec.ts`; §13 of the Phase 20 report |
| Custom UCI engine by path |  ◐ typed path   | ✅ Browse…  | Same registration; the desktop can pick the binary natively                    | `bridge-contract.test.ts`                     |
| Engine comparison, two    |       ✅        |     ✅      | none                                                                           | `engines.spec.ts`; same code path             |
| Local Syzygy tablebases   | ◐ via companion | ✅ built in | Reading table files needs a filesystem                                         | `TablebaseSettings`; §16 of the report        |
| Remote tablebase fallback |       ✅        |     ✅      | none                                                                           | `phase9.spec.ts`; same code path              |

## Native capability — desktop only, and why

Every row here is something a browser is not permitted to do. None of them
changes what a feature _does_; each adds a way of reaching it.

| Capability                      | Why the web cannot                                           | Evidence                             |
| ------------------------------- | ------------------------------------------------------------ | ------------------------------------ |
| File → Open PGN / Open Database | A page has no native dialog that returns a path              | `desktop/src/menu.test.mjs`          |
| Open Recent                     | The list is the shell's, and macOS puts it in the File menu  | `desktop/src/files.test.mjs`         |
| Double-click a `.pgn` in Finder | Document association belongs to an installed application     | `openableFromArgv`; §5 of the report |
| Drop a file on the window       | A dropped file in a page is content, not a path              | `pathForFile`; `useDesktop.ts`       |
| Browse… beside a path field     | Same reason: a picker that returns a path                    | `bridge-contract.test.ts`            |
| The companion starts itself     | A page cannot spawn a process                                | smoke: companion already paired      |
| Shell diagnostics in the report | Only the process that started them knows whether they are up | `diagnostic-report.test.ts`          |
| Quit ends every native process  | There is nothing to end in a browser tab                     | smoke: 0 descendants after quit      |

## Differences that are _not_ allowed, and are checked

| Would-be difference                      | Status                                                                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| A second board renderer in the shell     | **Absent.** One board architecture; a second is a bug. `AGENTS.md`                                                                 |
| Chess state in the main process          | **Absent.** No board, tree, engine session or query in `desktop/src/`                                                              |
| A second preferences system              | **Absent.** Desktop pairing is written _through_ the same preference Settings writes                                               |
| A web build changed to suit the desktop  | **Absent.** Standalone output and cross-origin isolation are opt-in behind env vars that only `scripts/build-desktop-web.mjs` sets |
| A generic `readFile(path)` on the bridge | **Absent**, deliberately. Everything readable was chosen in a dialog or dropped on the window                                      |

## The one asymmetry worth stating plainly

On the web, three things need a companion the user starts themselves: SQLite
collections, native engines, and local Syzygy tables. On the desktop they need
nothing, because the shell starts and pairs one. That is the single largest
practical difference between the two identities, and it is a difference in
_setup_, not in behaviour — the same code answers the same questions once a
companion exists either way.
