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
