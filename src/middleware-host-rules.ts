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
export const STUDIO_DEFAULT_HOSTS = ['studio.kingfisher-chess.vercel.app', 'studio.localhost'];

/** A path the marketing surface is allowed to answer. */
export const LANDING_PATHS = new Set<string>([
  '/',
  '/favicon.ico',
  '/icon.svg',
  '/apple-icon.png',
  '/manifest.webmanifest',
  '/robots.txt',
  '/sitemap.xml',
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
