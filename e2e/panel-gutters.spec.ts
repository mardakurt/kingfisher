/**
 * No tool's text starts at its panel's edge.
 *
 * `PanelBody` adds no padding of its own, so each panel must; Coverage, the
 * chapter's References and Review's Improvement did not, and their sentences
 * and cards ran into the column's border. Every text a tool draws is
 * measured, through a Range, against the left edge of the body it sits in.
 */

import { expect, test, type Page } from '@playwright/test';

import { selectTool } from './tools';

const READY = 'html[data-kingfisher-ready="true"]';
const GUTTER = 6;

async function flushText(page: Page): Promise<string[]> {
  return page.evaluate((gutter) => {
    const flush: string[] = [];
    for (const body of document.querySelectorAll<HTMLElement>('[data-panel-body]')) {
      const box = body.getBoundingClientRect();
      if (box.width === 0) continue;
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent?.trim();
        if (!text) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        // A screen-reader-only label is a one-pixel box at the edge, drawn for nobody.
        if (rect.width <= 1 || rect.height <= 1) continue;
        if (rect.left - box.left < gutter) flush.push(text.slice(0, 40));
      }
    }
    return flush;
  }, GUTTER);
}

test('no Analysis tool draws its text against the panel edge', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  const dock = page.locator('[data-workspace-dock]').first();
  await dock.getByRole('button', { name: /^More/ }).click();
  const names = (await page.getByRole('menuitem').allTextContents()).map((name) => name.trim());
  await page.keyboard.press('Escape');
  const tabs = (await dock.getByRole('tab').allTextContents()).map((name) => name.trim());
  expect(names.length + tabs.length).toBeGreaterThan(15);

  const found: string[] = [];
  for (const name of [...tabs, ...names]) {
    await selectTool(page, dock, name);
    // Let a lazily loaded panel draw before it is measured.
    await page.waitForTimeout(400);
    for (const text of await flushText(page)) found.push(`${name}: ${text}`);
  }
  expect(found).toEqual([]);
});

test("Review's Improvement keeps its figures off the panel edge", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/review');
  await page.locator(READY).waitFor();
  await page.getByRole('tab', { name: 'Improvement' }).click();
  await expect(page.getByText('Games reviewed')).toBeVisible();
  expect(await flushText(page)).toEqual([]);
});

test("a chapter's References keep their text off the panel edge", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/studies');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: 'Start a study' }).first().click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').first().fill('Gutters');
  await dialog.getByRole('button', { name: 'Create study' }).click();
  await page.getByRole('button', { name: 'Add a chapter' }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill('One');
  await dialog.getByRole('button', { name: 'Create chapter' }).click();
  await expect(dialog).toBeHidden();
  await selectTool(page, page.locator('[data-workspace-dock]').first(), 'References');
  await expect(page.getByText(/^No references yet/)).toBeVisible();
  expect(await flushText(page)).toEqual([]);
});
