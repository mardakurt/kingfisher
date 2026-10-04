#!/usr/bin/env node
/**
 * The Library and the Explorer, in a real browser, on real collections of
 * hundreds of thousands to a million games — what a person waits for.
 *
 * Expects collections already imported by `scripts/large-db-import.mjs` in
 * `--dir`, a running Kingfisher at `--base` (a production build: `next start`),
 * and starts its own companion on those collections. Every timing is from the
 * action to the moment the page shows its answer.
 *
 *   node scripts/large-db-ui.mjs --base=http://localhost:3210 \
 *     --dir=<collections> --expect=lichess-225k:224679,lichess-578k:578262 [--report=…]
 */

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { argv, exit } from 'node:process';

import { DatabaseSync } from 'node:sqlite';

import { chromium } from '@playwright/test';

/** Counts read straight from the collection file: the oracle the UI is held to. */
function oracle(name, event, fromDate) {
  const db = new DatabaseSync(path.join(DIR, `${name}.kingfisher.sqlite`), { readOnly: true });
  try {
    const one = (sql, ...args) => Number(Object.values(db.prepare(sql).get(...args))[0]);
    return {
      event: one('SELECT count(*) FROM games WHERE event = ?', event),
      from: one('SELECT count(*) FROM games WHERE date >= ?', fromDate.replaceAll('-', '.')),
    };
  } finally {
    db.close();
  }
}

const value = (name, fallback) => {
  const found = argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const BASE = value('base', 'http://localhost:3210');
const DIR = value('dir');
const PORT = Number(value('port', '4339'));
const TOKEN = 'large-db-acceptance';
const REPORT = value('report', path.join(DIR ?? '.', 'large-db-ui.json'));
const EXPECT = Object.fromEntries(
  (value('expect', '') || '')
    .split(',')
    .filter(Boolean)
    .map((pair) => {
      const [name, count] = pair.split(':');
      return [name, Number(count)];
    }),
);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const timings = {};
const time = async (label, work) => {
  const t0 = performance.now();
  const outcome = await work();
  const ms = Math.round(performance.now() - t0);
  (timings[label] ??= []).push(ms);
  return { ms, outcome };
};

function startCompanion() {
  const child = spawn(process.execPath, ['companion/src/server.mjs'], {
    env: {
      ...process.env,
      KINGFISHER_COMPANION_PORT: String(PORT),
      KINGFISHER_COMPANION_TOKEN: TOKEN,
      KINGFISHER_COMPANION_DATA_DIR: DIR,
      KINGFISHER_COMPANION_ALLOWED_ORIGINS: new URL(BASE).origin,
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return child;
}
async function companionUp() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return true;
    } catch {
      /* not yet */
    }
    await wait(200);
  }
  return false;
}

async function main() {
  let companion = startCompanion();
  check('companion serves the collections', await companionUp());
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  const status = () => page.locator('span', { hasText: /of [\d,]+ games/ }).first();
  const statusText = async () =>
    (
      await status()
        .innerText()
        .catch(() => '')
    ).trim();
  const list = page.locator('[data-library-list]');
  const firstRow = async () =>
    (
      await list
        .locator('tbody tr')
        .first()
        .innerText()
        .catch(() => '')
    ).replace(/\s+/g, ' ');
  const until = async (predicate, timeout = 120_000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await predicate().catch(() => false)) return true;
      await wait(25);
    }
    return false;
  };

  try {
    await page.goto(`${BASE}/analysis`);
    await page.locator('html[data-kingfisher-ready="true"]').waitFor();
    await page.getByRole('button', { name: 'Settings' }).first().click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('tab', { name: 'Companion' }).click();
    await settings.getByLabel('Pairing address').fill(`http://127.0.0.1:${PORT}#token=${TOKEN}`);
    await settings.getByRole('button', { name: 'Pair', exact: true }).click();
    check(
      'the browser pairs with the companion',
      await settings
        .getByText(/Paired with/)
        .isVisible({ timeout: 15_000 })
        .catch(() => false),
    );
    await settings.getByRole('button', { name: 'Close' }).click();

    await page.goto(`${BASE}/games`);
    await page.locator('html[data-kingfisher-ready="true"]').waitFor();
    const picker = page.getByRole('combobox', { name: 'Database' });

    for (const [name, expected] of Object.entries(EXPECT)) {
      console.log(`\n${name}`);
      const option = picker.locator('option', { hasText: name });
      const optionValue = await option.getAttribute('value');
      // Open, counted.
      const opened = await time(`${name} open + count`, async () => {
        await picker.selectOption(optionValue);
        return until(
          async () =>
            /of [\d,]+ games/.test(await statusText()) &&
            (await list.locator('tbody tr').count()) > 0,
        );
      });
      const shown = await statusText();
      const total = Number((/of ([\d,]+) games/.exec(shown)?.[1] ?? '0').replace(/,/g, ''));
      check(
        `${name}: opens and counts every game`,
        opened.outcome && total === expected,
        `${shown} in ${opened.ms} ms (expected ${expected.toLocaleString()})`,
      );

      // Next page.
      const next = await time(`${name} next page`, async () => {
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        return until(async () => /101–200/.test(await statusText()));
      });
      check(`${name}: next page`, next.outcome, `${next.ms} ms`);
      await page.getByRole('button', { name: 'Previous', exact: true }).click();

      // Sort by each sortable column once.
      const headers = await list.locator('thead th button').allInnerTexts();
      for (const header of headers.map((h) => h.replace(/[↑↓]/g, '').trim()).filter(Boolean)) {
        const before = await firstRow();
        const sorted = await time(`${name} sort`, async () => {
          await list.locator('thead th button', { hasText: header }).first().click();
          return until(async () => (await firstRow()) !== before, 60_000);
        });
        check(`${name}: sort by ${header}`, sorted.outcome, `${sorted.ms} ms`);
      }

      // A player from the collection itself, searched by name.
      const player = (await list.locator('tbody tr').nth(3).locator('td').allInnerTexts())
        .map((t) => t.trim())
        .find((t) => /^[A-Za-z0-9_-]{3,}$/.test(t) && !/^\d+$/.test(t));
      const search = page.getByRole('searchbox', { name: 'Search games' });
      if (player) {
        const found = await time(`${name} player search`, async () => {
          await search.fill(player);
          return until(async () => {
            const rows = await list.locator('tbody tr').allInnerTexts();
            return (
              rows.length > 0 && rows.every((r) => r.toLowerCase().includes(player.toLowerCase()))
            );
          });
        });
        check(
          `${name}: player search "${player}"`,
          found.outcome,
          `${found.ms} ms, ${await statusText()}`,
        );
      }

      // Rapid query changes: only the last one may be on screen.
      const queries = ['aa', 'ab', 'lov', 'mag', 'ste', player ?? 'chess'];
      const rapid = await time(`${name} rapid queries`, async () => {
        for (const q of queries) {
          await search.fill(q);
          await wait(40);
        }
        const last = queries.at(-1).toLowerCase();
        return until(async () => {
          const rows = await list.locator('tbody tr').allInnerTexts();
          return rows.length > 0 && rows.every((r) => r.toLowerCase().includes(last));
        });
      });
      check(`${name}: six rapid queries end on the last`, rapid.outcome, `${rapid.ms} ms`);
      await search.fill('');
      await until(async () => /of [\d,]+ games/.test(await statusText()));

      // Filters, each held to the count in the file, then cleared back to everything.
      const month =
        { 'lichess-225k': '2013-06-15', 'lichess-578k': '2013-12-15', 'lichess-1m': '2014-07-15' }[
          name
        ] ?? '2013-06-15';
      const truth = oracle(name, 'Rated Blitz game', month);
      const everything = async () =>
        (await statusText()).includes(`of ${total.toLocaleString()} games`) &&
        /^(1–100|[\d,]+ of [\d,]+ games · 1–100)/.test(await statusText()) &&
        ((await statusText()).startsWith('1–100') ||
          (await statusText()).startsWith(total.toLocaleString()));
      await page.getByRole('button', { name: 'Filters', exact: true }).click();
      const filters = page.locator('[data-library-filters]');
      for (const [label, input, expected] of [
        ['Event', 'Rated Blitz game', truth.event],
        ['From date', month, truth.from],
      ]) {
        const field = filters.getByLabel(label, { exact: true });
        if (!(await field.isVisible().catch(() => false))) {
          check(`${name}: filter ${label} is offered`, false);
          continue;
        }
        const filtered = await time(`${name} filter`, async () => {
          await field.fill(input);
          return until(
            async () => (await statusText()).startsWith(`${expected.toLocaleString()} of`),
            60_000,
          );
        });
        check(
          `${name}: filter ${label} = ${input} counts what the file holds`,
          filtered.outcome,
          `${filtered.ms} ms → ${await statusText()} (file: ${expected.toLocaleString()})`,
        );
        await field.fill('');
        check(
          `${name}: filter ${label} clears`,
          await until(everything, 30_000),
          await statusText(),
        );
      }
      await page
        .getByRole('button', { name: 'Close filters' })
        .click()
        .catch(() => undefined);

      // Preview a game, then open it on the board.
      const row = list.locator('[data-library-row]').nth(5);
      const preview = page.locator('[data-library-preview]');
      const previewed = await time(`${name} preview`, async () => {
        await row.locator('td').nth(4).click();
        return until(async () => /\b1\.\s*\S+/.test(await preview.innerText()), 20_000);
      });
      check(`${name}: a game previews with its moves`, previewed.outcome, `${previewed.ms} ms`);
      const opened2 = await time(`${name} open game`, async () => {
        await preview.getByRole('button', { name: 'Open' }).click();
        return until(
          async () =>
            /\/analysis/.test(page.url()) &&
            (await page.locator('[data-move-tree] [data-current]').count()) > 2,
          20_000,
        );
      });
      check(`${name}: the game opens on the board`, opened2.outcome, `${opened2.ms} ms`);

      // The collection as an explorer source, at the start and after 1.e4 c5.
      const dock = page.getByRole('complementary', { name: 'Workspace tools' });
      const tab = dock.getByRole('tab', { name: 'Explorer', exact: true });
      if (await tab.isVisible().catch(() => false)) await tab.click();
      const source = page.getByLabel('Evidence source');
      const sourceValue = await source
        .locator('option', { hasText: name })
        .first()
        .getAttribute('value')
        .catch(() => null);
      if (sourceValue) {
        await page.getByRole('button', { name: 'New analysis' }).first().click();
        const explored = await time(`${name} explorer`, async () => {
          await source.selectOption(sourceValue);
          return until(async () => (await page.locator('[data-explorer-row]').count()) > 0, 30_000);
        });
        check(`${name}: explorer at the start position`, explored.outcome, `${explored.ms} ms`);
        for (const [from, to] of [
          ['e2', 'e4'],
          ['c7', 'c5'],
        ]) {
          await page.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
          await page.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
        }
        const deeper = await time(`${name} explorer`, async () =>
          until(async () => (await page.locator('[data-explorer-row]').count()) > 0, 30_000),
        );
        check(`${name}: explorer after 1.e4 c5`, deeper.outcome, `${deeper.ms} ms`);
      } else check(`${name}: offered as an explorer source`, false, 'no option');
      await page.goto(`${BASE}/games`);
      await page.locator('html[data-kingfisher-ready="true"]').waitFor();
    }

    // Switching between collections, and a companion restart.
    const names = Object.keys(EXPECT);
    for (const name of [...names].reverse()) {
      const optionValue = await picker.locator('option', { hasText: name }).getAttribute('value');
      const switched = await time('switch collection', async () => {
        await picker.selectOption(optionValue);
        return until(async () => (await statusText()).includes(EXPECT[name].toLocaleString()));
      });
      check(`switch to ${name}`, switched.outcome, `${switched.ms} ms`);
    }
    companion.kill('SIGTERM');
    await wait(1500);
    companion = startCompanion();
    await companionUp();
    await page.reload();
    await page.locator('html[data-kingfisher-ready="true"]').waitFor();
    // The collection switched to last (the loop above runs the names backwards).
    const last = names[0];
    const back = await until(
      async () => (await statusText()).includes(EXPECT[last].toLocaleString()),
      60_000,
    );
    check('after a companion restart the collection reads again', back, await statusText());
  } catch (error) {
    check(
      'the run completed without an exception',
      false,
      String(error?.message ?? error).slice(0, 600),
    );
    await page
      .screenshot({ path: REPORT.replace(/\.json$/, '-failure.png') })
      .catch(() => undefined);
  } finally {
    const summary = Object.fromEntries(
      Object.entries(timings).map(([k, v]) => {
        const s = [...v].sort((a, b) => a - b);
        return [k, { n: s.length, p50: s[Math.floor(s.length / 2)], max: s.at(-1) }];
      }),
    );
    writeFileSync(
      REPORT,
      JSON.stringify({ base: BASE, results, timings: summary, errors }, null, 2),
    );
    console.log('\ntimings:', JSON.stringify(summary, null, 1));
    console.log(
      `${results.filter((r) => r.ok).length}/${results.length} passed; ${errors.length} console errors — ${REPORT}`,
    );
    await browser.close();
    companion.kill('SIGTERM');
    exit(results.every((r) => r.ok) ? 0 : 1);
  }
}

main();
