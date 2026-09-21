# The ChessBase file family, as Kingfisher reads it

_Record, 2026-09-22 (Phase 76). What was derived, from what, and what was
run to check it. The reader is `src/database/chessbase/`; this document is
the evidence behind it. Nothing here is a vendor specification — ChessBase
publishes none — and every claim is one a command below can reproduce._

## 1. What is read

A ChessBase database is a set of files sharing a name: `.cbh` (46-byte game
headers), `.cbg` (movetext), `.cba` (annotations), `.cbp` (players), `.cbt`
(tournaments), `.cbc` (annotators), `.cbs` (sources), `.cbe` (teams), `.cbj`
(the extended header, read for team ids only) and others Kingfisher ignores
(search boosters, guiding-text media). A `.cbv` is those files packed into one
archive. Kingfisher reads all of it **and never writes any of it**: the files
belong to a program that may be running.

The layouts of the database files follow the format description that ships
with Jimmy Mårdell's `morphy` (`morphy-cbh/docs/cbh-format/`, the result of
his reverse engineering; the repository declares no licence, and no code from
it was used). Two things were taken from that description that could not be
derived here: the 256-entry translation table for movetext encoding mode 0
(`table.ts`), which every third-party reader carries and which was checked
entry for entry against the independently derived table in `cbh2pgn` (MIT),
and the opcode table for single-byte moves. Everything else was written from
the description and then checked against files ChessBase itself wrote (§3).

The `.cbv` layout is **not** in that description. It was derived here (§2).

## 2. The archive (`.cbv`)

Derived by reading the weekly archives The Week in Chess publishes (fifteen
issues, 2016–2026, all written by ChessBase software) and requiring every
recovered file to have exactly its declared size. Where a file's layout is
fixed — the entity files — the same file stored raw in one issue was compared
with its packed form in another.

**Directory.** 8 bytes: `08 00`, entry count (u16 LE), entry size (u16 LE,
173), `03 00`. Then one 173-byte entry per file: a 128-byte name (zero
terminated; the rest is uninitialised memory), then offset, packed size and
unpacked size as u32 LE, two u32 of unknown meaning, one byte, and the three
sizes again as u64 LE. The data follows.

**Blocks.** A file is stored as blocks of `[u16 LE length][u16 LE ?][u8
method]` and `length − 1` bytes of payload. Each block holds 61,440 bytes of
the file (the last one fewer). The second field is not a checksum of the
payload or of the plain data under any common scheme (byte sum, 16-bit word
sums in either order, Fletcher, BSD, CRC-16 in four variants, Adler and CRC-32
were tried); it is not checked. The size checks are stronger.

**Method 0** — stored.

**Method 1** — an LZ77 variant. A 16-bit little-endian flag word covers the
next sixteen items, most significant bit first; a clear bit is a literal byte,
a set bit a token `b0 b1`, with `n = b0 >> 4` and
`f = (b0 & 15) | (b1 << 4)`:

| `n`  | meaning                                                   |
| ---- | --------------------------------------------------------- |
| 0    | a run of byte `b1`, `(b0 & 15) + 3` long                  |
| 1    | a run of the following byte, `f + 19` long                |
| 2    | a copy of `(following byte) + 16` bytes from `f + 3` back |
| 3–15 | a copy of `n` bytes from `f + 3` back                     |

Found from an `.ini` file (readable text) and the entity files, whose every
byte is predictable from their layout.

**Method 2** — a static Huffman code over bytes. The payload is a u16 BE count
of bytes, then for each byte value 0–255 a 4-bit code length and the code
itself (0 = unused), then the coded bytes, all most significant bit first.
Found by a known-plaintext attack: the `.cbg` of an issue was predicted from
the publisher's own PGN with a move encoder written from the format
description, the code for `0x00` was located as a five-bit pattern repeating
exactly where the plaintext has runs of zeros, the 256 code lengths were
solved as an integer linear system over 629 anchored segments (Kraft sum
exactly 1.0, residual 0), and the header was recognised when Σ(4 + length)
over the 256 symbols came to its exact bit count. The whole 61,440-byte block
then decoded with zero mismatches.

**Method 3** — method 2 wrapped around method 1: the Huffman stage yields an
LZ stream (its count is that stream's length), and the LZ stage yields the
file.

## 3. What was run

All of it in the scratch area with the Python prototypes that derived the
format, then repeated with the TypeScript reader in the repository.

- **Fifteen TWIC archives (issues 1000–1600), 201 files, 640 blocks:** every
  file unpacked to exactly its declared size; every LZ stream was consumed to
  its last byte; the TypeScript reader's output was byte-identical to the
  prototype's for all 201 files (0.85 s in total).
- **TWIC 1600 read back and compared with the publisher's PGN:** 8,895 of
  8,895 games decoded; all 8,895 agree with the PGN on every move of the main
  line, the result and the date. 55 differ in a player's name only, where
  ChessBase's fixed 30-byte surname and 20-byte forename fields truncated it.
- **The move encoding, the other way round:** an encoder written from the
  description re-encoded the 421 variation-free games of morphy's `World-ch`
  test database (written by ChessBase) and produced ChessBase's own bytes for
  every one of them — the check that the slot tables, the opcode ranges, the
  three-byte moves and the obfuscation counter are what the description says.
- **morphy's `World-ch` (1,025 games, 198,921 plies, 14,269 branch points,
  624 annotated games):** every move legal through Kingfisher's rules, every
  game rendered to PGN that Kingfisher's parser accepts, 0 annotation issues.
  Twelve lines end at a null move the PGN cannot hold; that is reported per
  game.
- **morphy's `Mate2` (ChessBase 6, 1992):** seven set-up positions, each
  puzzle ending in checkmate; and `test-annotations` (2024): NAGs, text,
  variations, coloured squares and arrows as expected.

## 4. What is in the repository

Fixtures in `src/database/chessbase/__fixtures__/`, 104 KB in all, listed in
`THIRD_PARTY_DATA.md`:

- `world-ch/` — a 23-game slice of morphy's `World-ch`: the 1886
  Steinitz–Zukertort match, the 1892 game morphy's own tests assert, and two
  games annotated with symbols only. Built by copying the game records and
  their movetext and rewriting the offsets; **every text annotation was left
  out** (the commentary is ChessBase Magazine's), and the slice is checked to
  contain none.
- `mate2/` — the seven set-up-position puzzles, with the annotation file left
  out (training questions, which Kingfisher does not import).
- `archive/` — four packed entries of TWIC 1600 (the tournament index, the
  source record, the annotation header and the flags file: event names and a
  publisher record, not games) with the files they unpack to, covering methods
  0, 1 and 3. Method 2 has no small specimen — ChessBase reserves it for the
  moves file — so its test uses a coder written to the description above.

## 5. Limits, stated

- Movetext encoding mode 0 only. Modes 1–7 need further permutation tables
  for a share of games morphy calls vanishing; 8–19 are chess variants;
  Chess960 (10, 11) is refused by rule. A game in another mode is reported
  and skipped, with the mode named.
- A null move ends a line in the PGN; the moves after it are decoded (to
  stay aligned) and dropped, and the game says so.
- Annotation types kept: text before and after a move, symbols, coloured
  squares, arrows, time spent, both clocks. Medals, critical positions,
  training questions, game quotations, pawn-structure and piece-path marks,
  variation colours, embedded media and the correspondence header are counted
  and left out. There is nothing in a Kingfisher game they could become.
- Guiding texts and games marked deleted are not imported; the inspection
  counts them.
- Names are read as Windows-1252, comments as UTF-8 when they are valid
  UTF-8 and Windows-1252 otherwise. ChessBase itself never wrote UTF-8 into
  the fixed name fields, and truncated names stay truncated.
- The 16-bit block field of the archive is not verified (§2).
