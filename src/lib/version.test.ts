/**
 * The version has to be one number, and it has to be the real one.
 *
 * Kingfisher writes its version in three places — the application manifest,
 * the desktop shell's manifest, and whatever `APP_VERSION` resolves to in a
 * built page — and for nineteen phases the third was a hardcoded `'0.1.0'`
 * fallback that nothing ever overrode. It agreed with the other two by
 * coincidence, and would have disagreed with both the moment either changed,
 * in the one surface a user actually pastes into a bug report.
 *
 * These tests check the two manifests directly and the injection mechanically,
 * because the alternative is finding out from a report that confidently states
 * the wrong version.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_VERSION } from './version';

const manifest = (relative: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), relative), 'utf8')) as { version: string };

const app = manifest('package.json');
const shell = manifest('desktop/package.json');

describe('the version', () => {
  it('is the same in the application and the desktop shell', () => {
    expect(shell.version).toBe(app.version);
  });

  it('is a version a package manager would accept', () => {
    expect(app.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });

  /*
    The one that would have caught it.

    Under Vitest nothing injects `NEXT_PUBLIC_APP_VERSION`, so `APP_VERSION` is
    whatever the fallback is. It must not be a version-shaped string: a
    plausible-looking constant is exactly how a stale value survives, because
    every reader sees something that could be right.
  */
  it('falls back to something no one could mistake for a real version', () => {
    if (process.env.NEXT_PUBLIC_APP_VERSION) {
      expect(APP_VERSION).toBe(process.env.NEXT_PUBLIC_APP_VERSION);
      return;
    }
    expect(APP_VERSION).toBe('unknown');
    expect(APP_VERSION).not.toMatch(/^\d+\.\d+\.\d+/);
  });

  it('is injected by the build from the manifest, not written down twice', () => {
    const config = readFileSync(path.join(process.cwd(), 'next.config.ts'), 'utf8');
    expect(config).toContain('NEXT_PUBLIC_APP_VERSION');
    expect(config).toContain('manifest.version');
    // The literal would be a second source of truth, which is the defect.
    expect(readFileSync(path.join(process.cwd(), 'src/lib/version.ts'), 'utf8')).not.toContain(
      app.version,
    );
  });
});
