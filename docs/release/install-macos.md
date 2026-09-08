# Installing Kingfisher on macOS

This is the honest version. Kingfisher 1.0.0-rc.4 is finished software
with an unfinished signature, and the difference will be the first
thing you meet.

## What you need

- A Mac with Apple Silicon (M1 or later), macOS 11 or later.
- About 1 GB of free disk space.
- Nothing else. No Node, no terminal, no database, no account.

## The normal path

1. Download `Kingfisher-1.0.0-rc.4-arm64.dmg` from the
   [latest release page](https://github.com/mardakurt/kingfisher/releases/latest).
2. Double-click it. A window opens with the Kingfisher icon and a shortcut to
   Applications.
3. Drag Kingfisher onto Applications.
4. Eject the disk image.
5. Open Kingfisher from Applications or Spotlight.

On first launch Kingfisher starts everything it needs by itself, unpacks the
bundled reference data, and opens on a board. There is nothing to configure
and nothing to sign in to.

## What Gatekeeper will do, and why

**Kingfisher is code-signed but not notarised**, so on a Mac that has
never seen the build, macOS will refuse to open it and say the
application is damaged or cannot be checked for malicious software.

That is not a diagnosis of the file. Notarisation is an Apple service
that requires a **Developer ID Application** certificate, and this
build does not have one — the identity it was signed with is a
development certificate, which is a different kind. Nothing about the
application changes when the right certificate exists; only the
ability to hand you the installer does.

### Opening it anyway, in this preview

You downloaded this build from the public Kingfisher release page on
GitHub. If that is not true of your copy, stop here.

Right-click (or Control-click) Kingfisher in Applications and choose
**Open**, then **Open** again in the dialog. macOS remembers the
decision for that copy of the application.

If macOS refuses even that, the file is carrying a quarantine attribute
from the download. Open **System Settings → Privacy & Security**,
scroll to the Security section, and click **Open Anyway** beside the
message about Kingfisher.

**Do not turn Gatekeeper off.** `spctl --master-disable` and its relatives
disable a system-wide protection for every application on the machine, for as
long as you leave it off, to solve a problem with one file. Nothing in this beta
is worth that, and Kingfisher will not ask you to do it.

## If you already tried rc.1 or rc.2

Those builds lost your work every time you quit — a defect in how the
application addressed its own storage, fixed in rc.3. **Your old work is not
gone**; it was still on disk and unreachable. rc.3 looks at what your profile
already holds on first launch and opens the workspace you last used, so install
it over the top and your studies should be there.

If they are not, Settings → Diagnostics → **Copy full diagnostic report** and
send it: the report names the address the application is serving from, which is
the fact that decides what happened.

## First five minutes

Kingfisher opens on the analysis board with a game position and the tools beside
it.

1. **Play a few moves** on the board, or click one in the Explorer.
2. **Press Analyse this position.** Stockfish runs in the application; nothing
   is downloaded and nothing is sent anywhere.
3. **Open the Explorer tool.** It answers from Kingfisher Starter — 172,376
   over-the-board games — and keeps answering twenty full moves in.
4. **Open the Theory Book tool.** It names the opening you are in, with its ECO
   code, and shows no numbers at all: a name is the only claim it makes.
5. **Search a player.** Players → type "Carlsen".
6. **Save something.** Save to study, then quit and reopen. It is still there.

## Optional, when you want it

None of this is needed to use Kingfisher, and none of it is part of first run.

- **Native engines.** Settings → Engine. Each is downloaded from the project's
  own release page, checked against a recorded SHA-256, and made to complete a
  real search before it is listed as ready. They run with your user account's
  permissions and are not sandboxed; the interface says so.
- **Local tablebases.** Settings → Companion → Browse… and point it at a folder
  of Syzygy files. The probe helper is inside the bundle; there is nothing to
  compile.
- **A Lichess or Chess.com account**, to study your own games.
- **Larger reference data.** Not available in this beta — the three optional
  packs are built but not yet published, and their Install buttons will tell you
  so. Kingfisher Starter is what you have, and it is a real source.

## If something goes wrong

**Settings → Diagnostics → Copy support information** puts eight lines on the
clipboard: version, machine, which sources are ready, which engines started,
whether the companion is up. Paste that into your report.

**Copy full diagnostic report** is what to attach. Neither contains your games,
studies, notes, tokens or keys.

**If Kingfisher says another program is using its port**, that is deliberate. It
keeps your work at one fixed loopback port recorded in your profile, and it
would rather stop and tell you than open an empty workspace somewhere else.
Close whatever is using the port it names, and open Kingfisher again.

**If Kingfisher did not get as far as a window**, there is nothing on screen to
copy from. The shell keeps its own log — launch, companion failures, quit —
at:

```
~/Library/Application Support/Kingfisher/logs/kingfisher.log
```

Send that instead. It is bounded to about a megabyte, it never leaves your
machine on its own, and the companion's pairing token is replaced with
`[redacted]` before anything is written.

A useful report is four sentences: what you were doing, what happened, what you
expected, and the support information.

## Uninstalling

Drag Kingfisher from Applications to the Trash. Your work lives in the
browser-style storage the application keeps under
`~/Library/Application Support/Kingfisher`; delete that folder too if you want
nothing left. **Export a backup first** if you want to keep your studies —
Settings → Database → **Export backup**.
