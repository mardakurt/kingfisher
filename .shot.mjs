import { chromium } from '@playwright/test';
const [url, out, w = '900', h = '400'] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto(url); await p.waitForTimeout(800); await p.screenshot({ path: out, fullPage: true }); await b.close();
