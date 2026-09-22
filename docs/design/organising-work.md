# Organising your work: tags, and search as a page

_Design, 2026-09-22 (Phase 76). The fourth item of the parity queue in
`docs/product/market-research.md` §6: "folders or tags on studies and
chapters, and the search that already exists surfaced as a page, not only a
palette." The record of what shipped is at the end._

## What the research says

Two complaints, from different people, about the same thing:

- "Difficult to organize, and almost impossible to search" — opening files
  mixed with game reviews, no position search (Solon, §3.2).
- Folders for studies have been requested on Lichess from 2021 to 2026,
  repeatedly, and are still absent; the study search misses exact titles and
  buries relevant results under recent ones (§3.2).

Kingfisher is further along than either — everything is keyed by position and
`searchByPosition` already reads eleven stores — but the reach is hidden. It
lives in the command palette, which a person has to know exists, has to open,
and which closes the moment they look away from it.

## Decisions

**Tags, not folders.** Folders ask a question with one answer: where does this
live? A study about the Najdorf, prepared for one opponent, from one
tournament, has three answers and a folder forces two of them to be lost. Tags
give the same organisation with none of that, and every other authored thing
in Kingfisher already carries them (opening files, endgame positions, review
themes), so this is the house idiom rather than a new one. A person who wants
folders can use one tag per study and has them.

**A tag is a string the person typed, and nothing else.** Kingfisher does not
infer tags from the moves, does not suggest an opening name as a tag, and does
not create one when a study is imported. An inferred tag would be a judgement
about somebody's filing wearing the clothes of their own label.

**Chapters carry tags too.** The complaint is "opening files mixed with game
reviews", and in Kingfisher those are often chapters of one study. A chapter
tagged `to-review` is the smallest thing that answers it.

**Search is a page as well as a palette.** The palette stays exactly as it is:
it is the fastest path and people use it. The page (`/search`) is for the
other half of the research's complaint — a result list you can read, sort
through, and come back to, with the query in the URL so it can be linked and
reloaded. Both open a hit the same way, through one module, because two
implementations of "open this chapter at this move" is how one of them
silently stops working.

**Position search and text search are the same box.** A FEN, a move sequence
(`1.e4 c5 2.Nf3`), or words: the page decides which it is the way the palette
already does, and says which it decided. The four questions stay apart — this
searches _your own work_, not a reference population.

## Model

`StudyRecord.tags` and `ChapterRecord.tags`, both `readonly string[]`, both
absent on records written before schema **v20** and read as `[]`. The stores
gain a `tags` multi-entry index so "every study tagged `najdorf`" is an index
lookup rather than a scan. Both stores are already in `PORTABLE_STORES`, so a
backup carries tags with no change; the migration fixture for v19→v20 is the
proof.

Tags are normalised on write: trimmed, lower-cased, deduplicated, at most 12
per record, each at most 32 characters. Normalisation is a pure function
(`src/persistence/tags.ts`) so the rail, the repository and the importer
cannot disagree about whether `Najdorf` and `najdorf ` are one tag.

## Interface

**Studies rail.** A tag row under the study list: every tag in use with its
count, newest-used first; selecting one filters the list, selecting several
narrows by all of them (a study must carry every selected tag — "and", not
"or", because a filter that widens as you add to it is not a filter). A study's
own tags are edited in its header; a chapter's in the chapter list.

**`/search`.** One box, the query in `?q=`. Above the results, what the box
was read as ("a position", "a move sequence", "words"). Results grouped by
kind with a count each, and — for a position — the same-pawns group the
palette added in Phase 75, under its own heading. Every row opens where it was
found. Empty says which kind of empty it is: nothing typed, nothing matched,
or a position that could not be read.

## What is not claimed

The page searches what the player has authored or imported into this
workspace. It does not search reference packs, the explorer, or the web, and
says so where a person might expect otherwise.

## Record

Shipped in Phase 76. `src/persistence/tags.ts` is the normalisation (13
tests); schema **v20** adds a multi-entry `tags` index to the studies and
chapters stores, with a v19→v20 historical fixture that writes an untagged
study, reads it back, and tags it — the `multiEntry` flag was flipped once
and the fixture failed, which is what makes it a fixture rather than a
formality. Both stores were already in `PORTABLE_STORES`, so backups carry
tags with no change.

`/search` is the page, with `?q=` as the only state: the box is a controlled
input over the URL, so a search can be linked, reloaded and walked with the
back button. `src/features/search/open-hit.ts` is the one implementation of
"open this hit", and the command palette was changed to call it — it had
carried its own copy of both openers, which is exactly the duplication that
lets one of them quietly stop landing on the right move.
