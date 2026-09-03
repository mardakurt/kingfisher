#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { env, exit, platform, arch, version } from 'node:process';

console.log(`Kingfisher reproducible local benchmark group`);
console.log(`node ${version} · ${platform}-${arch}`);
console.log(`PGN count: ${env.KINGFISHER_BENCH_PGN_COUNT ?? '100000'}\n`);

const commands = [
  ['node', ['scripts/bench-pgn.mjs', env.KINGFISHER_BENCH_PGN_COUNT ?? '100000']],
  ['node', ['scripts/bench-aggregates.mjs', env.KINGFISHER_BENCH_AGGREGATE_COUNT ?? '100000']],
  ['node', ['scripts/bench-rules-experiment.mjs', env.KINGFISHER_BENCH_RULES_COUNT ?? '20000']],
  ['npm', ['run', 'bench:evidence']],
  ['npm', ['test', '--', '--run', 'src/performance']],
];

if (existsSync('.next')) {
  commands.push(['node', ['scripts/bundle-report.mjs']]);
} else {
  console.log('Route bundle report skipped: run `npm run build` first.');
}

if (env.KINGFISHER_COMPANION_TOKEN) {
  commands.push([
    'npm',
    ['run', 'bench:sqlite', '--', env.KINGFISHER_BENCH_SQLITE_COUNT ?? '100000'],
  ]);
} else {
  console.log('SQLite benchmark skipped: KINGFISHER_COMPANION_TOKEN is not configured.');
}

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.status !== 0) exit(result.status ?? 1);
}
