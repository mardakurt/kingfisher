import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('MultiPV changes apply to a running engine and leave a stopped engine stopped', async ({
  page,
}) => {
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('tab', { name: 'Engine', exact: true }).click();
  const panel = page.locator('[data-engine-panel-fen]');
  await panel.getByRole('button', { name: 'Start analysis (E)', exact: true }).click();
  await expect(panel.locator('[data-engine-line]')).toHaveCount(3, { timeout: 30_000 });
  await panel.getByRole('button', { name: '1', exact: true }).click();
  await expect(panel.locator('[data-engine-line]')).toHaveCount(1, { timeout: 15_000 });
  await panel.getByRole('button', { name: '5', exact: true }).click();
  await expect(panel.locator('[data-engine-line]')).toHaveCount(5, { timeout: 15_000 });
  await panel.getByRole('button', { name: 'Stop analysis (E)', exact: true }).click();
  await panel.getByRole('button', { name: '2', exact: true }).click();
  await expect(
    panel.getByRole('button', { name: 'Start analysis (E)', exact: true }),
  ).toBeEnabled();
  await expect(panel.getByRole('button', { name: 'Stop analysis (E)', exact: true })).toHaveCount(
    0,
  );
});

test('the evaluation bands never fade while a real engine follows a game', async ({ page }) => {
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  // A sourceable, complete game with the author's original annotations — or,
  // with KF_EVAL_BAR_PGN, another real game (the closure audit used Giri–
  // Vachier-Lagrave, Tata Steel 2021, from Lichess's CC0 broadcast archive).
  const pgn = readFileSync(
    process.env.KF_EVAL_BAR_PGN || 'public/data/annotated/capablanca-chess-fundamentals-1921.pgn',
    'utf8',
  ).split(/\n(?=\[Event )/)[0]!;
  await page.getByRole('button', { name: 'Import PGN or FEN', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(pgn);
  await dialog.getByRole('button', { name: 'Import games', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('tab', { name: 'Engine', exact: true }).click();
  await page.getByRole('button', { name: 'Start analysis (E)', exact: true }).click();
  const bar = page.locator('[data-evaluation-bar]');
  await expect(bar.locator('[data-evaluation-bar-label]')).toHaveText(/^[+-]?\d|M/, {
    timeout: 30_000,
  });
  await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('[data-evaluation-bar]')!;
    const samples: { opacity: number; pending: boolean; label: string; description: string }[] = [];
    const record = () => {
      if (samples.length < 6000)
        samples.push({
          opacity: Number(getComputedStyle(bar).opacity),
          pending: bar.dataset.catchingUp === 'true',
          label: bar.querySelector('[data-evaluation-bar-label]')?.textContent ?? '',
          description: bar.getAttribute('aria-label') ?? '',
        });
    };
    const observer = new MutationObserver(record);
    observer.observe(bar, { attributes: true, childList: true, subtree: true });
    let frame = 0;
    const tick = () => {
      record();
      frame = requestAnimationFrame(tick);
    };
    tick();
    Object.assign(window, {
      __finishEvaluationSamples: () => {
        observer.disconnect();
        cancelAnimationFrame(frame);
        record();
        return samples;
      },
    });
  });
  for (let move = 0; move < 20; move += 1)
    await page.getByRole('button', { name: 'Next move (→)', exact: true }).click();
  for (let move = 0; move < 10; move += 1)
    await page.getByRole('button', { name: 'Previous move (←)', exact: true }).click();
  await expect(bar).not.toHaveAttribute('data-catching-up', 'true', { timeout: 30_000 });
  const samples = await page.evaluate(() =>
    (
      window as unknown as {
        __finishEvaluationSamples: () => {
          opacity: number;
          pending: boolean;
          label: string;
          description: string;
        }[];
      }
    ).__finishEvaluationSamples(),
  );
  const pending = samples.filter((sample) => sample.pending);
  expect(pending.length, 'the test must observe actual engine catch-up').toBeGreaterThan(0);
  expect(samples.every((sample) => sample.opacity === 1)).toBe(true);
  expect(pending.every((sample) => sample.label === '…')).toBe(true);
  expect(pending.every((sample) => sample.description.includes('previous position'))).toBe(true);
  // Settled, the engine's evidence belongs to the position on the board.
  const boardFen = (await page.locator('[data-fen-tooltip]').first().textContent())?.trim();
  await expect(page.locator('[data-engine-panel-fen]')).toHaveAttribute(
    'data-engine-panel-fen',
    boardFen!,
    { timeout: 30_000 },
  );
});
