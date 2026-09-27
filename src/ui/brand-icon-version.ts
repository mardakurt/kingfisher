/**
 * A version for the icon URLs that carry no content hash of their own.
 *
 * The favicon set under `src/app/` is content-hashed by Next
 * (`/favicon.ico?favicon.<hash>.ico`), but the web app manifest names
 * `/icon-192.png`, `/icon-512.png` and `/icon-maskable-512.png` by bare
 * path. When the mark was redrawn (`f31289e`, Phase 85) those URLs stayed
 * the same, so anything that keys an icon by its URL — an installed web
 * app, a browser's icon store, a cache — had no reason to fetch the new
 * picture (Phase 87, reported by the owner as "the favicon is the old icon").
 *
 * The version is the first twelve hex digits of the SHA-256 of the master,
 * `brand/kingfisher-mark.svg`, from which every raster is drawn.
 * `brand-icon-version.test.ts` recomputes it and fails when the mark
 * changes and this does not.
 */
export const BRAND_ICON_VERSION = '86c8f21d4abb';

/** A bare public icon path with the mark's version appended. */
export const versionedIcon = (path: string): string => `${path}?v=${BRAND_ICON_VERSION}`;
