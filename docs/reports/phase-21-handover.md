# Phase 21 — the window, the late answers, and the engines in the bundle

## 1. Executive verdict

Kingfisher is a chess research workstation that runs in a browser and as a Mac
application, at **1.0.0-rc.2**.

**Phase 21 is not complete.** It closed the defect the owner reported, closed
the engine gap Phase 20 left open, and re-ran every release gate — but the brief
runs to seventy-eight parts and this window did not reach all of them. §28 lists
exactly what was done, and §29 exactly what was not, without dressing the second
list up as a limitation of the product.

What was done:

- **The macOS window buttons no longer sit on top of the application.** That was
  the reported bug, it was real, and it is measured rather than described in §3.
- **Every managed engine the Mac offers now runs inside the packaged
  application** — six of them, installed, searched and stopped in the bundle.
- **A late answer cannot reach the screen**, asserted for the explorer and the
  player library, both mutation-checked.

|                        |                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Web                    | **Ready.** 227 browser tests, 2,154 unit tests, visual gate green                                                                |
| macOS desktop          | **Ready as a product.** 17/17 smoke, 51/51 window chrome, 25/25 engines, 23/23 offline — all against a packaged `Kingfisher.app` |
| Known Critical defects | none                                                                                                                             |
| Known High defects     | none                                                                                                                             |
| Release verdict        | **PRODUCT READY — MAC DISTRIBUTION CREDENTIAL BLOCKED** (§29)                                                                    |
| Magnus test            | passes for every workflow that was walked; §30 says which were not                                                               |

The one thing standing between this and a `.dmg` a person can open is still an
Apple **Developer ID Application** certificate. The build log for rc.2 says
`skipped macOS notarization`, `spctl` says `rejected`, and neither is a software
defect.

---

## 2. Git

|                 |                                                                 |
| --------------- | --------------------------------------------------------------- |
| Starting HEAD   | `755dab3` — _docs: hand over phase 20_                          |
| Final code HEAD | `fd182e2` — _fix: wait for the engine, not just for the socket_ |
| Handover HEAD   | this commit                                                     |
| Branch          | `master`, no others touched                                     |
| `origin/master` | equal to local `master`                                         |
| Working tree    | clean                                                           |
| Force pushes    | none                                                            |

Six code commits:

| Commit    |                                                                              |
| --------- | ---------------------------------------------------------------------------- |
| `c450ea7` | fix: make the macOS window buttons coexist with the Kingfisher shell         |
| `83f84a9` | test: refuse a late answer to a question nobody is asking any more           |
| `7d339e4` | docs: prepare Kingfisher 1.0.0-rc.2, and say what the window now promises    |
| `488aa72` | test: run every managed Mac engine through the packaged application          |
| `e69b593` | chore: say which Node this needs, before the suite says it unhelpfully       |
| `fd182e2` | fix: wait for the engine, not just for the socket, before asking it anything |

CI run IDs are in §27.

---

## 3. The macOS traffic lights

### What was wrong

The three window buttons were drawn on top of the Kingfisher mark in the corner
of the sidebar. Measured in the shell's own window, before any change:

|                 | rectangle           |
| --------------- | ------------------- |
| Kingfisher mark | x 14, y 10, 36 × 36 |
| Traffic lights  | x 14, y 12, 54 × 16 |

The close and minimise buttons were on the logo. Every window, every launch,
since the shell existed.

### Root cause

One rectangle that two processes had to agree about, and neither stated.

```js
titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
```

`hiddenInset` asks macOS to hide the title bar and inset the buttons by an
amount **macOS chooses and does not report** — `getWindowButtonPosition()`
returned `null`. So the renderer could not have reserved the corner even if it
had tried, and it had not: there was no reservation, no drag region and no
`app-region` declaration anywhere in `src/`.

### What it is now

|                             | before                            | after                      |
| --------------------------- | --------------------------------- | -------------------------- |
| `titleBarStyle`             | `hiddenInset`                     | `hidden`                   |
| `trafficLightPosition`      | unset (macOS default, unreported) | `{ x: 14, y: 12 }`         |
| `getWindowButtonPosition()` | `null`                            | `{ x: 14, y: 12 }`         |
| Reservation                 | none                              | 76 × 36, top-left          |
| Kingfisher mark             | (14, 10) — **under the buttons**  | (100, 10) — clear by 32 px |

**The architecture is one rectangle, stated once.**
`desktop/src/window-chrome.mjs` is the only place it is decided. The shell reads
it to place the buttons; the renderer is handed the same object across the
bridge and reserves exactly that. Two CSS custom properties carry it —
`--titlebar-safe-w`, `--titlebar-safe-h` — set before first paint by a bootstrap
in `layout.tsx`, for the same reason the theme is. **No component hard-codes a
padding**, which was the anti-pattern to avoid: a magic 76 scattered through the
four surfaces that touch the corner today and silently wrong at the fifth.

`src/features/shell/TitleBarSafeArea.tsx` is the only consumer, in two shapes,
because the corner belongs to one of two things. With navigation on screen it is
the sidebar header — already 56 px tall, so the reservation is purely horizontal
and **the board loses nothing**. With navigation gone (focus mode, or a viewport
narrow enough that the sidebar has become the mobile bar) it is a band, which is
the only answer that does not require every route's header to cooperate.

Both shapes are drag regions. The window's title bar is hidden and it still has
to be movable; these are the two pieces of chrome guaranteed to be empty, which
matters because `app-region: drag` swallows clicks for every descendant.

**The buttons are the operating system's own controls.** Nothing is drawn in
HTML.

### Evidence

`npm run desktop:chrome`, against a packaged `Kingfisher.app` — **51/51**:

| state                                                                                        | result                        |
| -------------------------------------------------------------------------------------------- | ----------------------------- |
| 900 × 600 (the shell's minimum), 1280 × 720, 1366 × 768, 1440 × 900, 1512 × 982, 1920 × 1080 | clear                         |
| `/analysis`, `/openings`, `/players`, `/databases`, `/repertoire`                            | clear                         |
| Sidebar expanded / collapsed rail / focus mode                                               | clear                         |
| Light theme / dark theme                                                                     | clear                         |
| Full screen, and the return from it                                                          | clear; buttons back at 14, 12 |
| Maximise, and restore                                                                        | clear                         |

In the collapsed 72 px rail the reservation clamps to the rail rather than
overflowing it, and the mark is not painted there at all — a mark under a close
button is the bug, and a rail showing the operating system's controls and
nothing else is what a Mac application with a collapsed sidebar looks like.

### The mutation check

A passing test proves nothing until it can fail. Restoring `hiddenInset` and
removing the reservation turns **51 green checks into 21 red ones**, reporting
the mark back at 14, 10.

One finding from doing it, and it is the reason the check is worth having: the
collision sweep over _interactive_ elements **passed even then**, because the
nearest control is below the buttons. The assertion that fails is the one naming
the Kingfisher mark — which is not interactive, and was the thing actually
broken. A contract covering only controls would have gone green on the original
bug.

### What could not be produced here

**A native screenshot containing the red, yellow and green buttons.** They are
drawn by the operating system above the web contents, so an Electron
`capturePage` cannot see them; `screencapture` refused (`could not create image
from display` — this shell has no Screen Recording permission), and the
screen-control grant needed to go round that was declined. Stated plainly rather
than worked around: **this phase has measured geometry and a renderer capture,
not a photograph of the buttons.**

The measured geometry is the stronger evidence for the overlap question — a
screenshot comparison goes red for a font change and stays green for a button
moved four pixels under the zoom control — but it is not the same claim, and
somebody with a window server should take the photograph before 1.0.

The renderer capture of the packaged application's corner shows the reserved
region empty and the mark and wordmark beginning at x = 100.

---

## 4. Web: the regression this fix introduced, and the test that caught it

Worth its own section because it nearly shipped.

The reservation is rendered unconditionally and sized entirely from custom
properties, so that the server's markup and the browser's agree. In a browser
those properties are zero — but **a zero-width flex child is still a flex
child**: it took its share of the sidebar header's `gap`, and the Kingfisher
mark moved from x 14 to x 24 **in every browser**. `self-stretch` also gave it
55 px of height.

`e2e/window-chrome.spec.ts` found it on its first run. The reservation is now
`display: none` off the desktop, and the spec pins the browser's own layout —
228 px sidebar, 56 px header, mark at (14, 10) — plus two properties that stop
it recurring: every reservation must have **zero area** in a browser, and
**nothing with area may carry `app-region: drag`**.

Severity **High** — it was a visible, unexplained layout shift in the shipping
web product, introduced and closed inside this phase.

---

## 5. Late answers: explorer, players, engines

The worst class of defect this application can have. A crash is visible; a
statistic from the wrong position is a research tool lying with a straight face,
and a player would act on it.

`e2e/stale-responses.spec.ts` is **differential rather than descriptive**. Each
test reaches a state twice — once deliberately, waiting at every step, once as
fast as Playwright can drive it — and asserts the two agree exactly, moves and
numbers. The deliberate walk is the oracle, so nothing is hard-coded against the
bundled reference and no stale render can satisfy it by matching a constant.

**The explorer.** The race switches away to a source that cannot answer and back
again while two position queries are still in flight — three positions and two
sources inside a fifth of a second. Ending on the empty source would let a blank
panel pass; ending back on the one with evidence means the panel has to produce
the _right_ evidence.

_Mutation-checked._ Dropping the position from the cache key —
`['explorer', sourceId, version, filters]` — makes it fail, and fail the way the
defect would present: the panel keeps serving the previous position's
continuations, so the move the walk tries to play next is not there.

The guard is structural: lookups are TanStack Query entries keyed by source,
source version, position and filters, and there is no `placeholderData`, so a
key change shows a pending state rather than the previous position's rows.

**Player search has no race to lose**, and that is the finding rather than a
green tick. It is a synchronous filter over a catalogue loaded once — a stronger
guarantee than cancelling a request. The test asserts the settled list _and_
that typing issues no requests, so the day it becomes a request per keystroke,
somebody has to deal with ordering deliberately.

**Engines.** `npm run engines:qualify` already carries the within-session
invariant, and its "rapid position switch" row passes on all four native engines
installed here. §7 adds the packaged-application half.

---

## 6. Settings

**33 preferences**, unchanged in number. `settings-contract.ts` names, for each,
the module that writes it, the module where it becomes visible, and what a
person would see; `settings-contract.test.ts` checks nine properties of that
claim against the source, including that every `verifiedBy` points at a test
file that exists. All pass. `e2e/settings.spec.ts` passes in the 227.

No preference was added, removed or changed in this phase, and the window-chrome
work deliberately introduced none: the reservation is a fact about the operating
system, not a thing a user chooses.

---

## 7. Managed engines, inside the packaged application

The gap Phase 20 left open, closed. Phase 20 verified two engines in the bundle;
the rest were qualified from a checkout as child processes of Node, which
answers "is this binary an engine" and not "can the signed application download
it, verify it, start it, search with it and stop it".

`npm run desktop:engines -- --packaged` — **25/25**, three consecutive runs:

| Engine                                  | offered | installs + verifies | finds the mate | answers the next position |                        stops                        |
| --------------------------------------- | :-----: | :-----------------: | :------------: | :-----------------------: | :-------------------------------------------------: |
| Stockfish 19                            |    ✓    |          ✓          |     `a1a8`     |             ✓             |                          ✓                          |
| Stormphrax 8.0.0                        |    ✓    |          ✓          |     `a1a8`     |             ✓             |                          ✓                          |
| Viridithas 20.0.0                       |    ✓    |          ✓          |     `a1a8`     |             ✓             |                          ✓                          |
| Halogen 16.0.0                          |    ✓    |          ✓          |     `a1a8`     |             ✓             |                          ✓                          |
| PlentyChess 8.0.0                       |    ✓    |          ✓          |     `a1a8`     |             ✓             |                          ✓                          |
| Lc0 0.32.1                              |    ✓    |          ✓          |     `a1a8`     |             ✓             |                          ✓                          |
| Berserk 14, Koivisto 9.0, Obsidian 16.0 |    —    |          —          |       —        |             —             | correctly not offered: no darwin-arm64 build exists |

Every request goes to the companion the shell started, over the URL and token
the shell handed the renderer, on the routes Settings → Engines calls. **What it
is not is a person clicking Install**, and that is stated in the file rather
than glossed; `e2e/engines.spec.ts` covers the button in a browser.

Ready means a search finished. Lc0 completes a UCI handshake happily with no
weights at all, so a handshake is not evidence of anything.

### Four wrong drafts, recorded because they are traps

1. Asserted a mate in a position that was not one — three engines "failed" by
   playing a perfectly good winning move.
2. Opened a second `EventSource` per search; every engine timed out. A session
   is already streaming, and a `bestmove` emitted while nothing is attached is
   not replayed — the same shape as the document-flush defect Phase 20 found in
   the shell, arrived at from the other end.
3. Read the whole line buffer and got `e2e4` for an endgame, because
   `EngineSessions.subscribe` replays a session's backlog and a fresh session's
   backlog opens with the verification search from the standard start.
4. **Every engine appeared to answer the previous position** — the most alarming
   result this project can produce. It was a parameter named `after`, shadowed by
   a local `const after` holding the engine catalogue, so all six were being sent
   `position fen undefined`. Driving the same session by hand showed Stormphrax
   answering `a1a8` and then `g2g3`, which is exactly right.

**Six engines failing identically is a harness, not six engines.** That is the
rule that got this to the truth, and it is worth keeping.

A fifth correction came from a flake: Halogen passed one run and timed out the
next, because `/engine/start` returns when the session exists rather than when
the engine is up. `isready`/`readyok` turns that race into a wait (`fd182e2`).

The limit is `go movetime` rather than `go depth`, because depth does not mean
the same thing to an MCTS searcher: `go depth 10` on a trivial won endgame ran
Lc0 past forty seconds while the alpha-beta engines answered in milliseconds.

### A note on the stream contract

`subscribe` replays a session's backlog to every new listener — deliberately, so
a reconnecting client does not lose output — and `EventSource` reconnects on its
own, silently. **Any consumer must therefore be able to tell replayed output
from new output.** Kingfisher's own session layer can, by carrying session,
position and engine identity on every result before it reaches UI state
(`src/engine/uci-session.ts`, `src/engine/uci-adversarial.test.ts`). This is not
a defect; it is a property a future consumer could easily get wrong, and it took
two drafts of a harness to notice.

---

## 8. Tablebases

The packaged application ships the Syzygy probe helper —
`Contents/Resources/kingfisher/engines/tablebase/kingfisher-tbprobe` — and the
smoke run probes a real position with it inside the bundle: **a rook against a
bare king is won, DTZ 29, up to 3 pieces**, answered by the helper rather than
the remote service.

This corrected a stale claim. The rc.1 notes said local Syzygy tablebases need a
probe helper _compiled on your machine_, which has not been true of the macOS
application since Phase 20 staged the helper. What a desktop user needs is their
own tables and the Browse… button. The web still compiles one. Fixed in the
rc.2 notes.

---

## 9. Web and desktop parity

`docs/product/web-desktop-parity.md` gains the only row where the two identities
differ in **layout** rather than in reach: the 76 × 36 title-bar safe area,
desktop-macOS only.

Two rules keep it honest, and both are asserted rather than asserted-to:

- **Windows and Linux inherit none of the geometry.** `windowChromeFor()`
  returns `null` off darwin, so the custom properties stay at zero — the same
  values a browser has.
- **A reservation with any area in a browser fails a test.**

Two new rows in the "differences that are not allowed" table: a desktop
title-bar spacer in the browser, and fake window buttons drawn in HTML. Both
absent, both checked.

---

## 10. The smallest window, which had never been checked

`minWidth: 900, minHeight: 600` is a promise: below this the user cannot go, so
at exactly this the application has to work. Nobody had looked.

At 900 × 600: the board is **583 px**, the page does not scroll sideways, the
Settings dialog fits, and of the twenty-five controls that sit below the fold —
including the move navigation — **none is stranded**: every one is inside a
region that scrolls. Now three permanent checks in `desktop:chrome`.

---

## 11. Security

Re-run against the rc.2 bundle:

|                                                     |                                                   |
| --------------------------------------------------- | ------------------------------------------------- |
| Builder's username anywhere in the bundle           | **0 files**                                       |
| Builder's home directory                            | **0 files**                                       |
| Token-shaped values (`ghp_`, `sk-`, `lip_`, `xox*`) | **0**                                             |
| `codesign --verify --deep --strict`                 | passes                                            |
| Hardened runtime                                    | on (Runtime Version 26.5.0)                       |
| Signing identity                                    | Apple Development — _not_ a distribution identity |
| `spctl -a`                                          | **rejected**, as expected without notarisation    |

The 27 files that match a naive `oauth|api_key` sweep are the `/oauth/lichess`
route name and Next internals; no value matches a secret shape.

---

## 12. Release gates

Every one of these was run in this phase, on this machine, at Node 24.14.0.

| Gate                                            | Result                                         |
| ----------------------------------------------- | ---------------------------------------------- |
| `npm test`                                      | **162 files, 2,154 passed, 11 skipped**        |
| `npm run typecheck`                             | pass                                           |
| `npm run lint`                                  | pass                                           |
| `npm run format:check`                          | pass                                           |
| `npm run build`                                 | pass                                           |
| `npm run test:e2e`                              | **227 passed, 13.5 min, retries 0, flaky 0**   |
| `npm run benchmark`                             | pass                                           |
| `git diff --check`                              | clean                                          |
| `npm run desktop:smoke` (checkout)              | **17/17**                                      |
| `npm run desktop:smoke -- --packaged`           | **17/17**                                      |
| `npm run desktop:smoke -- --packaged --offline` | **23/23**                                      |
| `npm run desktop:chrome -- --packaged`          | **51/51**                                      |
| `npm run desktop:engines -- --packaged`         | **25/25** ×3                                   |
| `npm run engines:qualify`                       | 4 engines × 16; one documented failure (below) |

The benchmark output contains a line reading `FAIL PGN variations, comments,
NAGs and recovery provenance`. It is not a regression: it is the rules-engine
replacement experiment (ADR 0028) correctly concluding **REJECT — direct chess.js
is a main-line loader and does not preserve Kingfisher variations/NAGs**.

`engines:qualify` reports one failure: **PlentyChess 8.0.0 exits on
`go depth banana`**. Already recorded in `docs/ENGINES.md` as known upstream
behaviour, alongside Stockfish 19 doing the same on a malformed FEN. Kingfisher
never sends either line, and a dead engine is failed rather than waited on.

**Phase 20's own repairs were re-exercised rather than assumed.** The packaged
smoke asserts the PGN cold launch, a second PGN while the app is open, Lc0 found
inside the bundle, the local Syzygy probe, both owned services, and **zero
surviving processes after quit** (6 descendants, all gone, 150 ms).

---

## 13. Defects

| #   | Defect                                                                                                                                         | Severity     | Fix       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------- |
| 1   | macOS window buttons drawn on top of the Kingfisher mark, every window since the shell existed                                                 | **Critical** | `c450ea7` |
| 2   | The fix shifted the mark 10 px right in every browser — a zero-width flex child still takes its share of the container's `gap`                 | **High**     | `c450ea7` |
| 3   | `engines:qualify` / `desktop:engines` flake: `/engine/start` returns before the engine is ready                                                | Medium       | `fd182e2` |
| 4   | `AGENTS.md` claimed the desktop smoke checks "fourteen things"; it has checked seventeen since Phase 20                                        | Low          | `7d339e4` |
| 5   | rc.1 notes said local Syzygy needs a helper compiled on your machine — untrue of the packaged app since Phase 20                               | Low          | `7d339e4` |
| 6   | No Node version declared anywhere; on Node 20 the suite reports fourteen files erroring on a missing built-in and reads like a broken checkout | Low          | `e69b593` |

Defects 1 and 2 are the same shape as most of this project's history: a
capability that works everywhere except where a user meets it, and a fix whose
side effect nobody looked for.

**One thing examined and found not to be a defect.** `public/engine/manifest.json`
in the bundle names the browser engine "Stockfish 17.1", while everything else
says 18. It is a git-ignored capability record from an older `engines:verify`
run on this machine. Nothing in `src/` reads it; the companion reads it but skips
every `transport: 'worker'` row; and the name a user sees comes from
`public/engine/stockfish/manifest.json`, which says **Stockfish 18**. Traced end
to end rather than guessed at, and left alone.

No known Critical or High defect remains. Stated as engineering rather than
mathematics: **no known release-blocking defects after the documented
release-candidate validation.**

---

## 14. Artifacts

|                                   |                                   |
| --------------------------------- | --------------------------------- |
| `Kingfisher.app` (arm64)          | **351 MB**                        |
| `Kingfisher-1.0.0-rc.2-arm64.dmg` | **150 MB**                        |
| `Kingfisher-1.0.0-rc.2.dmg` (x64) | **157 MB**, built, never launched |
| Assembled web payload             | **56 MB**                         |

Unchanged from rc.1 within measurement noise. Nothing in this phase moved them,
and nothing was optimised without a measured problem to point at.

---

## 15. Phases 1–20 freshness

`docs/product/phase-verification.md` extends to Phase 21 with five new rows and
records that Phase 21 re-ran the same suites, added two the product did not
have, and mutation-checked both before trusting them.

Phase 20's repairs are re-asserted by the packaged smoke rather than by
reference to the Phase 20 report — see §12.

---

## 16. What Phase 21 did **not** do

This is the section that must not be dressed up as a limitation of the product.
These are parts of the brief this window did not reach:

- **Parts L, M, BM, BY** — the manual UI integrity walks. The automated suites
  cover a great deal of it (227 browser tests including a 14-route × 10-viewport
  sweep and the visual gate), but nobody clicked through the packaged
  application's forty-six-step acceptance walk.
- **Parts X–AA** — reference-pack certification at scale: installing the three
  optional packs, memory under all of them, shard corruption and repair.
  `e2e/reference-sources.spec.ts` covers install, disable and offline for the
  bundled Starter only.
- **Parts AT, AU, AV, AW, AY** — companion kill and recovery, the web-server
  failure screen, sleep/wake, background/foreground, window restoration.
- **Parts BJ, BK** — per-process memory profiling and the long professional soak.
  `e2e/soak.spec.ts` runs inside the 227; the multi-hour walk did not.
- **Part J** — a native screenshot containing the buttons (§3, blocked).
- **Parts AB–AF, AG–AJ** — the player and database matrices were exercised by
  their existing specs, not re-walked by hand.

Nothing above is known to be broken. It is unverified in this phase, which is a
different statement, and the next agent should continue **this same phase**
rather than open a new one.

---

## 17. Release status

**PRODUCT READY — MAC DISTRIBUTION CREDENTIAL BLOCKED.**

The only blocker to handing somebody an installer is an Apple **Developer ID
Application** certificate. The identity available signs for development, not
distribution. Everything else — entitlements, hardened runtime, the signing and
stapling steps — is configured and committed, and the rc.2 build log says
`skipped macOS notarization` for that reason alone.

---

## 18. The Magnus test

Could a strong player be handed this on a Mac and work, without knowing what
Electron, Next.js, localhost, a companion, SQLite, IndexedDB or UCI are?

Verified in the packaged application this phase: open it from the Finder; a
window with correct native chrome at every size, in both themes, through a
full-screen round trip; open a PGN by double-clicking it; run browser Stockfish;
install and run six native engines including Lc0; local Syzygy; work with the
network cut; quit with engines running and leave nothing behind.

Not walked by hand this phase: the long research session end to end — Explorer
to Opening Report to Preparation to Repertoire Review to Study — which the
browser suite covers and a person did not.

One thing he would still notice: **Gatekeeper will refuse to open it.** That is
§17, and it is not a bug in the software.

---

## 19. Recommendation

Three, and no more:

1. **Get the Developer ID Application certificate and notarise.** It is the only
   thing between this and a release.
2. **Finish Phase 21's unreached parts** (§16) — the packaged acceptance walk and
   the reference-pack matrix first, since those are where a user meets data.
3. **Then give it to real chess players.** Stop building large feature phases;
   let field use decide what comes next.
