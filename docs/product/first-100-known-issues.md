# Kingfisher — first-100 known issues

> **Subject:** what the first 100 users should be told up-front,
> with the reasoning and the path to closing each item.
>
> This file is read by the maintainer. The user-facing summary
> lives in the release notes; the entries below are the work the
> maintainer tracks.

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

- **macOS native is Preview.** The 1.0.0 desktop binary is
  dev-signed. The Settings → Diagnostics card states this in
  plain English. The first 100 web/PWA users are not affected.
- **Web local data depends on browser storage.** A user can
  revoke storage protection from the browser settings. The
  status indicator shows this honestly
  (`Storage is not protected`) and offers a one-click request.
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

The current bug register is empty. Every product behaviour the
first 100 users will encounter is either the documented
behaviour or an improvement, not a defect. New reports from
the first 100 users will be triaged under
`docs/operations/first-100-feedback.md`.

## Improvement backlog count

5 items. The brief asks for a maximum of ten.
