# Long-term data — where a player's work lives, and the decision on accounts

> Phase 72. The question put to this audit was whether Kingfisher should
> add accounts and cloud persistence, ship a Windows application, or
> both, so that a player's studies do not feel disposable. This page
> records what the persistence architecture actually is today, what was
> verified, the decision, and the staged plan for what is not built yet.
> Nothing here is a promise of a date.

## What exists, verified on 2026-09-19

| Layer                 | Where                                                                         | Verified how                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Authored work         | IndexedDB on the origin (web) or in the Mac app's profile                     | `e2e/storage-persistence.spec.ts`; `docs/product/work-continuity.md`                                                       |
| Draft before document | `drafts` store, written before the chapter, cleared after                     | ADR 0012; `src/persistence/`                                                                                               |
| Auto-backup           | `backups` store, on a schedule (default weekly), last N kept                  | `src/features/shell/auto-backup.ts`; `e2e/settings.spec.ts` (Phase 71 added the runtime assertions)                        |
| Portable backup       | One JSON file, every store in `PORTABLE_STORES`, downloadable                 | This audit: Settings → Database → Export backup produced `kingfisher-<date>.chess-study-backup.json`, version 1, 22 stores |
| Restore               | Settings → Database → Import backup                                           | `e2e/backup-restore.spec.ts`                                                                                               |
| Cross-tab conflicts   | Chapter revisions; a losing write is reported, not applied                    | `AGENTS.md`, _Persistence_                                                                                                 |
| Mac application data  | `~/Library/Application Support/kingfisher-desktop/`, origin fixed per profile | `desktop/src/origin.mjs`; `npm run desktop:restart`, `desktop:upgrade`                                                     |

What does **not** exist: any server that holds a user's work, any
account, any sync between devices. The FAQ on the landing says so, and
it is true. There is no backend or auth system in the repository to
build on; `src/sync/` is the one-way import of games from Lichess and
Chess.com into the local collection, not a sync of the user's work.

## Why "disposable" is the right worry, and where it comes from

The work is durable on the device it was made on — IndexedDB survives
restarts and deployments, and both the draft and the auto-backup exist
for the crash and the mistake. The fragility is **origin-bound
storage**: a browser profile reset, a second machine, a phone, or a
browser vendor's eviction under storage pressure (`navigator.storage.persist()`
is a request the browser may refuse — the "Storage is not protected"
line in the sidebar is that refusal, reported rather than hidden). The
answer to that fragility is a second copy somewhere the user controls,
and today that copy is the backup file.

## The decision

**Neither a Windows application nor an account system is the right next
step for long-term data, and this audit built neither.**

- A Windows build does not answer the question. It is the same
  local-first application on a second platform: the work is still on
  one machine. It is worth doing for reach, not for persistence, and it
  cannot be honestly certified here — there is no Windows machine, and
  the project's rule is that "builds" is not "runs" (`AGENTS.md`).
- An account system built inside a stabilisation pass would be the
  half-secure thing the brief warns against: authentication, per-user
  data isolation, a schema for merging two devices' edits to the same
  chapter, encryption at rest, deletion and export obligations, and an
  operating cost — none of it small, and all of it must be right before
  a single study is entrusted to it. It also changes what the landing
  and the privacy page promise ("no account, nothing leaves your
  machine"), which is a public-claims decision, not a feature flag.

What is sustainable now, and what this audit did:

1. **The portable backup is the durable copy, and it is complete.**
   Every store a person authors is in `PORTABLE_STORES` (a unit test holds
   the list to the schema), the file is versioned, and restore is tested.
   The command palette now offers _Back up my work_ directly.
2. **Auto-backup is real and observable.** The status bar shows the age
   of the last backup and reminds when it is overdue (Phase 71 wired the
   preference; Phase 72 verified the flow end to end).
3. **The Mac application is the durable home today.** Its data directory
   is an ordinary folder a person can copy, Time Machine backs it up, and
   the origin cannot change under it (`desktop/src/origin.mjs`).

## The staged plan for sync (not built)

When sync is built, it should be built as **end-to-end encrypted,
opt-in, additive** — the local-first model stays the default and stays
true:

1. **Export/import is the wire format.** The portable backup already
   serialises every authored store with a version; a sync payload is that
   document, encrypted client-side with a key derived from a passphrase
   the server never sees.
2. **A minimal identity.** Email + passkey (WebAuthn) or a magic link; no
   passwords stored. Scope: one blob per user per device, plus a
   last-writer-wins pointer. This is deliberately not a CRDT — chapters
   already carry revisions and report conflicts rather than merging, and
   the first sync should behave the same way: "the copy on your laptop is
   newer than this one; keep which?".
3. **Storage.** Any object store with per-user keys (the project's
   existing Vercel account offers Blob; a self-hosted S3-compatible
   bucket is equivalent). Cost is bytes stored, which for a heavy user is
   tens of megabytes.
4. **Claims.** `docs/product/public-claims.md`, `/privacy` and the landing
   FAQ change in the same commit as the feature: "no account" becomes "no
   account unless you turn on sync", and the encryption statement must be
   one the code makes true.
5. **Deletion and export.** Deleting the account deletes the blob; the
   export is the backup file the person already has.

Each stage is small enough to be certified with the project's own
gates, and none of them is started in this pass.
