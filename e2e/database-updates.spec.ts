import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { settingsButton } from './support/settings-control';

test('a verified update rolls back in the product and refreshes the visible games', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-update-ui-'));
  const name = `Rollback UI ${Date.now()}`;
  let key: string | null = null;
  let lastJob = '';
  const post = async (route: string, data: object) => {
    const response = await request.post(`http://127.0.0.1:4338${route}`, {
      headers: { authorization: 'Bearer phase8-e2e-token' },
      data,
    });
    const body = await response.json();
    expect(response.ok(), `${route}: ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
    return body;
  };
  try {
    const created = await post('/db/create', { name, layout: 'postings', directory });
    key = created.key;
    const first = '[White "Original ledger"]\n[Black "Game"]\n[Result "*"]\n\n1. e4 e5 *';
    const added =
      '[White "Added ledger"]\n[Black "Game"]\n[Result "*"]\n\n1. d4 {A retained note.} d5 *';
    const file = path.join(directory, 'update.pgn');
    for (const pgn of [Array(1000).fill(first).join('\n\n'), first + '\n\n' + added]) {
      writeFileSync(file, pgn);
      const sha256 = createHash('sha256').update(pgn).digest('hex');
      const job = await post('/db/import-file', {
        key: created.key,
        path: file,
        sha256,
        licence: 'Synthetic regression fixture only',
      });
      lastJob = job.jobId;
      const jobs = await request.get('http://127.0.0.1:4338/db/import-file-jobs', {
        headers: { authorization: 'Bearer phase8-e2e-token' },
      });
      expect(
        (await jobs.json()).jobs.some((entry: { id: string }) => entry.id === job.jobId),
      ).toBeTruthy();
      const competing = await request.post('http://127.0.0.1:4338/db/compact', {
        headers: { authorization: 'Bearer phase8-e2e-token' },
        data: { key: created.key },
      });
      expect(competing.status()).toBe(400);
      expect((await competing.json()).error).toContain('active import');
      await expect
        .poll(async () => (await post('/db/import-file-status', { jobId: job.jobId })).phase, {
          // A cold eight-worker import took 21 s in the full suite.
          timeout: 60_000,
        })
        .toBe('done');
    }
    await page.goto('/analysis');
    await page.locator('html[data-kingfisher-ready="true"]').waitFor();
    await settingsButton(page).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('tab', { name: 'Companion' }).click();
    await settings
      .getByLabel('Pairing address')
      .fill('http://127.0.0.1:4338#token=phase8-e2e-token');
    await settings.getByRole('button', { name: 'Pair', exact: true }).click();
    await expect(settings.getByText(/Paired with/)).toBeVisible();
    await settings.getByRole('button', { name: 'Close' }).click();
    await page.goto('/databases');
    await page.locator('html[data-kingfisher-ready="true"]').waitFor();
    await page.getByRole('button', { name: 'Import a large file…' }).click();
    let importer = page.getByRole('dialog', { name: 'Import a large file' });
    await importer.getByLabel('Recent companion imports').selectOption(lastJob);
    await expect(importer).toContainText('1 games imported');
    await page.reload();
    await page.locator('html[data-kingfisher-ready="true"]').waitFor();
    await page.getByRole('button', { name: 'Import a large file…' }).click();
    importer = page.getByRole('dialog', { name: 'Import a large file' });
    await importer.getByLabel('Recent companion imports').selectOption(lastJob);
    await expect(importer).toContainText('1 games imported');
    await page.keyboard.press('Escape');
    await expect(importer).toBeHidden();
    await page
      .getByRole('list', { name: 'Collections' })
      .getByRole('button', { name: new RegExp(name) })
      .click();
    const ledger = page.getByRole('region', { name: 'Collection source ledger' });
    await expect(ledger).toContainText('Verified archive SHA-256');
    await expect(page.getByText('Added ledger – Game', { exact: true })).toBeVisible();
    await ledger.getByRole('button', { name: 'Roll back this update…' }).click();
    await page
      .getByRole('dialog', { name: 'Roll back this database update?' })
      .getByRole('button', { name: 'Roll back update', exact: true })
      .click();
    await expect(ledger).toContainText('rolled-back');
    await expect(page.getByText('Added ledger – Game', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Original ledger – Game', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Showing up to 100 · exact match count 1', { exact: true }),
    ).toBeVisible();
  } finally {
    if (lastJob) {
      // A failed assertion must not turn cleanup into a second, masking error.
      await post('/db/import-file-cancel', { jobId: lastJob });
      await expect
        .poll(async () => (await post('/db/import-file-status', { jobId: lastJob })).phase, {
          timeout: 30_000,
        })
        .toMatch(/^(done|stopped|failed)$/);
    }
    if (key) await post('/db/delete', { key });
    rmSync(directory, { recursive: true, force: true });
  }
});
