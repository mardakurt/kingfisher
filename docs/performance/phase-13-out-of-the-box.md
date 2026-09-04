# Phase 13 — out of the box

What the phase cost and what it bought, measured rather than asserted.

Environment: Apple M3 Pro, 12 cores, 19 GB, macOS 25.6, Node 24.14.0.
Reproduce with `npm run bundle:report`, `npm run reference:build`, and the
Playwright specs named against each figure.

---

## The board, which was the headline bug

`/analysis`, measured as `min(width, height)` of `[data-board-frame]`:

| Viewport  | Before | After | Floor asked for |
| --------- | ------ | ----- | --------------- |
| 1280×720  | 307    | 453   | 450             |
| 1366×768  | 355    | 501   | 490             |
| 1440×900  | 487    | 583   | 560             |
| 1920×1080 | 667    | 763   | 650             |
| 2560×1440 | 706    | 960   | —               |

The other two board-first routes were worse at small sizes, because both had
two fixed side columns taking 680 px whatever the display was:

| Viewport  | `/endgame` before → after | `/opening-files` before → after |
| --------- | ------------------------- | ------------------------------- |
| 1280×720  | 332 → 501                 | 372 → 511                       |
| 1366×768  | 418 → 554                 | 458 → 568                       |
| 1440×900  | 492 → 598                 | 532 → 612                       |
| 1920×1080 | 740 → 881                 | 740 → 900                       |

### Three separate causes, and one of them was a bug

Instrumenting the layout rather than looking at it found them:

1. **A 210 px notation panel and 89 px of padding came out of a 640 px column**
   before the board was measured at all. At 1280×720 the board is limited by
   _height_, by a wide margin, and nothing about the defaults acknowledged that.
2. **A hard 740 px ceiling**, which a 1920×1080 display reached and a laptop
   never got near — so it constrained exactly the machines that had room to
   spare and did nothing for the ones that did not.
3. **The evaluation bar's 22 px column and 12 px gap were subtracted from the
   board rather than added to the frame around it.** The container measured 453
   px of available height and the board rendered at 419. That is a bug, and it
   was invisible until the two numbers were printed side by side.

`e2e/board-size.spec.ts` holds the floors as absolute pixel numbers rather than
proportions. A proportion would pass on a 4K display while the laptop case that
motivated the work stayed broken.

---

## Starting up with the reference installing itself

Measured against `npm run dev` on localhost, with a fresh browser profile:

|                                                          |                                     |
| -------------------------------------------------------- | ----------------------------------- |
| Interactive (`data-kingfisher-ready`) on a fresh profile | **335 ms**                          |
| Bundled reference installed and readable, after that     | **632 ms**                          |
| Bytes transferred on that first load                     | **10.9 MB** (9.5 MB of it the pack) |
| Interactive on a second visit, pack already installed    | **156 ms**                          |
| First explorer answer after the panel opens              | **125 ms**                          |
| Next position, warm shard                                | **72 ms**                           |

The 9.5 MB is a one-off. It is fetched from the application's own static
assets, verified chunk by chunk, and written into IndexedDB; afterwards the
explorer answers with the network switched off, which
`e2e/reference-sources.spec.ts` asserts by blocking every non-local origin.

Dev-server numbers, so the interactive figures are pessimistic (unminified JS)
and the transfer figure is honest (the pack is the same bytes in production).

### The budget that mattered

**None of the reference data is in a JavaScript bundle.** §91's rule, and it is
structural rather than a promise: the pack is gzip chunks under
`public/reference/`, fetched by `fetch` and stored as bytes. The route bundles
grew only by the code that reads them.

| Route           | Phase 12              | Phase 13              | Change    |
| --------------- | --------------------- | --------------------- | --------- |
| `/analysis`     | 322.9 kB              | 332.8 kB              | +9.9 kB   |
| `/openings`     | —                     | 333.1 kB              | new mode  |
| `/databases`    | 310.1 kB              | 321.4 kB              | +11.3 kB  |
| `/players`      | —                     | 309.0 kB              | new route |
| Heaviest        | `/review` 335.7 kB    | `/review` 345.6 kB    | +9.9 kB   |
| Total client JS | 2,500.4 kB / 90 files | 3,177.5 kB / 95 files | +677.1 kB |

The total grew by more than any route did, which is the intended shape: the
opening library, the Polyglot reader and the pack installer are dynamic imports
and appear in the total without appearing in any route's initial JavaScript.
The Polyglot constants alone are 18.5 kB of source, and a workspace where
nobody opens the Book tab never fetches them.

---

## Building the packs

`npm run reference:build`, twelve cores, six workers.

|                     | Starter                      | Elite                        |
| ------------------- | ---------------------------- | ---------------------------- |
| Upstream archives   | 36 months, 293 MB compressed | 79 months, 679 MB compressed |
| Games read          | 899,023                      | 1,186,338                    |
| Games kept          | 175,022                      | 422,059                      |
| Full scores stored  | 11,357                       | 249,245                      |
| Position aggregates | 146,684                      | 684,269                      |
| Player identities   | 12,609                       | 34,114                       |
| Output              | 9.5 MB in 88 chunks          | 107.7 MB in 160 chunks       |
| Wall clock          | ~14 min                      | ~45 min                      |
| Peak scratch        | ~1.2 GB                      | ~4.5 GB                      |

The cost is dominated by replaying games through the application's own rules
code — 31,000 plies per second per worker, which is `chess.js`'s own throughput
and is why the scan is a worker pool rather than a loop. Using a second, faster
rules implementation was considered and rejected for the same reason
`build-opening-index.mjs` rejected it: the position keys a pack is written with
must be the keys the running application computes, and the only way to
guarantee that is to use the same code.

---

## Engine installation

Measured through the companion on this machine, over a domestic connection:

| Engine                | Download | Verify + UCI matrix | Total |
| --------------------- | -------- | ------------------- | ----- |
| Halogen 16 (20 MB)    | ~9 s     | ~6 s                | ~15 s |
| Stormphrax 8 (57 MB)  | ~25 s    | ~6 s                | ~31 s |
| Viridithas 20 (57 MB) | ~25 s    | ~6 s                | ~31 s |

The verification step is a fixed cost: nine checks including two `go depth 8`
searches and a `go infinite`/`stop` round trip. It is not optional, and an
engine that fails the handshake or cannot find a move is deleted rather than
registered.

---

## What was deliberately not measured

- **Pack installation over a real network at scale.** The bundled pack installs
  from local assets and the elite pack's release assets are not publicly
  reachable while this repository is private, so a figure for "install the
  107 MB pack over the internet" would be invented.
- **A live authenticated Lichess round trip.** The authorization request was
  made for real and accepted; the token exchange needs a human at a consent
  screen. Contract-tested instead, and stated as such.
- **IndexedDB behaviour at several installed packs.** One bundled pack and one
  installable pack is what exists; extrapolating a storage-pressure figure from
  that would be guesswork.
