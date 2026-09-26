'use client';

import { useId } from 'react';

/**
 * The Kingfisher mark, for use inside the application.
 *
 * The app icon itself — `brand/kingfisher-mark.svg`: the bird on the Studio
 * board, four squares in the board's near-white and periwinkle filling the
 * rounded tile to its edge (no navy frame since Phase 85). Until Phase 84 the sidebar drew the bird alone in the accent
 * while the icon, the landing and the disk image each drew something else;
 * the Studio, the landing and the Mac application now show one mark.
 *
 * The colours are the brand tokens (`--brand-*`), the same in both themes,
 * because a mark is not a surface. The tile is drawn 24 px inside a 36 px
 * box (a 16-unit margin on the 64-unit master): the box is what the window
 * chrome harness measures against the macOS buttons, and the tile's edge
 * sits where the bird's visible edge sat before.
 * `src/ui/brand-assets.test.ts` holds the geometry to the master.
 */
export function BrandMark({ className }: { readonly className?: string }) {
  const clip = `kf-brand-tile-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="-16 -16 96 96" className={className} aria-hidden focusable="false">
      <defs>
        <clipPath id={clip}>
          <rect width="64" height="64" rx="14" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect x="0" y="0" width="32" height="32" fill="var(--brand-square-light)" />
        <rect x="32" y="0" width="32" height="32" fill="var(--brand-square-dark)" />
        <rect x="0" y="32" width="32" height="32" fill="var(--brand-square-dark)" />
        <rect x="32" y="32" width="32" height="32" fill="var(--brand-square-light)" />
      </g>
      <g transform="translate(1.8 4.6) scale(0.94)">
        <path
          fill="var(--brand-frame)"
          d="M58 30L34.2 25.6L31.4 19.2L26.4 16.4L22.2 10.8L19.6 16.2L14.8 19.4
             C11.4 24.8 10.8 29.8 12.6 34.4C14.9 40.1 20 43.2 25.9 42.8
             C29.6 42.5 32 39.6 33.2 34.4Z"
        />
        <circle cx="26.2" cy="25.6" r="2.25" fill="var(--brand-square-light)" />
      </g>
    </svg>
  );
}
