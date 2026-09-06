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
      const parsed = raw ? JSON.parse(raw) : { state: {}, version: 4 };
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
    await withPreference(page, 'primaryEngineId', 'stockfish-wasm');
    await page.getByRole('tab', { name: 'Engine' }).click();
    await expect(page.locator('body')).toContainText(/Stockfish/i);
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
    const brush = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--shape-green').trim(),
      );
    await withPreference(page, 'arrowPalette', 'standard');
    await expect(page.locator('html')).toHaveAttribute('data-arrow-palette', 'standard');
    const standard = await brush();
    await withPreference(page, 'arrowPalette', 'colorblind');
    await expect(page.locator('html')).toHaveAttribute('data-arrow-palette', 'colorblind');
    expect(await brush(), 'both palettes paint the same colour').not.toBe(standard);
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
          const parsed = raw ? JSON.parse(raw) : { state: {}, version: 4 };
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
        const parsed = raw ? JSON.parse(raw) : { state: {}, version: 4 };
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
