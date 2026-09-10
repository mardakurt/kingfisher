/**
 * Host-routing rules extracted from the middleware for testability.
 *
 * The middleware itself cannot be unit-tested in isolation because it
 * runs inside Next's Edge runtime and reads the host header from the
 * incoming `NextRequest`. The two pure functions here carry the
 * actual decision logic, so a unit tests pins the rule and the
 * middleware is a thin shim around them.
 */

export const STUDIO_HOST_ENV = 'KINGFISHER_STUDIO_HOST';
export const STUDIO_DEFAULT_HOSTS = [
  'kingfisher-roan.vercel.app',
  'studio.kingfisher-chess.vercel.app',
  'studio.localhost',
];

/** A path the marketing surface is allowed to answer. */
export const LANDING_PATHS = new Set<string>([
  '/',
  '/favicon.ico',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-icon.png',
  '/manifest.webmanifest',
  '/robots.txt',
  '/sitemap.xml',
  // Public trust surfaces added in Phase 33. The canonical
  // docs and install guide; the marketing surface answers
  // them on the landing host. Keep this list in lockstep
  // with `src/app/{install,privacy,security,data-licences,terms}/page.tsx`.
  '/install',
  '/privacy',
  '/security',
  '/data-licences',
  '/terms',
]);

/**
 * Decide whether a request is for the studio host. Returns the bare
 * hostname (without port) when it matches one of the configured
 * studio hosts, or `null` otherwise. A `null` value is the default
 * single-origin behaviour: the project is the landing page everywhere.
 */
export function studioHostFor(hostHeader: string | null): string | null {
  const configured = process.env[STUDIO_HOST_ENV];
  const candidates = new Set<string>(
    configured ? [configured, ...STUDIO_DEFAULT_HOSTS] : STUDIO_DEFAULT_HOSTS,
  );
  if (!hostHeader) return null;
  const bare = hostHeader.split(':')[0]?.toLowerCase();
  return bare && candidates.has(bare) ? bare : null;
}

/** A path the marketing surface is allowed to answer. */
export function isLandingAsset(pathname: string): boolean {
  if (LANDING_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/landing/')) return true;
  if (pathname.startsWith('/reference/')) return true;
  if (pathname.startsWith('/_next/')) return true;
  return false;
}

/**
 * What the middleware should do for a given host + path combination.
 * The middleware translates this into NextResponse.rewrite /
 * .redirect / .next calls.
 */
export type RoutingAction =
  | { readonly kind: 'next' }
  | { readonly kind: 'redirect'; readonly to: string }
  | { readonly kind: 'rewrite'; readonly to: string };

export function routingFor(host: string | null, pathname: string): RoutingAction {
  // Local development and the desktop shell serve both the studio and its assets.
  // Match the complete authority so similarly named remote hosts cannot qualify.
  if (host && /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)) {
    return { kind: 'next' };
  }
  const studio = studioHostFor(host);
  if (!studio) {
    if (pathname !== '/' && !isLandingAsset(pathname)) {
      return { kind: 'redirect', to: '/' };
    }
    return { kind: 'next' };
  }
  if (pathname === '/') {
    return { kind: 'rewrite', to: '/analysis' };
  }
  return { kind: 'next' };
}
