/** Sample the entire packaged process tree while the existing 50-cycle soak runs. */
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { once } from 'node:events';

let [binary, output] = process.argv.slice(2);
if (!binary || !output)
  throw new Error('Usage: node scripts/desktop-interface-soak.mjs candidate.app results.json');
if (binary.endsWith('.app')) binary += '/Contents/MacOS/Kingfisher';
const started = Date.now();
const samples = [];
const errors = [];
function sample() {
  try {
    const table = execFileSync('ps', ['-eo', 'pid=,ppid=,rss=,args='], {
      encoding: 'utf8',
      timeout: 3000,
    })
      .split('\n')
      .flatMap((line) => {
        const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
        return match
          ? [
              {
                pid: Number(match[1]),
                parent: Number(match[2]),
                rssKiB: Number(match[3]),
                command: match[4],
              },
            ]
          : [];
      });
    const roots = table.filter(
      (row) =>
        row.command.startsWith(binary) &&
        /--user-data-dir=.*kingfisher-acceptance-/.test(row.command),
    );
    for (const root of roots) {
      const processes = new Set([root.pid]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const row of table) {
          if (!processes.has(row.pid) && processes.has(row.parent)) {
            processes.add(row.pid);
            changed = true;
          }
        }
      }
      samples.push({
        atMs: Date.now() - started,
        pid: root.pid,
        rssMiB:
          table.filter((row) => processes.has(row.pid)).reduce((sum, row) => sum + row.rssKiB, 0) /
          1024,
        processes: processes.size,
      });
    }
  } catch (error) {
    errors.push(String(error));
  }
}

const child = spawn('npm', ['run', 'desktop:soak:leaks'], {
  env: {
    ...process.env,
    KINGFISHER_ACCEPTANCE_BINARY: binary,
    KINGFISHER_SOAK_CYCLES: '50',
    KINGFISHER_SOAK_CHAIN_PASSES: '12',
  },
  stdio: 'inherit',
});
const timer = setInterval(sample, 5000);
const [code, signal] = await once(child, 'exit');
clearInterval(timer);
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const groups = [...new Set(samples.map((s) => s.pid))].map((pid) => {
  const values = samples.filter((s) => s.pid === pid);
  // Exclude the first two minutes of engine/module/cache warmup from trend analysis.
  const warm = values.filter((s) => s.atMs - values[0].atMs >= 120_000);
  const bins = Array.from({ length: 5 }, (_, bin) => {
    const part = warm.slice(
      Math.floor((bin * warm.length) / 5),
      Math.floor(((bin + 1) * warm.length) / 5),
    );
    return part.length ? median(part.map((s) => s.rssMiB)) : null;
  });
  const changePercent = bins.every((value) => value !== null)
    ? (bins[4] / bins[0] - 1) * 100
    : null;
  const monotonicGrowth =
    changePercent !== null &&
    changePercent > 0 &&
    bins.slice(1).every((value, index) => value > bins[index]);
  return {
    pid,
    samples: values.length,
    firstRssMiB: values[0].rssMiB,
    lastRssMiB: values.at(-1).rssMiB,
    peakRssMiB: Math.max(...values.map((s) => s.rssMiB)),
    warmMedianBinsMiB: bins,
    changePercent,
    monotonicGrowth,
  };
});
const report = {
  binary,
  cycles: 50,
  researchChainPasses: 12,
  intervalMs: 5000,
  code,
  signal,
  errors,
  groups,
  samples,
  note: 'RSS sums the whole descendant tree and does not deduplicate shared pages. Five post-warm median bins flag any strictly monotonic increase; resource constructors are independently gated by the existing soak.',
};
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ groups, exitCode: code, output }, null, 2));
if (
  code !== 0 ||
  errors.length ||
  !groups.some((g) => g.samples >= 10 && g.changePercent !== null) ||
  groups.some((g) => g.monotonicGrowth)
)
  process.exitCode = 1;
