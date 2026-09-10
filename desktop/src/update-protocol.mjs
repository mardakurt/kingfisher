/**
 * The single source of truth for "is this a Kingfisher desktop update, and
 * what does it say?".
 *
 * Both the renderer-side helper that paints the Settings panel and the
 * main-process service that actually performs the network call pass their
 * payloads through this file. A `v1.1.0` is a `v1.1.0` from the menu
 * choice, the Settings click and the command palette alike, because they
 * are the same parser and the same semver comparator.
 *
 * The contract the desktop update flow places on the public release
 * manifest is described in `docs/release/release-manifest.md`. The manifest
 * is the only thing the desktop shell trusts about a release; the GitHub
 * release page exists for humans and is *not* a primary source.
 */

import { createHash } from 'node:crypto';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const SHA256 = /^[0-9a-f]{64}$/i;
const DMG_NAME = /^Kingfisher-(\d+)\.(\d+)\.(\d+)-(arm64|x64)\.dmg$/;

/**
 * Strict allow-list of hosts the updater will ever talk to.
 *
 * GitHub legitimately redirects release-asset downloads between
 * `github.com` and `release-assets.githubusercontent.com`. Anything else is
 * rejected, including the raw `objects.githubusercontent.com` host. The
 * list is deliberately small: a host is added by code change, not by
 * configuration, because the harm an extra host can do far exceeds the
 * benefit of a single convenience redirect.
 */
export const ALLOWED_RELEASE_HOSTS = new Set([
  'github.com',
  'api.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);

/**
 * Hard ceiling on the size of a Kingfisher update, in bytes.
 *
 * Phase 34's Kingfisher 1.0.0 arm64 DMG measured ~155 MB. The ceiling
 * here is four times that, which covers the natural growth of a 1.1.0
 * build (a larger bundled engine, a longer reference section, a more
 * elaborate DMG) without ever allowing a manifest to claim 500 GB.
 *
 * Picked to be loose enough that legitimate growth never has to be
 * negotiated, tight enough that a hostile manifest cannot ask the user
 * to download 500 GB of nothing.
 */
export const MAX_UPDATE_BYTES = 700 * 1024 * 1024; // 700 MB

/** Maximum number of HTTP redirects to follow on the manifest fetch. */
export const MAX_REDIRECTS = 3;

/** Maximum number of HTTP redirects to follow on the asset download. */
export const MAX_DOWNLOAD_REDIRECTS = 5;

/**
 * The full set of host-name patterns the manifest URL itself may resolve to.
 *
 * The manifest lives at the GitHub Releases API endpoint and is reached via
 * `api.github.com`, not the human-facing `github.com`. The download host is
 * the asset host. Both are in `ALLOWED_RELEASE_HOSTS`; this is a separate
 * list because a future private mirror would have its own URL.
 */
export function isAllowedReleaseHost(hostname) {
  if (typeof hostname !== 'string') return false;
  return ALLOWED_RELEASE_HOSTS.has(hostname.toLowerCase());
}

/**
 * A parsed, validated update manifest. The main process is the only thing
 * that talks to GitHub, but the data shape it hands back to the renderer is
 * this — never the raw response body.
 */
/**
 * The verdict set the update service can hand to the renderer.
 *
 * Phase 35 introduced the original eight. Phase 36 splits the
 * download into two events (`downloading` and `downloaded`) and
 * adds three install-side states: `waiting-for-save`, `installing`,
 * and `restarting`. The renderer's switch in `update.js` is keyed
 * off these strings; adding a state is a renderer change in
 * lockstep with a service change. The list below is the source of
 * truth.
 */
export const STATUS = Object.freeze({
  IDLE: 'idle',
  CHECKING: 'checking',
  UP_TO_DATE: 'up-to-date',
  AVAILABLE: 'available',
  DOWNLOADING: 'downloading',
  DOWNLOADED: 'downloaded',
  VERIFYING: 'verifying',
  READY: 'ready',
  WAITING_FOR_SAVE: 'waiting-for-save',
  INSTALLING: 'installing',
  RESTARTING: 'restarting',
  UNABLE: 'unable-to-check',
  CANCELED: 'canceled',
  FAILED: 'failed',
});

/**
 * @typedef {Object} UpdateAsset
 * @property {'arm64' | 'x64'} arch
 * @property {string} url
 * @property {string} sha256
 * @property {number} bytes
 * @property {string} filename
 */

/**
 * @typedef {Object} ParsedManifest
 * @property {string} version       semver triple, e.g. "1.1.0"
 * @property {string} tag           e.g. "v1.1.0"
 * @property {string} htmlUrl       full https://github.com/... release page
 * @property {UpdateAsset[]} assets
 */

/**
 * Parse and validate a Kingfisher release manifest body.
 *
 * Anything that fails the guards returns `{ ok: false, reason }` rather than
 * throwing — the calling service turns a failed parse into an "unable to
 * check" verdict and never crashes the menu click.
 *
 * @param {unknown} body
 * @returns {{ ok: true, manifest: ParsedManifest } | { ok: false, reason: string }}
 */
export function parseReleaseManifest(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, reason: 'Release manifest is not an object.' };
  }
  const root = /** @type {Record<string, unknown>} */ (body);
  const kingfisher = root['kingfisher'];
  if (!kingfisher || typeof kingfisher !== 'object') {
    return { ok: false, reason: 'Release manifest is missing the "kingfisher" section.' };
  }
  const version = /** @type {Record<string, unknown>} */ (kingfisher)['version'];
  if (typeof version !== 'string' || !parseSemver(version)) {
    return {
      ok: false,
      reason: `Release manifest version "${String(version)}" is not a valid semver triple.`,
    };
  }
  const tag = /** @type {Record<string, unknown>} */ (kingfisher)['tag'];
  if (typeof tag !== 'string' || !tag.startsWith(`v${version}`)) {
    return {
      ok: false,
      reason: `Release manifest tag "${String(tag)}" does not match version ${version}.`,
    };
  }
  const htmlUrl = root['htmlUrl'];
  if (typeof htmlUrl !== 'string' || !isGithubReleaseUrl(htmlUrl)) {
    return {
      ok: false,
      reason: 'Release manifest is missing a verified GitHub release-page URL.',
    };
  }
  const desktop = root['desktop'];
  if (!Array.isArray(desktop) || desktop.length === 0) {
    return { ok: false, reason: 'Release manifest has no "desktop" assets.' };
  }
  const assets = [];
  for (const entry of desktop) {
    const parsed = parseAssetEntry(entry, version);
    if (parsed) assets.push(parsed);
  }
  if (assets.length === 0) {
    return {
      ok: false,
      reason: 'Release manifest does not list any signed desktop assets.',
    };
  }
  return { ok: true, manifest: { version, tag, htmlUrl, assets } };
}

function parseAssetEntry(entry, manifestVersion) {
  if (!entry || typeof entry !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (entry);
  const name = record['name'];
  const url = record['url'];
  const sha256 = record['sha256'];
  const bytes = record['bytes'];
  if (typeof name !== 'string') return null;
  const match = DMG_NAME.exec(name);
  if (!match) return null;
  // Asset name MUST match the version declared by the manifest.
  if (match[1] !== manifestVersion.split('.')[0]) return null;
  if (match[2] !== manifestVersion.split('.')[1]) return null;
  if (match[3] !== manifestVersion.split('.')[2]) return null;
  if (typeof sha256 !== 'string' || !SHA256.test(sha256)) return null;
  if (typeof bytes !== 'number' || bytes <= 0) return null;
  if (bytes > MAX_UPDATE_BYTES) return null;
  if (typeof url !== 'string') return null;
  if (!isHttpsUrlWithAllowedHost(url)) return null;
  const arch = match[4] === 'arm64' ? 'arm64' : 'x64';
  return { arch, url, sha256, bytes, filename: name };
}

function isGithubReleaseUrl(value) {
  if (!value.startsWith('https://github.com/')) return false;
  if (!value.includes('/releases/')) return false;
  return true;
}

function isHttpsUrlWithAllowedHost(value) {
  if (typeof value !== 'string' || !value.startsWith('https://')) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.port && parsed.port !== '443') return false;
  return isAllowedReleaseHost(parsed.hostname);
}

/**
 * Compare two semver triples. Returns:
 *   >0 if a is newer than b
 *   =0 if equal
 *   <0 if a is older than b
 *
 * The strings are not compared lexicographically — "1.10.0" must be newer
 * than "1.2.0", not equal. The parsing rejects anything that is not a
 * strict `MAJOR.MINOR.PATCH` triple; this is the same rule the manifest
 * applies to its own version.
 */
export function compareSemver(a, b) {
  const av = parseSemver(a);
  const bv = parseSemver(b);
  if (!av || !bv) return 0;
  for (let i = 0; i < 3; i++) {
    if (av[i] !== bv[i]) return av[i] - bv[i];
  }
  return 0;
}

export function parseSemver(value) {
  if (typeof value !== 'string') return null;
  const match = SEMVER.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Pick the manifest asset that matches the running architecture, or `null`
 * if there is no published build for that arch.
 *
 * @param {ParsedManifest} manifest
 * @param {'arm64' | 'x64'} arch
 */
export function assetForArch(manifest, arch) {
  return manifest.assets.find((a) => a.arch === arch) ?? null;
}

/**
 * Compute the SHA-256 of a buffer or a stream's collected bytes.
 *
 * Used by the download path to verify the bytes that landed on disk against
 * the digest the manifest advertised. A mismatch is a hard failure: the
 * partial file is unlinked, the user is told the download could not be
 * verified, and the menu reverts to "up to date" / "ready to check".
 */
export function sha256Of(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Render a human-friendly verdict line for the native update dialog.
 *
 * Pulled out of the dialog file because the same wording is also useful to
 * the renderer-side Settings panel, and a second copy in two places is the
 * bug "inconsistent copy" is named for.
 */
export function describeVerdict(verdict) {
  switch (verdict.status) {
    case STATUS.UP_TO_DATE:
      return { headline: `You're up to date.`, detail: null };
    case STATUS.NEWER_AVAILABLE: {
      const sizeMb = Math.round(verdict.download.bytes / (1024 * 1024));
      return {
        headline: `Kingfisher ${verdict.latestVersion} is available.`,
        detail: `You're running ${verdict.currentVersion}. The macOS ${verdict.download.arch} build is ${sizeMb} MB.`,
      };
    }
    case STATUS.UNABLE:
      return {
        headline: `Unable to check for updates right now.`,
        detail: verdict.reason,
      };
    case STATUS.DOWNLOADING:
      return {
        headline: `Downloading Kingfisher ${verdict.latestVersion}…`,
        detail: `${formatPercent(verdict)}`,
      };
    case STATUS.VERIFYING:
      return { headline: 'Verifying download…', detail: null };
    case STATUS.READY:
      return {
        headline: `Kingfisher ${verdict.latestVersion} is ready to install.`,
        detail: null,
      };
    case STATUS.FAILED:
      return {
        headline: `The downloaded update could not be verified.`,
        detail: verdict.reason ?? 'The file did not match the expected checksum.',
      };
    case STATUS.CANCELED:
      return { headline: `Download canceled.`, detail: null };
    default:
      return { headline: 'Checking for updates…', detail: null };
  }
}

function formatPercent(d) {
  if (!d.totalBytes) return '0%';
  const pct = Math.floor((d.receivedBytes / d.totalBytes) * 100);
  const mb = (n) => `${(n / (1024 * 1024)).toFixed(0)} MB`;
  return `${mb(d.receivedBytes)} of ${mb(d.totalBytes)} · ${pct}%`;
}
