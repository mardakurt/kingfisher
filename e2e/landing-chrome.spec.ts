/**
 * The landing's header, icons and images, at the widths people use.
 *
 * The header's links were centred between the wordmark and the button —
 * 26 px right of the page's centre at every desktop width — because a flex
 * row with `margin: auto` centres in the space that is left, not on the
 * page. The fix is a grid whose outer columns are equal; this asserts the
 * result numerically rather than by eye, at three widths, so a later change
 * to the wordmark or the button cannot quietly move the links again. Below
 * the collapse width the links fold into a disclosure menu that works
 * without script.
 *
 * The favicon set is asserted from the document, not the file system: the
 * .ico, the SVG, a PNG at a multiple of 48 px (what a search engine's
 * favicon crawler wants) and the Apple touch icon, each served with its
 * type. And every product image on the page is a real file with real bytes
 * — a landing that references a capture somebody renamed is a landing with
 * a broken picture in it.
 */

import { expect, test, type Page } from '@playwright/test';

const centre = async (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return (r.left + r.right) / 2;
  });

for (const width of [1920, 1440, 1024]) {
  test(`at ${width}px the section links are centred on the page`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const links = await centre(page, '.nav-links');
    expect(Math.abs(links - width / 2)).toBeLessThanOrEqual(1);
    // The brand starts, and the action ends, on the sections' column lines.
    const brandLeft = await page
      .locator('.nav-brand')
      .evaluate((el) => el.getBoundingClientRect().left);
    const sectionLeft = await page
      .locator('.section-why .section-head')
      .evaluate((el) => el.getBoundingClientRect().left);
    expect(Math.abs(brandLeft - sectionLeft)).toBeLessThanOrEqual(1);
    await expect(page.locator('.nav-menu')).toBeHidden();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
}

for (const width of [820, 390]) {
  test(`at ${width}px the links fold into a menu that opens without script`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('.nav-links')).toBeHidden();
    const menu = page.locator('.nav-menu');
    await expect(menu).toBeVisible();
    await menu.locator('summary').click();
    const list = page.getByRole('navigation', { name: 'Sections' });
    await expect(list.getByRole('link', { name: 'Research' })).toBeVisible();
    await expect(list.getByRole('link', { name: 'Install guide' })).toHaveAttribute(
      'href',
      '/install',
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
}

test('the document links a complete favicon set and every icon is served', async ({ page }) => {
  await page.goto('/');
  const icons = await page
    .locator('link[rel="icon"], link[rel="apple-touch-icon"]')
    .evaluateAll((links) =>
      links.map((link) => ({
        rel: link.getAttribute('rel'),
        href: link.getAttribute('href') ?? '',
        sizes: link.getAttribute('sizes'),
        type: link.getAttribute('type'),
      })),
    );
  const by = (predicate: (i: (typeof icons)[number]) => boolean) => icons.find(predicate);
  expect(by((i) => i.href.startsWith('/favicon.ico'))).toMatchObject({
    rel: 'icon',
    sizes: '48x48',
  });
  expect(by((i) => i.href.startsWith('/icon.svg'))).toMatchObject({ type: 'image/svg+xml' });
  // A multiple of 48 px, as PNG: the size a search-result favicon is made from.
  expect(by((i) => i.href.startsWith('/icon1.png'))).toMatchObject({
    sizes: '96x96',
    type: 'image/png',
  });
  expect(by((i) => i.rel === 'apple-touch-icon')).toMatchObject({ sizes: '180x180' });
  for (const icon of icons) {
    const response = await page.request.get(icon.href);
    expect(response.status(), icon.href).toBe(200);
    expect(response.headers()['content-type'], icon.href).toContain(icon.type ?? 'image/');
    expect((await response.body()).length, icon.href).toBeGreaterThan(500);
  }
});

test('every product image is a real file, sized as declared', async ({ page }) => {
  await page.goto('/');
  const images = await page
    .locator('.hero-product-img, .research-img, .engines-img')
    .evaluateAll((imgs) =>
      imgs.map((img) => ({
        src: img.getAttribute('src') ?? '',
        width: Number(img.getAttribute('width')),
        height: Number(img.getAttribute('height')),
        alt: img.getAttribute('alt') ?? '',
      })),
    );
  expect(images).toHaveLength(3);
  for (const image of images) {
    expect(image.alt.length, image.src).toBeGreaterThan(40);
    const response = await page.request.get(image.src);
    expect(response.status(), image.src).toBe(200);
    expect(response.headers()['content-type']).toBe('image/webp');
    // The declared box matches the file, so the browser reserves the right
    // space and the page does not shift when the picture arrives.
    const natural = await page.evaluate(
      (src) =>
        new Promise<{ w: number; h: number }>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = reject;
          img.src = src;
        }),
      image.src,
    );
    expect(natural, image.src).toEqual({ w: image.width, h: image.height });
  }
});
