import { expect, test } from '@playwright/test';

test('readiness uses a real engine and named offline population without changing the layout', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('gridcell', { name: 'e2, White pawn', exact: true }).click();
  await page.getByRole('gridcell', { name: 'e4, empty', exact: true }).click();
  await page.getByRole('button', { name: 'Research readiness', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Research readiness', exact: true });
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-current="true"]')).toHaveText('e4');
  await expect(dialog.locator('[data-readiness-engine]')).toHaveText('Not checked in this session');
  await dialog.getByRole('button', { name: 'Run short search', exact: true }).click();
  await expect(dialog.locator('[data-readiness-engine]')).toHaveText('Search completed', {
    timeout: 45_000,
  });
  await expect(dialog.getByRole('region', { name: 'Engine readiness' })).toContainText(
    'Reported identity: Stockfish',
  );
  await expect(dialog.locator('[data-readiness-save]')).toHaveText(
    'Draft saved · not filed in a study',
  );
  await expect(dialog.locator('[data-readiness-backup]')).toHaveText('Backup today');
  // If the selected source is online, choosing the offered local population is explicit.
  const offline = dialog.getByRole('button', { name: /^Use Kingfisher Starter.*offline$/ });
  if (await offline.count()) await offline.click();
  await expect(dialog.getByRole('region', { name: 'Reference readiness' })).toContainText(
    'Kingfisher Starter',
  );
  await expect(dialog.locator('[data-readiness-reference]')).toContainText(
    'Answered this position',
  );
  await expect(dialog.getByRole('region', { name: 'Reference readiness' })).toContainText(
    'CC-BY-SA-4.0',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Research readiness', exact: true })).toBeFocused();
  await expect(page.locator('[data-current="true"]')).toHaveText('e4');
});

test('an unavailable online reference offers an explicit offline recovery and useful settings', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'kingfisher.preferences',
      JSON.stringify({
        version: 7,
        state: { explorerSourceId: 'lichess-masters', autoBackupEnabled: false },
      }),
    );
  });
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Research readiness', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Research readiness', exact: true });
  await expect(dialog.locator('[data-readiness-reference]')).toContainText(
    /token|connection|unavailable/i,
  );
  await expect(dialog.locator('[data-readiness-backup]')).toHaveText('No backup yet');
  await dialog.getByRole('button', { name: /^Use Kingfisher Starter.*offline$/ }).click();
  await expect(dialog.locator('[data-readiness-reference]')).toContainText(
    'Answered this position',
  );
  await dialog.getByRole('button', { name: 'Manage and export backups', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toContainText('Export');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Research readiness', exact: true })).toBeFocused();
});

for (const theme of ['light', 'dark']) {
  test(`readiness remains reachable and scrollable in ${theme} on a narrow window`, async ({
    page,
  }) => {
    await page.addInitScript((theme) => {
      localStorage.setItem(
        'kingfisher.preferences',
        JSON.stringify({ version: 7, state: { theme } }),
      );
    }, theme);
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto('/analysis');
    await page.locator('html[data-kingfisher-ready="true"]').waitFor();
    const trigger = page.getByRole('button', { name: 'Research readiness', exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Research readiness', exact: true });
    const backups = dialog.getByRole('button', { name: 'Manage and export backups', exact: true });
    await backups.scrollIntoViewIfNeeded();
    await expect(backups).toBeInViewport();
    await page.screenshot({ path: `tmp/session/readiness-${theme}-narrow.png` });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });
}

test('an empty local collection is a valid zero answer, not a missing source', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'kingfisher.preferences',
      JSON.stringify({ version: 7, state: { explorerSourceId: 'local-collection' } }),
    );
  });
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Research readiness', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Research readiness', exact: true });
  await expect(dialog.locator('[data-readiness-reference]')).toContainText(
    'Answered this position · 0 games',
  );
  await expect(dialog).toContainText('This is a valid empty answer');
});

test('opening readiness never replaces an active analysis search', async ({ page }) => {
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: /^Layout/ }).click();
  await page.getByRole('menuitem', { name: 'Research workspace', exact: true }).click();
  const engine = page.getByRole('region', { name: 'Engine candidates' });
  await engine.getByRole('button', { name: 'Start analysis (E)' }).click();
  await expect(engine.locator('[data-engine-line="1"]')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Research readiness', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Research readiness', exact: true });
  await expect(dialog.getByRole('button', { name: 'Run short search' })).toBeDisabled();
  await expect(dialog.locator('[data-readiness-engine]')).toHaveText('Search responding');
  await expect(dialog).toHaveCSS('opacity', '1');
  await expect(dialog.locator('..')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'tmp/session/readiness-wide.png' });
  await page.keyboard.press('Escape');
  await expect(engine.getByRole('button', { name: 'Stop analysis (E)' })).toBeVisible();
  await engine.getByRole('button', { name: 'Stop analysis (E)' }).click();
});

for (const [key, title] of [
  ['ControlOrMeta+s', 'Save to study'],
  ['ControlOrMeta+,', 'Settings'],
  ['ControlOrMeta+k', 'Command palette'],
] as const) {
  test(`readiness hands ${key} to ${title} with one active dialog`, async ({ page }) => {
    await page.goto('/analysis');
    await page.locator('html[data-kingfisher-ready="true"]').waitFor();
    const trigger = page.getByRole('button', { name: 'Research readiness', exact: true });
    await trigger.click();
    await page.keyboard.press(key);
    const destination = page.getByRole('dialog', { name: title, exact: true });
    await expect(destination).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect
      .poll(() => destination.evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);
    if (title === 'Save to study') {
      const studyTitle = destination.getByRole('textbox', { name: 'New study title', exact: true });
      await studyTitle.fill('A title still being edited');
      await page.keyboard.press(key);
      await expect(studyTitle).toHaveValue('A title still being edited');
      await expect(page.getByRole('dialog')).toHaveCount(1);
      await page.keyboard.press('ControlOrMeta+,');
      await expect(destination).toBeVisible();
      await expect(studyTitle).toHaveValue('A title still being edited');
      await expect(page.getByRole('dialog')).toHaveCount(1);
    }
    if (title === 'Command palette') {
      await destination
        .getByRole('searchbox', {
          name: 'Search commands, games, studies and players',
          exact: true,
        })
        .evaluate((el) =>
          el.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }),
          ),
        );
      await expect(destination).toBeVisible();
      await page.keyboard.press('ControlOrMeta+,');
      await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(1);
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}
