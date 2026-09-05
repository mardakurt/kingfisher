#!/usr/bin/env node

/**
 * Reproducible depth and ECO-volume metrics for Kingfisher's named-position
 * index. This measures plies; the report also prints full-move equivalents so
 * a 20-move requirement can never accidentally become a 20-ply requirement.
 */

import { closeApp, loadApp } from './load-app.mjs';

const median = (values) => {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2
    : (ordered[middle] ?? 0);
};

async function main() {
  const generated = await loadApp(['/src/theory/opening-index.generated.ts']);
  const depths = Object.values(generated.OPENING_POSITIONS).map((entry) => entry[2]);
  const volumes = Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map((volume) => [volume, 0]));

  for (const packed of Object.values(generated.OPENING_POSITIONS)) {
    const eco = generated.OPENING_LABELS[packed[0]] ?? '';
    const volume = eco.slice(0, 1);
    if (volume in volumes) volumes[volume] += 1;
  }

  const atLeast = (plies) => depths.filter((depth) => depth >= plies).length;
  const maximum = Math.max(...depths);
  console.log('Kingfisher opening identity depth');
  console.log(`named positions       ${depths.length.toLocaleString()}`);
  console.log(`maximum depth         ${maximum} plies (${maximum / 2} full moves)`);
  console.log(`median depth          ${median(depths)} plies`);
  for (const plies of [20, 30, 40]) {
    console.log(
      `positions >= ${String(plies).padStart(2)} plies ${atLeast(plies).toLocaleString()}`,
    );
  }
  console.log('coverage by ECO volume');
  for (const [volume, count] of Object.entries(volumes)) {
    console.log(`  ${volume} ${count.toLocaleString()}`);
  }
  console.log(`dataset digest        ${generated.OPENING_DATASET_DIGEST}`);
  await closeApp();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : error);
  await closeApp();
  process.exit(1);
});
