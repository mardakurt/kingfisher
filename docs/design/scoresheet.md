# Scoresheet: the over-the-board game, from the sheet to the board

_Design, 2026-09-22 (Phase 76). The second item of the parity queue in
`docs/product/market-research.md` §6: "getting the game in". Built after this
document; the record of what shipped is at the end._

## What the research says

Typing a scoresheet is "extensive time and labor" (§3.7), and the answers on
the market all end at a PGN file: OCR apps, camera transcription, tablet
scoresheets, and DGT boards. Every one of them stops where the study tool's job
begins. ChessBase's only real answer is its DGT integration.

Two facts about handwriting recognition shape this design:

1. **There is no redistributable model for handwritten chess moves.** The
   open projects either need a purpose-printed sheet with alignment marks and a
   CNN trained on it (Reine, GPL), or send the photo to a hosted vision model
   with the user's own key (every 2025–2026 project). The academic BiLSTM
   (J. Imaging 2022) published no usable weights.
2. **Chess constrains the reading more than the ink does.** At most a few
   dozen moves are legal in any position; a scribble that could be `Nf3` or
   `Nf6` is one or the other, and the moves that follow usually decide which.
   A reader that knows the rules needs far less from the handwriting than a
   general one — and can say exactly which moves it is unsure of.

## Decisions

**The sheet is entered against the rules, and the rules do the work.** The
transcription is a sequence of tokens; each token is resolved against the
legal moves of the position reached so far by a matcher that accepts what
people actually write — `Nf3`, `nf3`, `Sf3` (German), `Cf3` (French, Spanish),
`0-0`, `oo`, `ed`, `exd`, `e8Q`, `e8/Q`, a missing `x` or `+`, a stray `:`. A
token that resolves to exactly one legal move is a move. One that resolves to
several is a move with a **check** flag and the alternatives kept. One that
resolves to none stops the transcription there and says so.

**Photo transcription uses the assistant endpoint the user already
configured, and nothing depends on it.** Kingfisher ships no key and no model
(ADR 0016). If _Settings → Assistant_ names an OpenAI-compatible endpoint and
its model can read images, _Read the sheet_ sends the photo and asks for the
moves as written; the reply is data, resolved token by token exactly as typed
input is, and every move it was unsure of — or that the rules could not accept
— is a check flag. No endpoint, or a model that cannot see: the photo still
sits beside the board, zoomed to where the player is, and they type. Nothing
is sent anywhere unless the user configured somewhere to send it and pressed
the button.

**A gap is a first-class thing.** An illegible cell is skipped with `?`. The
moves typed after it wait in a buffer while Kingfisher tries every legal move
at the gap and keeps those that leave the buffered moves legal. One survivor
fills the gap and is flagged _reconstructed from the moves around it_;
several are offered; none means the buffer holds the error, and it says which
move first fails under every candidate.

**"Check these moves" is a list on the board, not a colour on a page.** Each
flag names why (read as `…`, alternatives, reconstructed, illegible) and
selecting it shows the position with the alternatives as arrows; choosing one
rewrites the move. The flags are written into the game as comments so they
survive the save and the After-the-round evening that starts from it.

**One board.** The route uses the canonical board and the analysis store: every
accepted move is played into the tree the way a move on the board is, so the
move list, the engine, the notes and _After the round_ are the same tools with
nothing copied. The rail holds the sheet, the entry line and the flags.

**A photo dropped on the sheet becomes the sheet.** What a DGT board or a
transcription app produces is a PGN, and that already has a home: _Import
PGN_, which takes a file. This route adds the one drop target it owns — an
image on the sheet panel — and does not take over the window.

## Model

```
Transcript
  tokens: Token[]            what was written or read, in order
  plies:  Ply[]              what the rules accepted, in order
Ply
  san, uci                   the move the rules accepted
  status: 'read' | 'check' | 'reconstructed'
  readAs?: string            the token, when it did not resolve exactly
  alternatives?: string[]    other legal readings, when there were any
Gap
  at: ply index              where the sheet could not be read
  buffer: Token[]            moves after it, not yet on the board
```

`src/scoresheet/match.ts` — `matchToken(position, token)`: candidates ranked
exact → same move under a different spelling → one character off, never more.
`src/scoresheet/reconstruct.ts` — `reconstructGap(position, buffer)`: the
legal moves at the gap under which the buffer resolves, with how far each
gets. `src/scoresheet/reading.ts` — `readTokens(startFen, tokens, uncertain)`:
tokens into plies and flags, stopping at the first token no reading accepts;
and `parseReading(text)`: the assistant's reply into tokens, headers and the
indexes it marked uncertain, defensively. All three are pure and tested.

## Interface

`/scoresheet`, in the rail. The rail: the sheet (drop, choose, or the camera on
a phone; pinch and drag), _Read the sheet_ when an endpoint is configured, the
entry line with the ranked readings under it (Enter takes **what was
written**, clicking a reading takes that one, `?` skips a cell, Backspace
over an empty line takes the last move back), the
_Check these moves_ list, and the game details with _Save to My games_ and
_Save and start After the round_. The board and dock are the workspace's own.

## What is not claimed

Kingfisher does not read handwriting. It resolves what a model or a person
wrote against the rules and says where it could not. A sheet read by a model
is still the model's reading; the flags are the honest part.

## Record

Shipped in Phase 76 (`/scoresheet`). `src/scoresheet/` holds the four pure
modules (`match`, `reading`, `reconstruct`, `sheet-reading`) with 43 unit
tests; `src/stores/scoresheet-store.ts` is the session, and the flags live in
the tree as comments so they survive the save. `e2e/scoresheet.spec.ts` types
a Najdorf English Attack from a sheet with a smudged cell and an illegible
one, fills the gap from the eleven moves after it (two candidates still fit,
and both are offered rather than one being chosen), and saves the game to My
games.

Two things were found by driving it rather than by testing it. The entry line
first submitted the best candidate's SAN on Enter, which silently discarded
the doubt the flag list exists to carry — Enter now takes what was written,
and clicking a candidate is the deliberate choice. And a `?` inside a cell
left one legal reading often enough that it went in unflagged; it is now
always flagged, because "only one move fits" is not "this is what the sheet
says".
