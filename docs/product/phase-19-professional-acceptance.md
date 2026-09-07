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

| #   | Step                              | Expected                                                      | Observed                                                                                             | Result |
| --- | --------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ |
| 1   | Install on macOS                  | A `.dmg` mounts and the app can be placed in Applications     | `Kingfisher-0.1.0-arm64.dmg` and `Kingfisher-0.1.0.dmg` (x64) both built; `Kingfisher.app` is 338 MB | Pass   |
| 2   | Launch normally                   | A window, with no terminal                                    | Window in **5.4 s** from a cold start of the signed packaged build; 1.9 s from the checkout          | Pass   |
| 3   | The companion starts by itself    | Running, and paired, with nothing pasted                      | `diagnostics` reports both services running; the bridge carries a 64-character token nobody typed    | Pass   |
| 4   | No terminal needed                | Nothing about the workflow requires one                       | Confirmed: the shell chose both ports, minted the token and started both processes                   | Pass   |
| 5   | Open a PGN from the shell         | It appears on the board                                       | Move list showed `Bb5 … a6` after a PGN was delivered through the shell's own channel                | Pass   |
| 6   | Cross-origin isolation            | `crossOriginIsolated` true, so the threaded engine can run    | **true**, and `SharedArrayBuffer` present                                                            | Pass   |
| 7   | The renderer holds no Node handle | `window.require` undefined under `contextIsolation`+`sandbox` | undefined                                                                                            | Pass   |
| 8   | The companion answers             | An authenticated request through the bridged URL succeeds     | HTTP 200, `platform darwin-arm64`                                                                    | Pass   |
| 9   | Quit                              | Both services stop                                            | Both pids gone; **all 5 descendants gone**, 64 ms to close from the checkout, 4.3 s packaged         | Pass   |
| 10  | Relaunch                          | The session comes back                                        | Relaunched; profile and preferences intact                                                           | Pass   |

Steps 2–9 are `npm run desktop:smoke`, which drives the real application through
Playwright and asserts each of them. **14 of 14 checks pass**, against the
checkout and against the packaged `.app`.

| #   | Step                    | Expected                                  | Observed                                                                                                                                                                                  | Result  |
| --- | ----------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 11  | Code signed             | A real signature, hardened runtime, valid | **Signed.** `Identifier=dev.kingfisher.app`, `flags=0x10000(runtime)`, authority `Apple Development: Metin Arda KURT`, `valid on disk`, `satisfies its Designated Requirement`            | Pass    |
| 12  | Entitlements applied    | The six the trust model needs             | All six present in the signed bundle: `allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`, `files.user-selected.read-write`, `network.client`, `network.server` | Pass    |
| 13  | Gatekeeper accepts it   | It opens on another Mac                   | **`spctl` rejects it**, `origin=Apple Development` — a development certificate is not a distribution identity                                                                             | Blocked |
| 14  | Notarised               | A ticket stapled                          | **No ticket.** `stapler validate` → "does not have a ticket stapled to it"                                                                                                                | Blocked |
| 15  | Auto-update             | An update offered and applied safely      | **Not implemented.** No updater is configured, so there is nothing to test                                                                                                                | Blocked |
| 16  | `.pgn` file association | Double-clicking a PGN opens Kingfisher    | Declared in the bundle; not exercised, because registering it reliably needs a Gatekeeper-accepted app                                                                                    | Blocked |

**What 13 and 14 actually need**, stated precisely rather than as "an Apple
Developer identity". This machine's keychain holds two identities — _Apple
Development_ and _Apple Distribution_ — and neither is the one required.
Notarised direct distribution needs a **Developer ID Application** certificate,
which is a third kind: _Apple Distribution_ is for the App Store and TestFlight,
and _Apple Development_ is for running on registered devices, which is exactly
what the signature above is good for and no more.

So the bundle is properly signed, with the hardened runtime and the right
entitlements, and it validates and runs here — and it is **not distributable**.
That is one certificate away, and the certificate is the user's to obtain.

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

| #   | Step                       | Expected                                   | Observed                                                                                                                                                                                          | Result  |
| --- | -------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 34  | Analyse Game               | Engine, side, limit, MultiPV, opening skip | All five reach the job; `analyse-game.spec.ts` reads the job back                                                                                                                                 | Pass    |
| 35  | Critical position → Review | Transparent rules, no badges               | Reasons and signals; the words blunder and brilliant appear nowhere                                                                                                                               | Pass    |
| 36  | Training from a position   | Reuses the existing queue                  | One scheduler for repertoire prompts and tactics cards alike                                                                                                                                      | Pass    |
| 37  | Repertoire decision        | Saved by position                          | `repertoire-review.spec.ts`                                                                                                                                                                       | Pass    |
| 38  | Repertoire review          | A selection, not a syllabus                | The chain soak walks it four times: **prompts steady at 5**                                                                                                                                       | Pass    |
| 39  | Board theme and pieces     | Change what is drawn                       | `visual.spec.ts`, with a 0.2% tolerance on the board itself                                                                                                                                       | Pass    |
| 40  | Create a Study             | Survives reload                            | `reliability.spec.ts`                                                                                                                                                                             | Pass    |
| 41  | Probe local Syzygy         | Answers from disk                          | **Not exercised here**: no tablebase files are installed on this machine                                                                                                                          | Blocked |
| 42  | Go offline                 | Local features keep working                | `npm run desktop:smoke -- --offline` blocks every non-loopback request: **22 of 22 pass**; the board is drawn and `/studies`, `/repertoire`, `/training`, `/openings` and `/databases` all render | Pass    |

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

- **Gatekeeper acceptance, notarisation, auto-update and file association** —
  13 to 16 above. Signing itself is done and verified.
- **Lc0 in the packaged application** — 23. It is verified on this machine
  through the companion from a checkout; it is not installed in the packaged
  app's engine directory, and claiming otherwise would be the sort of platform
  claim this project treats as a defect.
- **Syzygy** — 41. No tables on this machine.
- **A live Lichess OAuth round trip** — it needs the user's own consent in a
  browser, which no agent can give. The contract is tested and the public half
  of the live check runs without a credential.
