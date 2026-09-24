/**
 * A unit of this machine's speed, for tests that hold code to a time budget.
 *
 * A wall-clock budget cannot both pass on every runner and catch a real
 * regression: GitHub's shared runners differ by about two times from one run
 * to the next (measured in Phase 85 — the same commit's theme scan took 0.30
 * and 0.70 ms a game on two runs), so a budget loose enough for the slow one
 * lets a threefold regression through on the fast one. Timing a fixed
 * workload in the same process, just before the code under test, and stating
 * the budget as a multiple of it cancels the machine out.
 *
 * The workload is ordinary JavaScript of the kind the measured code is made
 * of — short strings, a map, small arrays, a sort — and touches none of it, so
 * a regression in the code under test cannot hide by slowing the unit too.
 */

function workload(): number {
  let total = 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < 20_000; i += 1) {
    const key = `k${(i * 7_919) % 5_003}`;
    counts.set(key, (counts.get(key) ?? 0) + i);
    const small = [i & 7, (i >> 3) & 7, (i >> 6) & 7];
    total += small.reduce((sum, value) => sum + value, 0) + key.charCodeAt(1);
  }
  const ordered = [...counts.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
  return total + ordered.length;
}

let sink = 0;

/** Milliseconds for one pass of the workload: the median of `runs` after a warm-up. */
export function calibrationUnitMs(runs = 9): number {
  for (let i = 0; i < 3; i += 1) sink += workload();
  const samples: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const started = performance.now();
    sink += workload();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(runs / 2)]!;
}

/** The median of `runs` timings of `measure`, in milliseconds. */
export function medianMs(runs: number, measure: () => void): number {
  const samples: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const started = performance.now();
    measure();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(runs / 2)]!;
}

/** Keeps the workload's result alive so the JIT cannot discard it. */
export const calibrationSink = (): number => sink;
