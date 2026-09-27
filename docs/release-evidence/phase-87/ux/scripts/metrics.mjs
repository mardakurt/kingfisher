/* eslint-disable no-console -- measurement scripts report on stdout */
import { chromium } from '@playwright/test';
const base = process.argv[2];
const browser = await chromium.launch({ channel: 'chrome' });
const result = {};
// 1. Explorer at 1280x720 with a game loaded at move 0.
{
  const page = await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
  await page.goto(`${base}/analysis`);
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: /^Import( PGN or FEN)?$/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill('1. e4 c5 2. Nf3 d6 *');
  await dialog.getByRole('button', { name: /Import game/ }).click();
  await page.waitForTimeout(1200);
  const dock = page.locator('[data-workspace-dock]').first();
  await dock.getByRole('tab', { name: 'Explorer' }).first().click();
  await page.locator('[data-explorer-move]').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1000);
  result.explorer1280x720 = await page.evaluate(() => {
    const moves = [...document.querySelectorAll('[data-workspace-dock] [data-explorer-move]')];
    const visible = moves.filter((m) => m.getBoundingClientRect().bottom <= window.innerHeight - 24).length;
    const table = document.querySelector('[data-workspace-dock] table');
    const scroller = table?.parentElement;
    return { visibleRows: visible, tableOverflowPx: scroller ? scroller.scrollWidth - scroller.clientWidth : null };
  });
  await page.context().close();
}
// 2. Sidebar: is Databases fully in view at 1280x800?
{
  const page = await (await browser.newContext({ viewport:{width:1280,height:800} })).newPage();
  await page.goto(`${base}/analysis`);
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  result.sidebar1280x800 = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Sections"]');
    const link = [...nav.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Databases');
    const r = link.getBoundingClientRect(); const n = nav.getBoundingClientRect();
    const scroller = [...nav.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 4);
    const box = scroller ? scroller.getBoundingClientRect() : n;
    return { databasesVisible: r.top >= box.top && r.bottom <= box.bottom };
  });
  // 3. Empty repertoire: create buttons.
  await page.goto(`${base}/repertoire`);
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForTimeout(800);
  result.repertoireCreateButtons = await page.getByRole('button', { name: /^(Create|New) repertoire$/ }).count();
  await page.goto(`${base}/studies`);
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForTimeout(800);
  result.studiesStartButtons = await page.getByRole('button', { name: 'Start a study' }).count();
  result.routeContextSentence = await page.getByText(/route context/i).count();
  await page.context().close();
}
// 4. Preparation suggestion race on a fresh profile.
{
  const page = await (await browser.newContext({ viewport:{width:1440,height:860} })).newPage();
  await page.goto(`${base}/preparation`);
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('combobox', { name: 'Player name' }).fill('Carlsen');
  const seen = new Set();
  for (let i = 0; i < 40; i++) { const t = await page.locator('#opponent-suggestions').innerText().catch(() => null); if (t) seen.add(t.replace(/\n/g,' ')); await page.waitForTimeout(100); }
  result.prepSuggestionsSeen = [...seen];
  await page.context().close();
}
console.log(JSON.stringify(result, null, 1));
await browser.close();
