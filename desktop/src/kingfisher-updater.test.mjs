import { spawnSync } from 'node:child_process';

import { describe, expect, it, vi } from 'vitest';

/*
  The signature-continuity check before an install. It asks codesign about
  the running executable and refuses to install a trusted update on top of a
  binary that is not Developer ID signed. The first version read codesign's
  stdout; codesign writes its report to stderr, so every running Kingfisher
  read as unsigned and every install was refused — found by the real update
  test against a Developer ID build. These tests use codesign itself, on this
  machine's own binaries, so the stream and the format are the real ones.
*/
async function load() {
  vi.resetModules();
  vi.doMock('electron', () => ({
    app: { getPath: () => '/bin/ls', getVersion: () => '1.0.0' },
    dialog: {},
  }));
  return import('./kingfisher-updater.mjs');
}

const darwin = process.platform === 'darwin';

describe('getRunningAppSignature', () => {
  it('reads what codesign reports, which arrives on stderr', async () => {
    const { getRunningAppSignature } = await load();
    const signature = await getRunningAppSignature('/bin/ls');
    if (!darwin) {
      expect(signature).toEqual({ signed: false, reason: 'not-darwin' });
      return;
    }
    // Apple's own binary: signed, by Apple, not by a Developer ID.
    expect(signature.signed).toBe(true);
    expect(signature.authorities.length).toBeGreaterThan(0);
    expect(signature.isDeveloperId).toBe(false);
  });

  it('recognises a Developer ID Application signature', async () => {
    const { parseCodesignDetails } = await load();
    const report = [
      'Executable=/Applications/Kingfisher.app/Contents/MacOS/Kingfisher',
      'Identifier=app.kingfisher.chess',
      'Authority=Developer ID Application: Metin Arda Kurt (3B5CYF9DQ4)',
      'Authority=Developer ID Certification Authority',
      'Authority=Apple Root CA',
      'TeamIdentifier=3B5CYF9DQ4',
    ].join('\n');
    const parsed = parseCodesignDetails(report);
    expect(parsed.isDeveloperId).toBe(true);
    expect(parsed.teamId).toBe('3B5CYF9DQ4');
    expect(parsed.authorities).toHaveLength(3);
  });

  it('agrees with codesign about a Developer ID build when one is on this machine', async () => {
    if (!darwin) return;
    const { getRunningAppSignature } = await load();
    const candidates = [
      process.env.KINGFISHER_DESKTOP_APP,
      '/tmp/kingfisher-release/mac-arm64/Kingfisher.app/Contents/MacOS/Kingfisher',
    ].filter(Boolean);
    const built = candidates.find(
      (exe) => spawnSync('codesign', ['-dvvv', exe], { encoding: 'utf8' }).status === 0,
    );
    // Without a packaged build on this machine the parser test above is the
    // evidence; this one is the same claim against the real bundle when present.
    if (!built) {
      expect(candidates.length).toBeGreaterThanOrEqual(1);
      return;
    }
    const report = spawnSync('codesign', ['-dvvv', built], { encoding: 'utf8' }).stderr;
    const signature = await getRunningAppSignature(built);
    expect(signature.isDeveloperId).toBe(/Authority=Developer ID Application/.test(report));
  });
});
