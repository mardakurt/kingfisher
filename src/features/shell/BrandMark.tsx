'use client';

/**
 * The Kingfisher mark, for use inside the application.
 *
 * The same geometry as the app icon in `brand/kingfisher-mark.svg`, minus the
 * board tile and painted in one colour: an icon competes with a launcher full
 * of other icons and needs its own background, while a mark in a sidebar sits
 * on the application's own surface and should not bring a second one.
 *
 * `currentColor` rather than a fixed value, so the mark follows the accent in
 * both themes and dims with its container when it is not the point of the row.
 */
export function BrandMark({ className }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <g transform="translate(1.8 4.6) scale(0.94)" fill="currentColor">
        <path
          d="M58 30L34.2 25.6L31.4 19.2L26.4 16.4L22.2 10.8L19.6 16.2L14.8 19.4
             C11.4 24.8 10.8 29.8 12.6 34.4C14.9 40.1 20 43.2 25.9 42.8
             C29.6 42.5 32 39.6 33.2 34.4Z"
        />
      </g>
      {/* The eye is a hole, so the mark reads on any surface it is placed on. */}
      <circle cx="26.4" cy="28.7" r="2.1" fill="var(--surface-1)" />
    </svg>
  );
}
