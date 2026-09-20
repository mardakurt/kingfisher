/**
 * Browser-side mirror of the proxy's studio-host decision.
 *
 * The proxy (`src/proxy.ts`) runs on the server and is not imported
 * into a browser bundle, but the rule it enforces — "the studio
 * host is a particular set of hostnames, everything else is the
 * landing page" — has to be enforced in the browser too, so that
 * the PWA does not try to install on the marketing origin.
 *
 * Keep this list in lockstep with `src/proxy-host-rules.ts`.
 * A divergence here would mean a player can install the marketing
 * page as a PWA, which the directive explicitly forbids.
 *
 * Pure function: no environment access, no `window`, no side
 * effects. Test the same way the proxy test does.
 */

const STUDIO_HOSTS = new Set<string>([
  // The public host serves the application at its own routes, so the
  // service worker and the install prompt belong there too; the
  // landing at `/` never mounts either.
  'kingfisherchess.app',
  'www.kingfisherchess.app',
  'studio.kingfisher-chess.vercel.app',
  'studio.localhost',
]);

/**
 * Return the bare hostname (no port) when the visitor is on a
 * studio host, or `null` otherwise. Mirrors
 * `proxy-host-rules.studioHostFor`.
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
