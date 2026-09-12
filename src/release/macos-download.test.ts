import { describe, expect, it } from 'vitest';

import { describeMacosDownload, macosDownload, macosTrustLabel } from './macos-download';
import { publicUrl } from './public-urls';

/**
 * The descriptor is the only thing that names the public DMG. These are the
 * shape rules the landing, the install guide and the verifier rely on; the
 * *currency* of the descriptor against GitHub is `desktop:public:verify`'s job.
 */
describe('macos-download.json', () => {
  it('is the file the landing links', () => {
    expect(publicUrl.macosDmg).toBe(macosDownload.url);
    expect(macosDownload.url.endsWith(`/${macosDownload.filename}`)).toBe(true);
  });

  it('names an immutable asset, never the moving latest pointer', () => {
    expect(macosDownload.url).not.toMatch(/releases\/latest/);
    expect(macosDownload.url).toMatch(
      /^https:\/\/github\.com\/mardakurt\/kingfisher\/releases\/download\/[^/]+\/Kingfisher-/,
    );
  });

  it('describes an Apple silicon build with a real digest and size', () => {
    expect(macosDownload.architecture).toBe('arm64');
    expect(macosDownload.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(macosDownload.bytes).toBeGreaterThan(100_000_000);
    expect(macosDownload.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(macosDownload.minimumMacOS).toBe('11.0');
  });

  it('a preview filename carries its build number; a stable one does not', () => {
    if (macosDownload.channel === 'preview') {
      expect(macosDownload.build).not.toBeNull();
      expect(macosDownload.filename).toBe(
        `Kingfisher-${macosDownload.version}-preview-${macosDownload.build}-arm64.dmg`,
      );
    } else {
      expect(macosDownload.filename).toBe(`Kingfisher-${macosDownload.version}-arm64.dmg`);
    }
    expect(macosDownload.filename).not.toMatch(/phase/i);
  });

  it('never claims notarisation without a Developer ID identity', () => {
    if (macosDownload.signature.notarized) {
      expect(macosDownload.signature.identity).toBe('Developer ID Application');
    }
  });

  it('labels the trust state truthfully', () => {
    const label = macosTrustLabel({
      ...macosDownload,
      channel: 'preview',
      signature: { identity: 'Apple Development', notarized: false },
    });
    expect(label).toBe('Apple Silicon · Preview · not notarised');
    expect(
      macosTrustLabel({
        ...macosDownload,
        channel: 'stable',
        signature: { identity: 'Developer ID Application', notarized: true },
      }),
    ).toBe('Apple Silicon · Notarised');
    expect(describeMacosDownload({ ...macosDownload, channel: 'preview', build: 431 })).toBe(
      `Kingfisher ${macosDownload.version} preview (build 431)`,
    );
  });
});
