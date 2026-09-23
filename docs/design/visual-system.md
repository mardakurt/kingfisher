# Kingfisher visual system

Kingfisher is a chess workstation. The board, notation and current evidence
must read before navigation or decoration. Since Phase 82 it is drawn as a
quiet Mac document window: a white workspace, a pale grey source-list
sidebar, hairline separators, the platform's own typeface and one blue
accent. The same design is the web application and the Mac application.

## Principles

1. Board first; notation second; selected research tool third.
2. Air around the board, never chrome on top of it.
3. Hairlines and a change of surface, not boxes, shadows or uppercase labels.
4. One accent, blue, for selection and focus — never for decoration.
5. Motion explains a state change and stops when reduced motion is requested.

## Where the design comes from, and where it stops

The owner's brief of 2026-09-23 asked for the calm of the announced ChessBase
for Mac. What Phase 82 took is the _layout language_ every Mac application
shares — a source-list sidebar in sentence-case groups, a document title in
the toolbar, the board on its own with the notation in a panel beside it,
disclosure sections in that panel. What it did not take is anything that
identifies ChessBase: its name, its logo, its red, its piece artwork or its
wording. Kingfisher keeps its own mark, its own blue, its own pieces and its
own section names. Do not close that gap.

## Tokens

The typed catalogue is `src/ui/tokens.ts`; matching CSS custom properties live
in `src/app/globals.css`. Spacing uses a 4px base. Controls are 28/36/42px,
controls use 6px radii and panels 10px, and the board 2px inside its frame.
Sidebar rows are 30px with 17px icons. The expanded/collapsed sidebar widths
are 244/72px. Focus is a 2px accent outline. Motion is limited to 90, 140 and
180ms.

Surface levels mean one thing everywhere: `surface-0` is the application
canvas, `surface-1` is primary chrome — the same white as the canvas in the
light theme, so regions are divided by hairlines rather than by tone —
`surface-2` is a hovered or raised region, `surface-3` is the selected
surface, `surface-inset` is an input or recessed work area, and
`surface-sidebar` is the source list's own grey. Borders follow
subtle/default/strong.

Light is the default theme. Profiles from before Phase 82 were moved to it,
and from the Midnight board to Studio, once (preferences version 7); a choice
made after that is kept.

## Type and density

The UI face is the platform's own: San Francisco on a Mac (in Safari, Chrome
and the Mac application alike), Segoe UI on Windows, Inter elsewhere.
JetBrains Mono is reserved for FEN, UCI, engine diagnostics and technical
numeric data. Move notation uses the UI face with tabular move numbers. The
toolbar title is 15px semibold; section and group labels are 11–12px
semibold in sentence case. Phase 82 removed the uppercase, letter-spaced
labels throughout: they read as a dashboard, not a document.

## Navigation and tools

Primary routes are grouped by intent without accordion clicks, as a Mac
source list: a grey sidebar, sentence-case group names, 30px rows, and a
filled rounded row for the selection with the icon in the accent, so it does
not depend on hue alone. Settings is the one labelled row at the foot; theme,
feedback and collapse share a row of icons, each with its accessible name.
The list fits a 1440x900 display without scrolling.

The board column holds the board and its controls. The side panel opens with
the **Notation** as a disclosure section — folded or open, remembered per
browser — and the tools below it as a row of pill tabs: Engine, Explorer,
Theory Book and Notes visible, the long tail under More. A person can still
move the notation under the board from its ⋯ menu, and that choice is stored.
On a phone the panel is one sheet and the notation is a tab in it.

## Board and themes

The default board is **Studio**: near-white and periwinkle squares in a
5px navy frame, drawn as a ring outside the grid so the squares keep the box
the pointer mapping measures.

The canonical full-size board and `MiniBoard` share `SquareLayer` and
`PieceLayer`. Settings previews, PV previews and setup therefore cannot invent
different geometry. The evaluation bar belongs in the board frame's width
calculation. Last-move, selection, check, legal-target and annotation colors
are separate from success/warning/destructive UI colors.

Dark and light palettes are designed independently in semantic variables.
Every supported vector set is exercised on representative light, green,
brown, blue, dark, high-contrast and wood-like boards. Visual snapshots cover
whole high-risk compositions; semantic assertions remain the primary contract.

## Motion and accessibility

Menus, dialogs and panel transitions use short easing without bounce or
spring. `prefers-reduced-motion` reduces all transitions and animations to an
imperceptible duration. Icons supplement visible labels, and every icon-only
button has an accessible name. Focus is always visible in both themes.
