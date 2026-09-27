/* eslint-disable no-console -- measurement scripts report on stdout */
import { chromium } from '@playwright/test';
const out = process.argv[2];
const routes = ['search','recent','analysis','openings','studies','repertoire','preparation','players','opening-files','team','review','training','daily','season','endgame','games','scoresheet','similar','databases','settings','position','install','privacy','security'];
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
const page = await ctx.newPage();
await page.goto('http://localhost:3212/analysis');
await page.locator('html[data-kingfisher-ready="true"]').waitFor();
await page.evaluate(() => localStorage.setItem('kingfisher.preferences', JSON.stringify({ state: { theme: 'dark' }, version: 7 })));
const results = [];
for (const r of routes) {
  await page.goto(`http://localhost:3212/${r}`);
  await page.waitForTimeout(1800);
  const info = await page.evaluate(() => {
    const html = document.documentElement;
    // Find text whose colour is too close to its background (contrast < 3:1), a cheap sweep.
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bgOf = (el) => { while (el) { const c = parse(getComputedStyle(el).backgroundColor); if (c && c.a > 0.9) return c; el = el.parentElement; } return { r: 0, g: 0, b: 0 }; };
    const low = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || parseFloat(s.opacity) < 0.5) continue;
      const rect = el.getBoundingClientRect(); if (!rect.width || rect.bottom < 0 || rect.top > innerHeight) continue;
      const fg = parse(s.color); if (!fg) continue; const bg = bgOf(el);
      const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      if (ratio < 3 && !el.closest('[aria-disabled="true"],:disabled,[data-board-frame]')) low.push(`${el.textContent.trim().slice(0, 30)} (${ratio.toFixed(2)})`);
    }
    return { theme: html.dataset.theme, bg: getComputedStyle(document.body).backgroundColor, low: [...new Set(low)].slice(0, 6) };
  });
  results.push({ route: r, ...info });
  await page.screenshot({ path: `${out}/dark-${r}.png` });
}
console.log(JSON.stringify(results, null, 1));
await browser.close();
