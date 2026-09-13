/**
 * Browser-side mirror of the middleware's studio-host decision.
 *
 * The middleware lives in the Edge runtime and cannot be imported
 * from a browser bundle, but the rule it enforces — "the studio
 * host is a particular set of hostnames, everything else is the
 * landing page" — has to be enforced in the browser too, so that
 * the PWA does not try to install on the marketing origin.
 *
 * Keep this list in lockstep with `src/middleware-host-rules.ts`.
 * A divergence here would mean a player can install the marketing
 * page as a PWA, which the directive explicitly forbids.
 *
 * Pure function: no environment access, no `window`, no side
 * effects. Test the same way the middleware test does.
 */

const STUDIO_HOSTS = new Set<string>([
  // The public host serves the application at its own routes, so the
  // service worker and the install prompt belong there too; the
  // landing at `/` never mounts either.
  'kingfisherchess.app',
  'www.kingfisherchess.app',
  // The origin the application lived on until 2026-09-13.
  'kingfisher-roan.vercel.app',
  'studio.kingfisher-chess.vercel.app',
  'studio.localhost',
]);

/**
 * Return the bare hostname (no port) when the visitor is on a
 * studio host, or `null` otherwise. Mirrors
 * `middleware-host-rules.studioHostFor`.
 */
export function studioHostFor(hostHeader: string | null | undefined): string | null {
  if (!hostHeader) return null;
  const bare = hostHeader.split(':')[0]?.toLowerCase();
  return bare && STUDIO_HOSTS.has(bare) ? bare : null;
}

/**
 * Is the current document on a studio host? Convenience wrapper
 * around `studioHostFor(window.location.host)`. Returns `false`
 * during SSR (no `window`).
 */
export function isStudioDocument(): boolean {
  if (typeof window === 'undefined') return false;
  return studioHostFor(window.location.host) !== null;
}
