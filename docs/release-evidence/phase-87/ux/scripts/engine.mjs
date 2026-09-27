/* eslint-disable no-console -- measurement scripts report on stdout */
import { chromium } from '@playwright/test';
const [out, tag] = [process.argv[2], process.argv[3] ?? 'x'];
const browser = await chromium.launch({ channel: 'chrome' });
for (const scheme of ['light','dark']) {
const ctx = await browser.newContext({ viewport:{width:1440,height:860}, colorScheme: scheme });
const page = await ctx.newPage();
await page.goto('http://localhost:3210/analysis');
await page.locator('html[data-kingfisher-ready="true"]').waitFor();
await page.evaluate((theme) => localStorage.setItem('kingfisher.preferences', JSON.stringify({ state: { theme }, version: 7 })), scheme);
await page.reload(); await page.locator('html[data-kingfisher-ready="true"]').waitFor();
await page.getByRole('button', { name: /^Import( PGN or FEN)?$/ }).first().click();
const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
await dialog.getByRole('textbox').fill('[White "Anand"]\n[Black "Carlsen"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 Be7 9. Qd2 O-O 10. O-O-O Nbd7 11. g4 b5 12. g5 b4 13. Ne2 Ne8 14. f4 a5 *');
await dialog.getByRole('button', { name: /Import game/ }).click();
await page.waitForTimeout(1200);
await page.keyboard.press('End');
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Analyse this position' }).click().catch(() => console.log('no analyse btn'));
await page.waitForTimeout(8000);
await page.screenshot({ path: `${out}/engine-${scheme}-${tag}.png` });
await ctx.close();
}
await browser.close();
