# Kingfisher — first-100 user guide

A short, practical guide for the first 100 real users. It explains
the small number of things you need to do to be productive, and the
small number of things that will surprise you.

## Open Kingfisher

Kingfisher runs in the browser. There is no installer to run, no
account to create, no email to confirm. Open the URL your contact
gave you and you are in.

The very first time you open it, the browser will quietly stream a
small Starter reference. That takes a few seconds. The studio is
usable while it loads.

## The studio

The studio is the working surface. On the left is a navigation
rail; in the middle is a board and a move list; on the right is a
panel that shows reference data, an engine analysis, or a chapter
view, depending on what you are doing.

Three places to know:

- **The board.** Drag a piece, or type the move (e.g. `e4`).
- **The left rail.** The pages: Analysis, Studies, Repertoire,
  Training, Database, Openings, Players, Settings.
- **The bottom-left status.** This is the save indicator. It
  always says what is true: `Saved on this device`, `Saving…`, or
  `Save failed`.

## Run the engine

In the Analysis page, the right panel has an engine card. Press
**Start**. The first evaluation appears in a few seconds. Stop and
restart whenever you want; the engine is yours to run, with no
quota.

If the engine cannot start, the panel says what is wrong in plain
English. The most common reason on a fresh browser is that
cross-origin isolation is not yet available; the engine then runs
in single-threaded mode, which is slower but correct.

## Find anything: ⌘K / Ctrl K

Press `⌘K` on macOS or `Ctrl K` on Windows / Linux. The command
palette opens.

Type:

- `e4` — a position or a move sequence. The palette recognises
  both.
- `Najdorf` — an opening.
- `Carlsen` — a player.
- `rnbqkb1r/...` — a FEN.
- `my study` — your own work.

Use the up and down arrows to pick a result, then press Enter to
open it.

## The Explorer

On the right of the Analysis page, the **Explorer** panel shows how
often each move has been played in a reference database, and the
results of those games. By default it uses the **Starter**
reference, which is already on your machine.

The source selector at the top of the Explorer switches to other
references when you have them installed. The source identity is
shown on every row, so you always know which database a number
came from.

## Make a study

Open **Studies** in the left rail. Press **New study**, give it a
name, and play moves. Comments and engine lines can be added
inline. The work saves as you go. Close the studio, reopen it
tomorrow, the study is still there.

There is no **Save** button. There does not need to be.

## Make a repertoire

Open **Repertoire**. A repertoire is a tree of moves you intend to
play. Build it from any study or position. Kingfisher remembers
your answer for every position the user will see, and uses it to
drive Training.

## Train

Open **Training**. A position appears. Play the move you would
play in a real game. Kingfisher checks it against your repertoire.
A wrong move is not a failure; it is information. The next round
will see it again.

## Backups

Open **Settings** → **Storage** and press **Download backup**.
You get a single JSON file. Keep it somewhere safe; the file
contains your work but no chess engine, no reference data, and no
personal information.

To restore: open **Settings** → **Storage** → **Restore**, and
pick the file. The studio will tell you what is about to happen
before anything is written.

## Install the PWA

In Chrome or Edge, the right side of the address bar shows an
install icon. Press it. Kingfisher now opens in its own window,
starts faster, and works offline.

On Firefox, the install path is **Add to Dock** on macOS and
**Add to Apps** on Windows. On Safari, the path is **Share →
Add to Home Screen**.

The PWA and the browser tab share the same local workspace. The
work you do in one is visible in the other.

## When something is broken

Open **Settings** → **Help and feedback** and pick the issue type
that fits. The four categories are:

- **Something is broken** — opens the bug report template.
- **Chess / data issue** — opens the data issue template.
- **Idea or improvement** — opens the feature request template.
- **General feedback** — opens a discussion.

A **Copy support information** button is also there. It puts a
small, privacy-respecting text snippet on the clipboard. Paste it
into the report so the maintainer can see your Kingfisher version,
your browser, the reference sources you have, and the recent error
codes. The snippet does not contain your studies, comments, or
repertoire.

## What is not on you

You do not need to:

- create an account
- enter an email
- install anything to use it
- read a manual

The studio opens, the engine runs, the explorer answers. If
something stops being true, please tell the maintainer; the
feedback button is the right channel.
