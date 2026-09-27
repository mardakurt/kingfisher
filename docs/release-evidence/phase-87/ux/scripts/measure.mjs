/* eslint-disable no-console -- measurement scripts report on stdout */
import { chromium } from '@playwright/test';
const out = process.argv[2];
const sizes = [[1280,720],[1280,800],[1440,790],[1470,860],[1728,1000]];
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const page = await ctx.newPage();
const pgn = `[Event "Test"]\n[White "A"]\n[Black "B"]\n[Result "*"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 Be7 9. Qd2 O-O 10. O-O-O Nbd7 11. g4 b5 12. g5 b4 13. Ne2 Ne8 14. f4 a5 15. f5 a4 16. Nbd4 exd4 17. Nxd4 b3 18. Kb1 bxc2+ 19. Nxc2 Bb3 20. axb3 axb3 21. Na3 Ne5 *`;
await page.setViewportSize({width:1280,height:800});
await page.goto('http://localhost:3210/analysis');
await page.locator('html[data-kingfisher-ready="true"]').waitFor();
await page.getByRole('button', { name: /^Import( PGN or FEN)?$/ }).first().click().catch(async()=>{ await page.getByRole('button',{name:'Import'}).first().click(); });
const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
await dialog.getByRole('textbox').fill(pgn);
await dialog.getByRole('button', { name: /Import game/ }).click();
await page.waitForTimeout(1500);
for (const [w,h] of sizes) {
  await page.setViewportSize({width:w,height:h});
  await page.waitForTimeout(700);
  const m = await page.evaluate(() => {
    const r = (el) => { if(!el) return null; const b = el.getBoundingClientRect(); return `${Math.round(b.width)}x${Math.round(b.height)}@${Math.round(b.x)},${Math.round(b.y)}`; };
    const board = document.querySelector('[data-board-frame]');
    const tree = document.querySelector('[data-move-tree], [aria-label="Move tree"], [aria-label="Notation"]');
    return { board: r(board), tree: r(tree), boardSel: board?.getAttribute('data-testid') ?? board?.tagName };
  });
  console.log(w, h, JSON.stringify(m));
  await page.screenshot({ path: `${out}/analysis-game-${w}x${h}.png` });
}
await browser.close();
