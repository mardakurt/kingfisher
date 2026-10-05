import { expect, test, type Page } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * A titled player's photo on the preparation card, as ChessBase shows one,
 * from Wikimedia Commons with its credit. Wikimedia is stubbed at the HTTP
 * boundary; a file Commons names no licence for is not shown at all.
 */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function stubWikimedia(page: Page, licence: string | null) {
  await page.route('https://www.wikidata.org/wiki/Special:EntityData/Q106807.json', (route) =>
    route.fulfill({
      json: {
        entities: {
          Q106807: { claims: { P18: [{ mainsnak: { datavalue: { value: 'Carlsen.jpg' } } }] } },
        },
      },
    }),
  );
  await page.route('https://commons.wikimedia.org/w/api.php**', (route) =>
    route.fulfill({
      json: {
        query: {
          pages: {
            '1': {
              imageinfo: [
                {
                  thumburl: 'https://upload.wikimedia.org/test/Carlsen.png',
                  descriptionurl: 'https://commons.wikimedia.org/wiki/File:Carlsen.jpg',
                  extmetadata: {
                    Artist: { value: '<a href="https://example.org">Test Photographer</a>' },
                    ...(licence ? { LicenseShortName: { value: licence } } : {}),
                  },
                },
              ],
            },
          },
        },
      },
    }),
  );
  await page.route('https://upload.wikimedia.org/test/Carlsen.png', (route) =>
    route.fulfill({ body: PIXEL, contentType: 'image/png' }),
  );
}

async function prepareAgainstCarlsen(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/preparation');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('combobox', { name: 'Player name' }).fill('Carlsen');
  const option = page.locator('#opponent-suggestions').getByRole('option').first();
  await expect(option).toContainText('Carlsen', { timeout: 30_000 });
  await option.dispatchEvent('pointerdown');
  await page.locator('[data-player-card]').waitFor({ timeout: 30_000 });
}

test('a titled player’s Commons photo is shown with its author and licence', async ({ page }) => {
  test.setTimeout(120_000);
  await stubWikimedia(page, 'CC BY-SA 2.0');
  await prepareAgainstCarlsen(page);
  await expect(page.locator('[data-player-photo]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-player-photo-credit]')).toHaveText(
    'Photo: Test Photographer, CC BY-SA 2.0, via Wikimedia Commons',
  );
});

test('a file with no licence named is not shown, and the initials stay', async ({ page }) => {
  test.setTimeout(120_000);
  await stubWikimedia(page, null);
  // Absence is asserted only after Commons has answered, so it cannot pass early.
  const answered = page.waitForResponse(/commons\.wikimedia\.org\/w\/api\.php/);
  await prepareAgainstCarlsen(page);
  await answered;
  await page.waitForTimeout(500);
  await expect(page.locator('[data-player-card]')).toContainText('CM');
  await expect(page.locator('[data-player-photo]')).toHaveCount(0);
  await expect(page.locator('[data-player-photo-credit]')).toHaveCount(0);
});

test('with Player photos off in Settings, nothing is asked of Wikimedia', async ({ page }) => {
  test.setTimeout(120_000);
  await stubWikimedia(page, 'CC BY-SA 2.0');
  const asked: string[] = [];
  page.on('request', (request) => {
    if (/wikimedia\.org|wikidata\.org/.test(request.url())) asked.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/preparation');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page
    .getByRole('button', { name: /settings/i })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Database' }).click();
  const toggle = dialog.getByRole('switch', { name: 'Show player photos' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');

  await page.getByRole('combobox', { name: 'Player name' }).fill('Carlsen');
  const option = page.locator('#opponent-suggestions').getByRole('option').first();
  await expect(option).toContainText('Carlsen', { timeout: 30_000 });
  await option.dispatchEvent('pointerdown');
  await page.locator('[data-player-card]').waitFor({ timeout: 30_000 });
  // The card has rendered and had time to ask; with photos on it asks within a second.
  await page.waitForTimeout(3_000);
  await expect(page.locator('[data-player-card]')).toContainText('CM');
  await expect(page.locator('[data-player-photo]')).toHaveCount(0);
  expect(asked).toEqual([]);
});

test('a pre-FIDE world champion’s page shows his photo, found through the historical roster', async ({
  page,
}) => {
  /*
    Capablanca died eight years before FIDE's first titles, so the titled
    roster never had him and his page showed initials. His Wikidata item comes
    from the historical roster (src/reference/legend-wikidata.json).
  */
  test.setTimeout(120_000);
  const asked: string[] = [];
  await page.route('https://www.wikidata.org/wiki/Special:EntityData/**', (route) => {
    asked.push(route.request().url());
    const qid = /EntityData\/(Q\d+)\.json/.exec(route.request().url())?.[1] ?? '';
    return route.fulfill({
      json: {
        entities: {
          [qid]: {
            claims: { P18: [{ mainsnak: { datavalue: { value: 'Capablanca 1931.jpg' } } }] },
          },
        },
      },
    });
  });
  await page.route('https://commons.wikimedia.org/w/api.php**', (route) =>
    route.fulfill({
      json: {
        query: {
          pages: {
            '1': {
              imageinfo: [
                {
                  thumburl: 'https://upload.wikimedia.org/test/Capablanca.png',
                  descriptionurl: 'https://commons.wikimedia.org/wiki/File:Capablanca_1931.jpg',
                  extmetadata: {
                    Artist: { value: 'Unknown author' },
                    LicenseShortName: { value: 'Public domain' },
                  },
                },
              ],
            },
          },
        },
      },
    }),
  );
  await page.route('https://upload.wikimedia.org/test/Capablanca.png', (route) =>
    route.fulfill({ body: PIXEL, contentType: 'image/png' }),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/player/capablanca%2C%20jose%20raul');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  const facts = page.locator('[data-roster-facts][data-roster-source="legend"]');
  await expect(facts.locator('[data-player-photo]')).toBeVisible({ timeout: 30_000 });
  await expect(facts.locator('[data-player-photo-credit]')).toHaveText(
    'Photo: Unknown author, Public domain, via Wikimedia Commons',
  );
  expect(asked.some((url) => url.includes('/Q160702.json'))).toBe(true);
});
