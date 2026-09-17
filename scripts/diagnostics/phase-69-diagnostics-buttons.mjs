#!/usr/bin/env node
/**
 * Phase 69 — the "Test" buttons in Settings → Diagnostics actually fire.
 *
 * The owner reported that clicking Test on each data provider did nothing.
 * Investigation showed the buttons *did* call `health.refetch()`, but a
 * healthy local provider answers in a handful of milliseconds: `isFetching`
 * flipped on, the response landed, the badge stayed the same colour, and
 * the user saw a button that "did nothing". The fix holds the busy flag
 * for at least 600 ms so the "Testing…" state and the badge pulse are
 * unmistakable.
 *
 * This script opens the Diagnostics tab, clicks the first Test button, and
 * asserts that the button renders "Testing…" and is `disabled` for at
 * least 500 ms after the click. A regression that drops the floor (and
 * makes the bug visible again) will fail this — and the live Diagnostics
 * panel is the surface the owner actually clicked.
 *
 *   node scripts/diagnostics/phase-69-diagnostics-buttons.mjs
 *
 * Requires the web server running at http://localhost:3210.
 */

import { chromium } from 'playwright';

const BASE = process.env.KF_BASE_URL ?? 'http://localhost:3210';

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, a, [role="tab"]'));
    const target = btns.find((b) => b.textContent?.trim() === 'Diagnostics');
    target?.click();
  });
  await page.waitForTimeout(2000);

  const beforeText = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('[data-test-provider-test]'));
    return buttons.map((b) => b.textContent?.trim());
  });
  console.log(`before click: ${beforeText.join(' | ')}`);

  const button = await page.locator('[data-test-provider-test]').first();
  await button.click();

  // Sample the button text at a few points across the 600 ms floor.
  const samples = await page.evaluate(async () => {
    const snapshots = [];
    for (const ms of [50, 200, 500, 750, 1000]) {
      await new Promise((r) => setTimeout(r, ms - (snapshots.at(-1)?.ms ?? 0)));
      const button = document.querySelector('[data-test-provider-test]');
      snapshots.push({
        ms,
        text: button?.textContent?.trim() ?? null,
        disabled: button?.disabled ?? null,
      });
    }
    return snapshots;
  });

  await browser.close();

  console.log('button state after click:');
  for (const s of samples) {
    console.log(
      `  +${String(s.ms).padStart(4)} ms  text=${s.text?.padEnd(10)} disabled=${s.disabled}`,
    );
  }

  const sawBusy = samples.some((s) => s.text === 'Testing…');
  const sawEnabledAgain = samples.some((s) => s.text === 'Test' && s.disabled === false);

  if (!sawBusy) {
    console.error('FAIL: button never showed "Testing…" — busy floor regressed');
    process.exit(1);
  }
  if (!sawEnabledAgain) {
    console.error('FAIL: button never returned to "Test" + enabled — request did not complete');
    process.exit(1);
  }
  console.log('PASS: Test button visibly fires (busy floor held "Testing…") and recovers');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
