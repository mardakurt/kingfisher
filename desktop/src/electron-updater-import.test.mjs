/**
 * The updater engine is reachable the way the shell loads it.
 *
 * `electron-updater` is CommonJS and exports `autoUpdater` through a getter.
 * Node's static named-export detection cannot see a getter, so
 * `import('electron-updater').then(({ autoUpdater }) => …)` — the shape the
 * shell used from Phase 36 to Phase 45 — resolves `autoUpdater` to
 * `undefined`, and every packaged Check for Updates failed with "Cannot set
 * properties of undefined (setting 'autoDownload')". This pins the shape the
 * shell now relies on. It does not construct the updater: doing so needs a
 * running Electron.
 */

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require_ = createRequire(import.meta.url);

describe('electron-updater as an ES module import', () => {
  it('exposes autoUpdater on the default export, not as a named export', async () => {
    const namespace = await import('electron-updater');
    const cjs = namespace.default ?? namespace;
    // A getter, not a value: under Node's own loader that is exactly why a
    // destructured named import receives undefined. (The test runner's
    // interop differs, so the named export is not asserted here; the
    // descriptor is what the shell's fix depends on.)
    expect(Object.getOwnPropertyDescriptor(cjs, 'autoUpdater')?.get).toBeTypeOf('function');
  });

  it('is the package the desktop shell installs', () => {
    const { version } = require_('electron-updater/package.json');
    expect(version).toMatch(/^6\./);
  });
});
