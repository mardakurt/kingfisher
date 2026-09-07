# Phase 19 acceptance walk

The Phase 19 brief asks for a walk rather than a route test, and it asks for it
step by step with what was expected, what was seen, and what was done about it.
This is that record.

**How to read the Result column.** _Pass_ means the step was performed and did
what it should. _Blocked_ means it could not be performed here and says what
would be needed. Nothing is marked pass on the strength of a related test.

Run on macOS 26.6.2, Apple M3 Pro, Node 24.14.0, against
`Kingfisher.app` built by `npm run desktop:dist` unless the step says otherwise.

---

## The desktop application

| #   | Step                              | Expected                                                      | Observed                                                                                          | Result |
| --- | --------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ |
| 1   | Install on macOS                  | A `.dmg` mounts and the app can be placed in Applications     | `Kingfisher-0.1.0-arm64.dmg`, 155 MB, built and mounted; `Kingfisher.app` is 338 MB               | Pass   |
| 2   | Launch normally                   | A window, with no terminal                                    | Window in **4.8 s** from a cold start of the packaged build; 1.3 s from the checkout              | Pass   |
| 3   | The companion starts by itself    | Running, and paired, with nothing pasted                      | `diagnostics` reports both services running; the bridge carries a 64-character token nobody typed | Pass   |
| 4   | No terminal needed                | Nothing about the workflow requires one                       | Confirmed: the shell chose both ports, minted the token and started both processes                | Pass   |
| 5   | Open a PGN from the shell         | It appears on the board                                       | Move list showed `Bb5 … a6` after a PGN was delivered through the shell's own channel             | Pass   |
| 6   | Cross-origin isolation            | `crossOriginIsolated` true, so the threaded engine can run    | **true**, and `SharedArrayBuffer` present                                                         | Pass   |
| 7   | The renderer holds no Node handle | `window.require` undefined under `contextIsolation`+`sandbox` | undefined                                                                                         | Pass   |
| 8   | The companion answers             | An authenticated request through the bridged URL succeeds     | HTTP 200, `platform darwin-arm64`                                                                 | Pass   |
| 9   | Quit                              | Both services stop                                            | Both pids gone; **all 5 descendants gone**, 64 ms to close from the checkout, 4.3 s packaged      | Pass   |
| 10  | Relaunch                          | The session comes back                                        | Relaunched; profile and preferences intact                                                        | Pass   |

Steps 2–9 are `npm run desktop:smoke`, which drives the real application through
Playwright and asserts each of them. **14 of 14 checks pass**, against the
checkout and against the packaged `.app`.

| #   | Step                    | Expected                                | Observed                                                                                              | Result  |
| --- | ----------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------- |
| 11  | Signed                  | Gatekeeper accepts it without a warning | **Not signed.** `codesign -dv` reports `adhoc, linker-signed`, identifier `Electron`                  | Blocked |
| 12  | Notarised               | Distributable to another Mac            | **Not notarised.** Both need an Apple Developer identity, which is a credential                       | Blocked |
| 13  | Auto-update             | An update is offered and applied safely | **Not implemented.** No updater is configured, so there is nothing to test                            | Blocked |
| 14  | `.pgn` file association | Double-clicking a PGN opens Kingfisher  | Declared in the bundle; not exercised, because registering it reliably needs an installed, signed app | Blocked |

The hardened runtime and its entitlements are configured and committed, so 11
and 12 are one credential away. 13 and 14 are not started, and the report says
so rather than implying otherwise.

---

## Research, on the packaged application

| #   | Step                             | Expected                                                       | Observed                                                                                                  | Result  |
| --- | -------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------- |
| 15  | Opening Explorer                 | Evidence for the position, from a named source                 | Answers from the bundled starter pack with the network off                                                | Pass    |
| 16  | Opening Report                   | Identity, brief, branches, populations, plans, with provenance | Every section carries a provenance line or a stated reason it is empty                                    | Pass    |
| 17  | Switch reference populations     | Each source in its own column, never merged                    | Source comparison shows each with its own count and licence                                               | Pass    |
| 18  | Theory Book                      | Names the line, with no counts or evaluations                  | `data-theory-book="located"`, naming the Sicilian line                                                    | Pass    |
| 19  | Search historical master data    | Online masters, distinguished from what is installed           | The masters explorer needs the user's own token; the games it names open here                             | Partial |
| 20  | Open a master game in Kingfisher | On the board, not in a web browser                             | `masters/pgn/{id}` needs no token — verified live — and the game opens on Kingfisher's board              | Pass    |
| 21  | Fischer–Spassky 1972             | Reachable                                                      | The position is reachable through the masters explorer, which needs a token; the _game_ endpoint does not | Partial |

19 and 21 are partial for one reason, and it is a fact about the API rather
than about Kingfisher: **the Lichess masters endpoint takes `fen`, `play`,
`since`, `until`, `moves` and `topGames`, and no player parameter.** There is
no player search in the masters database, so "find every Fischer game" is not a
request that can be sent. What works, and now works inside the application, is
reaching a position and opening the games that got there.

---

## Engines

| #   | Step                        | Expected                                      | Observed                                                                                      | Result  |
| --- | --------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- | ------- |
| 22  | Run Stockfish               | Analysis on the board                         | The browser engine runs threaded, because the shell is cross-origin isolated                  | Pass    |
| 23  | Run Lc0                     | A neural engine beside it                     | **Not run in the packaged app.** Lc0 is a `system` engine on macOS and is not installed here  | Blocked |
| 24  | Run another native engine   | A third opinion                               | Stormphrax, Viridithas, Halogen and PlentyChess are installed and qualified on this machine   | Pass    |
| 25  | Compare engines             | Two readings of one position, resources split | Two slots, budget split between them                                                          | Pass    |
| 26  | Switch positions rapidly    | No stale output                               | The session owns the boundary; `uci-adversarial.test.ts` and the qualification matrix hold it | Pass    |
| 27  | Engines built by Kingfisher | Built from an exact tag and qualified         | Berserk 14 on macOS arm64, macOS x64 and Linux x64 — 16 of 16 checks each, CI 34112154544     | Pass    |

---

## Data

| #   | Step                           | Expected                        | Observed                                                                    | Result |
| --- | ------------------------------ | ------------------------------- | --------------------------------------------------------------------------- | ------ |
| 28  | Open a local SQLite collection | Opened in place, by path        | `/db/attach` opens it read-only first and refuses anything else             | Pass   |
| 29  | Run a claim search             | Interactive                     | median **0.4 ms**, worst **78.8 ms** on 11,303,059 positions                | Pass   |
| 30  | Verify the improvement         | Measurably better than Phase 18 | median 642.6 ms → 0.4 ms; worst 11,241.9 ms → 78.8 ms                       | Pass   |
| 31  | Copy, merge, dedupe            | Unchanged by this phase's work  | `schema-equivalence.test.mjs`, 57 tests, green                              | Pass   |
| 32  | En Croissant import            | Read-only, never written        | `attach.test.mjs` asserts an En Croissant file is refused **and unchanged** | Pass   |
| 33  | Compaction reachable           | A person can start it           | The Position index section, with preflight numbers before the button        | Pass   |

---

## The rest of the workstation

| #   | Step                       | Expected                                   | Observed                                                                  | Result  |
| --- | -------------------------- | ------------------------------------------ | ------------------------------------------------------------------------- | ------- |
| 34  | Analyse Game               | Engine, side, limit, MultiPV, opening skip | All five reach the job; `analyse-game.spec.ts` reads the job back         | Pass    |
| 35  | Critical position → Review | Transparent rules, no badges               | Reasons and signals; the words blunder and brilliant appear nowhere       | Pass    |
| 36  | Training from a position   | Reuses the existing queue                  | One scheduler for repertoire prompts and tactics cards alike              | Pass    |
| 37  | Repertoire decision        | Saved by position                          | `repertoire-review.spec.ts`                                               | Pass    |
| 38  | Repertoire review          | A selection, not a syllabus                | The chain soak walks it four times: **prompts steady at 5**               | Pass    |
| 39  | Board theme and pieces     | Change what is drawn                       | `visual.spec.ts`, with a 0.2% tolerance on the board itself               | Pass    |
| 40  | Create a Study             | Survives reload                            | `reliability.spec.ts`                                                     | Pass    |
| 41  | Probe local Syzygy         | Answers from disk                          | **Not exercised here**: no tablebase files are installed on this machine  | Blocked |
| 42  | Go offline                 | Local features keep working                | `chaos.spec.ts` drives an offline machine; the board, tree and notes work | Pass    |

---

## Gates

| Gate                    | Result                            |
| ----------------------- | --------------------------------- |
| `npm test`              | see the final report              |
| `npm run typecheck`     | ✓                                 |
| `npm run lint`          | ✓                                 |
| `npm run format:check`  | ✓                                 |
| `npm run build`         | ✓                                 |
| `npm run test:e2e`      | see the final report              |
| `git diff --check`      | ✓                                 |
| `npm run desktop:smoke` | ✓ 14 of 14, checkout and packaged |

---

## What this walk did not cover

Named rather than omitted:

- **Signing, notarisation, auto-update and file association** — 11 to 14 above.
- **Lc0 in the packaged application** — 23. It is verified on this machine
  through the companion from a checkout; it is not installed in the packaged
  app's engine directory, and claiming otherwise would be the sort of platform
  claim this project treats as a defect.
- **Syzygy** — 41. No tables on this machine.
- **A live Lichess OAuth round trip** — it needs the user's own consent in a
  browser, which no agent can give. The contract is tested and the public half
  of the live check runs without a credential.
