# Getting started with Kingfisher

A 5-minute tour. Built for somebody who has just opened the
application and wants to find the things that matter.

Open the web application at <https://kingfisher-chess.vercel.app/>, or download
the Apple Silicon macOS preview from the
[latest release](https://github.com/mardakurt/kingfisher/releases/latest).

## 1. Open a board

The application opens on `/analysis` with a board on the left and
the engine panel on the right. Stockfish 18 (WebAssembly) is ready
to answer.

Play a move. Either drag a piece, or use the keyboard:

- **Arrows** move the cursor.
- **Enter** drops the selected piece.
- **Backspace** takes the move back.

## 2. Run an analysis

Click **Analyse this position** in the engine panel. Stockfish
evaluates the current position to depth 22 in a couple of
seconds. The principal variation is shown in the engine panel and
on the board as ghost squares.

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

Hit `Cmd+S` (macOS) or `Ctrl+S` (web) and choose a Study. Anything
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

Open **Preparation**, add a name, then click **Research**. The
panel shows what your opponent plays as White and Black, with
the same Explorer columns as before.

That's the five minutes. The same flow works the other way: open
a game, replay it move by move, drop the engine, drop a reference
source, ask "what does Stockfish say at move 18 when the
broadcast games at move 18 were evenly split?"
