/**
 * Whether this page can reach a companion at all.
 *
 * The companion binds loopback and answers only loopback origins
 * (`companion/src/security.mjs`, `allowedOrigins`): a page served from
 * `https://kingfisherchess.app` is refused by design, because the origin
 * allowlist is one of the two things standing between any web page in the
 * user's browser and their engines and files. That rule is right, and it has
 * a consequence the Settings panel used to hide: on the public site, "pair a
 * companion" is an instruction that cannot succeed. The Mac application
 * carries its own companion and starts it; a checkout served from
 * `localhost` is where the terminal instructions apply; everywhere else the
 * honest answer is "the Mac application".
 *
 * Pure, so the rule is unit-tested; the hook below reads it after hydration.
 */

export type CompanionReach =
  /** The desktop shell: the companion is bundled and started by the shell. */
  | 'desktop'
  /** A loopback origin — a checkout or `next start` on this machine. */
  | 'checkout'
  /** Any other origin: a loopback companion refuses it, by design. */
  | 'remote';

export function companionReachFor(origin: string | null, desktop: boolean): CompanionReach {
  if (desktop) return 'desktop';
  if (!origin) return 'remote';
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return 'remote';
  }
  const loopback =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  return url.protocol === 'http:' && loopback ? 'checkout' : 'remote';
}
