#!/usr/bin/env node
/**
 * A deterministic test stub that speaks the same protocol as the
 * real `kingfisher-tbprobe` helper built from Fathom. It is used
 * to test the *helper process management* without requiring the
 * user to build a C compiler and download 56 KB of real Syzygy
 * tables.
 *
 * Protocol (must stay in sync with `tbprobe-helper.mjs`):
 *
 *   - The process is started with `--path=<directory>` as its
 *     single argument.
 *   - First line on stdout is the ready banner: `{ready: true,
 *     largest: <number>}` when the directory contains files, or
 *     `{ready: false, reason: '...'}` when it does not.
 *   - Subsequent lines are probe answers, one JSON object per
 *     FEN line read from stdin.
 *
 * The stub:
 *
 *   - Decides `largest` from the piece counts encoded in
 *     Syzygy filename conventions (`<side1>v<side2>.rtbw`).
 *   - Returns a small fixed dictionary of correct answers for
 *     the FEN strings the suite cares about, and a structured
 *     refusal for everything else.
 *
 * The answer dictionary lives in `tbprobe-answers.mjs` so the
 * automated test (`tbprobe-real.test.mjs`) can assert it
 * without having to spawn a process.
 */

import { readdirSync } from 'node:fs';
import { argv } from 'node:process';

import { answers, looksLikeFen } from './tbprobe-answers.mjs';

const arg = argv.find((a) => a.startsWith('--path='));
const directory = arg ? arg.slice('--path='.length) : null;

let largest = 0;
if (directory) {
  try {
    for (const name of readdirSync(directory)) {
      /* Syzygy tablebase names are `<side1>v<side2>.rtbw`, where
         each side lists the pieces on that side as letter codes
         (K, R, N, B, Q, P). The piece count for the table is
         the total number of piece letters in the filename. The
         stub uses the same convention to derive the largest
         table in the directory. */
      const m = /^([A-Z]+)v([A-Z]+)\.(rtbw|rtbz)$/.exec(name);
      if (m) {
        const value = m[1].length + m[2].length;
        if (value > largest) largest = value;
      }
    }
  } catch {
    /* directory unreadable — the real helper would surface this;
       the stub refuses below. */
  }
}

if (!directory || largest === 0) {
  process.stdout.write(
    JSON.stringify({ ready: false, reason: 'No Syzygy tables in directory.' }) + '\n',
  );
  process.exit(0);
}

process.stdout.write(JSON.stringify({ ready: true, largest }) + '\n');

/* Read probe lines from stdin one chunk at a time. The real
   helper does the same. The handler must keep the event loop
   alive — `readable` mode does that as long as stdin is open;
   once stdin closes the process exits naturally. */
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  const lines = chunk.split('\n');
  for (const line of lines) {
    const fen = line.trim();
    if (!fen) continue;
    if (fen in answers) {
      process.stdout.write(JSON.stringify(answers[fen]) + '\n');
    } else if (looksLikeFen(fen)) {
      process.stdout.write(
        JSON.stringify({ ok: false, reason: 'Position outside supported tables.' }) + '\n',
      );
    } else {
      process.stdout.write(JSON.stringify({ ok: false, reason: 'Unreadable FEN.' }) + '\n');
    }
  }
});
process.stdin.on('end', () => {
  /* The real helper exits when stdin closes; we mirror that so
     a leaked process is a real test failure, not a quiet one. */
  process.exit(0);
});
process.stdin.on('error', () => {
  /* Mirror the real helper: a broken pipe is not an error from
     the helper's point of view, it is the caller going away. */
  process.exit(0);
});
