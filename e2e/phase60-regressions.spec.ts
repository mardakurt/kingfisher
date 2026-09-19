import { expect, test, type Page } from '@playwright/test';
import { selectTool } from './tools';

const ready = (page: Page) => page.locator('html[data-kingfisher-ready="true"]').waitFor();

async function backups(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kingfisher');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{ reason: string; payload: string }[]>((resolve, reject) => {
        const request = db.transaction('backups').objectStore('backups').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}

test('the tour opens from Settings only, steps by keyboard, and stays closed after a reload', async ({
  page,
}) => {
  /*
    Phase 61 stopped the tour opening on launch; Phase 62 added "Open the
    tour guide" to Settings → Help; nothing mounted the dialog the link
    opened until Phase 71. So the three claims here: a fresh profile gets no
    tour, the link opens it, and a reload does not bring it back.
  */
  await page.goto('/analysis');
  await ready(page);
  await page.evaluate(() => localStorage.removeItem('kingfisher.preferences'));
  await page.reload();
  await ready(page);
  const tour = page.getByRole('dialog', { name: /^Tour/ });
  await page.waitForTimeout(500);
  await expect(tour).toBeHidden();

  await page.getByRole('button', { name: 'Settings ⌘,' }).click();
  await page.getByRole('tab', { name: 'Diagnostics', exact: true }).click();
  await page.locator('[data-open-tour]').click();
  await expect(tour).toBeVisible();
  await expect(tour).toHaveAccessibleName(/step 1 of/);
  await page.keyboard.press('ArrowRight');
  await expect(tour).toHaveAccessibleName(/step 2 of/);
  await page.keyboard.press('ArrowLeft');
  await expect(tour).toHaveAccessibleName(/step 1 of/);
  await page.keyboard.press('Escape');
  await expect(tour).toBeHidden();

  await page.reload();
  await ready(page);
  await page.waitForTimeout(500);
  await expect(tour).toBeHidden();
  await page.getByRole('button', { name: 'Settings ⌘,' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
  await expect(tour).toBeHidden();
});

test('account validation accepts mixed case for both providers and rejects whitespace', async ({
  page,
}) => {
  await page.goto('/analysis');
  await ready(page);
  await page.getByRole('button', { name: 'Settings ⌘,' }).click();
  await page.getByRole('tab', { name: 'Accounts', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Account username' });
  for (const provider of ['Lichess', 'Chess.com']) {
    await page.getByLabel('Account provider').selectOption({ label: provider });
    await input.fill('DrNykterstein');
    await expect(input).toHaveAttribute('aria-invalid', 'false');
    await expect(page.getByRole('button', { name: 'Link', exact: true })).toBeEnabled();
    await input.fill('invalid name');
    await expect(page.getByRole('button', { name: 'Link', exact: true })).toBeDisabled();
  }
});

test('scheduled and manual backups persist portable preferences with the schedule off for manual', async ({
  page,
}) => {
  await page.goto('/analysis');
  await ready(page);
  await expect
    .poll(async () => (await backups(page)).filter((b) => b.reason === 'scheduled').length)
    .toBeGreaterThan(0);
  const scheduled = (await backups(page)).find((b) => b.reason === 'scheduled')!;
  expect(JSON.parse(scheduled.payload).backup.preferences.boardTheme).toBe('midnight');
  expect(JSON.parse(scheduled.payload).backup.preferences).not.toHaveProperty('assistantApiKey');
  await page.getByRole('button', { name: /open the database settings/ }).click();
  await expect(page.getByRole('tab', { name: 'Database', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByLabel('Auto-backup', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Back up now', exact: true }).click();
  await expect(
    page.getByText('Backup taken. Auto-backup is off — turn it on above for the next one.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel('Auto-backup', { exact: true })).not.toBeChecked();
  const manual = (await backups(page)).find((b) => b.reason === 'manual')!;
  expect(JSON.parse(manual.payload).backup.preferences.autoBackupEnabled).toBe(false);
  await page.reload();
  await ready(page);
  expect((await backups(page)).filter((b) => b.reason === 'manual')).toHaveLength(1);
});

test('Ask coalesces same-frame input and releases after success and failure', async ({ page }) => {
  await page.goto('/analysis');
  await ready(page);
  await page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem('kingfisher.preferences')!);
    Object.assign(prefs.state, {
      assistantBaseUrl: 'https://assistant.test/v1',
      assistantModel: 'test',
    });
    localStorage.setItem('kingfisher.preferences', JSON.stringify(prefs));
  });
  let calls = 0;
  await page.route('https://assistant.test/v1/chat/completions', async (route) => {
    calls++;
    await route.fulfill({
      status: calls === 2 ? 500 : 200,
      contentType: 'application/json',
      body: JSON.stringify(
        calls === 2
          ? { error: { message: 'Test failure' } }
          : { choices: [{ message: { content: `Test response ${calls}` } }] },
      ),
    });
  });
  await page.reload();
  await ready(page);
  await selectTool(page, page.locator('[data-workspace-dock]'), 'Companion');
  const input = page.getByPlaceholder('Ask about this position…');
  for (let i = 1; i <= 3; i++) {
    await input.evaluate((element) => {
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeEnabled();
    await expect(
      page.getByText(i === 2 ? /Test failure/ : `Test response ${i}`, { exact: i !== 2 }),
    ).toBeVisible();
    expect(calls).toBe(i);
  }
});

test('panel shortcuts and endgame settings link reach their intended controls', async ({
  page,
}) => {
  await page.goto('/analysis');
  await ready(page);
  await page.getByRole('tab', { name: 'Engine', exact: true }).focus();
  await page.keyboard.press('n');
  await expect(page.getByRole('tab', { name: 'Notes', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('Shift+E');
  await expect(page.getByRole('tab', { name: 'Engine', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.goto('/endgame');
  await ready(page);
  await page.getByRole('button', { name: 'Settings → Companion', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Companion', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
