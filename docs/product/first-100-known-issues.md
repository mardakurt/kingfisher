# Kingfisher — first-100 known issues

## Release-audit status — 2026-09-13 (1.1.4)

The public Mac 1.1.4 (build 544, `8f3e1d5`; 1.1.3 was build 539, `0600ce1`) and the public web deployment
are built from the same source revision. 1.1.3 closes the nineteen items
the owner reported after the first day of public use (listed under
"Closed during Phase 51" below); the gates run for it are in the
[Phase 51 handover](../reports/phase-51-handover.md). The 1.1.2 audit
(build 516, `fc95f4d`; the feedback-dialog fix) is recorded in the
[Phase 50 handover](../reports/phase-50-handover.md).

> **Subject:** what the first 100 users should be told up-front,
> with the reasoning and the path to closing each item.
>
> This file is read by the maintainer. The user-facing summary
> lives in the release notes; the entries below are the work the
> maintainer tracks.

## Closed during Phase 51 — the owner's first-day report

Nineteen items reported by the owner after the first day of public use,
each reproduced on the running application before it was touched, and
each closed in 1.1.3. The user-facing wording is the 1.1.3 entry in
`CHANGELOG.md`; the maintainer's reasons are in the code.

- **The tool dock's More menu showed one item and scrolled the tabs away.**
  The menu was a child of the row with `overflow-x: auto`, which clips
  vertically too. Moved out of the row; the strip wraps rather than scrolls.
- **Position setup was reachable from Analysis only**, two menus deep. A
  **Set up** button on every board page's header (the workspace frame).
- **Every board page had its own hand-built layout**, and they had drifted:
  a fixed 360px dock on Review, a chapter list that could not be folded on
  Studies, columns in viewport units on Endgame. One frame,
  `WorkspaceFrame`, with a foldable rail and a width policy that keeps the
  board the largest thing on a laptop.
- **"Open on the board" opened the start position** with the opening in
  the move list; **"Open this position in Explorer" opened the library**.
  `?fen=` had never been read by any route.
- **Preparation found nobody.** It searched the local collection only; a
  new user has none. It now searches the player library and reads the
  reference packs' games for the player, each source counted on its own.
- **"Add to repertoire" was not findable** from the page that told you to
  use it. A board for an empty repertoire, and the button in three places.
- **Players appeared twice**: the Turkish dotless ı survives accent
  folding, roster aliases were tried in one word order, and two packs filed
  one person under two spellings.
- **Lichess linking said "no account called …" for accounts that exist**:
  Lichess answers anonymous export requests with 404 since 2026. And on the
  Mac the sign-in opened in the system browser, where the callback could
  never reach the verifier; it now opens in a child window.
- **The chosen engine was saved and not applied** after a reload; the
  one-engine panel had no selector; native engines failed with a
  developer's remedy (`npm run …`).
- **"Storage is not protected" answered with a dead-end toast.**
- **A selected piece could not be deselected.** Second click clears it.
- **No way to clear the move tree** without resetting the position.
- **Settings was 640px wide with twelve tabs scrolling sideways.**
- **Eight variation briefs were wrong**, one of them describing the
  Caro-Kann Exchange's minority attack as White's.

## Closed during Phase 46

Found by adversarial testing of the packaged application and fixed in
`master`; the full register with reproductions is
`docs/reports/phase-46-findings.md`. None of these had been reported by
a user; every packaged build since the polished-DMG work had been unable
to launch, so no desktop user could have.

- **The packaged macOS application contained no application** (every
  build since Phase 35 exited on launch). Fixed; the bundle contents are
  pinned by test and the DMG verifier refuses a bundle that cannot launch.
- **The board could not be played while an engine arrow was drawn.**
  Fixed; pinned by an e2e test.
- **Check for Updates did nothing, then failed.** Fixed end to end; a
  preview build now says which build it is and opens the download page.
- **One malformed pairing token could end the companion.** Fixed; the
  companion is now fuzzed as a real process.
- **A dead companion read as running, and could not be brought back.**
  Fixed; _Diagnostics → Restart companion_.
- **Resize then close within 400 ms raised a main-process error dialog.**
  Fixed.

## Closed during Phase 38

The following items were open at the start of Phase 38 and are
now closed in `master`. They are listed here so the next phase
inherits a clean register and does not re-discover them.

- **The save indicator used to be quiet.** It only reflected
  whether the browser had granted storage protection. A pending
  or failed write produced the same green dot as a real
  successful commit. The indicator now also reflects the write
  tracker: it shows `Saving…` while a write is in flight, and
  `Save failed` with a download-backup offer if a write has
  rejected since the last success. The reducer is in
  `src/persistence/saved-state.ts`; the hook in
  `src/persistence/use-write-tracker.ts`; the indicator in
  `src/persistence/StoragePersistenceStatus.tsx`.
- **A late engine snapshot could overwrite a fresh one.** The
  engine store already drops snapshots whose request id is
  outranked, and a new test pins the "first search emits after
  second search has started" path
  (`src/stores/engine-store.test.ts`).
- **A late markSaved() could overwrite the live revision.** A
  test in `src/stores/analysis-store.test.ts` pins the contract:
  a markSaved() with a revision older than the current document
  must not advance `savedRevision`.
- **The repo had drifted out of `prettier --check` compliance.**
  25 files were off. `npm run format` brought the tree back to
  the agreed style; `npm run format:check` is now green.

## Known limitations — user-facing, expected to remain

These are real product facts, not defects. The first 100 users
are told about each of them in product; the relevant docs are
linked.

- **Three catalogue engines are not offered on a Mac.** Berserk 14,
  Obsidian 16.0 and Koivisto 9.0 publish Windows builds only (Koivisto
  also Linux). They are in the catalogue because on Windows they are
  three more installable engines; on a Mac the companion reports its
  platform and they are dropped from the selector, and Settings →
  Engines names them under "Not offered on macOS" with the reason. A
  Mac user who knew the catalogue had nine native engines and found six
  used to conclude three were broken. Six install and run on Apple
  Silicon (`npm run desktop:engines -- --packaged`, 25/25 on 1.1.3).
- **macOS is Apple Silicon, macOS 13 or later.** The public build
  (named by `src/release/macos-download.json` with its build number) is
  signed with Developer ID and notarised, opens with a double-click,
  and offers newer releases through _Kingfisher → Check for Updates…_;
  the first such update may show macOS's helper-tool prompt once.
  Diagnostics reports the build, commit and channel. There is no Intel
  build and no Windows or Linux build; those users have the web.
- **Playing a move stops the engine.** By design (the position guard):
  evidence never survives a position change, and a person starts the
  engine again. Recorded because a first-time user may expect the
  engine to follow the board.
- **Web local data depends on browser storage.** Work lives in
  the browser's IndexedDB for `kingfisherchess.app`; clearing site
  data, a private window, or another browser or profile means a
  different (or empty) database. Kingfisher asks the browser for
  durable storage after the first save; the status indicator shows
  the browser's answer honestly (`Storage is not protected`) and
  offers the request again on a click. Safari removes a site's
  storage after seven days of Safari use without a visit unless the
  app is added to the Dock. The Mac application and _Settings →
  Database → Export backup_ are the answers for long-term work.
- **Some references need internet unless installed.** The
  Starter reference is local. Elite, Recent, Online and
  Lichess-style references stream; the studio is usable offline
  for any reference that has already been opened while online.
- **Mobile is supported but not the primary environment.** The
  professional workstation is the laptop. Phones and tablets are
  usable for review and read-only paths.

## Improvement backlog

The list below is bounded and represents work the maintainer
will pick from after the first 100 users start providing real
feedback. Each item is an improvement, not a defect: the
software works correctly today, and would be a little better
with the change.

- **Better empty states for first-run users.** The current
  first-run panel is small and useful, but the Studio could
  signpost Cmd+K and the Explorer source more directly. A
  small dismissible orientation aid is the shape; not an
  onboarding wizard.
- **Reference cache warmer.** The first move of a session
  re-warms the entire reference. For a Starter pack this is
  fine; for Elite it is noticeable. A small warm-on-idle task
  would smooth the first evaluation.
- **A second indicator near the move list.** The save status
  lives in the sidebar today. A player who is in a study may
  not look at the sidebar. A subtle "saved" mark on the move
  list itself would make the model more obvious.
- **A printable PGN export that includes comments and NAGs.**
  Export is correct today. A `File → Print` path that opens a
  print stylesheet with the comments and NAGs would let
  trainers share a study on paper without losing the
  annotations.
- **A more honest "no internet" mode.** Today the studio
  degrades gracefully but still tries to fetch. A first-load
  detection of "I will be offline" that suppresses network
  attempts would be kinder to the user's bandwidth cap.

## Bug register

Empty at the time of writing — with the caveat that the register was
also "empty" while every Send in the feedback dialog failed in every
browser (fixed in 1.1.2, `fc95f4d`, found by driving the real dialog
on production). An empty register means nothing is known, not that
nothing is wrong. New reports from the first 100 users will be
triaged under `docs/operations/first-100-feedback.md`.

## Improvement backlog count

5 items. The brief asks for a maximum of ten.
