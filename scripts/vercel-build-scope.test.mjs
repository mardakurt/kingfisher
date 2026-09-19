import { describe, expect, it } from 'vitest';

import { isOutsideWebBuild, needsWebBuild } from './vercel-build-scope.mjs';

describe('what needs a web deployment', () => {
  it('a docs-only change does not', () => {
    expect(
      needsWebBuild([
        'docs/reports/phase-72-handover.md',
        'CHANGELOG.md',
        'e2e/kingfisher.spec.ts',
        'desktop/src/main.mjs',
        'companion/README.md',
        'scripts/diagnostics/phase-69-mate-bar.mjs',
        'scripts/desktop-mac-appcast.mjs',
      ]),
    ).toBe(false);
  });

  it('anything the build reads does, however it is mixed with docs', () => {
    for (const path of [
      'src/app/landing/LandingPage.tsx',
      'public/landing/img/og.png',
      'next.config.ts',
      'vercel.json',
      'package.json',
      'package-lock.json',
      'src/release/macos-download.json',
      'scripts/install-engine.mjs',
      'scripts/build-reference-pack.mjs',
      'tsconfig.json',
      'a-new-top-level-file.txt',
    ]) {
      expect(needsWebBuild(['docs/README.md', path]), path).toBe(true);
      expect(isOutsideWebBuild(path), path).toBe(false);
    }
  });

  it('an empty change set does not (the caller treats that as a redeploy)', () => {
    expect(needsWebBuild([])).toBe(false);
  });
});
