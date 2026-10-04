import { expect, test, type Page } from '@playwright/test';
import type { AppRepositories } from '../src/persistence/types';

const READY = 'html[data-kingfisher-ready="true"]';
type ReadProbeWindow = Window & {
  __kingfisher: AppRepositories;
  __chapterReadStarted?: boolean;
  __releaseChapterRead?: () => void;
};

async function play(page: Page, from: string, to: string) {
  await page.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await page.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

async function saved(page: Page) {
  await expect(page.getByText('· unsaved', { exact: true })).toBeVisible();
  await expect(page.getByText('· saved', { exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kingfisher.preferences', JSON.stringify({ state: {}, version: 7 }));
  });
  await page.goto('/studies');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: 'New study', exact: true }).click();
  await page.getByRole('dialog', { name: 'New study' }).getByLabel('Title').fill('Read ownership');
  await page.getByRole('button', { name: 'Create study' }).click();
  for (const [title, from, to] of [
    ['Original', 'd2', 'd4'],
    ['Target', 'e2', 'e4'],
  ] as const) {
    await page.getByRole('button', { name: 'New chapter', exact: true }).click();
    await page.getByRole('dialog', { name: 'New chapter' }).getByLabel('Title').fill(title);
    await page.getByRole('button', { name: 'Create chapter' }).click();
    // An empty board alone is not proof that the new document is loaded.
    await expect(page.locator('footer').filter({ hasText: 'half-moves' })).toContainText(title);
    await expect(page.getByText('0 half-moves')).toBeVisible();
    await play(page, from, to);
    await saved(page);
  }
  await page.getByRole('button', { name: /Original 1 move$/ }).click();
  await expect(page.getByRole('button', { name: 'd4', exact: true })).toBeVisible();
  await expect(page.locator('footer').filter({ hasText: 'half-moves' })).toContainText('Original');
  await page.getByRole('button', { name: 'End of line (End)', exact: true }).click();
  await expect(page.locator('[data-fen-tooltip]')).toContainText(' b ');
});

for (const waitForSave of [false, true]) {
  test(`an edit during a delayed chapter read cancels the switch${waitForSave ? ' after cache refresh' : ''} and survives reload`, async ({
    page,
  }) => {
    await page.evaluate(async () => {
      const probe = window as unknown as ReadProbeWindow;
      const repository = probe.__kingfisher.studies;
      const [study] = await repository.list();
      const target = (await repository.get(study!.id))!.chapters.find(
        (chapter) => chapter.title === 'Target',
      )!;
      const read = repository.getChapter.bind(repository);
      const gate = new Promise<void>((resolve) => {
        probe.__releaseChapterRead = resolve;
      });
      // Delay the I/O boundary; the real repository and workspace remain in use.
      repository.getChapter = async (id) => {
        const result = await read(id);
        if (id === target.id) {
          probe.__chapterReadStarted = true;
          await gate;
        }
        return result;
      };
    });
    await page.getByRole('button', { name: /Target 1 move$/ }).click();
    await page.waitForFunction(() => (window as unknown as ReadProbeWindow).__chapterReadStarted);
    await play(page, 'g8', 'f6');
    await expect(page.getByRole('button', { name: 'Nf6', exact: true })).toBeVisible();
    if (waitForSave) await saved(page);
    await page.evaluate(() => (window as unknown as ReadProbeWindow).__releaseChapterRead!());
    await expect(page.getByRole('button', { name: /Original 2 moves$/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Nf6', exact: true })).toBeVisible();
    await expect(page.getByText('· saved', { exact: true })).toBeVisible();
    await page.reload();
    await page.locator(READY).waitFor();
    await expect(page.getByRole('button', { name: 'Nf6', exact: true })).toBeVisible();
  });
}

test('a failed chapter read keeps the current board and chapter selection', async ({ page }) => {
  await page.evaluate(async () => {
    const repository = (window as unknown as ReadProbeWindow).__kingfisher.studies;
    const [study] = await repository.list();
    const target = (await repository.get(study!.id))!.chapters.find(
      (chapter) => chapter.title === 'Target',
    )!;
    const read = repository.getChapter.bind(repository);
    repository.getChapter = async (id) => {
      if (id === target.id) throw new Error('Injected chapter read failure');
      return read(id);
    };
  });
  await page.getByRole('button', { name: /Target 1 move$/ }).click();
  await expect(page.getByText('Injected chapter read failure', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Original 1 move$/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(page.getByRole('button', { name: 'd4', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'e4', exact: true })).toBeHidden();
  await expect(page.locator('footer').filter({ hasText: 'half-moves' })).toContainText('Original');
});
