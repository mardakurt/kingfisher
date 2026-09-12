import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { MINIMUM_MACOS, compareMacOSVersions, describeMinimumMacOS } from './platform-floor.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);

/**
 * Electron's own bundle is the authority on the floor. On a Mac the installed
 * `electron` package carries `Electron.app`, whose Info.plist states it; the
 * test reads that plist directly. On Linux (CI) the dist has no `.app`, so the
 * fallback pins the pair (Electron major, floor) that a Mac has verified —
 * a deterministic assertion, not a skip — and a bump of the Electron major
 * fails it until someone reads the new plist on a Mac.
 */
function electronDeclaredFloor() {
  const plist = path.join(
    here,
    '..',
    'node_modules',
    'electron',
    'dist',
    'Electron.app',
    'Contents',
    'Info.plist',
  );
  if (!existsSync(plist)) return null;
  const xml = readFileSync(plist, 'utf8');
  const match = xml.match(/<key>LSMinimumSystemVersion<\/key>\s*<string>([^<]+)<\/string>/);
  return match ? match[1] : null;
}

describe('the macOS floor', () => {
  it('is what the Electron in the bundle declares', () => {
    const declared = electronDeclaredFloor();
    if (declared !== null) {
      expect(declared).toBe(MINIMUM_MACOS);
      return;
    }
    const electronMajor = Number(require_('electron/package.json').version.split('.')[0]);
    expect({ electronMajor, floor: MINIMUM_MACOS }).toEqual({ electronMajor: 44, floor: '13.0' });
  });

  it('is what the build declares to Finder', () => {
    const yml = readFileSync(path.join(here, '..', 'electron-builder.yml'), 'utf8');
    const match = yml.match(/LSMinimumSystemVersion:\s*'([^']+)'/);
    expect(match?.[1]).toBe(MINIMUM_MACOS);
  });

  it('is what the public descriptor promises', () => {
    const descriptor = JSON.parse(
      readFileSync(path.join(here, '..', '..', 'src', 'release', 'macos-download.json'), 'utf8'),
    );
    // A published build may declare a *newer* floor than the source (the
    // descriptor is rewritten from the verified bundle at release time); it
    // may never promise an older one, because that is a machine the download
    // will not start on.
    expect(compareMacOSVersions(descriptor.minimumMacOS, MINIMUM_MACOS)).toBeGreaterThanOrEqual(0);
  });

  it('names the version the way Apple does', () => {
    expect(describeMinimumMacOS('13.0')).toBe('macOS 13 (Ventura)');
    expect(describeMinimumMacOS('11.0')).toBe('macOS 11 (Big Sur)');
    expect(describeMinimumMacOS('99.0')).toBe('macOS 99');
    expect(compareMacOSVersions('13.0', '11.0')).toBeGreaterThan(0);
    expect(compareMacOSVersions('13.0', '13')).toBe(0);
    expect(compareMacOSVersions('12.7', '13.0')).toBeLessThan(0);
  });
});
