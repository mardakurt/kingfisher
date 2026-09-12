/**
 * The one description of the macOS build the public is offered.
 *
 * Everything that names the current download — the landing page's button and
 * spec list, the install guide, `npm run docs:check`,
 * `npm run desktop:public:verify` — reads this file, and nothing else names
 * a DMG. Before it existed the filename lived in five places and the landing
 * pointed at a build 104 commits and thirty thousand lines behind master for
 * three days without anything noticing.
 *
 * `macos-download.json` is written by `npm run release:mac:preview` (a
 * preview) or the stable release process, from the artifact it just
 * uploaded and re-downloaded. It is committed, so the landing that deploys
 * from the commit describes the bytes that are actually there.
 */

import descriptor from './macos-download.json' with { type: 'json' };

export type MacosChannel = 'stable' | 'preview';

export interface MacosDownload {
  readonly schema: 'kingfisher-macos-download/1';
  /** `stable`: a signed, notarised release. `preview`: current master, code-signed only. */
  readonly channel: MacosChannel;
  /** The marketing version. A preview shares it with the stable release it precedes. */
  readonly version: string;
  /** `git rev-list --count` at the build; distinct for every preview. Null for a build made before it was recorded. */
  readonly build: number | null;
  readonly commit: string;
  readonly filename: string;
  /** The immutable asset URL: a specific tag, never `/releases/latest`. */
  readonly url: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly architecture: 'arm64';
  readonly minimumMacOS: string;
  readonly signature: {
    /** The identity family the bundle was signed with. */
    readonly identity: 'Developer ID Application' | 'Apple Development';
    readonly notarized: boolean;
  };
  readonly publishedAt: string;
  /** The GitHub release page that holds the asset and its SHA256SUMS. */
  readonly releasePage: string;
}

export const macosDownload: MacosDownload = descriptor as MacosDownload;

/** `Kingfisher 1.0.0 (build 431)` — how the download is named to a person. */
export function describeMacosDownload(d: MacosDownload = macosDownload): string {
  const build = d.build === null ? '' : ` (build ${d.build})`;
  return d.channel === 'preview'
    ? `Kingfisher ${d.version} preview${build}`
    : `Kingfisher ${d.version}${build}`;
}

/** The label under the download button, honest about the trust state. */
export function macosTrustLabel(d: MacosDownload = macosDownload): string {
  if (d.signature.notarized) return 'Apple Silicon · Notarised';
  return d.channel === 'preview'
    ? 'Apple Silicon · Preview · not notarised'
    : 'Apple Silicon · not notarised';
}

export function formatBytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(0)} MB`;
}
