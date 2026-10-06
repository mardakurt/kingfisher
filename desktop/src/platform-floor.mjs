/**
 * The oldest macOS the Electron runtime inside Kingfisher can run on.
 *
 * This is not Kingfisher's choice; it is Electron's. Every Electron release
 * ships a Chromium that drops operating systems on Chromium's schedule, and
 * the `Electron.app` inside `node_modules/electron/dist` declares the result
 * in its own `LSMinimumSystemVersion`. Electron 44 declares 13.0 (Ventura).
 *
 * Until Phase 49 the bundle declared 11.0 and every public document said
 * "macOS 11 (Big Sur)". Finder would have let a Monterey user launch the
 * application and Chromium would have refused to start — a wrong system
 * requirement stated on the download page. `platform-floor.test.mjs` reads
 * Electron's own plist and fails if this constant ever disagrees with it;
 * `builder-config.test.mjs` pins the yml to it, `verify-dmg.mjs` asserts a
 * built bundle declares it, and `docs:check` refuses a public document that
 * names a different version.
 */
export const ELECTRON_MINIMUM_MACOS = '13.0';

/**
 * The oldest macOS Kingfisher supports: what the bundle declares to Finder
 * and Sparkle, and what the download page promises.
 *
 * It is the oldest macOS a packaged build has actually been run on (14.8.9,
 * on a hosted Apple-silicon runner), not the oldest the runtime might start
 * on. macOS 13 was the declared floor until 1.5.0 and was never run: no
 * Apple-silicon Mac on 13 was available and GitHub's macOS 13 runners were
 * Intel. A promise nobody has checked is the kind this project removes, so
 * the owner chose to raise the floor to the evidence (2026-10-06). It may
 * never be lower than `ELECTRON_MINIMUM_MACOS`; the test says so.
 */
export const MINIMUM_MACOS = '14.0';

/** Apple's marketing name for a major version, for the documents that say it. */
export const MACOS_NAMES = Object.freeze({
  11: 'Big Sur',
  12: 'Monterey',
  13: 'Ventura',
  14: 'Sonoma',
  15: 'Sequoia',
  26: 'Tahoe',
});

/** "13.0" → "macOS 13 (Ventura)". */
export function describeMinimumMacOS(version = MINIMUM_MACOS) {
  const major = Number(String(version).split('.')[0]);
  const name = MACOS_NAMES[major];
  return name ? `macOS ${major} (${name})` : `macOS ${major}`;
}

/** Numeric compare of "13.0" style versions: negative, zero or positive. */
export function compareMacOSVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
