# Phase 20 — the release candidate

```
Phase 20 status: COMPLETE. Every autonomous item on the brief was done or is
                 recorded here with the reason it could not be, and there is
                 exactly one of the latter: a certificate Apple issues.
```

Every number below names the command that produced it. Phase 19's numbers were
re-run rather than quoted, and §7 is what happened when one of them turned out
to be measuring the measuring apparatus.

---

## 1. Executive verdict

**What is Kingfisher now?** A chess research workstation that runs as a web
application and as a Mac application, at **1.0.0-rc.1**, with every release
gate green and no known release-blocking defect.

**Phase 20 complete?** Yes.

**Web release ready?** Yes. 2,154 unit tests, 222 browser tests at zero
retries, 24 visual, a production build, and no regression in the bundle — the
heaviest route moved from 371.4 kB gzipped to 372.7 kB.

**macOS release ready?** The product, yes. The distribution, no, and it is not
a code problem: the bundle is signed with the hardened runtime and all six
entitlements, `codesign --verify --deep --strict` reports it valid and
satisfying its Designated Requirement, and **Gatekeeper still rejects it**
because notarised distribution needs a _Developer ID Application_ certificate.
This keychain holds _Apple Development_ and _Apple Distribution_, and neither
is that. §5.

**Public macOS distribution ready?** No. One credential away, and §5 says
exactly which and what to do with it.

**Known release blockers?** None for the web. One for macOS distribution, and
it is the certificate.

**The Magnus test.** §28. It changed from "yes, except he cannot be handed the
installer" to the same answer with three fewer asterisks — Lc0, tablebases and
double-clicking a PGN all now work inside the packaged application, and none of
them did when this phase started.

**Verdict: PRODUCT READY — MAC DISTRIBUTION CREDENTIAL BLOCKED.** §29.

---

## 2. Git and GitHub

|                        |                                   |
| ---------------------- | --------------------------------- |
| Branch                 | `master`                          |
| Phase 20 begins        | `fd966ae` (the Phase 19 handover) |
| Last gated code commit | **`7e0c89d`**                     |
| Handover HEAD          | this report, documentation-only   |
| Commits                | **13 code, plus this report**     |
| Diff                   | **42 files, +2,083 / −68**        |
| New files              | **18**                            |
| Working tree           | clean                             |

```
7e0c89d ci: stop a slow runner reporting itself as a failing gate
a4dcb82 fix: let the desktop package on Windows at all
d394aa2 fix: open the PGN somebody double-clicked, which had never once worked
b3d5d55 feat: make local tablebases work in the packaged application, and probe one there
126653b fix: take every trace of the build machine out of the signed application
a4014c3 ci: find out whether the desktop packages on Windows and Linux
2f216b9 fix: stop shipping the build machine's paths, and find the tablebase helper here
6cc79ea test: probe a real tablebase, with tables a reader can check
ad51262 fix: find an engine the machine already has, when there is no shell to ask
7e1fa9b fix: make the desktop bundle a property of the repository, not of the machine
1684bf5 feat: give Kingfisher a real version, and write down what a release means
20c8c37 perf: take the companion off the path to a window, and measure what launch costs
848a9fa fix: make the shell's own file dialogs reachable, and say where every one leads
```

**CI.** Run **34147643787** on `7e0c89d` — the last gated code commit. §24 has
the table, including the run before it that was killed by a job timeout with
nothing failing. Desktop packaging run **34145332653** built Windows and Linux,
both for the first time.

---

## 3. Web product

|                   |                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Startup           | Unchanged; no desktop work reached the web build                                          |
| Heaviest route    | **372.7 kB** gzipped (`/review`), against 371.4 kB in Phase 19                            |
| Total client JS   | 3,505.6 kB across 108 files, lazy chunks included                                         |
| Browser Stockfish | Stockfish 18 WebAssembly, sandboxed by the browser                                        |
| Starter data      | 172,376 games, 246,870 position aggregates, 12,522 players, 20 full moves deep, offline   |
| Offline           | Board, studies, repertoire, training, openings, databases all render with the network cut |

The web build was deliberately not changed for the desktop. Standalone output,
cross-origin isolation and the image-optimiser decision in §8 are all behind
environment variables that only `scripts/build-desktop-web.mjs` sets; with them
unset `npm run build` emits what it emitted before.

---

## 4. Desktop product

|                       | Measured                                               |
| --------------------- | ------------------------------------------------------ |
| Electron              | **44.2.0**, Chromium 152.0.7977.76, Node 24.20.0       |
| `Kingfisher.app`      | **351 MB** (382 MB at the start of this phase)         |
| arm64 DMG             | **150 MB** (169.7 MB at the start of this phase)       |
| x64 DMG               | **156 MB**                                             |
| Window visible        | **~630 ms** (558 / 684 / 631 over three warm launches) |
| Renderer loaded       | **726 ms**                                             |
| Companion ready       | **217 ms**                                             |
| Quit, everything gone | **171 ms**, 6 descendants before, 0 after              |
| Packaged smoke        | **17/17**                                              |
| Offline smoke         | **23/23**, every non-loopback request blocked          |

---

## 5. macOS distribution

| Artifact                          | Status                                       |
| --------------------------------- | -------------------------------------------- |
| `Kingfisher.app` (arm64)          | **built, signed, launched, driven** — 351 MB |
| `Kingfisher-1.0.0-rc.1-arm64.dmg` | **built** — 150 MB                           |
| `Kingfisher-1.0.0-rc.1.dmg` (x64) | **built**, not launched                      |

`codesign -dv`: `Identifier=dev.kingfisher.app`, `flags=0x10000(runtime)`,
`TeamIdentifier=3B5CYF9DQ4`, `Sealed Resources version=2 rules=13 files=1917`.
`codesign --verify --deep --strict`: **valid on disk**, **satisfies its
Designated Requirement**.

`spctl -a -t exec`: **rejected**, `origin=Apple Development`.
`xcrun stapler validate`: **does not have a ticket stapled to it**.

**What unblocks it, exactly.** `security find-identity -v -p codesigning` on
this machine returns two identities, _Apple Development_ and _Apple
Distribution_. Notarised direct distribution needs a third kind:

1. In the Apple Developer account, create a **Developer ID Application**
   certificate and install it in this keychain. (An individual account can;
   Apple Distribution is for the App Store, Apple Development for registered
   devices, and neither can be notarised for direct download.)
2. Create an app-specific password for the Apple ID and store it:
   `xcrun notarytool store-credentials`.
3. `npm run desktop:dist` — electron-builder picks the Developer ID identity
   automatically once it is the best available match.
4. `xcrun notarytool submit --wait`, then `xcrun stapler staple`.
5. Re-run `spctl -a -t exec -vv`; it must say `accepted`.

Everything for steps 3–5 is configured and committed. Nothing about the
application changes.

**Finder association.** `.pgn` is declared with `LSHandlerRank = Alternate`
against Apple's own `com.apple.chess.pgn` type, so Apple Chess remains the
default handler and Kingfisher appears under Open With. The document paths
themselves were tested and one of them was broken; §22.1. Verified with the
application installed in `/Applications` and registered with `lsregister`:
opening a PGN launches it, opening a second while it is running is handled by
the running instance rather than starting a second, and quitting leaves zero
processes.

---

## 6. Windows and Linux

Both **packaged for the first time**, in CI run 34145332653, and neither is a
supported release. The distinction is the point of this section.

|             | Configured |   Built    |   Smoke-tested   | Supported |
| ----------- | :--------: | :--------: | :--------------: | :-------: |
| macOS arm64 |     ✅     |     ✅     |   ✅ 17 checks   |  **✅**   |
| macOS x64   |     ✅     |     ✅     | ✗ never launched |     ✗     |
| Windows x64 |     ✅     | ✅ **new** |        ✗         |     ✗     |
| Linux x64   |     ✅     | ✅ **new** |        ✗         |     ✗     |

Artifacts produced: `Kingfisher Setup 1.0.0-rc.1.exe` (271 MB),
`win-unpacked/Kingfisher.exe` (246 MB), `win-arm64-unpacked/Kingfisher.exe`
(226 MB), `Kingfisher-1.0.0-rc.1.AppImage` (155 MB) and its arm64 counterpart
(156 MB).

Getting there took two real bugs, both invisible until a Windows runner ran the
code for the first time — §22.7. Nobody has installed or launched any of these,
so README and the release notes call them unsupported. **Producing an installer
and supporting a platform are different claims.**

---

## 7. Startup performance, and a number that was measuring the wrong thing

Phase 19 reported **5.4 s** to a window, packaged. That number is real and it
is not what a user experiences: it is `npm run desktop:smoke`'s measure, taken
across Playwright's `electron.launch()` — which spawns the application with
remote debugging, waits for the CDP endpoint, connects to it, and only then
asks for the first window.

Phase 20 instrumented the shell itself, which is the only place the answer
lives. `KINGFISHER_STARTUP_TRACE=1` on the packaged binary:

| Stage            |   Measured |
| ---------------- | ---------: |
| Electron ready   |      76 ms |
| Companion ready  |     217 ms |
| Web server ready |     441 ms |
| Window created   |     513 ms |
| **Window shown** | **627 ms** |
| Renderer loaded  |     726 ms |

Three warm launches put the window at **558, 684 and 631 ms**. The same smoke
harness that reported 5.4 s reports 4.1 s online and **0.7 s offline** on this
build — a harness whose result moves by a factor of six with the network is not
measuring the shell.

**So: the launch was already good, and Phase 19's report of it was not.** The
brief asked for 2–3 seconds to an interactive board; it was under one second
before this phase began, and nobody knew.

**What did change, and honestly what it bought here.** The shell waited on
`Promise.all([web.start(), companion.start()])` before creating a window, so
the slower of the two decided when anything appeared — while the comment three
lines above said the companion was not a prerequisite. It now waits only on the
web server. On this machine, with a light companion profile, the companion was
ready at 217 ms and the web server at 441 ms, so **the change bought nothing
measurable here**. It removes a dependency that grows with how much a user has
configured: the companion replays registered collections and custom engines and
stats each recorded path, which is work proportional to somebody's setup, and
it was on the path to a blank board.

That is the whole claim. No before/after is offered for a speedup that was not
demonstrated.

**Data is not on the startup path**, checked rather than assumed. `PackReader`
holds a manifest and a chunk source and nothing else; chunks are read on first
use behind an LRU. Installed optional packs are listed at start-up — one
IndexedDB read of manifests — and never deserialised until something asks a
position. §11.

---

## 8. Bundle and footprint

`du -sh` on the signed bundle, before and after this phase's changes:

|                       |   Before |       After |
| --------------------- | -------: | ----------: |
| `Kingfisher.app`      |   382 MB |  **351 MB** |
| arm64 DMG             | 169.7 MB |  **150 MB** |
| Assembled web payload |  81.8 MB | **53.5 MB** |

Where the 351 MB is:

|                                            |         |
| ------------------------------------------ | ------: |
| Electron framework                         |  285 MB |
| Web payload (server, `.next`, public)      | 53.5 MB |
| — of which reference data                  |   16 MB |
| — of which the browser engine              |   14 MB |
| — of which `.next/static`                  |    4 MB |
| Companion, scripts, helpers                | ~0.4 MB |
| Everything else (helpers, icon, signature) |  ~12 MB |

Two things came out, and one thing that looked like a saving was not.

**28.4 MB of `sharp` and libvips.** Kingfisher renders no `next/image`
anywhere — the pieces are a few hundred bytes of SVG drawn with a plain `<img>`
— so the image optimiser is never invoked, and the standalone trace bundled
what it _would_ need. Declaring `images.unoptimized` did **not** remove them:
measured, the app was still 379 MB with it set, because Next's tracer follows
what the compiled server could import rather than what the configuration will.
They are pruned after assembly, and the claim that this is safe was tested
rather than reasoned about — with both directories gone the standalone server
starts and answers ten routes with HTTP 200 and serves the 7.3 MB engine.

**2.9 MB of benchmark PGNs**, git-ignored, read by nothing, and in the bundle
only because they happened to be in `public/` on the machine that built it.

Nothing was removed that affects offline capability. The 16 MB of reference
data and the 14 MB browser engine are the offline story and both stayed; the
Syzygy helper was **added**, at 72 KB.

---

## 9. Built-in data

| Source             |   Games | Positions | Players |    Depth |   Size | Licence      |    Ships     |
| ------------------ | ------: | --------: | ------: | -------: | -----: | ------------ | :----------: |
| Kingfisher Starter | 172,376 |   246,870 |  12,522 | 20 moves |  16 MB | CC BY-SA 4.0 | **built in** |
| Elite OTB          | 407,538 | 5,438,808 |  33,607 | 20 moves | 339 MB | CC BY-SA 4.0 |  one click   |
| Recent Theory      |  44,200 |   918,069 |   2,567 | 20 moves |  34 MB | CC BY-SA 4.0 |  one click   |
| High-Rated Online  | 305,169 |   315,668 |       — | 20 moves |  86 MB | CC0-1.0      |  one click   |

All four are built by `scripts/build-reference-pack.mjs` from the Lichess open
database, verified against the publisher's digests, and replayed through
Kingfisher's own rules code. Every pack is verified chunk by chunk against its
manifest's own SHA-256 on read; a damaged chunk raises "verify or reinstall
this pack" rather than answering wrongly.

**A fifth source is new this phase**: the three-piece Syzygy set, 56 KB, all
ten files verified against the publisher's own SHA-256 manifest before being
committed. Provenance in `THIRD_PARTY_DATA.md`. §14.

`e2e/fresh-user.spec.ts` is the release gate for the fresh-profile experience
and passed in the final run: board, browser engine, Theory Book, Explorer,
opening name, variation brief, starter statistics, full games and player
results, with nothing imported and nothing configured.

---

## 10. Opening Explorer and Theory Book

Unchanged this phase and re-verified rather than assumed: `theory-book.spec.ts`,
`source-comparison.spec.ts`, `reference-sources.spec.ts`,
`variation-brief.spec.ts` and `opening-report.spec.ts` all pass in the final
run, inside the 222.

The four questions stay four questions. The Theory Book shows no counts, no
percentages and no evaluations, and `e2e/theory-book.spec.ts` asserts their
absence. Populations are never merged: comparing sources puts each in its own
column with its own game count and licence, and there is deliberately no
combined figure.

**No Explorer work was done this phase**, because none was needed and the brief
was explicit that Phase 20 is not a feature phase. What this phase verified is
that it still holds, on the same evidence a reviewer can re-run.

---

## 11. Databases

Re-verified, not rewritten. `phase7.spec.ts`, `en-croissant.spec.ts` and the
companion's 224 tests cover IndexedDB collections, the compact SQLite schema,
the claim index, copy/move/merge, dedupe, federated search, integrity, backup,
restore, En Croissant import and native attach, and all passed.

Phase 19's claim-search work stands: 0.4 ms median and 78.8 ms worst on
11,303,059 indexed positions, reproducible with `npm run bench:claim-search`.
Not re-measured this phase — that benchmark needs a 4.96 GB collection and
89 minutes of import, and nothing in this phase's diff touches the query path.
Stated as inherited rather than as re-run.

**The move invariant holds**: a copy is verified at the destination before the
source is deleted, never the other way round.

---

## 12. Engines

| Engine      | Version    | Kind               | Licence          |  Available here  |         Packaged-app tested         |
| ----------- | ---------- | ------------------ | ---------------- | :--------------: | :---------------------------------: |
| Stockfish   | 18         | browser (WASM)     | GPL-3.0-or-later |        ✅        |  ✅ threaded, `SharedArrayBuffer`   |
| Stockfish   | 19         | native             | GPL-3.0-or-later |        ✅        |                  —                  |
| Stormphrax  | 8.0.0      | native             | GPL-3.0-or-later |        ✅        |                  —                  |
| Viridithas  | 20.0.0     | native             | AGPL-3.0-only    |        ✅        |                  —                  |
| Halogen     | 16.0.0     | native             | GPL-3.0-or-later |        ✅        |                  —                  |
| PlentyChess | 8.0.0      | native             | GPL-3.0          |        ✅        |                  —                  |
| **Lc0**     | **0.32.1** | **neural, system** | GPL-3.0-or-later |        ✅        | **✅ located, qualified, searched** |
| Berserk     | 14         | native             | GPL-3.0          | ✗ no macOS asset |                  —                  |
| Koivisto    | 9.0        | native             | GPL-3.0          | ✗ no macOS asset |                  —                  |
| Obsidian    | 16.0       | native             | GPL-3.0          |  ✗ Windows only  |                  —                  |

Capabilities are read from each engine's own `uci` response at install time and
never declared in a table. An engine is Ready only when it handshakes **and**
completes a real search.

**Built engines and the GPL.** Phase 19's position is unchanged and is the
right one for v1: `npm run engines:build` produces a binary and a provenance
record, and those binaries are **not published**. Every engine here is GPL or
AGPL, conveying a binary carries an obligation to offer the corresponding
source, nothing is patched (`build-engine.mjs` refuses an unclean checkout) so
the obligation would be satisfiable by the upstream tag — but satisfying it
properly is a release process, not a CI artifact. Managed engines come from
each project's own release page. This blocks nothing.

---

## 13. Lc0, inside the packaged application

Phase 19's seventh limitation, closed, and it turned out to be a defect rather
than an untested claim.

Lc0 is a `system` engine: its project publishes no macOS release asset, so
Kingfisher locates the copy a package manager installed. It located it with
`which`. **A macOS application launched from the Finder inherits
`/usr/bin:/bin:/usr/sbin:/sbin` and nothing else** — no Homebrew, no MacPorts,
no `/usr/local/bin`. Measured: with that PATH, `which lc0` fails on this
machine, which has Lc0 at `/opt/homebrew/bin/lc0`. The search succeeded in a
terminal, succeeded from a checkout, and could never have succeeded in the
bundle.

`#locate` now falls back to the directories each platform's package managers
install into. Directories, not binaries: the name must still be one the
catalogue lists, the file must still be executable, and it must still complete
a handshake **and** find a move.

Smoke check, in the packaged application:

```
✓ Lc0 is found and qualified inside the packaged application
  — Lc0 v0.32.1+git.dirty at /opt/homebrew/bin/lc0
```

|                             |                                                                     |
| --------------------------- | ------------------------------------------------------------------- |
| Binary                      | `Lc0 v0.32.1`, located at `/opt/homebrew/bin/lc0`                   |
| Backend                     | **metal**, Apple M3 Pro                                             |
| Network                     | autodiscovered; confirmed in a stripped `env -i PATH=/usr/bin:/bin` |
| Search                      | real, `bestmove e2e4 ponder c7c6`                                   |
| Handshake + search recorded | both `ok` in the registered engine record                           |

**What is still not automatic.** Lc0's project ships no macOS binary and its
networks are separately licensed, so Kingfisher does not download either. The
catalogue row says `brew install lc0` and, once that is done, the install
button finds it, qualifies it and reports it Ready with no terminal. On a
machine without Lc0 the row says "Not on this machine", which is true.

---

## 14. Tablebases

Phase 19's eighth limitation, closed, and it uncovered a second defect on the
way.

**Real tables.** The complete three-piece Syzygy set — 56 KB, ten files —
downloaded from the Lichess mirror and verified against the publisher's own
`sha256` manifest, then committed. `companion/src/tbprobe-real.test.mjs` probes
them, and the answers are ones a reader can check: a rook against a bare king
is won with a DTZ; a knight or bishop against one is drawn; king and pawn
against king can be stalemate; and **the three rook moves that hang the rook are
individually marked drawn while the position is won** — which is the assertion
a "does it answer?" check would miss. A four-piece position must come back as
"I do not have that", because the fall-through to the public service depends on
being told.

**And it could never have worked in a bundle.** The helper was resolved from a
build record naming the machine that compiled it, so `existsSync` was false for
every other reader — every desktop user would have fallen back to the public
service permanently, with no action able to change it. The 72 KB helper is now
staged into the bundle where the companion already looks, and the record's path
is stripped at packaging (§15).

Smoke check, in the packaged application:

```
✓ a local Syzygy probe answers correctly inside the packaged application
  — rook against a bare king is won, DTZ 29, up to 3 pieces
```

Four- and five-piece tables are 900 MB and are not shipped; a user points
Kingfisher at a folder, and since this phase can do it with a **Browse…** button
rather than by typing an absolute path.

---

## 15. Security and privacy

**The finding.** Grepping the signed bundle for the builder's user name
returned seven files. That check had never been run in nineteen phases.

| Source                                 | What it leaked                                     | Fixed                       |
| -------------------------------------- | -------------------------------------------------- | --------------------------- |
| `public/engine/tablebase.json`         | `/Users/<builder>/…/kingfisher-tbprobe`            | stripped at packaging       |
| `public/engine/manifest.json`          | `/Users/<builder>/…/engines/stormphrax/stormphrax` | stripped at packaging       |
| A second copy of both                  | same, via `extraResources` straight from the repo  | staged sanitised pair       |
| `web/server.js`                        | `outputFileTracingRoot`, `repoRoot`                | rewritten to a neutral path |
| `web/.next/required-server-files.json` | `outputFileTracingRoot`, `repoRoot`, `appDir`      | rewritten to a neutral path |

The last two are ordinary Next standalone output rather than a Kingfisher bug,
and they are still somebody's home directory inside an application handed to
other people; the running server resolves what it serves from `__dirname` and
needs none of the three to be true. Rewriting them was tested, not reasoned
about: the server then starts and answers ten routes and serves the engine.

`grep -rl metinardakurt Kingfisher.app` now returns nothing.

**Everything else, re-checked:**

- No telemetry, no analytics endpoint, no upload of authored work.
- The diagnostic report names every field individually rather than spreading an
  object, so a new preference is absent until somebody adds it deliberately. It
  reports whether a secret is configured, never its value, and a redaction pass
  runs over the whole output — including, new this phase, the companion log.
  Confirmed capable of failing by removing the pass and watching two tests fail.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`;
  `window.require` is `undefined`, asserted in the smoke run.
- No `readFile(path)` on the bridge. Everything readable was chosen in a dialog
  or dropped on the window; `/db/attach` opens read-only and refuses anything
  that is not already a Kingfisher collection.
- Navigation pinned to the shell's origin; external links go to the user's
  browser.
- Companion token minted per run, never written to disk; loopback origins
  validated rather than trusted.
- Engines: allowlisted environment, no shell, argument arrays, process-group
  termination, bounded buffers, digest-checked downloads. **Not sandboxed**, and
  Kingfisher says so beside each one.
- New this phase, and worth naming as a security property rather than a build
  detail: `execFileSync`/`spawnSync` now run Next's and electron-builder's CLIs
  under this Node directly instead of through `npx`. The reason was Windows, and
  the effect is that no packaging step puts a command line through a shell.

---

## 16. No-dead-controls sweep

Phase 19 recommended this and did not do it. It was mandatory here, and it
found the largest cluster of defects in the phase.

**What the sweep actually was.** Walking every `<button>` finds nothing —
118 of them come from one shared component and every one has a handler. The
defect shape this project produces is different: _a capability built, tested,
documented, and reachable from no control._ So the sweep went at the capability
boundaries instead, and asked, for each exported method, who calls it.

| Boundary          | Methods |                                  With no production caller |
| ----------------- | ------: | ---------------------------------------------------------: |
| `DesktopBridge`   |      10 |                                                      **4** |
| `CompanionClient` |      42 | 2 (both progress-polling helpers, reached via their query) |

Of the four:

- **`chooseFile` and `chooseDirectory`** — implemented in the main process,
  wired through the preload, typed on the bridge, called by nothing, while
  three separate screens asked the user to type an absolute path by hand. Fixed;
  §22.5.
- **`diagnostics`** — the shell's versions and the state of the two processes it
  owns, never asked for, so a desktop bug report was indistinguishable from a
  browser one. Fixed; §22.6.
- **`openPgn`, `openDatabase`, `recentDocuments`** — legitimately uncalled: the
  shell's own File menu reaches all three, which is where a macOS user looks.
  Not dead controls; unused duplicates.

**The durable part.** `src/desktop/bridge-contract.ts` requires every bridge
method to name either the module that reaches it or the reason nothing does,
and `bridge-contract.test.ts` checks the claim against the source, in both
directions — a row that names a caller which stopped calling fails, and so does
an excused method that something started calling. It also asserts every declared
method exists in the preload, because one that does not is `undefined` at
runtime and throws inside a click handler.

Confirmed capable of failing: reverting the `PathField` wiring makes it name
both methods and the module that stopped calling them.

**The manual walk.** Recent, Analysis, Openings, Studies, Repertoire,
Preparation, Players, Games, Databases, Review, Training, Endgame, Opening
Files, Model Games and Settings are covered by 222 browser tests across 28 spec
files, all green. The three path fields, the diagnostics report, the Finder
document paths and the Settings tablebase and custom-engine panels were driven
by hand in the packaged application.

---

## 17. Settings

The 33-preference contract is intact and unchanged. `settings-contract.ts`
names, for each, the module that writes it, the module where it becomes
visible, and what a person would see; `e2e/settings.spec.ts` carries a runtime
assertion for each or a written reason one is impossible — 13 carry such a
reason, 7 name a specific end-to-end test, and all of it is green in the final
run.

**No dead or write-only setting was found.** Two settings changed shape rather
than behaviour: the Syzygy directory and the custom-engine path are now
`PathField`s, so on the desktop they can be filled from a native dialog. The
preference they write, and every consumer of it, is unchanged.

**The desktop still creates no second preferences system.** Companion pairing is
written _through_ the same preference the Settings field writes.

---

## 18. Web and desktop parity

New this phase: [`docs/product/web-desktop-parity.md`](../product/web-desktop-parity.md),
feature by feature, with the evidence for each row.

Core chess is identical because it is the same code — rules, tree, position
identity, Theory Book, repertoire and review have no idea which identity they
are in. Every difference is a native capability a browser is not permitted to
have, and each row says which.

The table also lists the differences that are **not** allowed, because those are
the ones that would arrive quietly: a second board renderer, chess state in the
main process, a second preferences system, a web build bent to suit the desktop,
a generic `readFile(path)` on the bridge. All five absent.

**The one asymmetry worth stating plainly.** On the web, three things need a
companion the user starts themselves: SQLite collections, native engines, and
local Syzygy tables. On the desktop they need nothing. That is a difference in
setup, not in behaviour.

---

## 19. Phases 1–19 freshness

`docs/product/phase-verification.md` updated rather than restarted: a Phase 20
section of eight rows, all **Held (repaired)**, and the running tally corrected
from 34 to 42.

Every row's evidence was **re-run rather than read**. The unit and integration
suite, the browser suite, the visual gate, the desktop shell tests and the
companion suite were all run from a clean checkout at the start of this phase —
159 files, 2,132 passed, matching Phase 19's report exactly — and again at the
end. No row is marked Held on the strength of a previous report.

---

## 20. Stale features

The honest answer is the same shape as Phase 19's and one degree better. The
222 browser tests exercise the command palette, shortcuts, all training modes,
backup and restore, model games, opening files, recent work, saved filters,
Syzygy fallback, database copy/move/merge, dedupe, En Croissant import, the
position report, preparation sessions, player profiles, the research back
stack, focus mode and compact mode — and this phase added the structural sweep
in §16 that Phase 19 said was missing.

Four capabilities were found stale and all four are fixed. One test fixture was
found leaking: a process that exists to ignore `SIGTERM` had been running for a
day, stranded by an interrupted test run. It now self-destructs after a minute,
which no passing test reaches.

---

## 21. Memory and soak

|                           |                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------- |
| Afternoon walk, 10 cycles | heap **98.4 MB**; 1 worker, 1 observer, 16 listeners, 0 intervals                 |
| Research chain, 4 passes  | review prompts steady at **5**; workers 1, observers 1, listeners 16, intervals 0 |
| Explorer cache            | bounded, asserted                                                                 |
| Desktop processes         | 6 before quit, **0 after**                                                        |
| Quit                      | 171 ms packaged                                                                   |

Nothing grew without bound. The desktop process count is asserted on the pids
the shell reports rather than on a `ps` name heuristic, because both services
run under `ELECTRON_RUN_AS_NODE` and a name-based check cannot tell what it is
looking at.

---

## 22. Bugs found

Eleven, all fixed. Severity is what the defect would have cost a user.

| #   | Severity | Defect                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **High** | A PGN double-clicked on a cold launch never opened. The document was queued for the window and flushed on `ready-to-show`, which fires before React has mounted and attached its listener; `ipcRenderer.on` does not replay, so Kingfisher launched, showed an empty board, and gave no sign it had been handed anything. The flagship desktop workflow, and it had never once worked. |
| 2   | **High** | Lc0 could never be found in the packaged application. `which` on the Finder's PATH cannot see `/opt/homebrew/bin`.                                                                                                                                                                                                                                                                     |
| 3   | **High** | Local Syzygy could never work in a distributed build. The probe helper was resolved from a build record naming the machine that compiled it.                                                                                                                                                                                                                                           |
| 4   | Medium   | The signed bundle contained the builder's home directory in seven files, including the name of a native engine on their disk.                                                                                                                                                                                                                                                          |
| 5   | Medium   | `chooseFile` and `chooseDirectory` were implemented, wired, typed and called by nothing, while three screens asked for hand-typed absolute paths.                                                                                                                                                                                                                                      |
| 6   | Medium   | The desktop diagnostic report never said it was a desktop. "The companion is offline" could not be told from "the shell started one and it died".                                                                                                                                                                                                                                      |
| 7   | Medium   | Windows packaging could not work at all: `spawnSync('npx')` cannot start a `.cmd` since CVE-2024-27980, in two separate scripts.                                                                                                                                                                                                                                                       |
| 8   | Medium   | `NEXT_PUBLIC_APP_VERSION` was set by nothing, so every diagnostic report said `0.1.0` whatever the manifests said — a stale constant doing the work of a value.                                                                                                                                                                                                                        |
| 9   | Medium   | The desktop bundle's contents depended on whose working tree built it; 2.9 MB of git-ignored benchmark PGNs shipped inside a signed application.                                                                                                                                                                                                                                       |
| 10  | Low      | The window waited on the companion it did not need.                                                                                                                                                                                                                                                                                                                                    |
| 11  | Low      | A test fixture that ignores `SIGTERM` outlived its run by a day.                                                                                                                                                                                                                                                                                                                       |

**A twelfth was introduced and caught within the phase**, and is recorded
because the way it was caught is the point: the first attempt at #9 asked git
what it was ignoring and excluded all of it — including `public/engine/`, which
holds the browser engine. That produced a valid, signed, 67 MB application with
no engine in it, and the build reported success. The fix was to state the two
lists separately and check the required one after the copy, which then failed
the first Linux packaging run for a genuinely missing asset. **Ignored by git
and not needed at runtime are different claims.**

No known Critical defect. No known High defect remaining.

---

## 23. Tests

|                            |           Start of phase |                 End of phase |
| -------------------------- | -----------------------: | ---------------------------: |
| Unit and integration files |                      159 |                      **162** |
| Unit and integration tests | 2,132 passed, 11 skipped | **2,154 passed, 11 skipped** |
| Browser spec files         |                       28 |                       **28** |
| Browser tests              |                      222 |                      **222** |
| Playwright retries         |                        0 |                        **0** |
| Visual                     |                       24 |                       **24** |
| Companion tests            |                      208 |   **224 passed, 11 skipped** |
| Desktop shell tests        |                       22 |                       **22** |
| Desktop smoke (packaged)   |                       14 |                       **17** |
| Desktop smoke (offline)    |                       22 |                       **23** |

New files: `src/desktop/bridge-contract.ts` and its test,
`src/lib/version.test.ts`, `companion/src/tbprobe-real.test.mjs`,
`src/components/ui/PathField.tsx`, `.github/workflows/desktop-package.yml`,
`docs/product/web-desktop-parity.md`, `docs/release/1.0.0-rc.1.md`, and the ten
Syzygy fixture files.

**Every regression test for a defect in §22 was confirmed capable of failing**
by reverting the implementation and watching it fail — named individually in
the commit messages.

Gates run locally on `a4dcb82`: `npm test`, `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm run build`, `npm run test:e2e`, `npm run benchmark`,
`git diff --check`. All clean.

---

## 24. CI

Final completed run **34147643787**, on **`7e0c89d`** — the last gated code
commit — green on all four gating jobs.

| Job                 | Result                                    | Time |
| ------------------- | ----------------------------------------- | ---: |
| Quality             | ✓ 162 files, **2,147 passed**, 18 skipped |   3m |
| Production build    | ✓                                         |  <1m |
| Visual gate (Linux) | ✓ **24 passed**                           |   2m |
| Browser tests       | ✓ **222 passed** (23.0m)                  |  24m |

Retries **0**. Flaky **0**.

The Quality job skips 18 where a local run skips 11. The seven extra are the
real-Syzygy probes, which skip when the Fathom helper has not been built: CI
has no C compiler, that is a supported configuration, and the suite says so
rather than failing. §14 records that those seven were run here.

**The run before it is recorded rather than hidden.** Run **34145333430** on
`a4dcb82` was green on Quality, Production build and the Visual gate, and its
Browser tests job was **cancelled at 30m17s against a 30-minute limit** — a job
timeout, with nothing failing. The suite had not changed: 222 tests before and
after, and the same 222 pass locally in 13.0m. Phase 19's run of the identical
suite took 25m42s, so the margin was four minutes on shared infrastructure and
it ran out. The limit is now 45 minutes, and this run used 24 of them. Retries
stay 0: a slow runner and a failing test are different things, and only one of
them should be able to turn this gate red.

**Desktop package** run **34145332653**: Windows x64 ✓, Linux x64 ✓ — the first
time either has been built. §6.

Runs on `ad51262`, `b3d5d55`, `126653b` and `d394aa2` show as _cancelled_, each
superseded by the next push under the workflow's concurrency rule, with their
completed jobs green. None is a test failure.

Off the gates and inherited from Phase 19, stated as inherited: engine fleet run
34048549010, engine build run 34112154544, Lichess contract smoke 34123549102.

---

## 25. What changed, commit by commit

1. **`848a9fa`** — `PathField`, the bridge contract, and the desktop section of
   the diagnostic report. §16.
2. **`20c8c37`** — the companion off the path to a window, and six startup
   marks carried through the bridge into the report. §7.
3. **`1684bf5`** — 1.0.0-rc.1, injected for real; the parity matrix; the
   release notes.
4. **`7e1fa9b`** — the bundle as a property of the repository.
5. **`ad51262`** — system engines found without a shell's PATH. §13.
6. **`6cc79ea`** — real Syzygy tables and seven real probes. §14.
7. **`2f216b9`** — the helper resolved on the running machine, and the first
   half of the path leak.
8. **`a4014c3`** — the Windows and Linux packaging workflow.
9. **`126653b`** — the rest of the path leak, and two corrections the first
   packaging run found.
10. **`b3d5d55`** — the Syzygy helper into the bundle; Lc0 and a real probe
    asserted in the packaged smoke run.
11. **`d394aa2`** — the PGN somebody double-clicked. §22.1.
12. **`a4dcb82`** — Windows packaging, for real.

---

## 26. Known limitations

Genuine, and none of them is unfinished Phase 20 work.

1. **The macOS application is not notarised.** Signed, valid, hardened;
   Gatekeeper rejects it. Needs a Developer ID Application certificate. §5.
2. **No auto-update.** Evaluated and deliberately not built: a signed updater is
   a security surface, and adding one in the week before a first release trades
   the thing that matters for the thing that is convenient. Manual installation
   is documented.
3. **Windows and Linux are unsupported.** Now built; never installed or
   launched. §6.
4. **macOS x64 builds and has never been launched.** No such hardware here.
5. **No live Lichess OAuth round trip.** It needs the user's consent in a
   browser. Contract-tested; the public half of the live check runs without a
   credential.
6. **No games before 2020.** The open archive begins there.
7. **Chess960 is not supported**, deliberately, enforced by a test.
8. **The engine comparison takes two engines**, by decision, with a measurement
   behind it.
9. **Saving a fetched master game locally is not implemented.** Revisited this
   phase: the provider's terms for redistributing individual fetched games are
   not clearly permissive, so it stays unbuilt rather than guessed at. The
   research flow itself is complete — a master game opens on Kingfisher's board.
10. **Four- and five-piece Syzygy tables are not shipped**, at 900 MB. Three-piece
    are, and a folder can be chosen.
11. **157 variation briefs**, covering 93.6% of named positions.
12. **The claim-search benchmark was not re-run** this phase; Phase 19's numbers
    are quoted as inherited.

---

## 27. Competitors

Updated in [`docs/product/competitors.md`](../product/competitors.md). The rows
Phase 20 moved:

|                     |    ChessBase     |  Lichess   | En Croissant | ChessMonitor |                                Kingfisher                                |
| ------------------- | :--------------: | :--------: | :----------: | :----------: | :----------------------------------------------------------------------: |
| Desktop application | ✅ Windows-first |     ✗      | ✅ all three |      ✗       | ◐ **macOS driven; Windows and Linux built, untested; not distributable** |
| Tablebases          |        ✅        | ✅ remote  |      ✅      |      ✗       |                    ✅ **local, in the packaged app**                     |
| Neural engine       |        ✅        |     ✗      |      ✅      |      ✗       |                  ✅ **Lc0, metal, in the packaged app**                  |
| Ease of setup       |   ◐ installer    | ✅ nothing | ◐ installer  |  ✅ nothing  |               ◐ **nothing on the web; a build on the Mac**               |

Strictly: Kingfisher is **weaker** on database breadth (507k shipped against
11.7M), on historical coverage (nothing before 2020), and on distribution —
ChessBase and En Croissant both ship something a stranger can install and
Kingfisher does not. It is **stronger** on provenance, on comparing populations
without merging them, on shipping usable data for nothing, and on being one
application in two identities rather than two implementations. **Different by
design** on the Theory Book, which refuses to show a statistic beside a name.

---

## 28. The Magnus test

> Could Magnus sit down at a MacBook with Kingfisher installed and prepare,
> without understanding Electron, Next.js, localhost, the companion, SQLite,
> UCI or IndexedDB?

|                      |                                                                      |
| -------------------- | -------------------------------------------------------------------- |
| Install it           | **No** — Gatekeeper. The only no, and it is a certificate.           |
| Open it              | Yes. One launch, no terminal, no token.                              |
| Open PGNs            | Yes — File menu, drop, **and double-click, which this phase fixed**. |
| Research openings    | Yes. Theory Book, Explorer, source comparison, report.               |
| Built-in databases   | Yes, immediately, offline, nothing to configure.                     |
| Huge local databases | Yes. 11.3M positions, structural search under a millisecond.         |
| Search players       | Yes.                                                                 |
| Prepare opponents    | Yes.                                                                 |
| Run Stockfish        | Yes, threaded.                                                       |
| **Run Lc0**          | **Yes — in the packaged app now**, metal backend, real search.       |
| Compare engines      | Yes, two, by decision.                                               |
| Review repertoire    | Yes.                                                                 |
| Analyse games        | Yes.                                                                 |
| **Use tablebases**   | **Yes — locally, in the packaged app now.**                          |
| Work offline         | Yes. 23 of 23 checks with the network cut.                           |
| Quit cleanly         | Yes. Zero processes after.                                           |

Everything on that list except the first, without knowing anything about how
Kingfisher is made. **Somebody would still have to build it for him**, and that
is the whole of what is left.

---

## 29. Final release verdict

**PRODUCT READY — MAC DISTRIBUTION CREDENTIAL BLOCKED.**

The web application is releasable today. Every gate is green, the fresh-user
experience is a release gate and passes, and nothing in this phase touched the
web build except to leave it alone.

The macOS application is finished as a product. It launches in under a second,
starts and pairs its own companion, opens documents from the Finder, runs a
threaded browser engine and a native neural one, probes local tablebases,
works with the network cut, and leaves nothing running when it quits. Seventeen
packaged checks and twenty-three offline ones assert it. What it cannot do is
be given to somebody, because Gatekeeper will not open a bundle signed with an
Apple Development certificate — and that is a certificate, not a defect. §5
lists the five steps, none of which changes a line of the application.

This is not "do not release because the code is broken". The code is not
broken. Eleven defects were found and fixed this phase, three of them High and
all three the same shape: a capability that worked everywhere except the place
a user would actually meet it. That is the class this project keeps producing,
and §16 leaves behind a test that fails when it happens again rather than a
recommendation that somebody look.

Windows and Linux are built and untested and are described that way everywhere
they appear. Calling them supported would be the one thing that could turn a
truthful release into a misleading one.

---

## 30. Next, at most three

1. **A Developer ID Application certificate, then notarise and staple.** Still
   the only thing between a working Mac application and one a stranger can
   install. Five steps, all in §5, none of them a code change.
2. **Give it to people.** Not another phase. Three of this phase's High defects
   were things no test suite would have looked for and one afternoon of real use
   would have hit in the first minute — a double-clicked PGN opening an empty
   board is not subtle, and it survived nineteen phases because nobody
   double-clicked a PGN.
3. **Then, and only if use asks for it**: Windows or Linux support, which means
   installing and driving them rather than building them.
