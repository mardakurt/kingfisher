# Getting started with Kingfisher

A 5-minute tour. Built for somebody who has just opened the
application and wants to find the things that matter.

Open the web application at <https://kingfisherchess.app/analysis>, or download
the Apple Silicon macOS application from the
[landing page](https://kingfisherchess.app/#macos) (macOS 13 or later;
signed with a Developer ID certificate and notarised by Apple).

## 1. Open a board

The application opens on `/analysis` with a board on the left and
the engine panel on the right. Stockfish 18 (WebAssembly) is ready
to answer.

Play a move. Drag a piece, click it and then its square, or use the
keyboard:

- **T** opens a field under the board: type the move as you would write it
  (`Nf3`, `exd5`, `O-O`, `e2e4`) and press **Enter**. A whole line —
  `1.e4 c5 2.Nf3` — is played as far as it is legal.
- **← →** step back and forward through the moves, **Home** and **End** go
  to the start and the end of the line, **P** plays it through.
- **⌘Z** takes a move back; **Delete** removes the move and everything
  after it.
- **⌘V** with a PGN or a FEN on the clipboard opens Import with it.

Every board page — Analysis, Studies, Repertoire, Openings,
Preparation, Review, Endgame — has the same shape: the board, and on
the right the notation with the tools under it (Engine, Explorer,
Theory Book, Notes, and More), and **Position**
and **Set up** in the header. **Set up** is where you add or remove
pieces to build an endgame or a "what if" position; the Position
menu is everything else you can do with what is on the board.

## 2. Run an analysis

Click **Analyse this position** in the engine panel. Stockfish
evaluates the current position to depth 22 in a couple of
seconds. The principal variation is shown in the engine panel and
its first move as an arrow on the board.

On a Mac, six native engines can be installed from Settings → Engines
(Stockfish 19, Stormphrax, Viridithas, Halogen, PlentyChess, Lc0). Three
catalogue engines — Berserk, Obsidian, Koivisto — publish Windows builds
only and are not offered here; the Settings page says so. That is a fact
about those projects, not a broken install.

## 3. Open the Explorer

Click **Explorer** in the workspace tools. With the bundled
Kingfisher Starter installed, the Explorer answers for every
position. Switch sources from the row at the top — each source
keeps its own count, licence and provenance.

## 4. Open the Theory Book

Click **Theory Book** in the workspace tools. The 3,810 named
positions are listed by ECO code and name. Open the Sicilian, then
the Najdorf, then the English Attack. Click a position to put it
on the board.

## 5. Search a player

Open the **Players** section. Type "Carlsen". The first row
is the live one. The profile shows total games, what Carlsen
plays as White, what he plays as Black, and what changed
recently. Click any game to open it on the board.

## 6. Save something

Press `⌘S` (`Ctrl+S` on Windows and Linux, in the browser too) and choose a Study. Anything
you save persists across quits. To prove it: quit the desktop
application, reopen it, find the same study.

## 7. Optional: install a reference pack

The bundled Kingfisher Starter answers on day one. For broader
coverage, open **Databases → Reference sources → Install** and
pick **Elite OTB**, **Recent Theory** or **High-Rated Online**.
The Install button does the full download + checksum + install
for you. Sizes are honest; pick the pack that matches the
question you actually have.

## 8. Optional: an opponent preparation

Open **Preparation** and start typing a name. The box offers the
player library — every player the installed reference sources hold
games for, with the count — and **Prepare** builds the report from
those games and from any you have imported, each source counted on
its own line. The profile is in the rail on the left, the opening
tree in the dock on the right, and the board between them.

That's the five minutes. The same flow works the other way: open
a game, replay it move by move, drop the engine, drop a reference
source, ask "what does Stockfish say at move 18 when the
broadcast games at move 18 were evenly split?"
