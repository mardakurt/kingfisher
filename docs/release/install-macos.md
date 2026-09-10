# Installing Kingfisher on macOS

This is the **honest version** of the install guide. Kingfisher
1.0.0 for macOS is a Preview build — code-signed with an Apple
**Development** identity, **not** a notarised Developer ID release.
Gatekeeper may therefore block the first launch. This page tells
you exactly what to do about that, without disabling anything
system-wide.

> **Note on 1.1.0 and notarisation.** The 1.1.0 release is
> **planned** to be Developer ID signed and Apple-notarised, with
> a stapled ticket, and a normal double-click as the only step a
> first launch needs. That release is **not yet published**. Until
> it is, every macOS build that exists is the 1.0.0 Preview and
> follows the Gatekeeper instructions below. The release runbook
> for the trusted 1.1.0 build lives in
> [`macos-trusted-release.md`](./macos-trusted-release.md); do
> **not** apply that document to the 1.0.0 binary you actually
> download from the latest release.

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

**Kingfisher 1.0.0 is code-signed but not notarised.** On a Mac
that has not seen this build, macOS will refuse to open it and say
the application is _damaged_ or _cannot be checked for malicious
software_. That is not a diagnosis of the file. Notarisation is
an Apple service that requires a **Developer ID Application**
certificate, and this build does not have one — the identity it
was signed with is a development certificate, which is a
different kind. Nothing about the application changes when the
right certificate exists; only the ability to hand you the
installer does.

**The safe, supported way through Gatekeeper:**

1. Open Finder and go to **Applications**.
2. **right-click → Open** the Kingfisher icon (or Control-click
   and choose **Open** from the menu). This is the only step
   that is different from a normal app launch.
3. macOS will show a confirmation dialog: _“Kingfisher” is from
   an unidentified developer. Are you sure you want to open it?_
   Click **Open**.
4. From this point on Kingfisher opens normally, including
   through Spotlight and Launchpad.

The first right-click is the only friction. Gatekeeper records
the exception per application, per machine, and remembers it.

## 6. If the first launch still fails

If macOS still refuses to open the application after step 5, or
if your Mac is set to only allow App Store and identified
developers, do **not** flip a system-wide setting. The
instructions above are the supported path for an unnotarised
preview. The only thing that removes the right-click step is a
Developer ID build of the application, which does not exist yet
for 1.0.0.

If the file truly is damaged (a `shasum` mismatch, for example),
delete the DMG and download it again. A corrupt download is a
real problem; the Gatekeeper message by itself is not.

## 7. Updates

Kingfisher checks for updates through the application itself:
**Kingfisher → Check for Updates…** in the macOS menu, or
**Settings → Check for Updates** in the application. The check
is manual — there is no background poller and no surprise
restart.

The first launch after an update shows a one-time notice in the
application ("Kingfisher was updated to 1.1.0"). The notice is
non-modal and dismissable. Acknowledging it tells the desktop
you have seen it, so the next launch starts clean.

## 8. Uninstalling

Kingfisher stores its data outside the application bundle, in
`~/Library/Application Support/Kingfisher/`. To remove the
application and start fresh:

1. Quit Kingfisher.
2. Move the Kingfisher icon from **Applications** to the Trash.
3. (Optional) remove the user-data directory:
   ```bash
   rm -rf ~/Library/Application\ Support/Kingfisher
   ```
   This deletes local Studies, Repertoire, Training, Recent
   Work, and Settings. Reference cache and downloaded data packs
   are also in this directory; they are safe to delete and will
   be re-fetched on demand.

The first launch of a fresh install will not recover deleted
user data. Backups created from **Settings → Backup** are the
supported way to keep that work.

## Common questions

**Is this build the same as the web app?** The application is
the same Next.js application the web runs, with the same
features and the same data. The desktop adds a Mac window
around it, a long-lived companion process, and the engine and
database integrations that the browser cannot host.

**Why is the 1.0.0 binary not notarised?** Notarisation
requires a **Developer ID Application** certificate, which has
to be applied for through the Apple Developer Program and
minted by the team that signs the build. Kingfisher 1.0.0 is
signed with the developer's **Apple Development** identity,
which is the right identity for development and testing but is
not trusted by Gatekeeper for distribution. The 1.1.0 release
will use a Developer ID Application identity and a notarised
ticket; the runbook for that release is in
[`macos-trusted-release.md`](./macos-trusted-release.md).

**Where are my Studies, Repertoire, and Training saved?** In
the per-user data directory at
`~/Library/Application Support/Kingfisher/`. The directory is
created on first launch. Backups, made from **Settings →
Backup**, are a JSON file you choose a path for. A backup
restores the same data; uninstalling the app does not delete
the directory, but moving the .app to the Trash and emptying
it does not delete it either — the directory only goes away
when the user explicitly removes it.

**Does the application phone home?** No. The application
contacts the network only when the user explicitly asks it
to: a check for updates, an Explorer query that hits a remote
source, a Reference pack install from the Data Center. None
of those run on a timer.
