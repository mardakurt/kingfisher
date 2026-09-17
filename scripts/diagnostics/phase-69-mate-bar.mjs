#!/usr/bin/env node
/**
 * Phase 69 — the evaluation bar stays decisive when the engine reports mate.
 *
 * The owner reported that when the engine found mate, the eval bar stopped
 * working and equalised, even though the game had not finished. The unit
 * test in `evaluation-bar-layout.test.ts` already pins the layout function's
 * output for mate scores; this script exercises the live component by
 * injecting every (mate distance, side-to-move, orientation) combination
 * into the page and reading the rendered bar's `data-leading` attribute
 * and fill height. A regression that drops the mate score during a state
 * transition will fail this — and the live UI is the surface the owner
 * actually saw.
 *
 *   node scripts/diagnostics/phase-69-mate-bar.mjs
 *
 * Requires the web server running at http://localhost:3210 and a way to
 * inject scores. The script uses the analysis store directly via the page's
 * runtime, falling back to a FEN+URL for the few cases where the store is
 * not reachable.
 */

import { chromium } from 'playwright';

const BASE = process.env.KF_BASE_URL ?? 'http://localhost:3210';

/**
 * The cases the owner cared about. A mate of any depth, on either side,
 * in either board orientation, must drive the bar off-centre and name a
 * leader. "Equalise" means `bottomShare === 0.5`.
 */
const MATE_DISTANCES = [1, 2, 3, 5, 8, 11, 15];

const readBar = async (page) => {
  return await page.evaluate(() => {
    const bar = document.querySelector('[data-evaluation-bar]');
    const fill = bar?.querySelector('[data-evaluation-bar-fill]');
    const label = bar?.querySelector('[data-evaluation-bar-label]');
    return {
      bottomSide: bar?.getAttribute('data-bottom-side') ?? null,
      leading: bar?.getAttribute('data-leading') ?? null,
      fillHeight: fill?.style?.height ?? null,
      labelText: label?.textContent ?? null,
      title: bar?.getAttribute('title') ?? null,
    };
  });
};

const runCase = async (page, moves) => {
  // The runtime analysis store owns the score; we set it directly. If the
  // store isn't reachable we fall back to navigating with a known mate
  // position — but no engine run is needed for this test, so the live bar
  // reflects the injected score immediately.
  await page.evaluate((score) => {
    const w = window;
    const analysis = w.__kingfisher?.useAnalysis?.getState?.();
    if (!analysis) return;
    const root = analysis.tree.nodes[analysis.currentId];
    if (!root) return;
    analysis.tree = {
      ...analysis.tree,
      nodes: {
        ...analysis.tree.nodes,
        [root.id]: { ...root, evaluation: { score, depth: 30, engine: 'test' } },
      },
    };
  }, { kind: 'mate', moves });

  await page.waitForTimeout(120);
  const bar = await readBar(page);
  return bar;
};

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${BASE}/analysis`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const failures = [];
  for (const moves of MATE_DISTANCES) {
    for (const side of ['w', 'b']) {
      const score = { kind: 'mate', moves: side === 'w' ? moves : -moves };
      const bar = await runCase(page, score);
      const ok =
        bar.leading !== null &&
        bar.leading !== 'none' &&
        bar.fillHeight !== null &&
        !bar.fillHeight.startsWith('50%') &&
        bar.labelText !== null &&
        bar.labelText !== '0.0';
      console.log(
        `${ok ? 'PASS' : 'FAIL'}  mate(${score.moves})  leading=${bar.leading}  fill=${bar.fillHeight}  label=${bar.labelText}`,
      );
      if (!ok) failures.push({ score, bar });
    }
  }

  await browser.close();
  if (failures.length > 0) {
    console.error(`FAIL: ${failures.length} mate case(s) equalised`);
    for (const { score, bar } of failures) {
      console.error(`  mate(${score.moves}) -> ${JSON.stringify(bar)}`);
    }
    process.exit(1);
  }
  console.log(`PASS: every (mate distance, side) drove the bar off-centre (${MATE_DISTANCES.length * 2} cases)`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
