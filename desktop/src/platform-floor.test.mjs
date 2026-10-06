import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  ELECTRON_MINIMUM_MACOS,
  MINIMUM_MACOS,
  compareMacOSVersions,
  describeMinimumMacOS,
} from './platform-floor.mjs';

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
  /*
    Two different assertions live behind this one name. `desktop/dist/` is
    git-ignored, so in a clean checkout the bundle is absent, the plist cannot be
    read, and the Electron-declared floor is never checked — while the test
    title still says it is. The pass is the same either way, which is what makes
    it worth fixing: a green that means "checked something else" is exactly the
    kind nobody can audit from the outside.
  */
  it('is what the Electron in the bundle declares, or pins the floor when there is no bundle', () => {
    const declared = electronDeclaredFloor();
    if (declared !== null) {
      // The bundle is here, so this really is the check the title promises.
      expect({ source: 'packaged plist', declared }).toEqual({
        source: 'packaged plist',
        declared: ELECTRON_MINIMUM_MACOS,
      });
      return;
    }
    const electronMajor = Number(require_('electron/package.json').version.split('.')[0]);
    // `source` is in both sides on purpose. A bundle appearing — or vanishing —
    // changes which assertion runs, and carrying the branch in the compared
    // object turns that switch into a failure rather than a silent change of
    // meaning under a title that no longer describes what was checked.
    expect({
      source: 'no bundle; pinned to Electron',
      electronMajor,
      floor: ELECTRON_MINIMUM_MACOS,
    }).toEqual({
      source: 'no bundle; pinned to Electron',
      electronMajor: 44,
      floor: '13.0',
    });
  });

  it('supports no macOS older than the runtime starts on, and none it was not run on', () => {
    expect(compareMacOSVersions(MINIMUM_MACOS, ELECTRON_MINIMUM_MACOS)).toBeGreaterThanOrEqual(0);
    // 14.8.9 is the oldest macOS a packaged build has been run on (hosted runner).
    expect(MINIMUM_MACOS).toBe('14.0');
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
    expect(
      compareMacOSVersions(descriptor.minimumMacOS, ELECTRON_MINIMUM_MACOS),
    ).toBeGreaterThanOrEqual(0);
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
