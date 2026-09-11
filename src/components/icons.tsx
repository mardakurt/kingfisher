/**
 * Icons.
 *
 * Hand-written rather than pulled from an icon package: the set is small, the
 * shapes are shared with the board, and a dependency for twenty paths is not
 * worth the bundle or the version churn. All icons are 16 × 16 on a 24 grid.
 */

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const Icon = ({ children, ...props }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    {...props}
  >
    {children}
  </svg>
);

export const ChevronLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="m15 6-6 6 6 6" />
  </Icon>
);
export const ChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);
export const ChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);
export const ChevronUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 15 6-6 6 6" />
  </Icon>
);
export const SkipStart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 5v14M16 12 8 5v14z" />
  </Icon>
);
export const SkipEnd = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 5v14M8 12l8-7v14z" />
  </Icon>
);
export const Play = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4.5 19 12 7 19.5z" />
  </Icon>
);
export const Stop = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </Icon>
);
export const Flip = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8h13l-3-3M20 16H7l3 3" />
  </Icon>
);
export const Plus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const Import = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Icon>
);
/**
 * Download, which is not Import.
 *
 * Both are an arrow going down, so they are told apart by what they arrive
 * into: `Import` lands in a tray (a file entering this collection), `Download`
 * comes out of a cloud (data arriving from somewhere else). They appear on the
 * same screen — install a reference pack, import a PGN — so the distinction
 * has to hold at 16px.
 */
export const Download = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 16.5a4 4 0 0 1 .4-8 5.5 5.5 0 0 1 10.5 1.6 3.5 3.5 0 0 1-.4 6.9" />
    <path d="M12 10v9m0 0 3.5-3.5M12 19l-3.5-3.5" />
  </Icon>
);
export const Export = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 15V4m0 0 4 4m-4-4L8 8M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Icon>
);
/**
 * Settings is sliders, not a cog.
 *
 * A cog is a ring with radial teeth, which at 20px is the same silhouette as
 * `Sun` — a ring with radial rays. The two controls sit next to each other in
 * the toolbar and again in the sidebar, so they must not share a shape at all.
 * Horizontal tracks with handles carry no rotational symmetry and cannot be
 * confused with an appearance control at any size.
 */
export const Settings = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h9M17 17h3" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="15" cy="17" r="2" />
  </Icon>
);
export const Search = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Icon>
);
export const Trash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />
  </Icon>
);
export const ArrowUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 20V5m0 0-6 6m6-6 6 6" />
  </Icon>
);
export const Scissors = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="6" cy="6" r="2.5" />
    <path d="M20 4 8.5 15.5M20 20 8.5 8.5" />
  </Icon>
);
export const Board = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
    <path d="M3.5 9h17M3.5 15h17M9 3.5v17M15 3.5v17" />
  </Icon>
);
/** Engine analysis: ranked principal-variation traces, not a generic CPU chip. */
export const EngineAnalysis = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h3l2.5 3L13 5l3 4h4" />
    <path d="M4 13h4l2 2.5L14 11l2.5 3H20" />
    <path d="M4 20h16" />
  </Icon>
);
/** A playable board position: four board cells opening into a forward line. */
export const PlayPosition = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4h11v11H4zM4 9.5h11M9.5 4v11" />
    <path d="M13.5 19.5H20m0 0-2.5-2.5m2.5 2.5L17.5 22" />
  </Icon>
);
export const Library = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4h4v16H4zM10 4h4v16h-4zM16.5 5l3.5 1-3 15-3.5-1z" />
  </Icon>
);
export const Database = (p: IconProps) => (
  <Icon {...p}>
    <ellipse cx="12" cy="6" rx="7.5" ry="3" />
    <path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
  </Icon>
);
export const Opening = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v5M12 8 6 13v8M12 8l6 5v8" />
    <circle cx="12" cy="3.5" r="1.5" />
  </Icon>
);
export const Repertoire = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4h11l3 3v13H5z" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </Icon>
);
export const Notebook = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3h13v18H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M9 3v18M12 8h4M12 12h4" />
  </Icon>
);
/**
 * Players: two people.
 *
 * Not a single silhouette, because the section is a *library* of players — a
 * list to search — rather than "your account", which is the thing one person
 * shape means everywhere else in software.
 */
export const Players = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.25" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.5a3.25 3.25 0 0 1 0 6.4" />
    <path d="M17.5 14.2a5.5 5.5 0 0 1 3 4.8" />
  </Icon>
);
/**
 * Opening files: a folder, holding one subject's papers.
 *
 * Previously this shared the branching-lines icon with Openings, which made
 * two adjacent sections indistinguishable in the collapsed rail. A folder is
 * the right metaphor anyway: an opening file is a dossier, not a tree.
 */
export const Dossier = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 7.5a1.5 1.5 0 0 1 1.5-1.5h3.6a1.5 1.5 0 0 1 1.2.6l1 1.4H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5z" />
    <path d="M8 13h8" />
  </Icon>
);
/**
 * Endgame: a king, alone.
 *
 * Preparation owns the bullseye, and Endgame used to borrow it — so the two
 * were the same shape in the same list. A king with nothing around it is what
 * an endgame *is*, and no other icon in the set is a crowned dome.
 */
export const Endgame = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 2.5v4M10 4.5h4" />
    <path d="M12 6.5c-3 0-5 2.2-5 4.8 0 2.1 1.4 3.6 2 5.2h6c.6-1.6 2-3.1 2-5.2 0-2.6-2-4.8-5-4.8z" />
    <path d="M8 19h8M8.5 21.5h7" />
  </Icon>
);
export const Target = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3.5" />
  </Icon>
);
/**
 * Training: a card coming back around.
 *
 * Training used to borrow `Target`, which left Preparation and Training with
 * the same bullseye in the same sidebar. Recall on a schedule is a loop, and a
 * loop is nothing like a target at any size.
 */
export const Recall = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4v4.5h-4.5" />
    <path d="M12 8.5V12l2.5 1.6" />
  </Icon>
);
/**
 * Review: a magnifier over the board, pointed at your own thinking.
 *
 * Deliberately not a bullseye — Preparation already owns that, and the two
 * sections would be indistinguishable in a collapsed rail. Deliberately not a
 * chart either: Review is about looking closely at one position, not about
 * summarising many.
 */
export const Review = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15 15l5 5" />
    <path d="M8 10.5h5M10.5 8v5" />
  </Icon>
);
export const Sun = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);
export const Moon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </Icon>
);
export const Clock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </Icon>
);
export const Info = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </Icon>
);
export const Close = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
export const Menu = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);
export const Pin = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 3h6l-1 6 4 3v2H6v-2l4-3z" />
    <path d="M12 14v7" />
  </Icon>
);
export const Pencil = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4l10-10a2.5 2.5 0 0 0-4-4L4 16z" />
  </Icon>
);
export const Copy = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" />
  </Icon>
);
export const ArrowDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icon>
);
export const ArrowLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);
export const Check = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Icon>
);
export const Warning = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4 2.5 20h19z" />
    <path d="M12 10v4M12 17.2v.1" />
  </Icon>
);
export const Save = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4h11l4 4v12H5z" />
    <path d="M9 4v5h6V4M8 20v-6h8v6" />
  </Icon>
);
export const Filter = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 5h18l-7 8v6l-4 2v-8z" />
  </Icon>
);
export const Feedback = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
  </Icon>
);
