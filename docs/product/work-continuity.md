# Work continuity — what survives what

> The plain-language answer to "did my Study actually save?". Read
> this before you file an issue about lost work.

## Short answer

Kingfisher is **local-first and persistence-hardened by default**.
Every piece of work a user authors — Studies, Repertoire,
Preparation, Training, Opening Files, Notes, Preferences — is
written to IndexedDB on the same device the user is typing on.
Nothing leaves that device unless the user explicitly enables the
optional cloud sync, which is documented separately and is not part
of the 1.0 default experience.

## What survives what, exactly

The table below describes what happens to authored work in each
situation, as of the current build. Tested behaviours are marked
**(verified)**; behaviours that depend on a browser vendor decision
or a user's choices are marked **(with caveats)**.

| Situation | Authored work | Preferences | Reference packs | Personal DBs |
| --- | --- | --- | --- | --- |
| Same browser, same profile, **next day** | ✅ kept (verified) | ✅ kept (verified) | ✅ kept (verified) | ✅ kept (verified) |
| Same browser, **private/incognito** window | ❌ erased on window close (with caveats) | ❌ erased | ❌ erased | ❌ erased |
| **Browser site-data cleared** | ❌ erased (intentional) | ❌ erased | ❌ erased | ❌ erased |
| **Different browser profile** on the same machine | ❌ separate IndexedDB origin (with caveats) | ❌ separate | ❌ separate | ❌ separate |
| **Different device** | ❌ separate IndexedDB origin | ❌ separate | ❌ separate (download required) | ❌ separate |
| **Quitting the application** (web) | ✅ kept (verified) | ✅ kept | ✅ kept | ✅ kept |
| **Crash mid-save** | Draft remains in storage (with caveats) | ✅ kept | ✅ kept | ✅ kept |
| **Quota exceeded** | Save refused, draft kept, error shown | n/a | n/a | n/a |
| **Browser vendor drops IndexedDB** | ❌ (with caveats) | ❌ | ❌ | ❌ |

**IndexedDB** is a per-origin per-profile store. A Study on
`kingfisher-chess.vercel.app` in Chrome profile A is in Chrome
profile A's IndexedDB for that origin. Clearing site data deletes
it. Switching profiles loses access. Switching devices loses
access. Private windows lose it on close. None of this is hidden.

## What this means for a user

If a user only ever uses one browser profile on one device, **their
work is safe across quit, restart, crash, and even an OS reboot**.
The user does not need to do anything. Studies are autosaved on
every edit, with both a debounce window and a maximum wait window
(see `src/persistence/autosave.ts`). A draft is written *before* a
document commit, so the worst case after a crash is "the last few
keystrokes".

If a user wants cross-device, cross-browser, or cross-profile
continuity, they must enable the optional cloud sync. That feature
is not part of the default 1.0 experience and is the subject of a
separate document (`docs/adr/00xx-optional-account-sync.md`).

If a user wants backup regardless, the application supports a
manual export of every authored store (`src/persistence/backup.ts`),
producing a portable JSON file. This is the user's own responsibility
to keep.

## What "Saved on this device" actually means

The application surfaces a small status line that says **Saved on
this device** whenever authored content is unchanged from the
local commit. The status is *derived*, not stored: it is "Saved"
when there is no pending autosave and no failed autosave in the
last few seconds; "Saving…" while an autosave is in flight;
"Not saved" when the most recent autosave rejected; and
**Storage protection unavailable** when the browser will not give
Kingfisher persistent storage (private browsing, vendor policy).
See the *Storage persistence* section of `src/persistence/...`
for the implementation.

## Honest limits

- A user's stored work is only as durable as the browser's
  IndexedDB. Chrome's site-data clear is one click. Firefox's
  "Clear data" is one click. Safari's "Manage Website Data" is
  one click. **Kingfisher cannot defend against a user who chooses
  to clear it.** That is correct browser behaviour and is the
  contract the application works within.
- Storage quotas are real and per-origin. A 50 MB Study importing
  5,000 games can fill a quota. Kingfisher surfaces a quota error
  in plain English and refuses to silently drop the user's work
  (see `src/persistence/quota.ts`).
- **"Backup is your responsibility."** Kingfisher is not a cloud
  service. A user who has not enabled cloud sync and has not
  exported a backup has chosen local-only storage, and the
  consequences of that choice are theirs.

## What we are not doing (yet)

- We do not promise that private/incognito works. It does not.
- We do not promise cross-device continuity by default. It does
  not work that way; the user opts in to cloud sync if they want it.
- We do not auto-export to anywhere. The user must take the export
  action themselves.

These are product decisions, not bugs.