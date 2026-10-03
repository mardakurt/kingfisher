import { expect, test, type Page } from '@playwright/test';

/** A recorded colour card, solely a media fixture; never presented as a chess course. */
async function testVideo(page: Page) {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#345678';
    context.fillRect(0, 0, 160, 90);
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const complete = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    });
    const draw = setInterval(() => context.fillRect(0, 0, 160, 90), 100);
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, 2500));
    recorder.stop();
    clearInterval(draw);
    const blob = await complete;
    stream.getTracks().forEach((track) => track.stop());
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  return { name: 'lesson.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) };
}

test('a local video follows the chapter cues, seeks backwards and keeps cues through reload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/studies');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Start a study' }).first().click();
  const study = page.getByRole('dialog', { name: 'New study' });
  await study.getByLabel('Title').fill('Video course');
  await study.getByRole('button', { name: 'Create study', exact: true }).click();
  const rail = page.locator('[data-workspace-rail]').first();
  await rail.getByRole('button', { name: 'New chapter' }).click();
  const chapter = page.getByRole('dialog', { name: 'New chapter' });
  await chapter.getByLabel('Title').fill('Lesson one');
  await chapter
    .getByRole('button', { name: /Create|Add/ })
    .first()
    .click();
  await expect(page.locator('[data-study-save-status]')).toHaveText('Saved');
  await page.getByRole('button', { name: 'Video lesson', exact: true }).click();
  const lesson = page.locator('[data-video-lesson]');
  const fixture = await testVideo(page);
  await lesson.getByLabel('Choose lesson video').setInputFiles(fixture);
  const video = lesson.locator('video');
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState))
    .toBeGreaterThanOrEqual(1);
  await lesson.getByRole('button', { name: 'Cue current position' }).click();
  // A cue-only edit must survive even when reloading before the autosave debounce.
  await page.reload();
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Video lesson', exact: true }).click();
  await expect(lesson.getByRole('list', { name: 'Video cues' }).getByRole('listitem')).toHaveCount(
    1,
  );
  await lesson.getByLabel('Choose lesson video').setInputFiles(fixture);
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState))
    .toBeGreaterThanOrEqual(1);
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await board.getByRole('gridcell', { name: /^e2,/ }).click();
  await board.getByRole('gridcell', { name: /^e4,/ }).click();
  await lesson.getByLabel('Cue time (seconds)').fill('0.3');
  await lesson.getByRole('button', { name: 'Cue current position' }).click();
  await board.getByRole('gridcell', { name: /^e7,/ }).click();
  await board.getByRole('gridcell', { name: /^e5,/ }).click();
  await lesson.getByLabel('Cue time (seconds)').fill('1.2');
  await lesson.getByRole('button', { name: 'Cue current position' }).click();
  const cues = lesson.getByRole('list', { name: 'Video cues' });
  await expect(cues.getByRole('listitem')).toHaveCount(3);

  await cues.getByRole('button', { name: 'Jump to 0:00.0 Starting position', exact: true }).click();
  await video.evaluate((element: HTMLVideoElement) => element.play());
  await expect(board.getByRole('gridcell', { name: /^e5,.*black pawn/i })).toBeVisible();
  await video.evaluate((element: HTMLVideoElement) => element.pause());
  await cues.getByRole('button', { name: 'Jump to 0:00.3 1. e4', exact: true }).click();
  await expect(board.getByRole('gridcell', { name: /^e7,.*black pawn/i })).toBeVisible();
  await lesson.getByLabel('Follow video on the board').uncheck();
  await video.evaluate((element: HTMLVideoElement) => {
    element.currentTime = 1.5;
  });
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
    .toBeGreaterThan(1.4);
  await expect(board.getByRole('gridcell', { name: /^e7,.*black pawn/i })).toBeVisible();
  await lesson.getByLabel('Follow video on the board').check();
  await expect(board.getByRole('gridcell', { name: /^e5,.*black pawn/i })).toBeVisible();

  await lesson.getByLabel('Cue time (seconds)').fill('-1');
  await expect(lesson.getByRole('button', { name: 'Cue current position' })).toBeDisabled();
  await expect(page.locator('[data-study-save-status]')).toHaveText('Saved');
  await page.screenshot({ path: '/tmp/kingfisher-145-video-desktop.png' });
  await page.reload();
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Video lesson', exact: true }).click();
  await expect(lesson).toContainText('Attach lesson.webm');
  await expect(cues.getByRole('listitem')).toHaveCount(3);
  await expect(video).toHaveCount(0);
  await lesson.getByLabel('Choose lesson video').setInputFiles({ ...fixture, name: 'wrong.webm' });
  await expect(lesson.getByRole('alert')).toContainText('This chapter uses lesson.webm');
  await lesson.getByLabel('Choose lesson video').setInputFiles(fixture);
  await expect(video).toHaveCount(1);
  await lesson.getByRole('button', { name: 'Remove cue for 1… e5' }).click();
  await expect(cues.getByRole('listitem')).toHaveCount(2);
  await lesson.getByRole('button', { name: 'Clear lesson and cues' }).click();
  await expect(video).toHaveCount(0);
  await expect(cues).toHaveCount(0);
  await expect(lesson).not.toContainText('Attach lesson.webm');
  // Changing chapters must detach the video and keep each chapter's own cues.
  await lesson.getByLabel('Choose lesson video').setInputFiles(fixture);
  await lesson.getByLabel('Cue time (seconds)').fill('0');
  await lesson.getByRole('button', { name: 'Cue current position' }).click();
  await rail.getByRole('button', { name: 'New chapter' }).click();
  const second = page.getByRole('dialog', { name: 'New chapter' });
  await second.getByLabel('Title').fill('Lesson two');
  await second
    .getByRole('button', { name: /Create|Add/ })
    .first()
    .click();
  await expect(lesson).toBeVisible();
  await expect(video).toHaveCount(0);
  await expect(cues).toHaveCount(0);
  await rail.getByRole('button', { name: /1\. Lesson one/ }).click();
  await expect(cues.getByRole('listitem')).toHaveCount(1);
  await expect(video).toHaveCount(0);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(lesson.getByLabel('Choose lesson video')).toBeVisible();
    await expect(lesson.getByRole('button', { name: 'Clear lesson and cues' })).toBeVisible();
    await lesson.getByLabel('Choose lesson video').scrollIntoViewIfNeeded();
    await expect(lesson.getByLabel('Choose lesson video')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `/tmp/kingfisher-145-video-${viewport.width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('kingfisher.preferences')!);
    stored.state = { ...stored.state, theme: 'dark' };
    localStorage.setItem('kingfisher.preferences', JSON.stringify(stored));
  });
  await page.reload();
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Video lesson', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(lesson.getByLabel('Choose lesson video')).toBeVisible();
  await page.screenshot({ path: '/tmp/kingfisher-145-video-dark.png' });
});
