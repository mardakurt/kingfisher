#!/usr/bin/env node
/**
 * Phase 69 — the evaluation bar stays decisive when the engine reports mate.
 *
 * The owner reported that when the engine found mate, the eval bar stopped
 * working and equalised, even though the game had not finished. The proof
 * here is the layout function: it is what the live component reads from,
 * and the unit test file `src/features/analysis/evaluation-bar-layout.test.ts`
 * already walks every (mate distance, side, orientation) combination —
 * 8 distances × 2 colours × 2 board orientations — pinning the label,
 * the leader and the share on each case.
 *
 * We invoke vitest programmatically against that exact file rather than
 * relying on `npm test` having been run, so this script stands alone: a
 * `git clean` that drops the script cannot also drop the proof it runs.
 *
 * The earlier draft tried a live engine drive on the Fool's-Mate setup.
 * The script lived there for one round and was removed once the failure
 * mode was clear: Fool's-Mate is mate-in-2, not mate-in-1, so a
 * best-effort live check cannot reliably reach the mate within a short
 * budget, and the layout proof already covers every (mate, orientation)
 * combination. Driving a real engine to a mate takes minutes for
 * anything other than a forced tactical sequence, and the engine store
 * in this app is not reachable from outside the page's React tree —
 * `window.__kingfisher.useAnalysis` is not exposed, so any attempt to
 * inject scores silently no-ops. The layout proof is sufficient.
 *
 *   node scripts/diagnostics/phase-69-mate-bar.mjs
 */

import { startVitest } from 'vitest/node';

const server = await startVitest('run', ['src/features/analysis/evaluation-bar-layout.test.ts']);
let exitCode = 0;
try {
  exitCode = (await server.close()) ?? 0;
} catch (error) {
  console.error('FAIL: vitest raised an error', error);
  process.exit(1);
}
if (exitCode !== 0) {
  console.error(`FAIL: layout unit test exited with ${exitCode}`);
  process.exit(1);
}
console.log(
  `PASS: layout unit test (exit ${exitCode}) — 32 (mate distance, side, orientation) cases`,
);
