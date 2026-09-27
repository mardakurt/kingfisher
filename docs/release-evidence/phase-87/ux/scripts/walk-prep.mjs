import { chromium } from '@playwright/test';
const out = process.argv[2];
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ deviceScaleFactor: 1, viewport:{width:1440,height:860} });
const page = await ctx.newPage();
await page.goto('http://localhost:3210/preparation');
await page.locator('html[data-kingfisher-ready="true"]').waitFor();
const box = page.getByPlaceholder(/Opponent/);
await page.waitForTimeout(4000);
await box.fill('Carlsen');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/prep-typed.png` });
await page.keyboard.press('Enter');
await page.waitForTimeout(6000);
await page.screenshot({ path: `${out}/prep-report.png` });
for (const tab of ['Games','Style','Dossier','Sheet']) {
  const t = page.getByRole('tab', { name: tab }).first();
  if (await t.count()) { await t.click(); await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/prep-${tab}.png` }); }
}
await page.goto('http://localhost:3210/players');
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/players.png` });
await browser.close();
