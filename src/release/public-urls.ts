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

/*
 * The descriptor is imported as JSON with an import attribute so that the
 * same file loads under Node's type stripping (the desktop build and the
 * verification scripts read it) and under the Next bundler. `macos-download.ts`
 * is the typed reader for application code.
 */
import macosDownload from './macos-download.json' with { type: 'json' };

const fromEnv = (name: string, fallback: string): string => {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
};

const trimTrailingSlash = (s: string): string => s.replace(/\/+$/, '');

export const publicUrl = {
  /*
   * The canonical public origin. Since 2026-09-13 one host serves
   * both surfaces: the landing at `/`, the application at its own
   * routes. It is the only origin the application prints, the
   * documentation links to, and the social metadata names. The
   * earlier landing host (`kingfisher-chess.vercel.app`) redirects
   * here; the earlier application host was retired; the legacy
   * `mardakurt.github.io/kingfisher-data/` origin still serves a
   * tiny redirect-only backup and is not a canonical surface.
   */
  landing: trimTrailingSlash(
    fromEnv('KINGFISHER_PUBLIC_LANDING_URL', 'https://kingfisherchess.app'),
  ),
  /*
   * The application, as a returning player bookmarks it: the
   * analysis board on the public origin. **Do not change the origin
   * lightly** — IndexedDB is origin-scoped, and a new hostname
   * strands the local data of everyone on the old one. The move to
   * this origin was made on 2026-09-13, before the first public
   * announcement, and the previous host was retired the same day.
   */
  studio: trimTrailingSlash(
    fromEnv(
      'KINGFISHER_PUBLIC_STUDIO_URL',
      `${fromEnv('KINGFISHER_PUBLIC_WEB_URL', 'https://kingfisherchess.app')}/analysis`,
    ),
  ),
  /*
   * The origin the application is served from — the same as the
   * landing since the two surfaces share a host.
   */
  web: trimTrailingSlash(fromEnv('KINGFISHER_PUBLIC_WEB_URL', 'https://kingfisherchess.app')),
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
  /*
   * The macOS DMG the public is offered, from `macos-download.json` — the
   * one file that names it (see `macos-download.ts`). Never `/releases/latest`:
   * that URL is GitHub's idea of the latest *release*, which is the stable
   * 1.0.0 and may be older than the preview the landing offers.
   */
  get macosDmg(): string {
    return fromEnv('KINGFISHER_PUBLIC_DMG_URL', macosDownload.url);
  },
} as const;

export type PublicUrl = typeof publicUrl;
