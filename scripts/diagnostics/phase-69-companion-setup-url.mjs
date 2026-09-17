#!/usr/bin/env node
/**
 * Phase 69 — the "Read the full setup guide" link in Settings → Companion
 * points at a page that exists.
 *
 * The previous URL was `docs/install/companion.md`. That path does not
 * exist in the repository — the companion docs live in `companion/README.md`,
 * which is what the project root README links to and what GitHub renders at
 * `github.com/mardakurt/kingfisher/blob/master/companion/README.md`.
 *
 * This script opens the Settings dialog, navigates to the Companion section,
 * reads the href of the "Read the full setup guide" anchor, and asserts
 * that the path resolves to the live companion README. A 404 is exactly the
 * failure mode the owner reported, so the test fails loudly if the URL
 * regresses.
 *
 *   node scripts/diagnostics/phase-69-companion-setup-url.mjs
 *
 * Requires the web server running at http://localhost:3210.
 */

import { chromium } from 'playwright';

const BASE = process.env.KF_BASE_URL ?? 'http://localhost:3210';

const EXPECTED = 'https://github.com/mardakurt/kingfisher/blob/master/companion/README.md';

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // Click the Companion tab in the settings side-nav.
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, a, [role="tab"]'));
    const target = btns.find((b) => b.textContent?.trim() === 'Companion');
    target?.click();
  });
  await page.waitForTimeout(800);

  const href = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a'));
    const link = links.find((l) => /setup guide/i.test(l.textContent || ''));
    return link?.href ?? null;
  });
  await browser.close();

  console.log(`expected: ${EXPECTED}`);
  console.log(`actual:   ${href ?? '(not found)'}`);
  if (href !== EXPECTED) {
    console.error('FAIL: companion setup-guide link does not point at companion/README.md');
    process.exit(1);
  }
  console.log('PASS: companion setup-guide link resolves to the companion README');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
