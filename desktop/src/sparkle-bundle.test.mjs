/**
 * The Sparkle bundle contract, and the gates that read it.
 *
 * Every check in `inspectSparkleBundle` is made to fail here at least once
 * by removing or altering the one thing it asserts, so that a gate which
 * passes has been seen to be able to fail — the standard the packaged
 * build had to learn in Phase 47, when a verifier passed a bundle that
 * exited on launch.
 */

import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  SPARKLE_BUNDLE_FILES,
  assertSparkleBundle,
  inspectSparkleBundle,
  plistValue,
  readSparkleRecord,
} from './sparkle-bundle.mjs';
import { infoPlist, writeSparkleFixture } from './test-helpers/sparkle-fixture.mjs';

const temporary = [];
function contents(options) {
  const dir = mkdtempSync(path.join(tmpdir(), 'kingfisher-sparkle-bundle-'));
  temporary.push(dir);
  return writeSparkleFixture(path.join(dir, 'Kingfisher.app', 'Contents'), options);
}
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const failures = (dir, expect_ = {}) => inspectSparkleBundle(dir, expect_).filter((c) => !c.ok);

describe('a complete bundle', () => {
  it('passes every check, and the checks are the ones the module documents', () => {
    const dir = contents();
    const checks = inspectSparkleBundle(dir);
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(checks.map((c) => c.name)).toEqual([
      ...SPARKLE_BUNDLE_FILES.map((f) => `sparkle: ${f}`),
      'sparkle: no XPCServices (not sandboxed)',
      'sparkle: no XPCServices (not sandboxed)',
      `sparkle: framework is ${readSparkleRecord().version}`,
      'sparkle: SUFeedURL',
      'sparkle: SUPublicEDKey is the recorded key',
      'sparkle: SUEnableAutomaticChecks is false',
      'sparkle: SUAllowsAutomaticUpdates is false',
    ]);
    expect(() => assertSparkleBundle(dir)).not.toThrow();
  });
});

describe('each check can fail', () => {
  it.each(SPARKLE_BUNDLE_FILES)('a missing or empty %s', (relative) => {
    const dir = contents();
    writeFileSync(path.join(dir, relative), '');
    const failed = failures(dir);
    expect(failed.map((c) => c.name)).toContain(`sparkle: ${relative}`);
    expect(() => assertSparkleBundle(dir)).toThrow(relative);
  });

  it('XPC services that were not stripped — even as a dangling symlink', () => {
    const dir = contents();
    symlinkSync(
      'Versions/Current/XPCServices',
      path.join(dir, 'Frameworks/Sparkle.framework/XPCServices'),
    );
    expect(failures(dir).map((c) => c.detail)).toContain(
      'Frameworks/Sparkle.framework/XPCServices is shipped',
    );
  });

  it('a framework other than the recorded version', () => {
    const dir = contents({ version: '2.9.9' });
    expect(failures(dir).map((c) => c.name)).toEqual([
      `sparkle: framework is ${readSparkleRecord().version}`,
    ]);
  });

  it('a feed that is not https, or not the one expected', () => {
    expect(
      failures(contents({ feedURL: 'http://example.com/appcast.xml' })).map((c) => c.name),
    ).toEqual(['sparkle: SUFeedURL']);
    expect(
      failures(contents(), { feedURL: 'https://example.com/other.xml' }).map((c) => c.name),
    ).toEqual(['sparkle: SUFeedURL']);
    expect(
      failures(contents({ feedURL: 'https://example.com/other.xml' }), {
        feedURL: 'https://example.com/other.xml',
      }),
    ).toEqual([]);
  });

  it('a public key other than the recorded one, or none', () => {
    expect(
      failures(contents({ publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' })).map(
        (c) => c.name,
      ),
    ).toEqual(['sparkle: SUPublicEDKey is the recorded key']);
    const dir = contents();
    writeFileSync(
      path.join(dir, 'Info.plist'),
      infoPlist({
        SUFeedURL: 'https://example.com/appcast.xml',
        SUEnableAutomaticChecks: false,
        SUAllowsAutomaticUpdates: false,
      }),
    );
    expect(failures(dir).map((c) => c.detail)).toContain('missing');
    // A throwaway key is accepted when it is the one expected (the staging harness).
    expect(
      failures(contents({ publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' }), {
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      }),
    ).toEqual([]);
  });

  it('a scheduled check or an automatic download switched on, or the key left out', () => {
    expect(failures(contents({ automaticChecks: true })).map((c) => c.name)).toEqual([
      'sparkle: SUEnableAutomaticChecks is false',
    ]);
    expect(failures(contents({ automaticUpdates: true })).map((c) => c.name)).toEqual([
      'sparkle: SUAllowsAutomaticUpdates is false',
    ]);
    const dir = contents();
    writeFileSync(
      path.join(dir, 'Info.plist'),
      infoPlist({ SUFeedURL: 'https://e.com/a.xml', SUPublicEDKey: readSparkleRecord().publicKey }),
    );
    expect(failures(dir).map((c) => c.detail)).toEqual(['missing', 'missing']);
  });
});

describe('the plist reader', () => {
  it('reads strings, integers and booleans at the top level, unescaping entities', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'kingfisher-plist-'));
    temporary.push(dir);
    const file = path.join(dir, 'Info.plist');
    writeFileSync(
      file,
      infoPlist({
        SUFeedURL: 'https://x/?a=1&b=<2>',
        CFBundleVersion: '580',
        Flag: true,
        Off: false,
      }),
    );
    expect(plistValue(file, 'SUFeedURL')).toBe('https://x/?a=1&b=<2>');
    expect(plistValue(file, 'CFBundleVersion')).toBe('580');
    expect(plistValue(file, 'Flag')).toBe('true');
    expect(plistValue(file, 'Off')).toBe('false');
    expect(plistValue(file, 'Absent')).toBeNull();
    expect(plistValue(path.join(dir, 'nope.plist'), 'SUFeedURL')).toBeNull();
  });
});
