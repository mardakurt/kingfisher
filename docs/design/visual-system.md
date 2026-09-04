# Kingfisher visual system

Kingfisher is a chess workstation. The board, notation and current evidence
must read before navigation or decoration. Chrome stays compact and surfaces
stay quiet so a long analysis session does not become tiring.

## Principles

1. Board first; current line second; selected research tool third.
2. Compress chrome, never chess content.
3. Prefer dividers and surface changes to floating cards and shadows.
4. Use amber for selection and focus, not as decoration.
5. Motion explains a state change and stops when reduced motion is requested.

## Tokens

The typed catalogue is `src/ui/tokens.ts`; matching CSS custom properties live
in `src/app/globals.css`. Spacing uses a 4px base. Controls are 28/36/42px,
panels use 6px radii, the board uses 3px, and navigation icons are optically
sized at 21px. The expanded/collapsed sidebar widths are 228/72px. Focus is a
2px accent outline. Motion is limited to 90, 140 and 180ms.

Surface levels mean one thing everywhere: `surface-0` is the application
canvas, `surface-1` is primary chrome, `surface-2` is a selected or raised
region, `surface-3` is the strongest selected surface, and `surface-inset` is
an input or recessed work area. Borders follow subtle/default/strong.

## Type and density

Inter is the UI face. JetBrains Mono is reserved for FEN, UCI, engine
diagnostics and technical numeric data. Move notation uses the UI face with
tabular move numbers. Headings inside the workstation are compact; there are
no marketing-sized titles. Group labels may use uppercase only as quiet list
scaffolding, never as body copy.

## Navigation and tools

Primary routes are grouped by intent without accordion clicks. Rows are 40px,
icons are 21px, and selection combines a stronger surface with an amber rail,
so it does not depend on hue alone. Collapsed rows retain `title`, `aria-label`
and the same selected rail.

Workspace tools keep Engine, Explorer and Notes visible, preserve the selected
tool in the strip, and put the long tail under More. A tool keeps one label and
behavior across workspaces. The dock is secondary to the board and may be
resized or collapsed.

## Board and themes

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
