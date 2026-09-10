/**
 * The single canonical list of public URLs the Kingfisher application
 * exposes — landing, web app, repository, latest release, data mirror,
 * support.
 *
 * The point of this file is to avoid the thirty scattered literal
 * `https://github.com/...` strings that drift out of sync the first time
 * a release is cut. Every public-facing surface reads from here, and
 * every URL the application puts in the user's hands comes through
 * `publicUrl()` so that a single change re-points them all.
 *
 * Override values via environment variables in deployments:
 *
 *   KINGFISHER_PUBLIC_LANDING_URL
 *   KINGFISHER_PUBLIC_WEB_URL
 *   KINGFISHER_PUBLIC_REPOSITORY_URL
 *   KINGFISHER_PUBLIC_RELEASE_URL
 *   KINGFISHER_PUBLIC_DMG_URL
 *   KINGFISHER_PUBLIC_ISSUES_URL
 *   KINGFISHER_PUBLIC_DISCUSSIONS_URL
 *   KINGFISHER_PUBLIC_DOCS_URL
 *   KINGFISHER_PUBLIC_DATA_ROOT_URL
 *
 * Defaults match the Phase 24 public architecture: a GitHub Pages
 * landing page and data mirror, a Vercel-hosted web app, and the
 * GitHub repository for source, releases, issues, and discussions.
 *
 * No URL in this file is a placeholder. The web-app URL defaults to
 * the production deployment created by `vercel deploy`; if it is
 * unset, the application's *Help → Check for updates* and *About*
 * surfaces fall back to the landing page and read "the web app
 * deploys to Vercel" rather than printing a half-truth URL.
 */

const fromEnv = (name: string, fallback: string): string => {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
};

const trimTrailingSlash = (s: string): string => s.replace(/\/+$/, '');

export const publicUrl = {
  /*
   * The canonical public landing. The Vercel production host is
   * the only origin the application prints, the documentation
   * links to, and the social metadata names. The legacy
   * `mardakurt.github.io/kingfisher-data/` origin still serves
   * a tiny redirect-only backup and is not a canonical surface.
   */
  landing: trimTrailingSlash(
    fromEnv('KINGFISHER_PUBLIC_LANDING_URL', 'https://kingfisher-chess.vercel.app'),
  ),
  /*
   * The studio is the *application*, served on its own host so a
   * returning player can bookmark and open it directly without
   * passing through the marketing page.
   *
   * Default: a separate Vercel host. The host header is what
   * decides which surface the visitor sees, so a deployment that
   * serves both can still point at a single canonical studio
   * URL here. **Do not change this lightly** — IndexedDB is
   * origin-scoped, and changing the studio hostname would strand
   * the existing local data of every existing user. See
   * `docs/reports/phase-33-handover.md` for the persistence /
   * migration analysis.
   */
  studio: trimTrailingSlash(
    fromEnv(
      'KINGFISHER_PUBLIC_STUDIO_URL',
      fromEnv('KINGFISHER_PUBLIC_WEB_URL', 'https://kingfisher-roan.vercel.app'),
    ),
  ),
  /*
   * The full app at the marketing origin. Useful for the launch
   * button when the middleware is not configured (single-host
   * deployment) or when the visitor wants the canonical
   * `https://kingfisher-chess.vercel.app/analysis` URL.
   */
  web: trimTrailingSlash(
    fromEnv('KINGFISHER_PUBLIC_WEB_URL', 'https://kingfisher-chess.vercel.app'),
  ),
  repository: trimTrailingSlash(
    fromEnv('KINGFISHER_PUBLIC_REPOSITORY_URL', 'https://github.com/mardakurt/kingfisher'),
  ),
  release: trimTrailingSlash(
    fromEnv(
      'KINGFISHER_PUBLIC_RELEASE_URL',
      'https://github.com/mardakurt/kingfisher/releases/latest',
    ),
  ),
  issues: trimTrailingSlash(
    fromEnv('KINGFISHER_PUBLIC_ISSUES_URL', 'https://github.com/mardakurt/kingfisher/issues'),
  ),
  discussions: trimTrailingSlash(
    fromEnv(
      'KINGFISHER_PUBLIC_DISCUSSIONS_URL',
      'https://github.com/mardakurt/kingfisher/discussions',
    ),
  ),
  docs: trimTrailingSlash(
    fromEnv(
      'KINGFISHER_PUBLIC_DOCS_URL',
      'https://github.com/mardakurt/kingfisher/tree/master/docs',
    ),
  ),
  /*
   * The data mirror is still `mardakurt.github.io/kingfisher-data`
   * in production terms, but the *public* path through Kingfisher
   * does not yet ship a public repository there. Packs are built
   * and verified (see `docs/data/data-inventory.md`); the
   * installer answers 404 honestly. The default below is the
   * reserved path; the install catalogue exposes it as a typed
   * `installFromUrl` flow.
   */
  data: trimTrailingSlash(
    fromEnv('KINGFISHER_PUBLIC_DATA_ROOT_URL', 'https://mardakurt.github.io/kingfisher-data'),
  ),
  // Per-pack manifest URLs are derived from `data` so they cannot
  // drift from the data root.
  get packManifests(): { elite: string; recent: string; online: string } {
    return {
      elite: `${this.data}/reference-elite-v2/manifest.json`,
      recent: `${this.data}/reference-recent-v1/manifest.json`,
      online: `${this.data}/reference-online-v1/manifest.json`,
    };
  },
  // The macOS DMG is the asset on the *latest* release page.
  // We do not hardcode a version here — that is the point of a
  // `/releases/latest` URL.
  get macosDmg(): string {
    return `${this.release}/download/Kingfisher-1.0.0-arm64.dmg`;
  },
} as const;

export type PublicUrl = typeof publicUrl;
