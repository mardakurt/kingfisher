# Installing Kingfisher on macOS

This is the **honest version** of the install guide. Kingfisher
1.1.0 for macOS is **Developer ID signed** and **notarised by
Apple**; the notarization ticket is stapled to the deliverable
so a normal double-click is all a first launch needs. There is
no Gatekeeper workaround and no system-wide setting to flip.

If you are on a 1.0.x build and the installer still asks you
to right-click → Open, you are looking at a pre-Phase 36 build
and the new version's first launch will be silent.

## What you need

- A Mac with **Apple Silicon** (M1 or later), running **macOS 11
  (Big Sur)** or later.
- About **1 GB** of free disk space for the application and a
  fresh study workspace.
- Nothing else. No Node, no terminal, no database, no account.

## 1. Download

Get the DMG from the latest release on GitHub:

> <https://github.com/mardakurt/kingfisher/releases/latest>

The file is **`Kingfisher-1.0.0-arm64.dmg`**. The download button
on the landing page points at the same file. If the file you
downloaded has a different name, the release page is the source
of truth — stop and check the SHA-256 listed there.

## 2. (Optional) verify the download

The release page lists the SHA-256 of the DMG. To check yours:

```bash
shasum -a 256 ~/Downloads/Kingfisher-1.0.0-arm64.dmg
```

The output should match the value on the release page. If it
does not, the download was corrupted or tampered with — delete
it and re-download.

## 3. Open the DMG

Double-click `Kingfisher-1.0.0-arm64.dmg` in your Downloads
folder. A window opens with the Kingfisher icon and a shortcut
to Applications.

## 4. Move to Applications

Drag the Kingfisher icon onto the Applications shortcut. Eject
the disk image (right-click the desktop icon, **Eject**, or use
the eject button next to it in Finder).

## 5. First launch — Gatekeeper

Open Kingfisher from Applications or Spotlight. The first launch
is the one Gatekeeper cares about.

**Kingfisher 1.1.0 is Developer ID signed and notarised by
Apple.** The notarization ticket is stapled to the application,
so the offline Gatekeeper decision is in your favor. A normal
double-click is enough. There is no right-click → Open step
and there is no system-wide setting to change.

If you have an older 1.0.x build that you signed-out, the new
build will be detected by the auto-update path on the next
launch; the macOS menu's **Kingfisher → Check for Updates…**
item offers **Install Update** as the primary action.

**Do not turn Gatekeeper off.** `spctl --master-disable` and
its relatives disable a system-wide protection for every
application on the machine, for as long as you leave it off,
to solve a problem with one file. Nothing in Kingfisher is
worth that, and Kingfisher will not ask you to do it.

## 6. First five minutes

Kingfisher opens on the analysis board with a game position and
the tools beside it.

1. **Play a few moves** on the board, or click one in the
   Explorer.
2. **Press _Analyse this position_.** Stockfish 18 runs in the
   application; nothing is downloaded and nothing is sent
   anywhere.
3. **Open the _Explorer_ tool.** It answers from Kingfisher
   Starter — 172,376 over-the-board games — and keeps answering
   twenty full moves in.
4. **Open the _Theory Book_ tool.** It names the opening you
   are in, with its ECO code, and shows no numbers at all: a
   name is the only claim it makes.
5. **Search a player.** Players → type "Carlsen".
6. **Save something.** Save to study, then quit and reopen. It
   is still there.

## 7. Updating

**The normal path** is in-app and one click:

1. **Kingfisher → Check for Updates…** in the macOS menu bar.
2. If a newer version is published, the dialog shows
   **Kingfisher 1.X.Y is ready to install.** with two
   buttons: **Install Update** (primary) and **View Release
   Notes** (secondary).
3. Click **Install Update**. Kingfisher downloads the update
   in the background, verifies it against the signed
   manifest, asks any open windows to finish saving your work,
   and replaces the running application. The previous version
   closes; the new version opens. There is no second "Open
   Installer" click.
4. On the first launch of the new version, Kingfisher shows a
   small "Kingfisher was updated to 1.X.Y" notice once. The
   notice is dismissed by clicking the **What's New** link or
   by simply closing it; it does not appear again.

Your studies, repertoire, training, recent work, settings and
preferences are kept; they live in
`~/Library/Application Support/Kingfisher/` and are not
touched by replacing the application bundle. The save barrier
that runs before the install refuses to replace the application
if any of those writes are still in flight.

**The manual fallback** is the same DMG you downloaded for the
first install. The dialog offers **Download Installer** if
auto-install cannot run on your machine (read-only volume,
permission failure, or any other reason). The download is the
same signed and notarized artifact the auto-update path
would have used; verify its SHA-256 against the release page
and drag it over the existing application.

## 8. Uninstalling

1. **Export a backup first** if you want to keep your studies:
   _Settings → Database → Export backup_.
2. Quit Kingfisher.
3. Drag Kingfisher from Applications to the Trash.
4. Optionally, delete the application-support folder to remove
   the last copy of your local work:
   `~/Library/Application Support/Kingfisher`.

## Troubleshooting

### "Kingfisher is damaged"

That is Gatekeeper saying the same thing as _cannot be checked
for malicious software_. It should not happen on a 1.1.0
build: the notarization ticket is stapled and the offline
decision is in your favor. If you see this on 1.1.0:

- The download was corrupted. Re-download and verify the
  SHA-256 against the release page.
- The DMG is being opened from a quarantined location the OS
  does not recognize. Move it to `~/Downloads/` or
  `~/Desktop/` and re-open it from there.
- The build is a 1.0.x line on your machine, not 1.1.0. The
  1.0.x build is code-signed with a development identity and
  Gatekeeper treats it as untrusted. Open the **Check for
  Updates…** menu item and use **Install Update** to move to
  1.1.0.

### "Another program is using its port"

That is deliberate. The desktop companion keeps your work at one
fixed loopback port recorded in your profile, and Kingfisher
would rather stop and tell you than open an empty workspace
somewhere else. Close whatever is using the port it names, and
open Kingfisher again.

### Kingfisher did not get as far as a window

There is nothing on screen to copy from. The shell keeps its own
log — launch, companion failures, quit — at:

```
~/Library/Application Support/Kingfisher/logs/kingfisher.log
```

The log is bounded to about a megabyte, it never leaves your
machine on its own, and the companion's pairing token is
replaced with `[redacted]` before anything is written.

_Settings → Diagnostics → Copy support information_ puts eight
lines on the clipboard: version, machine, which sources are
ready, which engines started, whether the companion is up. Paste
that into your report.

_Copy full diagnostic report_ is what to attach. Neither contains
your games, studies, notes, tokens or keys.

### A useful report is four sentences

What you were doing. What happened. What you expected. The
support-information line.

## Optional, when you want it

None of this is needed to use Kingfisher, and none of it is part
of first run.

- **Native engines.** _Settings → Engine_. Each is downloaded
  from the project's own release page, checked against a
  recorded SHA-256, and made to complete a real search before
  it is listed as ready. They run with your user account's
  permissions and are not sandboxed; the interface says so.
- **Local tablebases.** _Settings → Companion → Browse…_ and
  point it at a folder of Syzygy files. The probe helper is
  inside the bundle; there is nothing to compile.
- **A Lichess or Chess.com account**, to study your own games.
- **Larger reference data.** _Databases → Reference sources →
  Install_ lists Elite OTB, Recent Theory and High-Rated
  Online. The install button does the full download + checksum
  - install for you. Sizes are honest; pick the pack that
    matches the question you actually have.

## See also

- [Getting started](getting-started.md) — the five-minute tour
  of the application.
- [Release notes](1.0.0.md) — what is in this build.
- [Data licences](../legal/data-licences.md) — every reference
  source and its licence.
