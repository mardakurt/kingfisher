/**
 * A database's annotators, sources and teams (ChessBase's Annotator, Sources
 * and Teams tabs), read from the games' own headers, each opening its games.
 */

import { expect, test } from '@playwright/test';
import { settingsButton } from './support/settings-control';

const PGN = `[Title "A recorded title"]
[Event "Tagged A"]
[White "Alpha"]
[Black "Beta"]
[Annotator "Capablanca"]
[Source "Chess Fundamentals"]
[WhiteTeam "Havana"]
1. e4 e5 *

[Title "A recorded title extended"]
[Event "Tagged B"]
[White "Gamma"]
[Black "Delta"]
[Annotator "Capablanca, J"]
[Source "Manual"]
[BlackTeam "Havana"]
1. d4 d5 *

[Event "No tags"]
[White "Epsilon"]
[Black "Zeta"]
1. c4 {Annotator Capablanca, Havana} e5 *`;

test('the annotators, sources and teams of My games, each leading to exactly its games', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(PGN);
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('3 games added to your database.')).toBeVisible();

  await page.goto('/databases?db=local');
  const tags = page.locator('[data-collection-tags]');
  const annotators = tags.locator('[data-tags-list="annotators"] li');
  // Two annotators, each named as written; the comment's words are no tag.
  await expect(annotators).toHaveCount(2);
  await expect(tags).toContainText('1 game of 3 names no annotator.');
  await tags.getByRole('button', { name: /^Teams/ }).click();
  await expect(tags.locator('[data-tags-list="teams"] li')).toHaveCount(1);
  await expect(tags.locator('[data-tags-list="teams"]')).toContainText('Havana2 games');

  await tags.getByRole('button', { name: /^Annotators/ }).click();
  // "Capablanca" exactly — not "Capablanca, J", which contains its letters.
  await tags.locator('[data-tag-name="Capablanca"]').click();
  await expect(page).toHaveURL(/\/games/);
  await expect(page).not.toHaveURL(/annotator=/);
  await expect(page.getByText(/1 of 3 games read contain it/)).toBeVisible();
  await expect(page.locator('[data-library-list]')).toContainText('Tagged A');
  await expect(page.locator('[data-library-list]')).not.toContainText('Tagged B');
  await page.goto('/databases?db=local');
  await tags.getByRole('button', { name: /^Game titles/ }).click();
  await expect(tags.locator('[data-tags-list="titles"] li')).toHaveCount(2);
  await expect(tags).toContainText('1 game of 3 names no recorded title.');
  await tags.locator('[data-tag-name="A recorded title"]').click();
  await expect(page.getByText(/1 of 3 games read contain it/)).toBeVisible();
  await expect(page.locator('[data-library-list]')).toContainText('Tagged A');
  await expect(page.locator('[data-library-list]')).not.toContainText('Tagged B');
  // Repeatedly leave and return: a title must replace the previous metadata search.
  for (const title of [
    'A recorded title extended',
    'A recorded title',
    'A recorded title extended',
    'A recorded title',
  ]) {
    await page.goBack();
    await tags.getByRole('button', { name: /^Game titles/ }).click();
    await tags.locator(`[data-tag-name="${title}"]`).click();
    await expect(page).not.toHaveURL(/title=/);
    await expect(page.getByText(/1 of 3 games read contain it/)).toBeVisible();
    await expect(page.locator('[data-library-list]')).toContainText(
      title.endsWith('extended') ? 'Tagged B' : 'Tagged A',
    );
    await expect(page.locator('[data-library-list]')).not.toContainText(
      title.endsWith('extended') ? 'Tagged A' : 'Tagged B',
    );
  }
});

test('a companion collection lists its annotators from its stored PGN too', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await settingsButton(page).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Companion' }).click();
  await settings.getByLabel('Pairing address').fill('http://127.0.0.1:4338#token=phase8-e2e-token');
  await settings.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(settings.getByText(/Paired with/)).toBeVisible();
  const name = `Tags E2E ${Date.now()}`;
  await settings.getByPlaceholder('New collection name').fill(name);
  await settings.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(settings.getByText(name).first()).toBeVisible();
  await settings.getByPlaceholder('Paste a PGN collection…').fill(PGN);
  await settings.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText(/\b3 games imported/)).toBeVisible();
  await settings.getByRole('button', { name: 'Close' }).click();

  await page.goto('/databases');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page
    .locator('main')
    .getByRole('button', { name: new RegExp(name) })
    .first()
    .click();
  const tags = page.locator('[data-collection-tags]');
  await expect(tags.locator('[data-tags-list="annotators"] li')).toHaveCount(2);
  await tags.getByRole('button', { name: /^Sources/ }).click();
  await expect(tags.locator('[data-tags-list="sources"]')).toContainText('Chess Fundamentals');
  await tags.getByRole('button', { name: /^Game titles/ }).click();
  await expect(tags.locator('[data-tags-list="titles"] li')).toHaveCount(2);
  await tags.locator('[data-tag-name="A recorded title"]').click();
  await expect(page.getByText(/1 of 3 games read contain it/)).toBeVisible();
  await expect(page.locator('[data-library-list]')).toContainText('Tagged A');
  await expect(page.locator('[data-library-list]')).not.toContainText('Tagged B');
});
