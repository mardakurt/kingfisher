import { expect, test, type Page } from '@playwright/test';
import { Chess } from 'chess.js';

import type { AppRepositories } from '../src/persistence/types';
import { isNavigationAbortNoise } from './tools';
import { authoredMove, type BoardSnapshot } from './support/authored-move';

/**
 * Two real tabs on one profile, editing one study for a sustained, seeded
 * sequence — with every chapter read and write delayed at random at the
 * persistence boundary in both of them.
 *
 * The single-race regressions (study-open-ownership, reliability's stale
 * write, study-reload) each pin one interleaving. This asks the question they
 * cannot: after many interleavings nobody chose, is every move a person
 * authored still stored somewhere they can find it, and did each tab always
 * show the document it said it showed?
 *
 * The oracle is independent of the application's own state. Every move played
 * is recorded here as (document, resulting position, SAN); at the end each one
 * must exist in a stored chapter of that name or in a conflict copy of it.
 * Conflicts are always resolved with "Save my version as a copy", the choice
 * that keeps everything, so no authored move may be missing.
 *
 *   KF_STRESS_SEED=7 KF_STRESS_ACTIONS=120 npx playwright test e2e/cross-tab-stress.spec.ts
 */

const SEED = Number(process.env.KF_STRESS_SEED ?? 20261004);
const ACTIONS = Number(process.env.KF_STRESS_ACTIONS ?? 70);
const CHAPTERS = ['Alpha', 'Bravo', 'Charlie'] as const;
const READY = 'html[data-kingfisher-ready="true"]';

// No single click may wait out the whole run.
test.use({ actionTimeout: 15_000 });

type ProbeWindow = Window & { __kingfisher: AppRepositories; __kfStressFailNextWrite?: boolean };

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** Delays every chapter read and write, in this tab, from before the app loads. */
async function slowStorage(page: Page, seed: number) {
  await page.addInitScript((seed: number) => {
    let state = seed >>> 0;
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
    const pause = () => new Promise((resolve) => setTimeout(resolve, Math.floor(random() * 700)));
    let held: unknown;
    Object.defineProperty(globalThis, '__kingfisher', {
      configurable: true,
      get: () => held,
      set(value: AppRepositories) {
        const studies = value.studies;
        const read = studies.getChapter.bind(studies);
        const write = studies.saveChapter.bind(studies);
        studies.getChapter = async (id) => {
          await pause();
          const result = await read(id);
          await pause();
          return result;
        };
        studies.saveChapter = async (chapter) => {
          await pause();
          const probe = globalThis as unknown as ProbeWindow;
          if (probe.__kfStressFailNextWrite) {
            probe.__kfStressFailNextWrite = false;
            throw new DOMException('Injected by cross-tab-stress', 'QuotaExceededError');
          }
          const result = await write(chapter);
          await pause();
          return result;
        };
        held = value;
      },
    });
  }, seed);
}

async function fenOf(page: Page) {
  return ((await page.locator('[data-fen-tooltip]').first().textContent()) ?? '').trim();
}

/** The status bar's "what am I editing": the span just before its save label. */
async function documentTitle(page: Page) {
  const label = page
    .locator('footer')
    .getByText(/^· (saved|saving…|unsaved|not saved)$/)
    .first()
    .locator('xpath=preceding-sibling::span[1]');
  return ((await label.textContent()) ?? '').trim();
}

const conflictNotice = (page: Page) =>
  page.getByRole('alert').filter({ hasText: 'changed in another Kingfisher tab' });

/** Until the tab has either saved this edit or is asking about a conflict. */
async function settle(page: Page, label: string) {
  const deadline = Date.now() + 25_000;
  for (;;) {
    if (
      await conflictNotice(page)
        .isVisible()
        .catch(() => false)
    ) {
      await conflictNotice(page).getByRole('button', { name: 'Save my version as a copy' }).click();
      await expect(conflictNotice(page), `${label}: conflict resolved`).toBeHidden({
        timeout: 15_000,
      });
      continue;
    }
    const saved = await page
      .getByText('· saved', { exact: true })
      .isVisible()
      .catch(() => false);
    const unsaved = await page
      .getByText('· unsaved', { exact: true })
      .isVisible()
      .catch(() => false);
    if (saved && !unsaved) return;
    if (Date.now() > deadline)
      throw new Error(`${label}: never settled (saved=${saved}, unsaved=${unsaved})`);
    await page.waitForTimeout(150);
  }
}

/** Plays one random legal move in this tab; returns it if the board accepted it. */
async function playRandom(page: Page, random: () => number) {
  const before = await fenOf(page);
  const legal = new Chess(before).moves({ verbose: true }).filter((move) => !move.promotion);
  if (legal.length === 0) return null;
  const move = legal[Math.floor(random() * legal.length)]!;
  // Observe commits while the clicks run. Merely seeing a different FEN
  // afterwards also counts chapter navigation as an authored move. Observing
  // each transition retains a real move even if a later switch overwrites it.
  await page.evaluate(() => {
    const snapshots: { fen: string; chapter: string }[] = [];
    const read = () => {
      const fen = document.querySelector('[data-fen-tooltip]')?.textContent?.trim() ?? '';
      if (!fen || snapshots.at(-1)?.fen === fen) return;
      const status = [...document.querySelectorAll('footer span')].find((span) =>
        /^· (saved|saving…|unsaved|not saved)$/.test(span.textContent?.trim() ?? ''),
      );
      snapshots.push({ fen, chapter: status?.previousElementSibling?.textContent?.trim() ?? '' });
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    (window as unknown as { __kfStopBoardProbe: () => typeof snapshots }).__kfStopBoardProbe =
      () => {
        read();
        observer.disconnect();
        return snapshots;
      };
  });
  let snapshots: BoardSnapshot[] = [];
  try {
    await page.getByRole('gridcell', { name: new RegExp(`^${move.from},`) }).click();
    await page.getByRole('gridcell', { name: new RegExp(`^${move.to},`) }).click();
  } finally {
    snapshots = await page.evaluate(() =>
      (window as unknown as { __kfStopBoardProbe: () => BoardSnapshot[] }).__kfStopBoardProbe(),
    );
  }
  return authoredMove(snapshots, move.from, move.to);
}

test('two tabs editing one study under slow storage lose nothing and never mislabel the board', async ({
  context,
  browserName,
}) => {
  test.setTimeout(120_000 + ACTIONS * 40_000);
  const random = rng(SEED);
  const failures: string[] = [];
  const watch = (page: Page, name: string) => {
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (/Injected by cross-tab-stress|QuotaExceededError/.test(text)) return;
      if (!isNavigationAbortNoise(text, browserName)) failures.push(`${name}: ${text}`);
    });
    page.on('pageerror', (error) => failures.push(`${name} pageerror: ${error.message}`));
  };

  const a = await context.newPage();
  const b = await context.newPage();
  await slowStorage(a, SEED + 1);
  await slowStorage(b, SEED + 2);
  watch(a, 'A');
  watch(b, 'B');

  // One study, three chapters, made in tab A.
  await a.goto('/studies');
  await a.locator(READY).waitFor();
  // eslint-disable-next-line no-console
  if (process.env.KF_STRESS_VERBOSE) console.log('[cross-tab-stress] tab A ready');
  await a.getByRole('button', { name: 'New study', exact: true }).click();
  await a.getByRole('dialog', { name: 'New study' }).getByLabel('Title').fill('Stress study');
  await a.getByRole('button', { name: 'Create study' }).click();
  for (const title of CHAPTERS) {
    await a.getByRole('button', { name: 'New chapter', exact: true }).click();
    await a.getByRole('dialog', { name: 'New chapter' }).getByLabel('Title').fill(title);
    await a.getByRole('button', { name: 'Create chapter' }).click();
    await expect(a.locator('footer').filter({ hasText: 'half-moves' })).toContainText(title);
  }
  await b.goto('/studies');
  await b.locator(READY).waitFor();
  // Tab B opens the same study: its first chapter row, once the list has loaded.
  await expect(b.getByRole('button', { name: /^\d+\. Alpha( \d+ moves?)?$/ })).toBeVisible({
    timeout: 20_000,
  });

  /** Every move a tab authored: the document it landed in, the position it made, and the move. */
  const authored: { chapter: string; after: string; san: string; tab: string; step: number }[] = [];
  const log: string[] = [];
  const tabs = { A: a, B: b } as const;
  let failedWrites = 0;

  for (let step = 0; step < ACTIONS; step++) {
    const name = random() < 0.5 ? 'A' : 'B';
    const page = tabs[name];
    const roll = random();
    let action: string;

    if (roll < 0.18) {
      const title = CHAPTERS[Math.floor(random() * CHAPTERS.length)]!;
      action = `open ${title}`;
      const row = page.getByRole('button', {
        name: new RegExp(`^\\d+\\. ${title}( \\d+ moves?)?$`),
      });
      if ((await row.count()) === 0) action += ' (row not listed)';
      else await row.first().click();
    } else if (roll < 0.58) {
      const played = await playRandom(page, random);
      if (played) authored.push({ ...played, tab: name, step });
      action = played ? `play ${played.san} in "${played.chapter}"` : 'no move accepted';
    } else if (roll < 0.7) {
      // Both tabs on one chapter, each playing at the same moment: the write
      // that lands second carries a stale revision and must become a conflict.
      const title = CHAPTERS[Math.floor(random() * CHAPTERS.length)]!;
      for (const other of [a, b]) {
        await other
          .getByRole('button', { name: new RegExp(`^\\d+\\. ${title}( \\d+ moves?)?$`) })
          .first()
          .click();
        await settle(other, `race open ${title}`);
      }
      const [fromA, fromB] = await Promise.all([playRandom(a, random), playRandom(b, random)]);
      if (fromA) authored.push({ ...fromA, tab: 'A', step });
      if (fromB) authored.push({ ...fromB, tab: 'B', step });
      await settle(name === 'A' ? b : a, `race other tab`);
      action = `race in ${title}: A ${fromA?.san ?? '-'} / B ${fromB?.san ?? '-'}`;
    } else if (roll < 0.82) {
      const key = ['Home', 'End', 'ArrowLeft', 'ArrowLeft', 'ArrowRight'][
        Math.floor(random() * 5)
      ]!;
      await page
        .locator('[data-move-tree]')
        .first()
        .click({ position: { x: 4, y: 4 } })
        .catch(() => undefined);
      await page.keyboard.press(key);
      action = `key ${key}`;
    } else if (roll < 0.92) {
      const describe = async () =>
        `${await documentTitle(page).catch(() => '?')} ${(await fenOf(page)).split(' ')[0]} ` +
        `${await page
          .getByText(/· (saved|saving…|unsaved|not saved)$/)
          .first()
          .innerText()
          .catch(() => '')}` +
        `${(await page.getByRole('alert').allInnerTexts()).join(' | ').slice(0, 160)}`;
      const before = process.env.KF_STRESS_VERBOSE ? await describe() : '';
      await page.reload();
      await page.locator(READY).waitFor();
      if (process.env.KF_STRESS_VERBOSE) {
        await page.waitForTimeout(2500);
        action = `reload [${before}] → [${await describe()}]`;
      } else action = 'reload';
    } else {
      await page.evaluate(() => {
        (window as unknown as ProbeWindow).__kfStressFailNextWrite = true;
      });
      failedWrites++;
      action = 'fail the next write';
    }
    log.push(`${step} ${name}: ${action}`);
    // eslint-disable-next-line no-console
    if (process.env.KF_STRESS_VERBOSE) console.log(`[cross-tab-stress] ${log.at(-1)}`);

    // Invariants, in the tab that acted, once it has saved or resolved a conflict.
    await settle(page, `step ${step} ${name} ${action}`).catch(async (error) => {
      // A deliberately failed write must be visible, and the next edit retries it.
      const visible = await page
        .getByText(/not saved|Save failed|could not be saved/i)
        .first()
        .isVisible()
        .catch(() => false);
      if (!visible) throw error;
    });
    /*
      The selected chapter and the document on the board must agree once the
      tab has settled. While a slowed read is still pending the list may lag
      by up to that read's delay (cosmetic; recorded in the closure log); a
      disagreement that outlasts 10 s is a mislabelled board.
    */
    let agreement = '';
    for (let tries = 0; tries < 40; tries++) {
      const footer = await documentTitle(page);
      const selected = page
        .getByRole('button', { name: /^\d+\. (Alpha|Bravo|Charlie)( \(.*\))?( \d+ moves?)?$/ })
        .and(page.locator('[aria-current="true"]'));
      const row = (await selected.count())
        ? (
            (await selected.first().getAttribute('aria-label')) ??
            (await selected.first().innerText())
          )
            .split('\n')[0]!
            .replace(/^\d+\.\s*/, '')
            .replace(/\s*\d+ moves?$/, '')
            .trim()
        : null;
      agreement = `selected "${row}" vs document "${footer}"`;
      if (row === null || footer.includes(row)) {
        agreement = '';
        break;
      }
      await page.waitForTimeout(250);
    }
    expect(agreement, `step ${step} ${name}: never settled on one document`).toBe('');
    const fen = await fenOf(page);
    expect(new Chess(fen).fen().split(' ').slice(0, 4).join(' '), `step ${step} legal FEN`).toBe(
      fen.split(' ').slice(0, 4).join(' '),
    );
  }

  // Let both tabs finish, then read storage directly.
  for (const [name, page] of Object.entries(tabs)) {
    await page.getByRole('button', { name: CHAPTERS[0], exact: false }).first().isVisible();
    await settle(page, `final ${name}`).catch(() => undefined);
  }
  await a.reload();
  await a.locator(READY).waitFor();
  const stored = await a.evaluate(async () => {
    const repository = (window as unknown as ProbeWindow).__kingfisher.studies;
    const out: { title: string; pairs: string[]; revision: number }[] = [];
    for (const study of await repository.list()) {
      const full = await repository.get(study.id);
      for (const meta of full?.chapters ?? []) {
        const chapter = await repository.getChapter(meta.id);
        if (!chapter) continue;
        const nodes = chapter.tree.nodes;
        // The position each move made: identity enough, whatever line it is in.
        const pairs = Object.values(nodes)
          .filter((node) => node.move && node.parentId)
          .map((node) => node.fen);
        out.push({ title: chapter.title, pairs, revision: chapter.revision });
      }
    }
    return out;
  });

  /*
    A move made while the board held something other than a chapter (the
    cancelled-switch case) is in that document — the workspace draft, scratch
    space by design — and the screen says so (study-open-ownership.spec.ts).
    It is counted, not held to the chapter rule.
  */
  const isChapter = (title: string) =>
    CHAPTERS.some((name) => title === name || title.startsWith(`${name} (`));
  const outside = authored.filter(({ chapter }) => !isChapter(chapter));
  const missing = authored
    .filter(({ chapter }) => isChapter(chapter))
    .filter(({ chapter, after }) => {
      const candidates = stored.filter(
        (entry) => entry.title === chapter || entry.title.startsWith(`${chapter} (`),
      );
      return !candidates.some((entry) => entry.pairs.includes(after));
    });
  const copies = stored.filter((entry) => / \(/.test(entry.title)).length;
  // eslint-disable-next-line no-console
  console.log(
    `[cross-tab-stress] seed ${SEED}: ${ACTIONS} actions, ${authored.length} moves authored, ` +
      `${stored.length} chapters stored (${copies} conflict copies), ${failedWrites} injected write failures, ` +
      `${outside.length} played outside a chapter, ${missing.length} chapter moves missing`,
  );
  expect(missing, `lost authored moves; log:\n${log.join('\n')}`).toEqual([]);
  expect(failures).toEqual([]);
});

/*
  The case the seeded run above found (seed 20261004, step 98→99): a reload
  inside the autosave window, while another tab writes its own draft. Both
  draft slots are shared by every tab; the reloading tab's last edit existed
  only in its unload draft, lost the newer-wins comparison to the other tab's
  draft, and the tab came back showing the other tab's document.
*/
test('a tab reloaded mid-save comes back with its own work, not the other tab’s', async ({
  context,
}) => {
  test.setTimeout(120_000);
  const a = await context.newPage();
  const b = await context.newPage();
  await a.addInitScript(() => {
    let held: unknown;
    Object.defineProperty(globalThis, '__kingfisher', {
      configurable: true,
      get: () => held,
      set(value: AppRepositories) {
        if (sessionStorage.getItem('kf-hold-draft-read') === '1') {
          const read = value.drafts.get.bind(value.drafts);
          const gate = new Promise<void>((resolve) => {
            (globalThis as { __releaseDraftRead?: () => void }).__releaseDraftRead = resolve;
          });
          value.drafts.get = async () => {
            await gate;
            return read();
          };
        }
        held = value;
      },
    });
  });

  await a.goto('/studies');
  await a.locator(READY).waitFor();
  await a.getByRole('button', { name: 'New study', exact: true }).click();
  await a.getByRole('dialog', { name: 'New study' }).getByLabel('Title').fill('Two tabs');
  await a.getByRole('button', { name: 'Create study' }).click();
  for (const title of ['Theirs', 'Mine']) {
    await a.getByRole('button', { name: 'New chapter', exact: true }).click();
    await a.getByRole('dialog', { name: 'New chapter' }).getByLabel('Title').fill(title);
    await a.getByRole('button', { name: 'Create chapter' }).click();
    await expect(a.locator('footer').filter({ hasText: 'half-moves' })).toContainText(title);
  }
  await b.goto('/studies');
  await b.locator(READY).waitFor();
  await b.getByRole('button', { name: /^\d+\. Theirs$/ }).click();
  await expect(b.locator('footer').filter({ hasText: 'half-moves' })).toContainText('Theirs');

  // A's edit to "Mine" never reaches the chapter: only the unload draft will hold it.
  await a.evaluate(() => {
    const studies = (window as unknown as ProbeWindow).__kingfisher.studies;
    studies.saveChapter = () => new Promise(() => undefined);
  });
  await a.getByRole('gridcell', { name: /^e2,/ }).click();
  await a.getByRole('gridcell', { name: /^e4,/ }).click();
  await expect(a.getByRole('button', { name: 'e4', exact: true })).toBeVisible();
  await a.evaluate(() => sessionStorage.setItem('kf-hold-draft-read', '1'));
  await a.reload();
  await a.locator(READY).waitFor();

  // Meanwhile the other tab writes its own, newer draft.
  await b.getByRole('gridcell', { name: /^d2,/ }).click();
  await b.getByRole('gridcell', { name: /^d4,/ }).click();
  await expect(b.getByText('· unsaved', { exact: true })).toBeVisible();
  await expect(b.getByText('· saved', { exact: true })).toBeVisible({ timeout: 15_000 });

  await a.evaluate(() => {
    sessionStorage.removeItem('kf-hold-draft-read');
    (globalThis as { __releaseDraftRead?: () => void }).__releaseDraftRead!();
  });
  await expect(a.getByRole('button', { name: 'e4', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(a.getByRole('button', { name: 'd4', exact: true })).toHaveCount(0);
  await expect(a.locator('footer').filter({ hasText: 'half-moves' })).toContainText('Mine');
});
