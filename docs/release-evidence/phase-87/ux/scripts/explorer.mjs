/* eslint-disable no-console -- measurement scripts report on stdout */
import { chromium } from '@playwright/test';
const [out, tag] = [process.argv[2], process.argv[3] ?? 'x'];
const browser = await chromium.launch({ channel: 'chrome' });
const page = await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
await page.goto('http://localhost:3210/analysis');
await page.locator('html[data-kingfisher-ready="true"]').waitFor();
await page.getByRole('button', { name: /^Import( PGN or FEN)?$/ }).first().click();
const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
await dialog.getByRole('textbox').fill('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 *');
await dialog.getByRole('button', { name: /Import game/ }).click();
await page.waitForTimeout(1500);
const dock = page.locator('[data-workspace-dock]').first();
await dock.getByRole('tab', { name: 'Explorer' }).first().click().catch(() => console.log('tab', e.message));
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}/explorer-1280x720-${tag}.png` });
await browser.close();
