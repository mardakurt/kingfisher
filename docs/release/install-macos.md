# Installing Kingfisher on macOS

Kingfisher 1.1.7 for macOS is signed with a **Developer ID** certificate
and **notarised by Apple**, with the notarisation ticket stapled to the
disk image and to the application. It opens like any other downloaded
application: a normal double-click, one confirmation from macOS, done.
Notarisation is Apple's automated malware screening of the build; it is
not a review or an endorsement of the product.

The exact build the landing page offers — build number, commit, size and
SHA-256 — is stated in `src/release/macos-download.json` and on the
[install page](https://kingfisherchess.app/install), which is
rendered from that file.

## What you need

- A Mac with **Apple Silicon** (M1 or later), running **macOS 13
  (Ventura)** or later. (Electron 44, which the application is built on,
  does not run on anything older.)
- About **1 GB** of free disk space for the application and a
  fresh study workspace.
- Nothing else. No Node, no terminal, no database, no account.

## 1. Download

Get the DMG from the landing page or the latest release on GitHub:

> <https://kingfisherchess.app/#macos>
> <https://github.com/mardakurt/kingfisher/releases/latest>

The file is **`Kingfisher-1.1.7-arm64.dmg`**. If the file you downloaded
has a different name, the release page is the source of truth — stop and
check the SHA-256 listed there.

## 2. (Optional) verify the download

The release page and the install page list the SHA-256 of the DMG:

`eafeb5811ddcd48dbdf3acb34dc717d472be3450dc5efd584432ab7ad5335564`

To check yours:

```bash
shasum -a 256 ~/Downloads/Kingfisher-1.1.7-arm64.dmg
```

The output should match. If it does not, the download was corrupted or
tampered with — delete it and download it again.

## 3. Open the DMG

Double-click `Kingfisher-1.1.7-arm64.dmg` in your Downloads folder. A
window opens with the Kingfisher icon and a shortcut to Applications.

## 4. Move to Applications

Drag the Kingfisher icon onto the Applications shortcut. Eject the disk
image (right-click the desktop icon, **Eject**, or use the eject button
next to it in Finder).

## 5. First launch

Open Kingfisher from Applications or Spotlight. Because the file was
downloaded, macOS shows its standard confirmation once — _“Kingfisher” is
an app downloaded from the Internet. Are you sure you want to open it?_ —
and names Apple's check. Click **Open**. That is the whole first launch.

What you should **not** see: _“cannot be opened because the developer
cannot be verified”_, _“cannot be checked for malicious software”_, or
_“damaged”_. Those messages mean the file you have is not the build Apple
notarised — check the SHA-256 above and download it again from the
release page. There is no right-click workaround to apply, and no
system-wide setting to change; if a genuine Kingfisher 1.1.7 download
does show one of those messages, that is a bug — please report it.

## 6. Updates

Kingfisher checks for updates in two ways.

- **On launch, quietly.** Five seconds after the app finishes starting
  up, it asks the release host for the current Sparkle appcast. If a
  newer release exists, the _Kingfisher_ menu's _Check for Updates…_
  item re-labels itself to _An Update Is Available…_ (or _Update Ready
  to Install…_ once the download has finished) — the same pattern as
  ChatGPT and Claude on macOS. There is no badge, no banner, no
  notification; the user notices when they next open the menu.
- **When you ask.** _Kingfisher → Check for Updates…_ in the macOS
  menu. Sparkle's own window opens in its current state: idle,
  up-to-date, available, ready, or whatever the background check
  last observed.

When a newer release exists the window offers **Install Update**;
Kingfisher downloads it, verifies it against the appcast's EdDSA
signature and the running bundle's own code signature, finishes
saving your work, and Sparkle replaces the application bundle and
reopens it. The first launch after an update shows a one-time
notice ("Kingfisher was updated to …").

The dialog shows the first three points of the GitHub release notes,
one line each, and a _Full release notes…_ link that opens the release
page in your browser — the dialog stays one short page rather than a
changelog read through a scroll box. The notes are GitHub-flavoured
markdown; Kingfisher's renderer handles the headings, lists,
paragraphs, **bold**, _italic_, and `` `inline code` `` that actually
appear in release bodies, with no HTML pass-through, and only text
nodes reach the dialog.

### Why the update from 1.1.7 or earlier may ask for your password or Touch ID

Kingfisher 1.1.8 and later update through Sparkle, which asks for
nothing. An installed 1.1.0–1.1.7 still makes its last update through
the engine it shipped with: on a Developer ID-signed, notarised bundle,
the stock Electron updater (`Squirrel.Mac`) tries to install itself as
a privileged helper tool the first time it runs, which surfaces the
macOS dialog

> An update is ready to install. **Kingfisher is trying to add a new
> helper tool.** Touch ID or enter your password to allow this.

This is a long-standing Squirrel.Mac bug — see Squirrel/Squirrel.Mac
issues #192 and #247. The prompt only fires **once** per machine,
because the very next time the app starts it sets a flag in your user
defaults that tells Squirrel.Mac to skip the helper-install path:

```
defaults write app.kingfisher.chess SquirrelMacEnableDirectContentsWrite -string TRUE
```

The flag must be a string, not a boolean. Squirrel.Mac's check is

```objc
return [override isEqualToString:@"true"]
    || [override isEqualToString:@"TRUE"]
    || [override isEqualToString:@"1"];
```

and `defaults write -bool TRUE` is stored as the integer `1`, which the
comparison fails on. Kingfisher 1.1.2–1.1.7 wrote the value as a string
on first launch so the flag actually took effect; 1.1.8 and later do
not need it and do not write it.

Two things to know:

1. The prompt only appears on the **first** update after a fresh
   install of 1.1.0–1.1.7, and never once Kingfisher 1.1.8 or later is
   running: Sparkle replaces the bundle in place with your own
   permissions.
2. The flag does not weaken the install. The download is still
   SHA-512-verified against that engine's feed, and the new
   bundle is still Developer ID signed by the same identity as the
   old one. The flag only suppresses the re-prompt; the actual
   privilege check happens at the file-system layer the way it
   always has.

If you want to suppress the prompt before Kingfisher has a chance to
set the flag (for example, on a machine where you cannot run the app
yet), run the `defaults write` command above once and you're done.

**If you have the 1.0.0 preview installed:** it predates the updater and
is signed with a different identity, so it cannot update itself. Quit it,
replace it in Applications with the current release by hand, and open the new one. Your
Studies, Repertoire, Training, Recent work and Settings are kept — they
live in `~/Library/Application Support/kingfisher-desktop/`, outside the
application bundle, and the new release reads them as they are.

## 7. Uninstalling

Kingfisher stores its data outside the application bundle, in
`~/Library/Application Support/kingfisher-desktop/`. To remove the
application and start fresh:

1. Quit Kingfisher.
2. Move the Kingfisher icon from **Applications** to the Trash.
3. (Optional) remove the user-data directory:
   ```bash
   rm -rf ~/Library/Application\ Support/kingfisher-desktop
   ```
   This deletes local Studies, Repertoire, Training, Recent
   Work, and Settings. Reference cache and downloaded data packs
   are also in this directory; they are safe to delete and will
   be re-fetched on demand.

The first launch of a fresh install will not recover deleted
user data. Backups created from **Settings → Backup** are the
supported way to keep that work.

## Common questions

**Is this build the same as the web app?** The application is the same
Next.js application the web runs, with the same features and the same
data. The desktop adds a Mac window around it, a long-lived companion
process, and the engine and database integrations that the browser
cannot host.

**What does "notarised" mean?** Apple's notary service scanned the
signed build for malware and issued a ticket, which is stapled to the
disk image and the application so Gatekeeper can confirm it offline.
The signature is a `Developer ID Application` certificate held by the
maintainer (team `3B5CYF9DQ4`). Neither is an endorsement of what the
application does; both mean the bytes you run are the bytes that were
signed and screened. How the build is made and checked is in
[`macos-trusted-release.md`](./macos-trusted-release.md).

**Where are my Studies, Repertoire, and Training saved?** In the
per-user data directory at
`~/Library/Application Support/kingfisher-desktop/`. The directory is
created on first launch. Backups, made from **Settings → Backup**, are
a JSON file you choose a path for. A backup restores the same data;
uninstalling the app does not delete the directory, and moving the .app
to the Trash does not either — the directory only goes away when you
remove it.

**Does the application phone home?** No. The application contacts the
network only when you explicitly ask it to: a check for updates, an
Explorer query that reaches a remote source, a reference pack install
from the Data Center. None of these send anything about you; the
privacy policy is [`docs/legal/privacy.md`](../legal/privacy.md).
