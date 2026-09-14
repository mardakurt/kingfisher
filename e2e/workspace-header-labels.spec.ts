/**
 * The workspace header buttons (Position, Set up, Search commands) reveal their
 * labels at viewport breakpoints rather than at one large monitor size.
 *
 * Before Phase 53, both Position and Set up showed only their icons on every
 * screen narrower than 1500 px, which left them indistinguishable on iPad,
 * most laptops, and the lower half of the size matrix. Search commands hid its
 * label below 1600 px. The fix is a threshold rather than a redesign — the
 * labels were already in the DOM, just hidden with `display: none`.
 *
 * The thresholds come from the breakpoint tokens defined in `globals.css`:
 *
 *   - Position and Set up: `xs:` (430 px). Above that the sidebar is visible
 *     and there is room for two short labels next to their icons.
 *   - Search commands: `mid:` (900 px). The label is longer, and below 900 px
 *     it would push the theme toggle off the right edge of the header.
 *
 * The icon and the kbd stay visible at every width — only the text label
 * changes.
 */

import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

async function labelVisibility(page: Page) {
  return page.evaluate(() => {
    const position = [...document.querySelectorAll('span')].find(
      (el) => el.textContent?.trim() === 'Position',
    );
    const setup = [...document.querySelectorAll('span')].find(
      (el) => el.textContent?.trim() === 'Set up',
    );
    const search = [...document.querySelectorAll('span')].find(
      (el) => el.textContent?.trim() === 'Search commands',
    );
    const visible = (el: Element | undefined) =>
      el ? getComputedStyle(el).display !== 'none' : false;
    return {
      position: visible(position),
      setup: visible(setup),
      search: visible(search),
    };
  });
}

test.describe('workspace header labels', () => {
  test('Position and Set up show labels at iPad sizes, not just huge monitors', async ({
    page,
  }) => {
    // iPad Pro 11" portrait — 834 px wide, the size the owner reported on.
    await page.setViewportSize({ width: 834, height: 1194 });
    await page.goto('/analysis');
    await ready(page);
    const labels = await labelVisibility(page);
    expect(labels.position, 'Position label visible on iPad').toBe(true);
    expect(labels.setup, 'Set up label visible on iPad').toBe(true);
  });

  test('Search commands label waits for the wider toolbar to have room', async ({ page }) => {
    // iPad Pro 11" portrait — the label still hides because Search commands
    // is the widest of the three buttons and would crowd out the theme
    // toggle below 900 px.
    await page.setViewportSize({ width: 834, height: 1194 });
    await page.goto('/analysis');
    await ready(page);
    let labels = await labelVisibility(page);
    expect(labels.search, 'Search commands label hidden on iPad portrait').toBe(false);

    // At a normal laptop, all three labels are visible.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/analysis');
    await ready(page);
    labels = await labelVisibility(page);
    expect(labels.position).toBe(true);
    expect(labels.setup).toBe(true);
    expect(labels.search).toBe(true);
  });

  test('buttons stay icon-only on phones so the header still fits', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/analysis');
    await ready(page);
    const labels = await labelVisibility(page);
    expect(labels.position, 'Position label hidden on phone').toBe(false);
    expect(labels.setup, 'Set up label hidden on phone').toBe(false);
  });

  /**
   * The header is one row that does not wrap, so labels are a budget, and a
   * budget has to be checked as a sum rather than a feature at a time. The
   * first Phase 53 pass gave Position and Set up their labels from 430 px and
   * left the toolbar's three labels where they were; at the iPad sizes the
   * row then came to 835 px in a 796 px header, and a long document title was
   * painted under "Position". Three sizes, a long title, and the assertion
   * that no child of the header paints past its box or under its neighbour.
   */
  for (const size of [
    { width: 834, height: 1194, name: 'iPad portrait' },
    { width: 1024, height: 768, name: 'iPad landscape' },
    { width: 1280, height: 800, name: 'laptop' },
  ]) {
    test(`the header fits its row at ${size.name} (${size.width} px)`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/analysis');
      await ready(page);
      await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
      const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
      await dialog
        .getByRole('textbox')
        .fill(
          '[Event "Kingfisher header budget"]\n[White "Nepomniachtchi, Ian"]\n[Black "Praggnanandhaa, Rameshbabu"]\n\n1. e4 c5 2. Nf3 d6 *',
        );
      await dialog.getByRole('button', { name: /^(Load|Import)/ }).click();
      await expect(dialog).toBeHidden();
      await expect(
        page.locator('[data-workspace-header]').getByText('Nepomniachtchi, Ian – Praggnanandhaa'),
      ).toBeVisible();

      const survey = await page.evaluate(() => {
        const header = document.querySelector('[data-workspace-header]');
        if (!header) return null;
        const box = header.getBoundingClientRect();
        const children = [...header.children]
          .map((child) => {
            const rect = child.getBoundingClientRect();
            return {
              label: (child.textContent ?? '').trim().slice(0, 24),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
              overflow: child.scrollWidth - child.clientWidth,
            };
          })
          .filter((child) => child.width > 0);
        return { right: Math.round(box.right), children };
      });
      expect(survey).not.toBeNull();
      const children = survey?.children ?? [];
      expect(children.length).toBeGreaterThan(1);
      for (let index = 1; index < children.length; index += 1) {
        const previous = children[index - 1]!;
        const child = children[index]!;
        expect(
          previous.right,
          `${size.name}: "${previous.label}" ends at ${previous.right}, "${child.label}" starts at ${child.left}`,
        ).toBeLessThanOrEqual(child.left + 1);
      }
      for (const child of children) {
        expect(
          child.overflow,
          `${size.name}: "${child.label}" paints past its box`,
        ).toBeLessThanOrEqual(1);
        expect(child.right, `${size.name}: "${child.label}" leaves the header`).toBeLessThanOrEqual(
          (survey?.right ?? 0) + 1,
        );
      }
    });
  }
});
