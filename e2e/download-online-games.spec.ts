import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * ChessBase's "Download Online Games", against a stubbed Chess.com (the HTTP
 * boundary, not the downloader). Two monthly archives; the cap keeps the
 * newest games, and a Chess960 game in them is refused with its reason.
 */
const game = (n: number, date: string, variant = '') =>
  [
    `[Event "Live Chess"]`,
    `[Site "Chess.com"]`,
    `[Date "${date}"]`,
    `[White "kf_test_player"]`,
    `[Black "opponent${n}"]`,
    `[Result "1-0"]`,
    ...(variant
      ? [
          `[Variant "${variant}"]`,
          `[SetUp "1"]`,
          `[FEN "rkbnrnqb/pppppppp/8/8/8/8/PPPPPPPP/RKBNRNQB w KQkq - 0 1"]`,
        ]
      : []),
    '',
    `1. e4 e5 2. Nf3 Nc6 ${n === 1 ? '3. Bb5' : '3. Bc4'} 1-0`,
  ].join('\n');

test('downloads the newest public games of a Chess.com user into My games', async ({ page }) => {
  test.setTimeout(120_000);
  const today = new Date();
  const ym = (offset: number) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - offset, 1));
    return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  const day = (offset: number, dd: string) => `${ym(offset).replace('/', '.')}.${dd}`;
  await page.route('https://api.chess.com/pub/player/kf_test_player/games/archives', (route) =>
    route.fulfill({
      json: {
        archives: [ym(1), ym(0)].map(
          (month) => `https://api.chess.com/pub/player/kf_test_player/games/${month}`,
        ),
      },
    }),
  );
  await page.route(`https://api.chess.com/pub/player/kf_test_player/games/${ym(0)}/pgn`, (route) =>
    route.fulfill({
      body: [game(4, day(0, '01')), game(5, day(0, '02'), 'Chess960')].join('\n\n'),
    }),
  );
  await page.route(`https://api.chess.com/pub/player/kf_test_player/games/${ym(1)}/pgn`, (route) =>
    route.fulfill({
      body: [game(1, day(1, '01')), game(2, day(1, '02')), game(3, day(1, '03'))].join('\n\n'),
    }),
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/databases');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.locator('[data-download-online]').click();
  const dialog = page.getByRole('dialog', { name: 'Download online games' });
  await dialog.getByRole('button', { name: 'Chess.com', exact: true }).click();
  await dialog.getByLabel('Username').fill('kf_test_player');
  await dialog.getByLabel('At most').fill('3');
  await dialog.locator('[data-download-games]').click();

  await page.waitForURL(/\/games\?player=kf_test_player/);
  await expect(page.getByText('2 games by kf_test_player added to My games.')).toBeVisible();
  await expect(
    page.getByText(
      /3 downloaded from Chess\.com\. 1 Chess960 game not imported: Kingfisher plays standard chess only/,
    ),
  ).toBeVisible();
  // The newest three were the Chess960 game, opponent4 and opponent3; opponent1 and 2 were cut.
  const rows = page.locator('main table tbody tr');
  await expect(rows).toHaveCount(2);
  // Newest at the top of the list the download opens, as the dialog says it keeps them.
  await expect(rows.nth(0)).toContainText('opponent4');
  await expect(rows.nth(1)).toContainText('opponent3');
});
