# Installing Kingfisher on macOS

This is the **honest version** of the install guide. Kingfisher
1.0.0 for macOS is a **Preview** build: code-signed with an Apple
Development identity, not a notarised Developer ID release;
Gatekeeper may therefore block the first launch. This page tells
you exactly what to do about that, without disabling anything
system-wide.

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
that has not seen this build, macOS will refuse to open it and
say the application is _damaged_ or _cannot be checked for
malicious software_. That is not a diagnosis of the file.
Notarisation is an Apple service that requires a **Developer ID
Application** certificate, and this build does not have one —
the identity it was signed with is a development certificate,
which is a different kind. Nothing about the application changes
when the right certificate exists; only the ability to hand you
the installer does.

**The safe, supported way through Gatekeeper:**

1. **Right-click** (or **Control-click**) Kingfisher in
   Applications and choose **Open**. A dialog asks you to
   confirm.
2. Click **Open** in the dialog. macOS records the exception
   for this copy of the application, so the second launch is
   silent.
3. From then on, double-clicking Kingfisher in Applications is
   enough.

If macOS refuses even that, the file is carrying a quarantine
attribute from the browser. Open **System Settings → Privacy &
Security**, scroll to the **Security** section, and click
**Open Anyway** beside the message about Kingfisher. You may
need to scroll past the recent entries to find it. The same
exception is then recorded.

**Do not turn Gatekeeper off.** `spctl --master-disable` and
its relatives disable a system-wide protection for every
application on the machine, for as long as you leave it off,
to solve a problem with one file. Nothing in this Preview is
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

There is no auto-update. When a new build is published:

1. Quit Kingfisher.
2. Download the new DMG from the release page.
3. Drag the new `Kingfisher.app` over the old one in
   Applications. macOS asks whether to replace — confirm.
4. Your studies, repertoire, notes and preferences are kept;
   they live in `~/Library/Application Support/Kingfisher/`
   and are not touched by replacing the application bundle.

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
for malicious software_. Go back to step 5; right-click → Open
is the supported fix.

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
