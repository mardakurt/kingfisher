/**
 * Manual "Check for Updates" — desktop application.
 *
 * The Kingfisher desktop application does not auto-update. A
 * "Check for Updates" action is wired into the macOS application
 * menu and the Settings → Application panel; both call this
 * module.
 *
 * The check is **manual**. There is no timer, no background
 * fetch, no telemetry. Each click is one HTTPS request to the
 * public Kingfisher release metadata, with a small set of guards
 * in front of it:
 *
 *   1. The URL must be HTTPS, must point at the Kingfisher
 *      repository's release host, and must not be redirected
 *      to anywhere else.
 *   2. The response must declare a `kingfisher.version` that
 *      parses as a semver triple.
 *   3. The response must include at least one desktop asset
 *      (arm64 or x64) whose `name` matches
 *      `Kingfisher-<version>-<arch>.dmg` and whose `sha256`
 *      is a 64-character hex string.
 *
 * Anything that fails the guards is reported as `unable-to-check`
 * and never as `newer-available`. The renderer is the only place
 * that interprets the response; the desktop shell just fetches.
 *
 * No remote script is ever executed. No binary is downloaded or
 * executed automatically. The "newer available" verdict is
 * followed by a button that opens the verified release page in
 * the user's default browser; the user downloads, verifies and
 * installs the new build by hand.
 */

import { publicUrl } from './public-urls';

export type UpdateVerdict =
  | { readonly status: 'up-to-date' }
  | {
      readonly status: 'newer-available';
      readonly currentVersion: string;
      readonly latestVersion: string;
      readonly download: {
        readonly arch: 'arm64' | 'x64';
        readonly url: string;
        readonly sha256: string;
        readonly bytes: number;
      };
      readonly releasePageUrl: string;
    }
  | { readonly status: 'unable-to-check'; readonly reason: string };

export interface UpdateCheckInput {
  /** The version of Kingfisher that is currently running. */
  readonly currentVersion: string;
  /**
   * The body of the release manifest. The bridge hands the
   * renderer a stripped shape, not the raw GitHub response.
   */
  readonly manifest: unknown;
  /** The architecture the running build was compiled for. */
  readonly arch: 'arm64' | 'x64';
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const SHA256 = /^[0-9a-f]{64}$/i;
const DMG_NAME = /^Kingfisher-(\d+)\.(\d+)\.(\d+)-(arm64|x64)\.dmg$/;

export function evaluateUpdate(input: UpdateCheckInput): UpdateVerdict {
  const current = parseSemver(input.currentVersion);
  if (!current) {
    return {
      status: 'unable-to-check',
      reason: `Current version "${input.currentVersion}" is not a recognised release.`,
    };
  }
  const candidate = parseManifest(input.manifest);
  if ('reason' in candidate) {
    return { status: 'unable-to-check', reason: candidate.reason };
  }
  const cmp = compareSemver(candidate.version, current);
  if (cmp <= 0) {
    return { status: 'up-to-date' };
  }
  const asset = candidate.assets.find((a) => a.arch === input.arch);
  if (!asset) {
    return {
      status: 'unable-to-check',
      reason: `No build is published for the ${input.arch} architecture.`,
    };
  }
  return {
    status: 'newer-available',
    currentVersion: input.currentVersion,
    latestVersion: candidate.version,
    download: asset,
    releasePageUrl: candidate.htmlUrl,
  };
}

export async function checkForUpdate(
  arch: 'arm64' | 'x64',
  fetchImpl: typeof fetch = fetch,
): Promise<UpdateVerdict> {
  const url = releaseManifestUrl();
  if (!url) {
    return {
      status: 'unable-to-check',
      reason: 'No public release manifest URL is configured.',
    };
  }
  let response: Response;
  try {
    response = await fetchImpl(url, {
      redirect: 'manual',
      headers: { accept: 'application/json' },
    });
  } catch (err) {
    return {
      status: 'unable-to-check',
      reason: `Could not reach the release host: ${describeError(err)}`,
    };
  }
  if (response.status >= 300 && response.status < 400) {
    return {
      status: 'unable-to-check',
      reason: 'Release metadata redirect refused (a redirect is not expected for a stable URL).',
    };
  }
  if (!response.ok) {
    return {
      status: 'unable-to-check',
      reason: `Release host returned ${response.status} ${response.statusText}.`,
    };
  }
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return {
      status: 'unable-to-check',
      reason: 'Release metadata was not valid JSON.',
    };
  }
  return evaluateUpdate({
    currentVersion: APP_VERSION,
    manifest: body,
    arch,
  });
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function releaseManifestUrl(): string | null {
  // The release metadata is the GitHub Releases API for the
  // canonical repository. The owner may move the application to
  // another host eventually; the URL lives in public-urls so that
  // day does not require a code change here.
  const repo = publicUrl.repository;
  if (!repo.startsWith('https://github.com/')) return null;
  return `${repo}/releases/latest/download/kingfisher-release-manifest.json`;
}

interface ParsedManifest {
  readonly version: string;
  readonly assets: Array<{
    readonly arch: 'arm64' | 'x64';
    readonly url: string;
    readonly sha256: string;
    readonly bytes: number;
  }>;
  readonly htmlUrl: string;
}

function parseManifest(input: unknown): ParsedManifest | { reason: string } {
  if (!input || typeof input !== 'object') {
    return { reason: 'Release manifest is not an object.' };
  }
  const record = input as Record<string, unknown>;
  const kf = record['kingfisher'];
  if (!kf || typeof kf !== 'object') {
    return { reason: 'Release manifest is missing the "kingfisher" section.' };
  }
  const version = (kf as Record<string, unknown>)['version'];
  if (typeof version !== 'string' || !parseSemver(version)) {
    return {
      reason: `Release manifest version "${String(version)}" is not a valid semver triple.`,
    };
  }
  const desktop = record['desktop'];
  if (!Array.isArray(desktop)) {
    return { reason: 'Release manifest is missing the "desktop" array.' };
  }
  const assets: ParsedManifest['assets'] = [];
  for (const entry of desktop) {
    if (!entry || typeof entry !== 'object') continue;
    const r = entry as Record<string, unknown>;
    const name = r['name'];
    const url = r['url'];
    const sha256 = r['sha256'];
    const bytes = r['bytes'];
    if (typeof name !== 'string' || typeof url !== 'string') continue;
    const match = DMG_NAME.exec(name);
    if (!match) continue;
    if (match[1] !== String(version.split('.')[0])) continue;
    if (match[2] !== String(version.split('.')[1])) continue;
    if (match[3] !== String(version.split('.')[2])) continue;
    if (typeof sha256 !== 'string' || !SHA256.test(sha256)) continue;
    if (typeof bytes !== 'number' || bytes <= 0) continue;
    if (!url.startsWith('https://')) continue;
    const arch = match[4] === 'arm64' ? 'arm64' : 'x64';
    assets.push({ arch, url, sha256, bytes });
  }
  if (assets.length === 0) {
    return {
      reason: 'Release manifest does not list any signed desktop assets.',
    };
  }
  const htmlUrl = record['htmlUrl'];
  if (typeof htmlUrl !== 'string' || !htmlUrl.startsWith('https://github.com/')) {
    return { reason: 'Release manifest is missing a verified release-page URL.' };
  }
  return { version, assets, htmlUrl };
}

function parseSemver(value: string): [number, number, number] | null {
  const match = SEMVER.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a: string, b: [number, number, number]): number {
  const av = parseSemver(a);
  if (!av) return 0;
  for (let i = 0; i < 3; i++) {
    const left = av[i] as number;
    const right = b[i] as number;
    if (left !== right) return left - right;
  }
  return 0;
}

/**
 * The application's own version, from the same place the rest of
 * the application reads it. Re-exported through this module so
 * tests can drive `checkForUpdate` without pulling the whole app
 * tree.
 */
import { APP_VERSION } from '@/lib/version';
