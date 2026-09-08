#!/usr/bin/env node
/** Fresh profile → install every real pack → offline queries → quit/reopen. */
import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = process.env.KINGFISHER_DESKTOP_OUT;
if (!out) throw new Error('Set KINGFISHER_DESKTOP_OUT to the packaged output directory.');
const binary = path.join(out, 'mac-arm64/Kingfisher.app/Contents/MacOS/Kingfisher');
const directories = [
  'kingfisher-recent-theory',
  'kingfisher-elite-otb',
  'kingfisher-high-rated-online',
];
const manifests = directories.map((id) =>
  JSON.parse(readFileSync(path.join(root, '.packs', id, 'manifest.json'))),
);
const profile = mkdtempSync(path.join(tmpdir(), 'kingfisher-field-'));
const server = createServer((request, response) => {
  const parts = new URL(request.url, 'http://local').pathname.split('/').filter(Boolean);
  if (parts.length !== 2 || !directories.includes(parts[0]) || path.basename(parts[1]) !== parts[1])
    return response.writeHead(404).end();
  const file = path.join(root, '.packs', ...parts);
  if (!existsSync(file)) return response.writeHead(404).end();
  response.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Content-Length': statSync(file).size,
  });
  createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
let app;
async function boot(label) {
  const start = performance.now();
  app = await electron.launch({
    executablePath: binary,
    args: [`--user-data-dir=${profile}`],
    timeout: 120_000,
  });
  const page = await app.firstWindow();
  await page.locator('html[data-kingfisher-ready="true"]').waitFor({ timeout: 120_000 });
  console.log(`${label}: renderer ready ${(performance.now() - start).toFixed(0)} ms`);
  return page;
}
async function visit(page, route) {
  await page.goto(new URL(route, page.url()).href);
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}
try {
  let page = await boot('Fresh profile');
  await visit(page, '/databases');
  await page.getByRole('button', { name: /Reference sources/ }).click();
  for (const manifest of manifests) {
    const form = page.locator('form:has(#pack-url)');
    if (!(await form.isVisible()))
      await page.getByRole('button', { name: 'Install from a URL' }).click();
    await form.locator('#pack-url').fill(`http://127.0.0.1:${port}/${manifest.id}/manifest.json`);
    await form.getByRole('button', { name: 'Install', exact: true }).click();
    await expect(page.locator(`[data-source-row="${manifest.id}"]`)).toContainText(
      manifest.counts.games.toLocaleString(),
      { timeout: 480_000 },
    );
    const row = page.locator(`[data-source-row="${manifest.id}"]`);
    const toggle = row.getByRole('switch', { name: `Use ${manifest.name}` });
    await expect(toggle).toBeEnabled({ timeout: 480_000 });
    await expect(row.getByRole('button', { name: /^Remove /i })).toBeVisible();
    if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
    console.log(
      `Installed ${manifest.name}: ${manifest.counts.games} games, ${manifest.chunks.length} chunks`,
    );
  }
  await app.close();
  app = null;
  page = await boot('Warm profile with all four packs');
  // Disconnect external services while leaving the application's own loopback server available.
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    return ['127.0.0.1', 'localhost'].includes(host) ? route.continue() : route.abort();
  });
  await page.getByRole('tab', { name: 'Explorer', exact: true }).click();
  const dock = page.locator('[data-workspace-dock]');
  const picker = dock.getByRole('combobox', { name: 'Evidence source' });
  for (const manifest of manifests) {
    const start = performance.now();
    await picker.selectOption(manifest.id);
    await expect(dock).toContainText(`${manifest.counts.games.toLocaleString()} games here`, {
      timeout: 60_000,
    });
    await expect(dock.locator('[data-explorer-move]').first()).toBeVisible();
    console.log(
      `Offline ${manifest.name}: ${(performance.now() - start).toFixed(0)} ms including UI selection`,
    );
  }
  await page.screenshot({ path: path.join(out, 'all-packs-offline.png') });
  await page.getByRole('tab', { name: 'Theory Book', exact: true }).click();
  await page.locator('[data-book-branch]').filter({ hasText: "King's Pawn Game" }).first().click();
  await page.locator('[data-book-branch]').filter({ hasText: 'Sicilian Defense' }).first().click();
  await page.screenshot({ path: path.join(out, 'theory-opening.png') });
  await page.getByRole('button', { name: 'All openings', exact: true }).click();
  await expect(page.locator('[data-theory-book]')).toHaveAttribute('data-theory-book', 'roots');
  await page.screenshot({ path: path.join(out, 'theory-index.png') });
  console.log('All-pack restart, offline sources and Theory Book return navigation passed.');
} finally {
  await app?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  rmSync(profile, { recursive: true, force: true });
}
