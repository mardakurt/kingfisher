import { expect, test } from '@playwright/test';

/*
  The feedback dialog, driven end to end in a real browser with the route
  stubbed at the network boundary. 1.1.1 shipped a sink that called the
  built-in `fetch` as a method of its own object; Chromium and WebKit refuse
  that with "Illegal invocation", so every Send from the application failed
  while a curl against the route — and the Node unit tests — succeeded.
  Only a browser can prove the click reaches the wire.
*/
test('Send feedback posts the dialog contents to the route and shows the reference', async ({
  page,
}) => {
  let posted: Record<string, unknown> | null = null;
  await page.route('**/api/feedback', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          directSubmission: true,
          categories: ['broken', 'data-issue', 'confusing', 'improvement', 'general'],
          maxMessage: 4000,
        }),
      });
      return;
    }
    posted = request.postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reference: 'kf-e2e-reference' }),
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Send feedback' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'general' }).check();
  await dialog.getByRole('textbox').fill('The evaluation bar is the wrong way up after a flip.');
  await dialog.getByRole('switch', { name: 'Include current position' }).click();
  /* The route refuses a form filled in under 1.5 s. */
  await page.waitForTimeout(1_600);
  await dialog.getByRole('button', { name: 'Send feedback' }).click();

  await expect(dialog.getByText('Thanks. Your feedback was sent.')).toBeVisible();
  await expect(dialog.getByText('kf-e2e-reference')).toBeVisible();
  expect(posted).not.toBeNull();
  const body = posted as unknown as Record<string, unknown>;
  expect(body.category).toBe('general');
  expect(body.message).toBe('The evaluation bar is the wrong way up after a flip.');
  expect(body.surface).toBe('web');
  expect(typeof body.openedAtMs).toBe('number');
  expect(body.currentFen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
});
