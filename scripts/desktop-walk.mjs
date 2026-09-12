#!/usr/bin/env node
/**
 * A hostile-but-legitimate user, seeded.
 *
 * Drives a real Kingfisher — packaged or from the checkout — through a long,
 * random but reproducible sequence of the things a person actually does:
 * navigating, playing moves, undoing, starting and stopping engines, opening
 * files the way the Finder does, resizing, going full screen, closing the
 * window and coming back from the Dock, opening dialogs and cancelling them.
 * After every action it asserts the invariants that must hold whatever the
 * sequence was:
 *
 *   - the position on the board is a legal chess position;
 *   - every engine arrow is a legal move in *that* position;
 *   - the application never claims "Save failed" unless a fault was injected;
 *   - there is one application window (plus the update dialog, if open) and
 *     one application instance;
 *   - no native engine is running that the companion does not own;
 *   - no renderer crashed, no helper process died, nothing in the main
 *     process threw or rejected without a handler;
 *   - the page still has something on it.
 *
 * Everything is driven from a seed. A failure prints the seed, the action
 * index and the last actions, and the same command reproduces it. Metrics —
 * every process's memory, engine and window counts, profile size — are
 * sampled throughout and written to the report, so a soak is the same
 * program with a duration instead of a count.
 *
 *   node scripts/desktop-walk.mjs --packaged --seed=46 --actions=1000
 *   node scripts/desktop-walk.mjs --packaged --seed=7 --duration=30m
 *   node scripts/desktop-walk.mjs --packaged --seed=3 --faults        # inject failures too
 *   node scripts/desktop-walk.mjs --packaged --profile=/path/to/profile # a returning user
 *
 * `--report=<file>` writes the JSON report there; the default is a file in
 * the system temporary directory, whose path is printed.
 */

import { Chess } from 'chess.js';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { argv, exit } from 'node:process';

import {
  alive,
  descendants,
  engineProcesses,
  launchKingfisher,
  waitForReady,
} from './desktop-lib/launch.mjs';
import { writeCorpus } from './desktop-lib/pgn-corpus.mjs';

// --- arguments ---------------------------------------------------------------

const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback = null) => {
  const found = argv.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const durationMs = (text) => {
  if (!text) return null;
  const match = /^(\d+)(ms|s|m|h)$/.exec(text);
  if (!match) throw new Error(`--duration must look like 30m, 2h or 90s, not ${text}`);
  const n = Number(match[1]);
  return { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 }[match[2]] * n;
};

const args = {
  packaged: flag('packaged'),
  seed: Number(value('seed', String(Date.now() % 100_000))),
  actions: Number(value('actions', '200')),
  duration: durationMs(value('duration')),
  profile: value('profile'),
  report: value('report'),
  faults: flag('faults'),
  quiet: flag('quiet'),
  /** How often to sample metrics, in actions. */
  sampleEvery: Number(value('sample-every', '25')),
};

// --- a small deterministic PRNG ---------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- the walk ----------------------------------------------------------------

const ROUTES = [
  '/analysis',
  '/studies',
  '/repertoire',
  '/training',
  '/openings',
  '/databases',
  '/review',
  '/endgame',
  '/players',
  '/preparation',
  '/recent',
];

class Walk {
  constructor() {
    this.rng = mulberry32(args.seed);
    this.log = [];
    this.findings = [];
    this.samples = [];
    this.consoleErrors = [];
    this.pageErrors = [];
    this.injected = { companionDown: false, offline: false, engineKilled: 0 };
    this.stepIndex = 0;
    this.expectedWindows = 1;
    this.started = Date.now();
  }

  random() {
    return this.rng();
  }

  pick(list) {
    return list[Math.floor(this.random() * list.length)];
  }

  say(line) {
    if (!args.quiet) console.log(line);
  }

  // --- launch ---------------------------------------------------------------

  async open() {
    this.profile =
      args.profile ?? mkdtempSync(path.join(tmpdir(), `kingfisher-walk-${args.seed}-`));
    mkdirSync(this.profile, { recursive: true });
    this.corpusDir = mkdtempSync(path.join(tmpdir(), 'kingfisher-walk-corpus-'));
    this.corpus = writeCorpus(this.corpusDir);

    this.k = await launchKingfisher({
      packaged: args.packaged,
      profile: this.profile,
      env: { KINGFISHER_STARTUP_TRACE: '1' },
    });
    this.app = this.k.app;
    this.page = this.k.window;
    await this.attachRenderer(this.page);
    await waitForReady(this.page);

    /*
      Hooks in the main process, once. Everything that would otherwise be
      silent is written to a global the walk reads after every action.
    */
    await this.app.evaluate(({ app, dialog }) => {
      const g = globalThis;
      if (g.__kfWalk) return;
      g.__kfWalk = {
        rendererGone: [],
        childGone: [],
        exceptions: [],
        rejections: [],
        errorBoxes: [],
      };
      /*
        `dialog.showErrorBox` is synchronous and modal: it would stop the main
        process until a person clicked OK, and there is no person. Recording
        the box instead is a harness-only replacement inside this test process;
        the walk asserts that a bad file produced one rather than an exception.
      */
      dialog.showErrorBox = (title, content) =>
        g.__kfWalk.errorBoxes.push({ at: Date.now(), title, content });
      app.on('render-process-gone', (_e, contents, details) =>
        g.__kfWalk.rendererGone.push({ at: Date.now(), ...details }),
      );
      app.on('child-process-gone', (_e, details) =>
        g.__kfWalk.childGone.push({ at: Date.now(), ...details }),
      );
      process.on('uncaughtException', (error) =>
        g.__kfWalk.exceptions.push({ at: Date.now(), message: String(error?.stack ?? error) }),
      );
      process.on('unhandledRejection', (reason) =>
        g.__kfWalk.rejections.push({ at: Date.now(), message: String(reason?.stack ?? reason) }),
      );
    });

    const diag = await this.page.evaluate(() => window.kingfisher.diagnostics());
    this.pids = { shell: this.k.pid, web: diag.web.pid, companion: diag.companion.pid };
    this.build = diag.build ?? null;
    this.say(`Kingfisher ${this.build?.label ?? diag.shell.version} at ${this.k.executable}`);
    this.say(`profile ${this.profile}`);
    this.say(
      `seed ${args.seed} · ${args.duration ? `${args.duration / 60000} min` : `${args.actions} actions`}${args.faults ? ' · faults on' : ''}\n`,
    );
    this.baselineEngines = engineProcesses().map((p) => p.pid);
  }

  async attachRenderer(page) {
    // A control that cannot be clicked in eight seconds is a finding, not
    // something to wait half a minute for.
    page.setDefaultTimeout(8_000);
    page.on('pageerror', (error) =>
      this.pageErrors.push({ step: this.stepIndex, message: String(error?.message ?? error) }),
    );
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      this.consoleErrors.push({ step: this.stepIndex, text: message.text().slice(0, 400) });
    });
  }

  /** The main window, re-resolved: closing and reopening makes a new one. */
  async currentPage() {
    if (!this.page.isClosed()) return this.page;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const windows = this.app.windows().filter((w) => !w.isClosed());
      const main = windows.find((w) =>
        /\/(analysis|studies|repertoire|training|openings|databases|review|endgame|players|preparation|recent|settings)/.test(
          w.url(),
        ),
      );
      if (main) {
        this.page = main;
        await this.attachRenderer(main);
        return main;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('no main window came back');
  }

  // --- reading the application -----------------------------------------------

  async fen() {
    const page = await this.currentPage();
    return page.evaluate(
      () => document.querySelector('[data-fen-tooltip]')?.textContent?.trim() ?? null,
    );
  }

  async route() {
    const page = await this.currentPage();
    return new URL(page.url()).pathname;
  }

  async onBoardRoute() {
    const route = await this.route();
    return route === '/analysis' || route === '/studies' || route === '/repertoire';
  }

  async hasBoard() {
    const page = await this.currentPage();
    return (await page.locator('[data-chessboard]').count()) > 0;
  }

  async engineArrows() {
    const page = await this.currentPage();
    return page.evaluate(() =>
      [...document.querySelectorAll('[data-engine-arrow-hit]')].map((el) => ({
        from: el.getAttribute('data-engine-arrow-from'),
        to: el.getAttribute('data-engine-arrow-to'),
        engine: el.getAttribute('data-engine-arrow-engine'),
      })),
    );
  }

  async engineRunning() {
    const page = await this.currentPage();
    return (await page.getByRole('button', { name: 'Stop analysis (E)' }).count()) > 0;
  }

  // --- invariants ---------------------------------------------------------------

  async checkInvariants(action) {
    const page = await this.currentPage();
    const fail = (name, detail) =>
      this.findings.push({ step: this.stepIndex, action, name, detail });

    // 1. The position is legal.
    if (await this.hasBoard()) {
      const fen = await this.fen();
      if (!fen) fail('fen-missing', 'no FEN in the status bar');
      else {
        const fields = fen.split(' ');
        if (fields.length !== 6) fail('fen-fields', fen);
        try {
          new Chess(fen);
        } catch (error) {
          fail('fen-illegal', `${fen}: ${error.message}`);
        }
        // 2. Arrows belong to this position. Re-read once after a moment, so a
        //    frame of staleness during a position change is not a finding but
        //    an arrow that stays stale is.
        let arrows = (await this.engineArrows()).filter((a) => a.from && a.to);
        const stale = (list, position) => {
          const chess = new Chess(position);
          return list.filter(
            (a) => !chess.moves({ verbose: true }).some((m) => m.from === a.from && m.to === a.to),
          );
        };
        if (arrows.length && stale(arrows, fen).length) {
          await page.waitForTimeout(400);
          const again = await this.fen();
          arrows = (await this.engineArrows()).filter((a) => a.from && a.to);
          const still = again ? stale(arrows, again) : [];
          if (still.length) fail('arrow-not-in-position', `${JSON.stringify(still)} on ${again}`);
        }
      }
    }

    // 3. No save failure the walk did not cause.
    const saveFailed = await page.evaluate(() =>
      [...document.querySelectorAll('[data-study-save-status="failed"]')].map((el) =>
        el.getAttribute('data-study-save-failure'),
      ),
    );
    if (saveFailed.length && !this.injected.writeFault) fail('save-failed', saveFailed.join('; '));

    // 4. Windows and instances.
    const windows = await this.app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    );
    if (windows > this.expectedWindows)
      fail('window-count', `${windows} windows, expected ≤ ${this.expectedWindows}`);
    const instances = execFileSync('ps', ['-eo', 'pid=,comm='], { encoding: 'utf8' })
      .split('\n')
      .filter((line) => line.trim().endsWith(this.k.executable)).length;
    if (instances !== 1) fail('instance-count', `${instances} processes of ${this.k.executable}`);

    // 5. No orphan engines.
    const engines = engineProcesses().filter((p) => !this.baselineEngines.includes(p.pid));
    // Reparented to launchd: nobody owns it any more.
    const orphans = engines.filter((p) => p.ppid === 1);
    if (orphans.length) fail('orphan-engine', JSON.stringify(orphans));

    // 6. The processes the shell owns are up, unless the walk took them down.
    if (!this.injected.companionDown) {
      if (!alive(this.pids.web)) fail('web-server-gone', `pid ${this.pids.web}`);
      if (!alive(this.pids.companion)) fail('companion-gone', `pid ${this.pids.companion}`);
    }

    // 7. Nothing crashed.
    const main = await this.app.evaluate(() => {
      const g = globalThis.__kfWalk;
      const out = { ...g };
      g.rendererGone = [];
      g.childGone = [];
      g.exceptions = [];
      g.rejections = [];
      g.errorBoxes = [];
      return out;
    });
    for (const gone of main.rendererGone) fail('renderer-gone', JSON.stringify(gone));
    for (const gone of main.childGone) {
      // A utility process the walk killed on purpose is not a crash.
      if (this.injected.expectChildGone && /utility|node/i.test(gone.type ?? '')) continue;
      fail('child-process-gone', JSON.stringify(gone));
    }
    for (const box of main.errorBoxes) {
      if (this.injected.expectErrorBox)
        this.injected.errorBoxesSeen = (this.injected.errorBoxesSeen ?? 0) + 1;
      else fail('unexpected-error-box', `${box.title}: ${box.content}`.slice(0, 300));
    }
    this.injected.expectErrorBox = false;
    for (const e of main.exceptions) fail('main-uncaught-exception', e.message.slice(0, 500));
    for (const r of main.rejections) fail('main-unhandled-rejection', r.message.slice(0, 500));
    const newPageErrors = this.pageErrors.filter((e) => e.step === this.stepIndex);
    for (const e of newPageErrors) fail('renderer-uncaught', e.message.slice(0, 500));

    // 8. Something is on the page.
    const text = await page.evaluate(() => document.body.innerText.length);
    if (text < 100) fail('blank-page', `${text} characters`);
  }

  // --- metrics --------------------------------------------------------------------

  async sample(label) {
    const metrics = await this.app.evaluate(({ app }) =>
      app
        .getAppMetrics()
        .map((m) => ({ type: m.type, pid: m.pid, rssKb: m.memory.workingSetSize })),
    );
    const mainRss = await this.app.evaluate(() => process.memoryUsage().rss);
    const rendererKb = metrics.filter((m) => m.type === 'Tab').reduce((a, m) => a + m.rssKb, 0);
    const disk = Number(
      execFileSync('du', ['-sk', this.profile], { encoding: 'utf8' }).split('\t')[0],
    );
    const windows = await this.app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    );
    const engines = engineProcesses().filter((p) => !this.baselineEngines.includes(p.pid)).length;
    const sample = {
      at: Date.now() - this.started,
      step: this.stepIndex,
      label,
      mainRssMb: Math.round(mainRss / 1048576),
      rendererRssMb: Math.round(rendererKb / 1024),
      processes: metrics.length,
      engines,
      windows,
      profileMb: Math.round(disk / 1024),
      consoleErrors: this.consoleErrors.length,
      findings: this.findings.length,
    };
    this.samples.push(sample);
    this.say(
      `  · ${String(sample.step).padStart(5)} ${Math.round(sample.at / 1000)}s  main ${sample.mainRssMb} MB  renderer ${sample.rendererRssMb} MB  ` +
        `procs ${sample.processes}  engines ${sample.engines}  windows ${sample.windows}  profile ${sample.profileMb} MB`,
    );
    return sample;
  }

  // --- actions ---------------------------------------------------------------------

  actions() {
    const w = this;
    const page = () => this.currentPage();
    return [
      {
        name: 'route',
        weight: 10,
        async run() {
          // Two in five visits go to the analysis board: it is where a player
          // spends most of their time, and where moves and engines live.
          const target = w.random() < 0.4 ? '/analysis' : w.pick(ROUTES);
          const p = await page();
          await p.goto(`${new URL(p.url()).origin}${target}`);
          await waitForReady(p);
          return target;
        },
      },
      {
        name: 'move',
        weight: 14,
        when: () => w.onBoardRoute(),
        async run() {
          const fen = await w.fen();
          if (!fen) return 'no position';
          const chess = new Chess(fen);
          const moves = chess.moves({ verbose: true }).filter((m) => !m.promotion);
          if (moves.length === 0) return 'no moves';
          const move = w.pick(moves);
          const p = await page();
          await p.getByRole('gridcell', { name: new RegExp(`^${move.from},`) }).click();
          await p.getByRole('gridcell', { name: new RegExp(`^${move.to},`) }).click();
          await p.waitForTimeout(80);
          return `${move.san} on ${fen.split(' ')[0]}`;
        },
      },
      {
        name: 'undo',
        weight: 5,
        when: () => w.onBoardRoute(),
        async run() {
          const p = await page();
          await p.keyboard.press('ArrowLeft');
          await p.waitForTimeout(60);
        },
      },
      {
        name: 'redo',
        weight: 4,
        when: () => w.onBoardRoute(),
        async run() {
          const p = await page();
          await p.keyboard.press('ArrowRight');
          await p.waitForTimeout(60);
        },
      },
      {
        name: 'flip',
        weight: 3,
        when: () => w.onBoardRoute(),
        async run() {
          const p = await page();
          const button = p.getByRole('button', { name: 'Flip board (F)' });
          if ((await button.count()) === 0) return 'no flip control';
          await button.first().click();
        },
      },
      {
        name: 'copy-fen',
        weight: 4,
        when: () => w.hasBoard(),
        async run() {
          const p = await page();
          const shown = await w.fen();
          await p.locator('[data-copy-fen]').first().click();
          await p.waitForTimeout(150);
          const clipboard = await w.app.evaluate(({ clipboard }) => clipboard.readText());
          if (clipboard !== shown) {
            w.findings.push({
              step: w.stepIndex,
              action: 'copy-fen',
              name: 'clipboard-mismatch',
              detail: `clipboard "${clipboard}" vs shown "${shown}"`,
            });
          }
          const fields = String(clipboard).split(' ').length;
          if (fields !== 6)
            w.findings.push({
              step: w.stepIndex,
              action: 'copy-fen',
              name: 'clipboard-fen-fields',
              detail: clipboard,
            });
          return `${fields} fields`;
        },
      },
      {
        name: 'engine-start',
        weight: 6,
        when: async () => (await w.route()) === '/analysis' && !(await w.engineRunning()),
        async run() {
          const p = await page();
          const button = p.getByRole('button', { name: 'Start analysis (E)' });
          if ((await button.count()) === 0) return 'no start control';
          await button.first().click();
          await p.waitForTimeout(300);
        },
      },
      {
        name: 'engine-stop',
        weight: 5,
        when: () => w.engineRunning(),
        async run() {
          const p = await page();
          await p.getByRole('button', { name: 'Stop analysis (E)' }).first().click();
          await p.waitForTimeout(150);
        },
      },
      {
        name: 'palette',
        weight: 4,
        async run() {
          const p = await page();
          await p.keyboard.press('ControlOrMeta+k');
          const box = p.getByRole('combobox').or(p.getByRole('textbox')).first();
          await box.waitFor({ timeout: 3_000 }).catch(() => {});
          await p.keyboard.type(
            w.pick(['stud', 'engine', 'copy', 'settings', 'xyzzy', 'explorer']),
            { delay: 10 },
          );
          await p.waitForTimeout(100);
          await p.keyboard.press('Escape');
        },
      },
      {
        name: 'settings',
        weight: 3,
        async run() {
          const p = await page();
          await p.keyboard.press('ControlOrMeta+,');
          const dialog = p.getByRole('dialog').first();
          const opened = await dialog
            .waitFor({ timeout: 3_000 })
            .then(() => true)
            .catch(() => false);
          if (opened) {
            for (let i = 0; i < 4; i += 1) await p.keyboard.press('Tab');
            await p.keyboard.press('Escape');
            await dialog.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {
              w.findings.push({
                step: w.stepIndex,
                action: 'settings',
                name: 'dialog-escape-trap',
                detail: 'Settings did not close on Escape',
              });
            });
          }
          return opened ? 'opened and closed' : 'did not open';
        },
      },
      {
        name: 'new-study',
        weight: 2,
        when: async () => (await w.route()) === '/studies',
        async run() {
          const p = await page();
          const button = p.getByRole('button', { name: 'New study' });
          if ((await button.count()) === 0) return 'no New study button';
          await button.first().click();
          const dialog = p.getByRole('dialog', { name: 'New study' });
          await dialog.getByLabel('Title').fill(`Walk ${args.seed} study ${w.stepIndex}`);
          await p.getByRole('button', { name: 'Create study' }).click();
          const chapter = p.getByRole('button', { name: 'New chapter' });
          if (await chapter.count()) {
            await chapter.first().click();
            await p.getByRole('dialog', { name: 'New chapter' }).getByLabel('Title').fill('Line');
            await p.getByRole('button', { name: 'Create chapter' }).click();
          }
          await p.waitForTimeout(200);
        },
      },
      {
        name: 'note',
        weight: 3,
        when: () => w.onBoardRoute(),
        async run() {
          const p = await page();
          const field = p.getByRole('textbox', { name: /^Note about/ });
          if ((await field.count()) === 0) return 'no notes field visible';
          await field.first().fill(`note ${w.stepIndex} from seed ${args.seed}`);
          await p.keyboard.press('Tab');
          await p.waitForTimeout(150);
        },
      },
      {
        name: 'resize',
        weight: 4,
        async run() {
          const width = 900 + Math.floor(w.random() * 900);
          const height = 600 + Math.floor(w.random() * 600);
          await w.app.evaluate(
            ({ BrowserWindow }, size) => {
              const [win] = BrowserWindow.getAllWindows();
              win?.setSize(size.width, size.height, false);
            },
            { width, height },
          );
          await (await page()).waitForTimeout(150);
          return `${width}×${height}`;
        },
      },
      {
        name: 'fullscreen-toggle',
        weight: 1,
        async run() {
          const now = await w.app.evaluate(({ BrowserWindow }) => {
            const [win] = BrowserWindow.getAllWindows();
            if (!win) return null;
            const next = !win.isFullScreen();
            win.setFullScreen(next);
            return next;
          });
          await (await page()).waitForTimeout(900);
          return now ? 'entered' : 'left';
        },
      },
      {
        name: 'minimize-restore',
        weight: 1,
        async run() {
          await w.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.minimize());
          await (await page()).waitForTimeout(300);
          await w.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.restore());
          await (await page()).waitForTimeout(300);
        },
      },
      {
        name: 'hide-show',
        weight: 1,
        async run() {
          await w.app.evaluate(({ app }) => app.hide());
          await (await page()).waitForTimeout(200);
          await w.app.evaluate(({ app }) => app.show());
          await (await page()).waitForTimeout(200);
        },
      },
      {
        name: 'close-and-reopen',
        weight: 1,
        async run() {
          const before = await w.fen();
          await w.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
          await new Promise((resolve) => setTimeout(resolve, 400));
          const remaining = await w.app.evaluate(
            ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
          );
          // The Dock click: macOS sends `activate`, the shell makes a window.
          await w.app.evaluate(({ app }) => app.emit('activate'));
          const p = await w.currentPage();
          await waitForReady(p);
          return `${remaining} windows after close, reopened, position ${before ? 'was set' : 'unknown'}`;
        },
      },
      {
        name: 'open-pgn-finder',
        weight: 3,
        async run() {
          const key = w.pick(['normal', 'special', 'setup', 'variations', 'longGame']);
          const file = w.corpus[key];
          // What macOS does when a document is double-clicked with the app
          // running: an `open-file` event, which the shell reads and queues.
          await w.app.evaluate(
            ({ app }, file) => app.emit('open-file', { preventDefault() {} }, file),
            file,
          );
          const p = await page();
          await p.waitForTimeout(600);
          return key;
        },
      },
      {
        name: 'open-pgn-bad',
        weight: 1,
        async run() {
          const key = w.pick(['malformed', 'empty', 'missing']);
          const file =
            key === 'missing' ? path.join(w.corpusDir, 'does-not-exist.pgn') : w.corpus[key];
          // A missing file is a native error box, by design — not an exception.
          if (key === 'missing') w.injected.expectErrorBox = true;
          await w.app.evaluate(
            ({ app }, file) => app.emit('open-file', { preventDefault() {} }, file),
            file,
          );
          const p = await page();
          await p.waitForTimeout(600);
          if (key === 'missing') {
            const boxes = await w.app.evaluate(() => globalThis.__kfWalk.errorBoxes.length);
            if (boxes === 0)
              w.findings.push({
                step: w.stepIndex,
                action: 'open-pgn-bad',
                name: 'missing-file-silent',
                detail: 'no error box for a file that does not exist',
              });
          }
          return key;
        },
      },
      {
        name: 'explorer',
        weight: 3,
        when: () => w.onBoardRoute(),
        async run() {
          const p = await page();
          const tab = p.getByRole('tab', { name: 'Explorer', exact: true });
          if ((await tab.count()) === 0) return 'no explorer tab in the strip';
          await tab.first().click();
          await p.waitForTimeout(400);
        },
      },
      {
        name: 'update-dialog',
        weight: 1,
        async run() {
          const p = await page();
          w.expectedWindows = 2;
          await p.evaluate(() => window.kingfisher.showUpdateDialog());
          await p.waitForTimeout(700);
          // Press the dialog's own primary button, as a person would, and
          // record what the updater says about this build.
          const dialog = w.app
            .windows()
            .find((win) => /update\.html/.test(win.url()) && !win.isClosed());
          let headline = null;
          if (dialog) {
            const primary = dialog.locator('#primary');
            if (await primary.isEnabled().catch(() => false)) await primary.click();
            await p.waitForTimeout(2_500);
            headline = await dialog
              .locator('#headline')
              .textContent()
              .catch(() => null);
          }
          const verdict = await p.evaluate(() => window.kingfisher.updateStatus());
          if (headline && /could not start|did not receive/.test(headline)) {
            w.findings.push({
              step: w.stepIndex,
              action: 'update-dialog',
              name: 'update-dialog-broken',
              detail: headline,
            });
          }
          w.updateVerdicts = w.updateVerdicts ?? [];
          w.updateVerdicts.push(verdict);
          await w.app.evaluate(({ BrowserWindow }) => {
            for (const win of BrowserWindow.getAllWindows()) {
              if (/update/.test(win.webContents.getURL())) win.close();
            }
          });
          await p.waitForTimeout(200);
          w.expectedWindows = 1;
          return `verdict ${verdict?.status}${verdict?.reason ? ` — ${verdict.reason}` : ''}${headline ? ` · "${headline}"` : ''}`;
        },
      },
      {
        name: 'invalid-fen',
        weight: 1,
        when: async () => (await w.route()) === '/analysis',
        async run() {
          const p = await page();
          await p.keyboard.press('ControlOrMeta+k');
          await p.keyboard.type('set up position', { delay: 10 });
          await p.waitForTimeout(150);
          await p.keyboard.press('Enter');
          const field = p.getByRole('textbox', { name: 'Position FEN' });
          const opened = await field
            .waitFor({ timeout: 3_000 })
            .then(() => true)
            .catch(() => false);
          if (!opened) {
            // Whatever the palette did instead, leave nothing open behind.
            const covering = await p.evaluate(
              () => document.querySelector('[role="dialog"]')?.getAttribute('aria-label') ?? null,
            );
            await p.keyboard.press('Escape');
            await p.keyboard.press('Escape');
            return `setup dialog not reached${covering ? ` (a "${covering}" dialog was open)` : ''}`;
          }
          await field.fill(
            w.pick([
              'not a fen',
              'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0',
              '8/8/8/8/8/8/8/8 w - - 0 1',
              'KKKKKKKK/8/8/8/8/8/8/8 w - - 0 1',
            ]),
          );
          await p.getByRole('button', { name: 'Load FEN' }).click();
          await p.waitForTimeout(150);
          await p.keyboard.press('Escape');
          await p.waitForTimeout(150);
        },
      },
      // --- faults, only with --faults ---------------------------------------
      {
        name: 'fault-kill-engine',
        weight: 3,
        faults: true,
        when: () => w.engineRunning(),
        async run() {
          const engines = engineProcesses().filter((p) => !w.baselineEngines.includes(p.pid));
          if (engines.length === 0) return 'no native engine running (browser engine)';
          const victim = w.pick(engines);
          const signal = w.pick(['SIGTERM', 'SIGKILL']);
          try {
            process.kill(victim.pid, signal);
          } catch {
            return 'engine already gone';
          }
          w.injected.engineKilled += 1;
          await (await page()).waitForTimeout(800);
          return `${signal} → ${victim.comm.split('/').pop()} ${victim.pid}`;
        },
      },
      {
        name: 'fault-offline-toggle',
        weight: 2,
        faults: true,
        async run() {
          const next = !w.injected.offline;
          await w.app.evaluate(({ session }, block) => {
            session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
              if (!block) return callback({});
              const local = /^(https?:\/\/)?(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(
                details.url,
              );
              const internal = /^(devtools|chrome|chrome-extension|blob|data|file):/.test(
                details.url,
              );
              callback(local || internal ? {} : { cancel: true });
            });
          }, next);
          w.injected.offline = next;
          return next ? 'offline' : 'online';
        },
      },
      {
        name: 'fault-kill-companion',
        weight: 1,
        faults: true,
        when: () => !w.injected.companionDown,
        async run() {
          const signal = w.pick(['SIGTERM', 'SIGKILL']);
          try {
            process.kill(w.pids.companion, signal);
          } catch {
            return 'companion already gone';
          }
          w.injected.companionDown = true;
          w.injected.expectChildGone = true;
          const p = await page();
          await p.waitForTimeout(1_500);
          // The application must still be usable without it.
          const text = await p.evaluate(() => document.body.innerText.length);
          const diag = await p.evaluate(() => window.kingfisher.diagnostics());
          if (diag.companion.running) {
            w.findings.push({
              step: w.stepIndex,
              action: 'fault-kill-companion',
              name: 'companion-loss-undetected',
              detail: 'diagnostics still say running',
            });
          }
          return `${signal}; page ${text} chars; diagnostics running=${diag.companion.running}`;
        },
      },
    ];
  }

  async step() {
    const all = this.actions().filter((a) => !a.faults || args.faults);
    // Weighted choice among the actions whose precondition holds.
    const eligible = [];
    for (const action of all) {
      if (!action.when || (await action.when())) eligible.push(action);
    }
    const total = eligible.reduce((sum, a) => sum + a.weight, 0);
    let roll = this.random() * total;
    let chosen = eligible[eligible.length - 1];
    for (const action of eligible) {
      roll -= action.weight;
      if (roll <= 0) {
        chosen = action;
        break;
      }
    }
    this.stepIndex += 1;
    const started = Date.now();
    let detail = '';
    let error = null;
    try {
      detail = (await chosen.run()) ?? '';
    } catch (e) {
      error = String(e?.message ?? e)
        .split('\n')[0]
        .slice(0, 300);
    }
    const entry = {
      step: this.stepIndex,
      action: chosen.name,
      detail,
      ms: Date.now() - started,
      ...(error ? { error } : {}),
    };
    this.log.push(entry);
    if (error) {
      // Say what was in the way, then get out of it: a dialog a person would
      // dismiss should not block the next hundred actions.
      const p = await this.currentPage();
      const covering = await p
        .evaluate(
          () => document.querySelector('[role="dialog"]')?.getAttribute('aria-label') ?? null,
        )
        .catch(() => null);
      this.findings.push({
        step: this.stepIndex,
        action: chosen.name,
        name: 'action-threw',
        detail: `${error}${covering ? ` — a "${covering}" dialog was open` : ''}`,
      });
      await p.keyboard.press('Escape').catch(() => {});
    }
    await this.checkInvariants(chosen.name);
    const news = this.findings.filter((f) => f.step === this.stepIndex);
    this.say(
      `${String(this.stepIndex).padStart(5)} ${chosen.name.padEnd(20)} ${String(entry.ms).padStart(5)} ms  ${detail}${error ? `  ✗ ${error}` : ''}` +
        (news.length
          ? `\n      ✗ ${news.map((f) => `${f.name}: ${f.detail}`).join('\n      ✗ ')}`
          : ''),
    );
  }

  async run() {
    await this.open();
    await this.sample('start');
    const deadline = args.duration ? this.started + args.duration : null;
    let engineTail = null;
    while (deadline ? Date.now() < deadline : this.stepIndex < args.actions) {
      await this.step();
      if (this.stepIndex % args.sampleEvery === 0) await this.sample('during');
      /*
        A soak is not a CPU burn: a person does not click twenty times a
        second for two hours. With a duration set, the walk idles between
        actions, and lets an engine run for a while now and then.
      */
      if (deadline) {
        const pause = 400 + this.random() * 2_600;
        await new Promise((resolve) => setTimeout(resolve, pause));
        if (
          (await this.engineRunning()) &&
          (engineTail === null || Date.now() - engineTail > 60_000)
        ) {
          engineTail = Date.now();
          await new Promise((resolve) => setTimeout(resolve, 8_000));
        }
      }
    }
    // Leave the engine stopped so the quit is a clean one to measure.
    if (await this.engineRunning()) {
      await (
        await this.currentPage()
      )
        .getByRole('button', { name: 'Stop analysis (E)' })
        .first()
        .click()
        .catch(() => {});
    }
    await this.sample('end');
    return this.finish();
  }

  async finish() {
    const enginesBefore = engineProcesses().filter((p) => !this.baselineEngines.includes(p.pid));
    const closed = await this.k.close({ keepProfile: true });
    const enginesAfter = engineProcesses().filter(
      (p) => !this.baselineEngines.includes(p.pid) && alive(p.pid),
    );
    if (closed.survivors.length) {
      this.findings.push({
        step: this.stepIndex,
        action: 'quit',
        name: 'survivor-after-quit',
        detail: closed.survivors.map((s) => `${s.comm} ${s.pid}`).join(', '),
      });
    }
    if (enginesAfter.length) {
      this.findings.push({
        step: this.stepIndex,
        action: 'quit',
        name: 'orphan-engine-after-quit',
        detail: enginesAfter.map((s) => `${s.comm} ${s.pid}`).join(', '),
      });
      for (const p of enginesAfter) {
        try {
          process.kill(p.pid, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }
    }

    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const report = {
      seed: args.seed,
      packaged: args.packaged,
      faults: args.faults,
      build: this.build,
      executable: this.k.executable,
      profile: this.profile,
      startedAt: new Date(this.started).toISOString(),
      durationMs: Date.now() - this.started,
      actions: this.stepIndex,
      actionCounts: this.log.reduce(
        (acc, e) => ((acc[e.action] = (acc[e.action] ?? 0) + 1), acc),
        {},
      ),
      injected: this.injected,
      updateVerdicts: this.updateVerdicts ?? [],
      quit: closed,
      enginesRunningBeforeQuit: enginesBefore.length,
      memory:
        first && last
          ? {
              mainStartMb: first.mainRssMb,
              mainEndMb: last.mainRssMb,
              rendererStartMb: first.rendererRssMb,
              rendererEndMb: last.rendererRssMb,
            }
          : null,
      samples: this.samples,
      findings: this.findings,
      consoleErrors: this.consoleErrors,
      pageErrors: this.pageErrors,
      log: this.log,
    };
    const file =
      args.report ?? path.join(tmpdir(), `kingfisher-walk-${args.seed}-${Date.now()}.json`);
    writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);

    console.log('');
    console.log(
      `seed ${args.seed} · ${this.stepIndex} actions · ${Math.round(report.durationMs / 1000)} s`,
    );
    if (report.memory) {
      console.log(
        `main ${report.memory.mainStartMb} → ${report.memory.mainEndMb} MB · renderer ${report.memory.rendererStartMb} → ${report.memory.rendererEndMb} MB`,
      );
    }
    console.log(
      `quit: ${closed.descendants} descendants, ${closed.survivors.length} survivors, ${closed.closeMs} ms`,
    );
    console.log(`console errors: ${this.consoleErrors.length} · findings: ${this.findings.length}`);
    for (const f of this.findings.slice(0, 40))
      console.log(`  ✗ step ${f.step} ${f.action}: ${f.name} — ${f.detail}`);
    console.log(`report ${file}`);
    if (this.findings.length) {
      console.log(
        `\nreproduce: node scripts/desktop-walk.mjs${args.packaged ? ' --packaged' : ''} --seed=${args.seed} --actions=${this.stepIndex}${args.faults ? ' --faults' : ''}`,
      );
    }
    if (!args.profile) {
      rmSync(this.corpusDir, { recursive: true, force: true });
      if (this.findings.length === 0) rmSync(this.profile, { recursive: true, force: true });
      else console.log(`profile kept for reproduction: ${this.profile}`);
    }
    return this.findings.length === 0;
  }
}

new Walk()
  .run()
  .then((ok) => exit(ok ? 0 : 1))
  .catch((error) => {
    console.error(`\nThe walk did not complete: ${error?.stack ?? error}`);
    exit(2);
  });
