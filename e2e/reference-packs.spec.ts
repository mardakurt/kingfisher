import { expect, test, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { selectTool } from './tools';

/**
 * A reference pack, installed the way a person installs one.
 *
 * `e2e/reference-sources.spec.ts` covers the pack that ships inside the
 * application: install on first run, disable, offline. It cannot cover the
 * three optional ones, because installing those means a download, and the
 * download is the half where the interesting failures live — a cancel, a
 * corrupt chunk, a digest that does not match, a source that gets half way and
 * then has to decide whether it is usable.
 *
 * `src/reference/install.test.ts` covers those against fixtures. What neither
 * covers is a **real pack at real scale through the real interface**: eighty
 * chunks and thirty-two megabytes going into IndexedDB while a progress bar
 * runs, and then a chess question being asked of the result. Phase 21 listed
 * exactly this as unfinished, and Phase 22 is where it gets done.
 *
 * ## Why this skips, and what that costs
 *
 * The optional packs are gitignored build output; a clone does not have them
 * and neither does CI. So this suite states its requirement and skips when it
 * is not met, rather than passing vacuously. `docs/data/reference-packs.md`
 * records the run that was made on the maintainer's machine, and the skip
 * message names the command that produces the input.
 *
 * The pack is served from a local static server rather than from the published
 * address, for the ordinary reason that a test must not depend on a network,
 * and for one specific one: **the published addresses do not resolve.** All
 * three optional packs point at a GitHub Pages site for a data repository that
 * has not been created, so pressing Install in the shipped application is a 404
 * every time. That is recorded in `docs/data/reference-packs.md` as the
 * blocking item it is; it is not a defect in the code this file exercises,
 * which is the same code path either way.
 */

/* Playwright runs from the repository root, as `e2e/visual.spec.ts` also relies on. */
const ROOT = process.cwd();

/** The pack this suite uses, smallest first so the walk stays affordable. */
const CANDIDATES = process.env.KINGFISHER_REFERENCE_PACK
  ? [process.env.KINGFISHER_REFERENCE_PACK]
  : [
      '.packs/kingfisher-recent-theory',
      '.packs/kingfisher-high-rated-online',
      '.packs/kingfisher-elite-otb',
    ];

const packDirectory = CANDIDATES.map((relative) => path.join(ROOT, relative)).find((directory) =>
  existsSync(path.join(directory, 'manifest.json')),
);

/**
 * Serve a pack directory, with one deliberate way to lie about it.
 *
 * `corrupt` flips a byte in the middle of the first explorer chunk. Not a
 * truncation and not a 404 — those fail at the transport, which is a different
 * code path from a body that arrives whole and hashes to the wrong thing. The
 * second is the one a mirror, a proxy or a bad disk produces, and the one the
 * digest exists for.
 */
function servePack(
  directory: string,
  options: { corrupt?: boolean; version?: string; delayMs?: number } = {},
) {
  const server: Server = createServer((request, response) => {
    const name = path.basename(new URL(request.url ?? '/', 'http://x').pathname);
    const file = path.join(directory, name);
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (!name || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end('no');
      return;
    }
    if (name === 'manifest.json' && options.version) {
      const manifest = JSON.parse(readFileSync(file, 'utf8'));
      response.writeHead(200).end(JSON.stringify({ ...manifest, version: options.version }));
      return;
    }
    if (options.corrupt && name === 'explorer-000.kfp.gz') {
      const bytes = readFileSync(file);
      const at = Math.floor(bytes.length / 2);
      bytes.writeUInt8(bytes.readUInt8(at) ^ 0xff, at);
      response.writeHead(200, { 'content-length': String(bytes.length) }).end(bytes);
      return;
    }
    response.writeHead(200, { 'content-length': String(statSync(file).size) });
    setTimeout(() => {
      if (!response.destroyed) createReadStream(file).pipe(response);
    }, options.delayMs ?? 0);
  });
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/manifest.json`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

const manifest = packDirectory
  ? (JSON.parse(readFileSync(path.join(packDirectory, 'manifest.json'), 'utf8')) as {
      id: string;
      name: string;
      counts: { games: number; positions: number; players: number };
      chunks: readonly unknown[];
    })
  : null;

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

async function openReferenceSources(page: Page) {
  await page.goto('/databases');
  await ready(page);
  await page.getByRole('button', { name: /Reference sources/ }).click();
  await expect(page.locator('[data-source-row="kingfisher-starter"]')).toBeVisible({
    timeout: 60_000,
  });
}

async function installFromUrl(page: Page, url: string) {
  const form = page.locator('form:has(#pack-url)');
  if (!(await form.isVisible()))
    await page.getByRole('button', { name: 'Install from a URL' }).click();
  await form.locator('#pack-url').fill(url);
  // Scoped to the form: every catalog row has an Install button of its own.
  await form.getByRole('button', { name: 'Install', exact: true }).click();
}

test.describe('installing a reference pack a person could actually download', () => {
  test.skip(
    !packDirectory,
    'No optional reference pack is built here. Run `npm run reference:build -- recent` first; ' +
      'the packs are gitignored build output, so CI never has one.',
  );
  test.slow();
  test.use({ actionTimeout: 30_000 });

  test('installs at real scale, answers a chess question, and can be removed again', async ({
    page,
  }) => {
    test.setTimeout(600_000);
    const pack = await servePack(packDirectory!);
    const id = manifest!.id;
    try {
      await openReferenceSources(page);
      await installFromUrl(page, pack.url);

      // The row appears while the download is running, and it is not usable yet.
      const row = page.locator(`[data-source-row="${id}"]`);
      await expect(row).toBeVisible({ timeout: 120_000 });

      /*
        Installed, and reporting the numbers its own manifest states.

        Not "a row appeared": a pack that installed three of eighty chunks and
        called itself ready would also produce a row. The game count is the
        cheapest thing that can only be right if the whole thing landed.
      */
      await expect(row).toContainText(manifest!.counts.games.toLocaleString(), {
        timeout: 480_000,
      });
      await expect(row.getByRole('button', { name: /^Remove /i })).toBeVisible();

      // It is a source the explorer will actually use.
      await page.goto('/analysis');
      await ready(page);
      const dock = page.locator('[data-workspace-dock]').first();
      await selectTool(page, dock, 'Explorer');
      const picker = dock.getByRole('combobox', { name: 'Evidence source' });
      await expect(picker.locator(`option[value="${id}"]`)).toHaveCount(1, { timeout: 60_000 });
      await picker.selectOption(id);
      await expect(dock.locator('[data-explorer-move]').first()).toBeVisible({ timeout: 60_000 });

      /*
        And it answers as itself.

        A source that silently fell back to the bundled Starter would still show
        moves here, so the assertion is on the count the panel attributes to
        *this* source being one this pack could produce and Starter could not.
      */
      await expect(dock).toContainText(`${manifest!.counts.games.toLocaleString()} games here`);

      // Verification is clean on a pack that just installed.
      await openReferenceSources(page);
      await row.getByRole('button', { name: /^Show details of/ }).click();
      await row.getByRole('button', { name: 'Verify integrity' }).click();
      await expect(page.getByText(/all chunks verified/i)).toBeVisible({ timeout: 300_000 });

      // Removing it takes it away and leaves the bundled source alone.
      await row.getByRole('button', { name: /^Remove /i }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(row.getByRole('button', { name: 'Install', exact: true })).toHaveCount(0, {
        timeout: 120_000,
      });
      await expect(page.locator('[data-source-row="kingfisher-starter"]')).toContainText(
        'Built in',
      );
    } finally {
      await pack.close();
    }
  });

  test('recovers from full storage, resumes a cancellation and upgrades without losing the source', async ({
    page,
  }) => {
    test.setTimeout(600_000);
    const pack = await servePack(packDirectory!, { delayMs: 150 });
    const update = await servePack(packDirectory!, { version: 'phase22-upgrade-check' });
    const id = manifest!.id;
    try {
      await openReferenceSources(page);
      // Stub the browser storage boundary, not the installer or its state.
      await page.evaluate((packId) => {
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, ...args) {
          if (this.name === 'referenceChunks' && value?.packId === packId) {
            throw new DOMException('Test device storage is full', 'QuotaExceededError');
          }
          return original.call(this, value, ...args);
        };
      }, id);
      await installFromUrl(page, pack.url);
      const row = page.locator(`[data-source-row="${id}"]`);
      await expect(row).toContainText(/storage|space|quota|full/i, { timeout: 60_000 });
      await expect(row.getByRole('switch', { name: `Use ${manifest!.name}` })).toBeDisabled();
      // Reload removes the injected failure; the partial source is still not Ready.
      await page.reload();
      await openReferenceSources(page);
      await installFromUrl(page, pack.url);
      await row.getByRole('button', { name: /cancel/i }).click();
      await expect(row.getByRole('switch', { name: `Use ${manifest!.name}` })).toBeDisabled();
      await installFromUrl(page, pack.url);
      await expect(row).toContainText(manifest!.counts.games.toLocaleString(), {
        timeout: 480_000,
      });
      const toggle = row.getByRole('switch', { name: `Use ${manifest!.name}` });
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
      // A real pack with a test-only version label: same licensed bytes, new generation.
      await installFromUrl(page, update.url);
      await row.getByRole('button', { name: /^Show details of/ }).click();
      await expect(row).toContainText('phase22-upgrade-check', { timeout: 480_000 });
      await row.getByRole('button', { name: 'Verify integrity' }).click();
      await expect(page.getByText(/all chunks verified/i)).toBeVisible({ timeout: 300_000 });
      await row.getByRole('button', { name: /^Remove /i }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(toggle).toBeDisabled();
      await expect(row).toContainText('Available');
      await installFromUrl(page, pack.url);
      await expect(row).toContainText(manifest!.counts.games.toLocaleString(), {
        timeout: 480_000,
      });
    } finally {
      await pack.close();
      await update.close();
    }
  });

  /**
   * A chunk that arrives whole and hashes to the wrong thing.
   *
   * The contract is that a pack is wholly installed or not installed at all,
   * and the failure mode it exists to prevent is the one nobody would notice: a
   * source in the catalog, marked ready, quietly answering from part of its
   * data. So the assertion is not that an error appeared — it is that the
   * source never became usable.
   */
  test('a pack whose bytes do not match its digest never becomes a source', async ({ page }) => {
    test.setTimeout(600_000);
    const pack = await servePack(packDirectory!, { corrupt: true });
    const id = manifest!.id;
    try {
      await openReferenceSources(page);
      await installFromUrl(page, pack.url);

      const row = page.locator(`[data-source-row="${id}"]`);
      await expect(row).toBeVisible({ timeout: 120_000 });
      await expect(row).toContainText(/does not match|verification|digest|damaged|failed/i, {
        timeout: 480_000,
      });

      // Never usable: no toggle a person can turn on, and never offered to the
      // explorer as a source.
      await expect(row.getByRole('switch', { name: `Use ${manifest!.name}` })).toBeDisabled();

      await page.goto('/analysis');
      await ready(page);
      const dock = page.locator('[data-workspace-dock]').first();
      await selectTool(page, dock, 'Explorer');
      const picker = dock.getByRole('combobox', { name: 'Evidence source' });
      await expect(picker.locator(`option[value="${id}"]:not([disabled])`)).toHaveCount(0);
    } finally {
      await pack.close();
    }
  });
});
