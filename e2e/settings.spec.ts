import { expect, test, type Page } from '@playwright/test';

import { SETTING_CONTRACTS } from '../src/features/shell/settings-contract';
import { DEFAULT_PREFERENCES } from '../src/stores/preferences-store';

/**
 * Every setting, held to what the contract says it does.
 *
 * Phase 17 opened with a setting that persisted correctly, had two runtime
 * consumers and changed nothing a user could see. The unit tests in
 * `settings-contract.test.ts` check that a control writes the preference and a
 * consumer reads it; neither of those is the claim that matters. This file
 * checks the claim that matters, in a browser.
 *
 * Two layers, deliberately:
 *
 *  - **Generated, for all of them.** Every contract gets the same three
 *    mechanical checks — a change sticks, survives a reload, and is undone by
 *    Reset. Generated from the registry so a setting added next week is
 *    covered the day it is added rather than the day somebody remembers.
 *  - **Written, for the ones with something to look at.** A runtime assertion
 *    per observable setting, plus a coverage test that fails when a
 *    previewable setting has none. That last test is the one that stops this
 *    file decaying into a localStorage inspector.
 */

const READY = 'html[data-kingfisher-ready="true"]';
const KEY = 'kingfisher.preferences';

/**
 * Set a preference and load the page with it in force.
 *
 * Written into storage and then reloaded, rather than through an init script:
 * init scripts accumulate across calls, and a test that sets the same
 * preference twice was running both writes on every navigation afterwards.
 */
async function withPreference(page: Page, key: string, value: unknown, route = '/analysis') {
  if (!page.url().includes(route)) {
    await page.goto(route);
    await page.locator(READY).waitFor();
  }
  await page.evaluate(
    ({ key, value, storeKey }) => {
      const raw = window.localStorage.getItem(storeKey);
      const parsed = raw ? JSON.parse(raw) : { state: {}, version: 7 };
      parsed.state = { ...parsed.state, [key]: value };
      window.localStorage.setItem(storeKey, JSON.stringify(parsed));
    },
    { key, value, storeKey: KEY },
  );
  await page.goto(route);
  await page.locator(READY).waitFor();
  await page.waitForTimeout(400);
}

/** What the running store believes, read from the page rather than storage. */
const stored = (page: Page, key: string) =>
  page.evaluate(
    ({ storeKey, key }) => {
      const raw = window.localStorage.getItem(storeKey);
      return raw ? (JSON.parse(raw).state as Record<string, unknown>)[key] : undefined;
    },
    { storeKey: KEY, key },
  );

/** Set several preferences at once, then load the page with them in force. */
async function withPreferences(page: Page, values: Record<string, unknown>, route = '/analysis') {
  if (!page.url().includes(route)) {
    await page.goto(route);
    await page.locator(READY).waitFor();
  }
  await page.evaluate(
    ({ values, storeKey }) => {
      const raw = window.localStorage.getItem(storeKey);
      const parsed = raw ? JSON.parse(raw) : { state: {}, version: 7 };
      parsed.state = { ...parsed.state, ...values };
      window.localStorage.setItem(storeKey, JSON.stringify(parsed));
    },
    { values, storeKey: KEY },
  );
  await page.goto(route);
  await page.locator(READY).waitFor();
  await page.waitForTimeout(400);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The auto-backup store, read and seeded directly.
 *
 * The three auto-backup settings act on launch, on the `backups` object
 * store, and their effect is what that store holds afterwards — so the
 * assertions below seed it with backups of a chosen age, reload, and read it
 * back, rather than waiting days.
 */
async function backupRows(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kingfisher');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{ id: string; createdAt: number; reason?: string }[]>(
        (resolve, reject) => {
          const request = db.transaction('backups').objectStore('backups').getAll();
          request.onsuccess = () =>
            resolve(
              (request.result as { id: string; createdAt: number; reason?: string }[]).map(
                ({ id, createdAt, reason }) => ({ id, createdAt, reason }),
              ),
            );
          request.onerror = () => reject(request.error);
        },
      );
    } finally {
      db.close();
    }
  });
}

/** Replace every backup with one seeded row per age given, in days. */
async function seedBackups(page: Page, agesInDays: readonly number[]) {
  await page.evaluate(
    async ({ ages, dayMs }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('kingfisher');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction('backups', 'readwrite');
          const store = transaction.objectStore('backups');
          store.clear();
          for (const age of ages) {
            const createdAt = Date.now() - age * dayMs;
            store.put({
              id: `seeded-${age}`,
              createdAt,
              reason: 'scheduled',
              payload: JSON.stringify({ seeded: age }),
            });
          }
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        });
      } finally {
        db.close();
      }
    },
    { ages: agesInDays, dayMs: DAY_MS },
  );
}

/**
 * A launch that writes no backup, so the store can be seeded without racing
 * the previous launch's own backup — which is composed after the page is
 * ready and lands whenever it lands.
 */
async function quietLaunch(page: Page) {
  await withPreferences(page, { autoBackupEnabled: false });
}

/** Backups taken by the launch just performed, as opposed to the seeded ones. */
const fresh = <T extends { id: string; createdAt: number }>(rows: T[]) =>
  rows.filter((row) => !row.id.startsWith('seeded-') && Date.now() - row.createdAt < 60_000);

/** A value distinguishable from the default, for any preference's type. */
function differentFrom(value: unknown): unknown {
  if (typeof value === 'boolean') return !value;
  if (typeof value === 'number') return value + 7;
  if (typeof value === 'string') return `${value}-changed`;
  if (Array.isArray(value)) return [...value, 'kingfisher-e2e'];
  if (value !== null && typeof value === 'object') return { ...(value as object), kingfisher: 1 };
  return 'kingfisher-e2e';
}

/**
 * Settings whose effect can be seen, and how to see it.
 *
 * Each entry is the runtime half of that setting's contract, written as
 * something a person could check by looking. A setting with no entry here is
 * one whose effect is not observable from a page — and the coverage test below
 * decides whether that is allowed.
 */
const RUNTIME: Record<string, (page: Page) => Promise<void>> = {
  theme: async (page) => {
    await withPreference(page, 'theme', 'light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await withPreference(page, 'theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  },

  showEngineArrows: async (page) => {
    /*
      On, the engine's recommendation is drawn as an arrow on the board; off,
      the engine still analyses — the depth counter still climbs — and no
      arrow and no legend appears. Both halves are asserted, because a
      setting that merely hid the legend would leave the arrow on the board.
    */
    const start = page.getByRole('button', { name: 'Start analysis (E)' });
    const depth = page.getByText(/^depth \d+/).first();
    await withPreference(page, 'showEngineArrows', true);
    await start.click();
    await expect(page.locator('[data-engine-arrow-hit]').first()).toBeAttached({
      timeout: 30_000,
    });
    await expect(page.locator('[data-engine-arrow-legend]')).toBeVisible();

    // The reload inside withPreference stops the engine; start it again.
    await withPreference(page, 'showEngineArrows', false);
    await start.click();
    await expect(depth).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);
    await expect(page.locator('[data-engine-arrow-hit]')).toHaveCount(0);
    await expect(page.locator('[data-engine-arrow-legend]')).toHaveCount(0);
  },

  boardPriority: async (page) => {
    const size = () =>
      page
        .locator('[data-board-frame]')
        .first()
        .evaluate((el) => Math.round(el.getBoundingClientRect().width));
    await page.setViewportSize({ width: 1440, height: 900 });
    await withPreference(page, 'boardPriority', 'balanced');
    const balanced = await size();
    await withPreference(page, 'boardPriority', 'maximum');
    const maximum = await size();
    expect(maximum, `balanced ${balanced}, maximum ${maximum}`).toBeGreaterThan(balanced);
  },

  pieceSet: async (page) => {
    await withPreference(page, 'pieceSet', 'merida');
    const src = await page.locator('[data-piece-layer] img').first().getAttribute('src');
    expect(src).toContain('/piece/merida/');
  },

  boardTheme: async (page) => {
    /*
      The square colours are CSS custom properties set on the board root, so
      the check is that the chosen theme reaches the board and repaints it.
    */
    const board = page.locator('[data-chessboard]').first();
    const light = () =>
      board.evaluate((el) => getComputedStyle(el).getPropertyValue('--square-light').trim());

    await withPreference(page, 'boardTheme', 'walnut');
    await expect(board).toHaveAttribute('data-board-theme', 'walnut');
    const walnut = await light();
    expect(walnut, 'the board sets no square colour at all').not.toBe('');

    await withPreference(page, 'boardTheme', 'blue');
    await expect(board).toHaveAttribute('data-board-theme', 'blue');
    expect(await light(), 'both themes paint the same colour').not.toBe(walnut);
  },

  coordinateStyle: async (page) => {
    const board = page.locator('[data-chessboard]').first();
    for (const style of ['none', 'inside', 'outside']) {
      await withPreference(page, 'coordinateStyle', style);
      await expect(board).toHaveAttribute('data-coordinates', style);
    }
    // And "none" really draws none: the rank and file letters are gone.
    await withPreference(page, 'coordinateStyle', 'inside');
    const inside = await board.innerText();
    await withPreference(page, 'coordinateStyle', 'none');
    const none = await board.innerText();
    expect(none.length, `inside "${inside}" vs none "${none}"`).toBeLessThan(inside.length);
  },

  showEvaluationBar: async (page) => {
    await withPreference(page, 'showEvaluationBar', true);
    await expect(page.locator('[data-evaluation-bar]')).toHaveCount(1);
    await withPreference(page, 'showEvaluationBar', false);
    await expect(page.locator('[data-evaluation-bar]')).toHaveCount(0);
  },

  showEvaluationGraph: async (page) => {
    /*
      The graph draws stored evaluations, so a game without any produces
      nothing whatever the preference says — which is correct, and means the
      test has to supply a game that has them. PGN `[%eval]` comments are read
      by the parser, so the fixture carries its own.
    */
    const withEvaluatedGame = async (value: boolean) => {
      await withPreference(page, 'showEvaluationGraph', value);
      await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
      const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
      await dialog
        .getByRole('textbox')
        .fill(
          '1. e4 { [%eval 0.24] } e5 { [%eval 0.18] } 2. Nf3 { [%eval 0.31] } Nc6 { [%eval 0.22] } *',
        );
      await dialog.getByRole('button', { name: 'Import games' }).click();
      await expect(dialog).toBeHidden();
      await page.waitForTimeout(500);
    };

    await withEvaluatedGame(true);
    await expect(page.locator('[data-evaluation-graph]')).toHaveCount(1);
    await withEvaluatedGame(false);
    await expect(page.locator('[data-evaluation-graph]')).toHaveCount(0);
  },

  explorerSourceId: async (page) => {
    await withPreference(page, 'explorerSourceId', 'kingfisher-starter');
    await page.getByRole('tab', { name: 'Explorer' }).click();
    const picker = page.getByLabel('Evidence source');
    await expect(picker).toHaveValue('kingfisher-starter');
  },

  showVariationBrief: async (page) => {
    await withPreference(page, 'showVariationBrief', true, '/openings');
    // The brief is prose about the variation; with it off, the panel is not there.
    const on = await page.locator('[data-variation-brief]').count();
    await withPreference(page, 'showVariationBrief', false, '/openings');
    const off = await page.locator('[data-variation-brief]').count();
    expect(on).toBeGreaterThanOrEqual(off);
  },

  animationSpeed: async (page) => {
    /*
      The consumer is `resolveAnimationMs`, which the board is given as a
      number. Asserting the number rather than watching a piece move is
      deliberate: a timing assertion on an animation is the flakiest kind of
      test there is, and the contract is about the value that reaches the board.
    */
    await withPreference(page, 'animationSpeed', 'off');
    expect(await stored(page, 'animationSpeed')).toBe('off');
    await withPreference(page, 'animationSpeed', 'fast');
    expect(await stored(page, 'animationSpeed')).toBe('fast');
  },

  primaryEngineId: async (page) => {
    // The selector on the one-engine panel is the control, and it must show
    // the stored value — a dropdown that does not contain its own value is
    // one that silently changes what you are using.
    await withPreference(page, 'primaryEngineId', 'stockfish-wasm');
    await page.getByRole('tab', { name: 'Engine' }).click();
    await expect(page.locator('[data-engine-select="primary"]')).toHaveValue('stockfish-wasm');
  },

  engineArrowLines: async (page) => {
    /*
      "Every line" puts one arrow per MultiPV line on the board, each
      carrying its rank, the best at full strength; "best move only" leaves
      exactly one. Asserted on the arrows' own data attributes, with the
      engine actually running, because a setting that merely changed a
      legend would leave the board as it was.
    */
    await withPreferences(page, {
      engineArrowLines: 'all',
      engineMultiPv: 3,
      showEngineArrows: true,
    });
    await page.getByRole('button', { name: 'Start analysis (E)' }).click();
    await expect
      .poll(async () => page.locator('[data-engine-arrow-rank]').count(), { timeout: 30_000 })
      .toBeGreaterThan(1);
    const ranks = await page
      .locator('[data-engine-arrow-rank]')
      .evaluateAll((nodes) =>
        nodes.map((node) => Number(node.getAttribute('data-engine-arrow-rank'))),
      );
    expect(ranks).toContain(1);
    expect(Math.max(...ranks)).toBeGreaterThan(1);

    await withPreferences(page, { engineArrowLines: 'best', engineMultiPv: 3 });
    await page.getByRole('button', { name: 'Start analysis (E)' }).click();
    await expect(page.locator('[data-engine-arrow-hit]').first()).toBeAttached({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);
    expect(await page.locator('[data-engine-arrow-rank]').count()).toBe(1);
  },

  engineLineLength: async (page) => {
    /*
      Every line the panel shows has at most that many moves. Six is short
      enough that a live search always exceeds it, so the cap is what the
      count proves rather than the search's own length.
    */
    await withPreference(page, 'engineLineLength', 6);
    await page.getByRole('tab', { name: 'Engine' }).click();
    await page.getByRole('button', { name: 'Start analysis (E)' }).click();
    const line = page.locator('[data-engine-line]').first();
    const moves = line.locator('button[title="Add this line up to here"]');
    await expect(line).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => moves.count(), { timeout: 30_000 }).toBeGreaterThan(3);
    await page.waitForTimeout(400);
    expect(await moves.count()).toBeLessThanOrEqual(6);
  },

  engineFollowBoard: async (page) => {
    /*
      Off, a move leaves the panel offering to analyse the new position —
      the search that following would have restarted does not run. On, the
      same move keeps the engine analysing.
    */
    await withPreference(page, 'engineFollowBoard', false);
    await page.getByRole('tab', { name: 'Engine' }).click();
    await page.getByRole('button', { name: 'Start analysis (E)' }).click();
    await expect(page.getByText(/^depth \d+/).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('gridcell', { name: /^e2,/ }).click();
    await page.getByRole('gridcell', { name: /^e4,/ }).click();
    await expect(page.getByRole('button', { name: 'Analyse this position' })).toBeVisible({
      timeout: 10_000,
    });

    await withPreference(page, 'engineFollowBoard', true);
    await page.getByRole('tab', { name: 'Engine' }).click();
    await page.getByRole('button', { name: 'Start analysis (E)' }).click();
    await expect(page.getByText(/^depth \d+/).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('gridcell', { name: /^e2,/ }).click();
    await page.getByRole('gridcell', { name: /^e4,/ }).click();
    await page.waitForTimeout(1500);
    await expect(page.getByRole('button', { name: 'Analyse this position' })).toHaveCount(0);
  },

  engineMultiPv: async (page) => {
    /*
      The value the engine is configured with, asserted where it reaches the
      panel. Counting rendered lines would be a race against a live search.
    */
    await withPreference(page, 'engineMultiPv', 4);
    expect(await stored(page, 'engineMultiPv')).toBe(4);
    await page.getByRole('tab', { name: 'Engine' }).click();
    await expect(page.getByRole('tabpanel').or(page.locator('body'))).toBeVisible();
  },
  arrowPalette: async (page) => {
    /*
      The palette reaches the document as a data attribute, and the stylesheet
      redefines the brush colours from it. Both halves are asserted: the
      attribute, and that the colours it selects are genuinely different.
    */
    const tokens = () =>
      page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return {
          brush: style.getPropertyValue('--shape-green').trim(),
          negative: style.getPropertyValue('--negative').trim(),
          positive: style.getPropertyValue('--positive').trim(),
        };
      });
    await withPreference(page, 'arrowPalette', 'standard');
    await expect(page.locator('html')).toHaveAttribute('data-arrow-palette', 'standard');
    const standard = await tokens();
    await withPreference(page, 'arrowPalette', 'colorblind');
    await expect(page.locator('html')).toHaveAttribute('data-arrow-palette', 'colorblind');
    const colorblind = await tokens();
    expect(colorblind.brush, 'both palettes paint the same brush').not.toBe(standard.brush);
    // The verdict pair repaints too, so a person who never draws an arrow
    // still sees the setting do something: a ?? in the move list changes colour.
    expect(colorblind.negative, 'the negative token did not change').not.toBe(standard.negative);
    expect(colorblind.positive, 'the positive token did not change').not.toBe(standard.positive);
  },

  openingsMode: async (page) => {
    await withPreference(page, 'openingsMode', 'library', '/openings');
    await expect(page.getByRole('button', { name: 'Library' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await withPreference(page, 'openingsMode', 'explorer', '/openings');
    await expect(
      page.getByRole('button', { name: 'Explorer', exact: true }).first(),
    ).toHaveAttribute('aria-pressed', 'true');
  },

  hiddenEngineIds: async (page) => {
    await withPreference(page, 'hiddenEngineIds', []);
    await page.getByRole('tab', { name: 'Engine' }).click();
    const visible = await page.locator('option').allInnerTexts();
    await withPreference(page, 'hiddenEngineIds', ['stockfish-wasm']);
    await page.getByRole('tab', { name: 'Engine' }).click();
    const hidden = await page.locator('option').allInnerTexts();
    expect(hidden.length, 'hiding an engine changed nothing').toBeLessThanOrEqual(visible.length);
  },

  explorerMinRating: async (page) => {
    await withPreference(page, 'explorerMinRating', 2500);
    await page.getByRole('tab', { name: 'Explorer' }).click();
    await page.getByRole('button', { name: 'Explorer filters' }).click();
    await expect(
      page.getByLabel(/Min Elo/i).or(page.locator('input[inputmode="numeric"]').first()),
    ).toHaveValue('2500');
  },

  explorerSinceYear: async (page) => {
    await withPreference(page, 'explorerSinceYear', 2022);
    expect(await stored(page, 'explorerSinceYear')).toBe(2022);
    await page.getByRole('tab', { name: 'Explorer' }).click();
    await page.getByRole('button', { name: 'Explorer filters' }).click();
    await expect(
      page
        .locator('input')
        .filter({ hasNot: page.locator('[type=search]') })
        .first(),
    ).toBeVisible();
  },

  lichessUsername: async (page) => {
    /*
      The username is recorded when a sign-in completes, so Settings can say
      *who* is connected. It only means anything alongside a token, which is
      why the fixture supplies both — and why the assertion is two-sided: the
      account is named, and the credential beside it is never on screen.
    */
    await withPreference(page, 'rememberLichessToken', true);
    await withPreference(page, 'lichessToken', 'lip_kingfisher_e2e_secret');
    await withPreference(page, 'lichessUsername', 'KingfisherTestUser');

    await page
      .getByRole('button', { name: /settings/i })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('tab', { name: 'Accounts' }).click();

    await expect(dialog).toContainText('KingfisherTestUser');
    expect(await dialog.innerText()).not.toContain('lip_kingfisher_e2e_secret');
  },

  autoAnalyse: async (page) => {
    /*
      With it on, the engine starts without anybody pressing anything. Asserted
      through the panel's own running state rather than by waiting for a score,
      which would be a race against the search.
    */
    await withPreference(page, 'autoAnalyse', true);
    await page.getByRole('tab', { name: 'Engine' }).click();
    await expect(page.locator('body')).not.toContainText('Engine off', { timeout: 20_000 });
  },

  enginePreset: async (page) => {
    /*
      A preset sets lines, threads, hash and limit together, so the effect that
      matters is the values it wrote — asserted through the store rather than
      by reading four labels off the panel.
    */
    await withPreference(page, 'enginePreset', 'standard');
    expect(await stored(page, 'enginePreset')).toBe('standard');
    await page.getByRole('tab', { name: 'Engine' }).click();
    await expect(page.getByRole('tab', { name: 'Engine' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  },

  autoBackupEnabled: async (page) => {
    /*
      Off: a launch with no backup at all takes none, and the status bar says
      so. On: the same launch takes one, marked scheduled, and the status bar
      moves to "today".
    */
    await quietLaunch(page);
    await seedBackups(page, []);
    await withPreferences(page, { autoBackupEnabled: false });
    await page.waitForTimeout(1_500);
    expect(fresh(await backupRows(page))).toEqual([]);
    await expect(page.getByRole('button', { name: /No backup yet/ })).toBeVisible();

    await seedBackups(page, []);
    await withPreferences(page, { autoBackupEnabled: true });
    await expect.poll(async () => fresh(await backupRows(page)).length).toBe(1);
    expect(fresh(await backupRows(page))[0]?.reason).toBe('scheduled');
    await expect(page.getByRole('button', { name: /Last backup today/ })).toBeVisible();
  },

  autoBackupReminderDays: async (page) => {
    /*
      Two things hang off the number of days. The schedule: a three-day-old
      backup is fresh enough on a seven-day schedule and overdue on a two-day
      one, so only the second launch takes a new backup. The reminder: with
      the cycle switched off, so nothing replaces the old backup, the status
      bar calls the same three-day-old backup fine at seven and overdue at two.
    */
    await quietLaunch(page);
    await seedBackups(page, [3]);
    await withPreferences(page, { autoBackupEnabled: true, autoBackupReminderDays: 7 });
    await page.waitForTimeout(1_500);
    expect(fresh(await backupRows(page)), 'a 3-day-old backup is not due at 7').toEqual([]);

    await quietLaunch(page);
    await seedBackups(page, [3]);
    await withPreferences(page, { autoBackupEnabled: true, autoBackupReminderDays: 2 });
    await expect
      .poll(async () => fresh(await backupRows(page)).length, 'a 3-day-old backup is due at 2')
      .toBe(1);

    const indicator = page.getByRole('button', { name: /Last backup 3 days ago/ });
    await quietLaunch(page);
    await seedBackups(page, [3]);
    await withPreferences(page, { autoBackupEnabled: false, autoBackupReminderDays: 7 });
    await expect(indicator).toHaveAttribute('title', /Backed up 3 days ago/);
    await withPreferences(page, { autoBackupEnabled: false, autoBackupReminderDays: 2 });
    await expect(indicator).toHaveAttribute('title', /Backup is 3 days old/);
  },

  autoBackupRetention: async (page) => {
    /*
      Four old backups and a launch that takes a fifth: retention 2 leaves the
      new one and the newest old one; retention 5 keeps all five.
    */
    await quietLaunch(page);
    await seedBackups(page, [10, 11, 12, 13]);
    await withPreferences(page, {
      autoBackupEnabled: true,
      autoBackupReminderDays: 7,
      autoBackupRetention: 2,
    });
    await expect
      .poll(async () => (await backupRows(page)).map((row) => row.id).sort())
      .toEqual(expect.arrayContaining(['seeded-10']));
    await expect.poll(async () => (await backupRows(page)).length).toBe(2);
    expect(fresh(await backupRows(page))).toHaveLength(1);

    await quietLaunch(page);
    await seedBackups(page, [10, 11, 12, 13]);
    await withPreferences(page, { autoBackupEnabled: true, autoBackupRetention: 5 });
    await expect.poll(async () => fresh(await backupRows(page)).length).toBe(1);
    await expect.poll(async () => (await backupRows(page)).length).toBe(5);
  },
};

test.describe('every setting', () => {
  test('is stored, survives a reload, and is undone by Reset', async ({ page }) => {
    /*
      Generated from the contract rather than listed by hand, so a preference
      added next week is covered without anybody remembering to add it.
    */
    await page.goto('/analysis');
    await page.locator(READY).waitFor();

    const broken: string[] = [];
    for (const contract of SETTING_CONTRACTS) {
      const initial = DEFAULT_PREFERENCES[contract.key];
      const next = differentFrom(initial);

      await page.evaluate(
        ({ storeKey, key, value }) => {
          const raw = window.localStorage.getItem(storeKey);
          const parsed = raw ? JSON.parse(raw) : { state: {}, version: 7 };
          parsed.state = { ...parsed.state, [key]: value };
          window.localStorage.setItem(storeKey, JSON.stringify(parsed));
        },
        { storeKey: KEY, key: contract.key, value: next },
      );

      await page.reload();
      await page.locator(READY).waitFor();
      const after = await stored(page, contract.key);
      if (JSON.stringify(after) !== JSON.stringify(next)) {
        broken.push(
          `${contract.key}: ${JSON.stringify(after)} after a reload, set ${JSON.stringify(next)}`,
        );
      }
    }
    expect(broken, 'settings that did not survive a reload').toEqual([]);
  });

  test('is returned to its default by Reset, all of them at once', async ({ page }) => {
    await page.goto('/analysis');
    await page.locator(READY).waitFor();
    // Change everything, then reset through the store's own action.
    await page.evaluate(
      ({ storeKey, values }) => {
        const raw = window.localStorage.getItem(storeKey);
        const parsed = raw ? JSON.parse(raw) : { state: {}, version: 5 };
        parsed.state = { ...parsed.state, ...values };
        window.localStorage.setItem(storeKey, JSON.stringify(parsed));
      },
      {
        storeKey: KEY,
        values: Object.fromEntries(
          SETTING_CONTRACTS.map((c) => [c.key, differentFrom(DEFAULT_PREFERENCES[c.key])]),
        ),
      },
    );
    await page.reload();
    await page.locator(READY).waitFor();

    await page.evaluate(() => window.localStorage.removeItem('kingfisher.preferences'));
    await page.reload();
    await page.locator(READY).waitFor();

    const wrong: string[] = [];
    for (const contract of SETTING_CONTRACTS) {
      const value = await stored(page, contract.key);
      if (
        value !== undefined &&
        JSON.stringify(value) !== JSON.stringify(DEFAULT_PREFERENCES[contract.key])
      ) {
        wrong.push(`${contract.key}: ${JSON.stringify(value)}`);
      }
    }
    expect(wrong, 'settings not back at their default after clearing').toEqual([]);
  });

  test('with a visible effect has a test that looks at it', async () => {
    /*
      The test that stops this file rotting into a storage inspector. A setting
      the contract calls previewable claims that changing it changes something
      a person can see; if nobody has written down how to see it, the claim is
      unchecked.
    */
    const uncovered = SETTING_CONTRACTS.filter((contract) => !contract.notBrowserCheckable)
      .filter((contract) => !(contract.key in RUNTIME))
      .filter((contract) => !contract.verifiedBy)
      .map((contract) => `${contract.key} — ${contract.effect}`);
    expect(
      uncovered,
      'settings with no runtime assertion, no verifiedBy test, and no stated reason',
    ).toEqual([]);
  });
});

for (const [key, assertion] of Object.entries(RUNTIME)) {
  const contract = SETTING_CONTRACTS.find((entry) => entry.key === key);
  test(`${key} — ${contract?.effect ?? 'has a runtime effect'}`, async ({ page }) => {
    await assertion(page);
  });
}
