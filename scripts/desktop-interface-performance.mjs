/** Compare exact packaged apps on this machine, without changing the user's profile. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { launchKingfisher, descendants } from './desktop-lib/launch.mjs';

const [baseline, candidate, output] = process.argv.slice(2);
if (!baseline || !candidate || !output) {
  throw new Error(
    'Usage: node scripts/desktop-interface-performance.mjs baseline.app candidate.app results.json',
  );
}
const game = readFileSync(
  'public/data/annotated/capablanca-chess-fundamentals-1921.pgn',
  'utf8',
).split('\n[Event ')[0];
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];

function memory(pid) {
  const processes = new Set([pid, ...descendants(pid).map((p) => p.pid)]);
  const rows = execFileSync('ps', ['-eo', 'pid=,rss='], { encoding: 'utf8' }).trim().split('\n');
  let kib = 0;
  for (const row of rows) {
    const [id, rss] = row.trim().split(/\s+/).map(Number);
    if (processes.has(id)) kib += rss;
  }
  return { rssMiB: kib / 1024, processCount: processes.size };
}

async function measure(executablePath, research) {
  if (executablePath.endsWith('.app')) executablePath += '/Contents/MacOS/Kingfisher';
  const runs = [];
  for (let trial = 0; trial < 5; trial++) {
    const started = performance.now();
    const launch = await launchKingfisher({ packaged: true, executablePath });
    try {
      const page = launch.window;
      await page.locator('html[data-kingfisher-ready="true"]').waitFor();
      const interactiveMs = performance.now() - started;
      await launch.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(1280, 720),
      );
      await page.getByRole('button', { name: /^Import( PGN or FEN)?$/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
      await dialog.getByRole('textbox').fill(game);
      await dialog.getByRole('button', { name: /Import game/ }).click();
      await page.getByRole('button', { name: /^Layout/ }).click();
      await page
        .getByRole('menuitem', {
          name: research ? 'Research workspace' : 'Engine under the board',
          exact: true,
        })
        .click();
      const panel = page.locator('[data-engine-panel-fen]');
      if (research)
        await panel.getByRole('combobox', { name: 'Candidate lines' }).selectOption('3');
      else await panel.getByRole('button', { name: '3', exact: true }).click();
      await panel.getByRole('button', { name: 'Start analysis (E)' }).click();
      await panel.locator('[data-engine-line="3"]').waitFor();
      await panel.getByRole('button', { name: 'Stop analysis (E)' }).click();
      await page.waitForTimeout(5000);
      const settled = memory(launch.pid);
      const engineId = await panel.locator('[data-engine-select="primary"]').inputValue();
      const engineSettings = await page.evaluate(() => {
        const prefs = JSON.parse(localStorage.getItem('kingfisher.preferences')).state;
        return {
          threads: prefs.engineThreads,
          hashMiB: prefs.engineHashMb,
          candidates: prefs.engineMultiPv,
          limit: prefs.engineLimit,
        };
      });
      const identity = await page.evaluate(async () => {
        const { build, shell, platform } = await window.kingfisher.diagnostics();
        return { build, shell, platform };
      });
      const timings = [];
      await page.evaluate(() => {
        document.activeElement?.blur();
        window.__interfaceTimings = { started: null, duration: null };
        window.addEventListener(
          'keydown',
          (event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            window.__interfaceTimings.started = performance.now();
            window.__interfaceTimings.duration = null;
          },
          true,
        );
        const observer = new MutationObserver((records) => {
          if (!records.some((r) => r.attributeName === 'data-current')) return;
          const started = window.__interfaceTimings.started;
          if (started === null) return;
          window.__interfaceTimings.started = null;
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              window.__interfaceTimings.duration = performance.now() - started;
            }),
          );
        });
        observer.observe(document.body, {
          subtree: true,
          attributes: true,
          attributeFilter: ['data-current'],
        });
      });
      for (let step = 0; step < 60; step++) {
        await page.keyboard.press(step % 2 === 0 ? 'ArrowRight' : 'ArrowLeft');
        await page.waitForFunction(() => window.__interfaceTimings.duration !== null);
        const duration = await page.evaluate(() => window.__interfaceTimings.duration);
        if (step >= 10) timings.push(duration);
      }
      // Repeat with a real search running and follow-board enabled. Navigation
      // exercises the existing stop/restart identity boundary rather than a fake PV.
      await panel.getByRole('button', { name: 'Start analysis (E)' }).click();
      await panel.locator('[data-engine-line="3"]').waitFor();
      const searchingTimings = [];
      for (let step = 0; step < 60; step++) {
        await page.keyboard.press(step % 2 === 0 ? 'ArrowRight' : 'ArrowLeft');
        await page.waitForFunction(() => window.__interfaceTimings.duration !== null);
        const duration = await page.evaluate(() => window.__interfaceTimings.duration);
        if (step >= 10) searchingTimings.push(duration);
      }
      await panel.getByRole('button', { name: 'Stop analysis (E)' }).click();
      runs.push({
        trial,
        interactiveMs,
        ...settled,
        identity,
        engineId,
        engineSettings,
        responseSamples: timings,
        searchingResponseSamples: searchingTimings,
        p95SearchingResponseMs: percentile(searchingTimings, 0.95),
        p95ResponseMs: percentile(timings, 0.95),
      });
      console.log(
        `${research ? 'candidate' : 'baseline'} trial ${trial + 1}: ready ${interactiveMs.toFixed(0)} ms, RSS ${settled.rssMiB.toFixed(1)} MiB, p95 ${percentile(timings, 0.95).toFixed(1)} ms, searching p95 ${percentile(searchingTimings, 0.95).toFixed(1)} ms`,
      );
    } finally {
      const closed = await launch.close();
      if (closed.forced || closed.survivors.length)
        throw new Error(`Shutdown failed: ${JSON.stringify(closed)}`);
    }
  }
  return {
    executablePath,
    runs,
    medianStartupMs: median(runs.map((r) => r.interactiveMs)),
    medianRssMiB: median(runs.map((r) => r.rssMiB)),
    p95SearchingResponseMs: percentile(
      runs.flatMap((r) => r.searchingResponseSamples),
      0.95,
    ),
    p95ResponseMs: percentile(
      runs.flatMap((r) => r.responseSamples),
      0.95,
    ),
  };
}

const result = {
  hardware: execFileSync('sysctl', ['-n', 'hw.model', 'hw.memsize', 'machdep.cpu.brand_string'], {
    encoding: 'utf8',
  }).trim(),
  os: execFileSync('sw_vers', [], { encoding: 'utf8' }).trim(),
  protocol:
    '5 fresh profiles per app; 1280x720; first annotated Capablanca game; default engine, 1 thread/64 MiB hash, 3 lines; stop search, settle 5 s; 50 alternating navigation samples after 10 warmups, then repeat with search running and follow-board enabled; keydown to two animation frames after current-move mutation; RSS of full descendant process tree.',
  baseline: await measure(baseline, false),
  candidate: await measure(candidate, true),
};
result.startupChangePercent =
  (result.candidate.medianStartupMs / result.baseline.medianStartupMs - 1) * 100;
result.memoryChangePercent =
  (result.candidate.medianRssMiB / result.baseline.medianRssMiB - 1) * 100;
result.pass =
  result.candidate.p95ResponseMs < 100 &&
  result.candidate.p95SearchingResponseMs < 100 &&
  result.startupChangePercent <= 10 &&
  result.memoryChangePercent <= 10;
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Saved ${output}; acceptance ${result.pass ? 'PASS' : 'FAIL'}`);
if (!result.pass) process.exitCode = 1;
