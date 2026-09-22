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
/** A counter-clockwise arrow: start again from the position. */
export const Reset = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v5h5" />
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
/**
 * Openings: a pawn, the piece the opening phase is built around.
 *
 * Phase 53 replaced a branching-lines shape with the pawn itself. Phase 55
 * trimmed the foot. Phase 62 redrew it: the previous two-tier foot
 * (rectangles stacked at y=14 and y=16) read as two separate
 * horizontal lines rather than a single plinth, and the small head
 * disconnected from the body. The new shape is a single closed
 * silhouette — round head, narrow neck, body that widens to the base,
 * single wide foot — so it reads as one piece at every size the
 * sidebar uses it.
 */
export const Opening = (p: IconProps) => (
  <Icon {...p}>
    {/* Round head, sitting on the neck. */}
    <circle cx="12" cy="5" r="2.4" />
    {/* Body: narrow under the head, widening toward the foot. */}
    <path d="M9.4 7.6 Q12 9 14.6 7.6 L15.6 15 H8.4 Z" />
    {/* Single wide foot / plinth, slightly wider than the body. */}
    <path d="M6.5 15 H17.5 V17 H6.5 Z" />
    <path d="M7 17 H17 V18.5 H7 Z" />
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
 * Endgame: a king with the cross on top.
 *
 * Phase 53 redrew this from a single crowned dome (which read as a chess piece
 * but not specifically as a king) into a piece with the king's signature
 * cross, the body, and a wider foot. Preparation owns the bullseye, so
 * endgame cannot borrow any circle-and-concentric-circle shape; the cross
 * makes the king unmistakable next to the pawn in Openings.
 */
export const Endgame = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 2v4M9.5 4h5" />
    <path d="M8 7l2 3 2-3 2 3 2-3-1 5H9z" />
    <path d="M9 12h6v4H9z" />
    <path d="M7 16h10v3H7z" />
  </Icon>
);
/**
 * Team: three people around one thing.
 *
 * Players already owns the two-heads shape, so this is not heads. Three
 * points joined to a centre is the oldest picture of a hub there is, and a
 * small square at the centre — the board they hand each other — keeps it
 * from reading as a generic network glyph beside the bullseye and the
 * folder.
 */
export const Team = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9.5" y="9.5" width="5" height="5" rx="0.75" />
    <circle cx="12" cy="4" r="2" />
    <circle cx="5" cy="17" r="2" />
    <circle cx="19" cy="17" r="2" />
    <path d="M12 6v3.5M6.6 15.9l2.9-2M17.4 15.9l-2.9-2" />
  </Icon>
);
/**
 * Similar games: two boards, one behind the other.
 *
 * The section asks "where else has this position been", and the thing it is
 * about is one position appearing twice — so two squares, offset, sharing
 * the same four-square grid. Deliberately not a magnifier (Search has it)
 * and not a bullseye (Target is Preparation): at 21 px the rail reads as a
 * column of silhouettes, and two of anything must not be one of something
 * else.
 */
export const Similar = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="12" height="12" rx="1.5" />
    <path d="M9 9h6M12 6v6" />
    <rect x="9" y="9" width="12" height="12" rx="1.5" />
  </Icon>
);
export const Target = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3.5" />
  </Icon>
);
/**
 * Training: a chess knight, the tactical piece.
 *
 * With the pawn in Openings and the king in Endgame, the knight makes the
 * three sections that carry a piece read as one family: the piece the phase
 * is about, drawn as an outline on the same plinth. Phases 67–69 tried to
 * describe the head feature by feature (a mane, an ear notch, a muzzle and an
 * eye, on a column) and every version at 21 px read as something else — a
 * tent peg, a desk lamp, a snail — because a knight is not its features, it
 * is its silhouette: a muzzle pointing one way, an ear pointing up, and a
 * neck curving down behind them. This is that silhouette and nothing more:
 * one closed path, no interior detail, the muzzle to the left as every
 * icon set draws it, and the king's plinth beneath so the two pieces line up
 * in the rail. The head is drawn large — the piece fills 12 of the 24
 * units — so it keeps the optical weight of the magnifier and the bullseye
 * next to it rather than shrinking into a smudge at 16 px.
 */
export const Recall = (p: IconProps) => (
  <Icon {...p}>
    {/* The plinth, the same one the Endgame king stands on. */}
    <path d="M7 16h10v3H7z" />
    {/*
      Head and neck, one outline, traced clockwise from the chest: up to the
      throat, forward along the jaw to the muzzle, up the nose and forehead
      to the ear, then down the back of the neck to the plinth.
    */}
    <path d="M9.5 16C9.3 14 9.8 12.5 11 11.6L7.2 12.4C5.9 12.4 5.2 11.5 5.6 10.4L7 7.4C8.2 5.6 10 4.6 11.8 4.2L12.9 2.4L14.2 5C16.4 7.2 17.2 11 16.5 16Z" />
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
/** A window with its left column shown: the route's rail is open. */
export const PanelLeft = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M9 5v14" />
  </Icon>
);
/** The same window with the column folded away. */
export const PanelRight = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M9 5v14" strokeDasharray="2 2" />
  </Icon>
);
export const MoreHorizontal = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="18" cy="12" r="1" fill="currentColor" />
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

/**
 * Daily: a single chess piece on a calendar-day square.
 *
 * The calendar page is a stylised 6×5 grid; the piece stands on one of its
 * cells to read as "today's session". Distinct from `Recall` (the training
 * queue, a knight head and neck), from `Review` (a magnifier), and from
 * `Endgame` (a rook on a plinth) so the collapsed rail keeps four
 * separate silhouettes for the four "improve" sections.
 */
export const Daily = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="5.5" width="17" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" stroke="currentColor" strokeWidth="1.2" />
    <line x1="8" y1="3" x2="8" y2="6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <line x1="16" y1="3" x2="16" y2="6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    {/*
      A pawn, head and plinth, smaller than the calendar so the page reads
      first and the piece second.
    */}
    <circle cx="11.5" cy="13" r="1.6" fill="currentColor" />
    <path d="M11.5 14.5 L11.5 16.5 L13.5 16.5 L13.5 14.5 Z" fill="currentColor" />
    <rect x="9.8" y="16.5" width="5.4" height="1.2" fill="currentColor" />
  </Icon>
);

/**
 * `Season` (a sparkline over a baseline) so the collapsed rail keeps four
 * separate silhouettes for the four "improve" sections. The line is short
 * and uneven to read as "real data", not a chevron.
 */
export const Season = (p: IconProps) => (
  <Icon {...p}>
    <line x1="3.5" y1="18" x2="20.5" y2="18" stroke="currentColor" strokeWidth="1.2" />
    <polyline
      points="4,15 7,12 10,14 13,9 16,11 20,6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="20" cy="6" r="1.4" fill="currentColor" />
  </Icon>
);
