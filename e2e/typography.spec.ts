/**
 * The two faces are the ones the design names, where they are used.
 *
 * `--font-ui` and `--font-code` are declared on `:root` and refer to the faces
 * next/font defines (`--font-inter`, `--font-mono-face`). From 8737815 until
 * Phase 86 those were defined on <body>, so at `:root` the references were
 * undefined, both stacks were invalid, and everything inherited Tailwind's
 * default sans — a FEN in the system face, not monospace — on the website and
 * in the Mac application alike. Nothing looked broken enough to notice.
 */

import { expect, test } from '@playwright/test';

test('the interface and the notation use the stacks the design declares', async ({ page }) => {
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();

  const faces = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const fen = [...document.querySelectorAll('.font-mono')].find((element) =>
      /^[rnbqkpRNBQKP1-8/]+/.test(element.textContent ?? ''),
    );
    return {
      ui: root.getPropertyValue('--font-ui').trim(),
      code: root.getPropertyValue('--font-code').trim(),
      body: getComputedStyle(document.body).fontFamily,
      fen: fen ? getComputedStyle(fen).fontFamily : null,
    };
  });

  expect(faces.ui).not.toBe('');
  expect(faces.code).not.toBe('');
  // The platform's own face first, then Inter where there is none.
  expect(faces.body).toContain('SF Pro Text');
  expect(faces.body).toContain('Inter');
  // The position's FEN, in the status bar, is set in the mono face.
  expect(faces.fen).not.toBeNull();
  expect(faces.fen).toContain('JetBrains Mono');
});
