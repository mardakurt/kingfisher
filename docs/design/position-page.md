# The position page — one address for work that already belongs together

Phase 77 design, 2026-09-22. Implementation and run evidence will be recorded
in the phase handover; this document is not a certification claim.

## 1. Research

The brief is market-research.md §3.2 and §5: the missing connection is between
one's own files. Nate Solon describes leaving studies because he could not
find his notes on a position across them; position and pawn-structure search
were the reason to change tools. His account distinguishes neutral reference
files from a player's chosen repertoire. Those must remain distinct here.
[His first-hand account, read 2026-09-22](https://www.zwischenzug.gg/p/how-i-store-my-opening-files).

IM jposthuma describes losing old studies even when searching for their exact
title. A result must reopen the work at the relevant place, rather than send
the player back to a library to search again.
[Study-search feedback, read 2026-09-22](https://lichess.org/forum/lichess-feedback/lichess-studies-search-function).

These accounts support retrieval and continuity. They do not establish that
no competing product has a position page; we make no exclusivity claim.

## 2. Decisions

- Give the position a URL, `/position?fen=…`, stable on reload and browser Back.
  All joins use canonical `positionKey`; counters and move order are not identity.
- Read existing repositories and providers. Do not create a duplicate store,
  second engine session, board renderer or index of authored content.
- Retain separate questions: personal games, authored work, repertoire choices,
  each reference population, and engine observations. Never sum populations.
- Missing clocks and failed queries are unknown, not zero. A local section
  remains readable when a remote source fails. Query limits are visible.
- Loading the page must not replace an unsaved analysis tree. Its position is
  read-only, rendered by the canonical board; opening a result uses the normal
  document loader and navigation semantics.
- A profile alias is necessary to call imported games “your games”. Without an
  exact profile match, say “Local games” and explain the distinction.
- No cloud service, account, telemetry, invented coaching interpretation or
  engine run is needed to read evidence already stored.

## 3. Design

A compact heading names the page and shows the FEN with a copy control. A
read-only canonical board anchors the left side at desktop widths; the evidence
flows beside it. At phone width the board precedes the sections in one scrolling
column. Each section has a heading, a loading/error/empty state and actionable
rows. Font sizes and controls use existing tokens; no nested scroll traps.

The sections are:

1. Local games at the exact position: players, event, result, matching ply and
   recorded clocks. Identify profile matches explicitly. Open at that ply.
2. Studies and team hand-ins, at the found node; repertoire choices with their
   chosen moves; decisions, review and training cards; opening files and sheets.
3. Reference populations, each a separate column naming its source, count and
   limitations. Offline sources answer automatically; online queries are an
   explicit action. A failure occupies only that source's column.
4. Stored engine evidence with engine, depth, date, score convention and PV.
   Pinned and queued observations keep their own provenance; no “best” badge.
5. Same pawn structure, labelled as different from exact identity. Include local
   games and authored work, linking to their actual positions.

The shared position action list gains “Open position page”; the palette uses
the same action. A direct board-area control makes it one click in the common
workspace frame. Concealed training/calculation positions must not gain an
information leak: respect the existing workspace capability contract.

## 4. Acceptance

- Two transposed move orders find the same work; differing counters do not
  split identity. An invalid FEN produces a readable error, not empty results.
- A sideline chapter and team hand-in reopen at the matching node; a different
  pawn skeleton cannot appear under “Same pawns”.
- Two sources with different counts render independently; one failure cannot
  remove local evidence. Limits never masquerade as total counts.
- An imported spectator game is not presented as the player's own game.
- Missing clock/evaluation evidence is explicitly unavailable. Reading the page
  neither starts an engine nor writes chess state.
- Browser checks exercise board entry, palette entry, reload, result navigation,
  responsive overflow and concealment. Pure-module tests are mutation-checked.

## 5. Persistence and release

No authored store or schema migration is planned. Existing stores remain the
portable source of truth. This is Mac-facing shared source; the published Mac
remains 1.2.6 until section B is run in a future release. No version bump or
package is part of this phase.
