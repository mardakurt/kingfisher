/**
 * Host-aware web app manifest.
 *
 * Kingfisher's public surface is one origin, `kingfisherchess.app`,
 * serving the landing at `/` and the application at its own routes
 * (`isApplicationHost`). The earlier layout — a landing-only host and a
 * dedicated studio host — is still recognised:
 *
 *   - a *landing-only* host is any host that is neither public nor a
 *     studio host;
 *   - a *studio* host is one in `STUDIO_DEFAULT_HOSTS` (or the one
 *     `KINGFISHER_STUDIO_HOST` names).
 *
 * The PWA install experience belongs to the application. A landing-only
 * host must not advertise itself as a standalone application —
 * installing it would trap the visitor in a window that has no chess
 * engine and no data.
 *
 * The same Next.js project serves both origins. The host header
 * determines what the manifest returns. Studio requests get the full
 * install manifest (`display: standalone`, `start_url: /analysis`,
 * full scope); landing requests get a marketing-only manifest that
 * does not claim installable application behaviour.
 *
 * The marketing manifest is still a valid web app manifest — Safari
 * on iOS uses it to render the "Add to Home Screen" entry — but it
 * leaves `display` as the default `browser` and does not set
 * `start_url`, so a tap from a saved shortcut goes to the actual
 * landing page instead of trying to install the marketing origin as a
 * standalone window.
 *
 * See `src/proxy-host-rules.ts` for the host detection that this
 * route relies on. The decision is duplicated here (rather than
 * imported) so that a route handler does not depend on the proxy's
 * module, which Next may deploy separately from the application.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isApplicationHost } from '@/proxy-host-rules';
import { PALETTE } from '@/ui/palette';

const ICON_192 = '/icon-192.png';
const ICON_512 = '/icon-512.png';
const ICON_MASKABLE = '/icon-maskable-512.png';

const STUDIO_MANIFEST = {
  name: 'Kingfisher Studio',
  short_name: 'Kingfisher',
  description:
    'Engine analysis, opening databases, repertoire and training in one local-first chess workspace.',
  start_url: '/analysis',
  scope: '/',
  display: 'standalone',
  orientation: 'any',
  background_color: PALETTE.light.canvas,
  theme_color: PALETTE.light.canvas,
  categories: ['productivity', 'education', 'games'],
  icons: [
    { src: ICON_192, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: ICON_512, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: ICON_MASKABLE, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  // Share target is intentionally not declared. Kingfisher ingests PGN
  // through an explicit UI, not by claiming to be a share sink, and
  // a `share_target` invites the browser to promote install as if the
  // surface were a content receiver.
};

const MARKETING_MANIFEST = {
  name: 'Kingfisher — chess research workspace',
  short_name: 'Kingfisher',
  description:
    'Engine analysis, opening databases, repertoire and training. Use in the browser, install where supported, or download the macOS preview.',
  start_url: '/',
  scope: '/',
  display: 'browser',
  orientation: 'any',
  // The landing is drawn in the Studio's own palette since Phase 84; the
  // navy it used to carry here was a second product's colour.
  background_color: PALETTE.light.canvas,
  theme_color: PALETTE.light.canvas,
  icons: [
    { src: ICON_192, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: ICON_512, sizes: '512x512', type: 'image/png', purpose: 'any' },
  ],
};

export function GET(request: NextRequest): NextResponse {
  const host = request.headers.get('host');
  const isStudio = isApplicationHost(host);
  const manifest = isStudio ? STUDIO_MANIFEST : MARKETING_MANIFEST;
  const body = JSON.stringify(manifest, null, 2);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      // The marketing manifest is safe to cache. The studio manifest
      // is also safe — its only inputs are the studio host list and
      // the icon paths, both of which are version-controlled and
      // produce a new URL when they change. Five minutes of browser
      // cache on the studio is generous.
      'cache-control': isStudio ? 'public, max-age=300, must-revalidate' : 'public, max-age=300',
      // The studio manifest is not a search-engine target. The
      // marketing manifest must remain indexable; it is served with
      // the same content-type either way, so the proxy-applied
      // `X-Robots-Tag: noindex` on studio responses is the single
      // source of truth for indexing.
      'x-robots-tag': isStudio ? 'noindex, nofollow' : 'all',
      // A modest defence against third-party embedding: the manifest
      // has no UI to render in an iframe, but a hostile site asking
      // for it is not a request we should cooperate with.
      'x-content-type-options': 'nosniff',
    },
  });
}
