/**
 * One share of a file import (Phase 85). Runs the application's own import
 * path (the bundled import kit) on its share of the games and hands the
 * prepared games to the job, which is the one writer. A PGN is shared out
 * game by game; a ChessBase database by blocks of game numbers, each worker
 * reading its records from disk at their offsets.
 */

import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';

import { readGameTexts } from './pgn-stream.mjs';

const { kitFile, kind, file, files, share, shares, keepPositions, batch } = workerData;
const kit = await import(pathToFileURL(kitFile).href);
const openings = await kit.loadOpeningIndex();

let credits = 3;
let wake = null;
parentPort.on('message', (message) => {
  if (message === 'ack') {
    credits += 1;
    wake?.();
  }
});
async function send(message) {
  while (credits <= 0) await new Promise((resolve) => (wake = resolve));
  credits -= 1;
  parentPort.postMessage(message);
}

if (kind === 'pgn') {
  let index = 0;
  let pending = [];
  const flush = async () => {
    if (pending.length === 0) return;
    const prepared = kit.preparePgnBatch(pending.join('\n\n'), openings, keepPositions);
    const read = pending.length;
    pending = [];
    await send({
      kind: 'batch',
      payloads: prepared.payloads,
      rejected: prepared.rejected + Math.max(0, read - prepared.read),
      read,
      failures: [],
    });
  };
  for await (const text of readGameTexts(file)) {
    const mine = index % shares === share;
    index += 1;
    if (!mine) continue;
    pending.push(text);
    if (pending.length >= batch) await flush();
  }
  await flush();
} else {
  // A ChessBase database, read from disk at the offsets asked for — never whole.
  const handles = [];
  const sources = new Map();
  for (const [extension, filePath] of Object.entries(files)) {
    const fd = openSync(filePath, 'r');
    handles.push(fd);
    const size = fstatSync(fd).size;
    sources.set(extension, {
      size,
      read(offset, length) {
        const want = Math.max(0, Math.min(length, size - offset));
        const buffer = Buffer.alloc(want);
        const got = want > 0 ? readSync(fd, buffer, 0, want, offset) : 0;
        return new Uint8Array(buffer.buffer, buffer.byteOffset, got);
      },
    });
  }
  try {
    const database = new kit.ChessBaseDatabase(path.basename(files.cbh, '.cbh'), sources);
    const total = database.count;
    for (let block = share; block * batch + 1 <= total; block += shares) {
      const from = block * batch + 1;
      const to = Math.min(total, from + batch - 1);
      const prepared = kit.prepareChessBaseRange(database, from, to, openings, keepPositions);
      await send({
        kind: 'batch',
        payloads: prepared.payloads,
        rejected: prepared.failures.length,
        read: to - from + 1,
        failures: prepared.failures.slice(0, 20),
      });
    }
  } finally {
    for (const fd of handles) closeSync(fd);
  }
}
parentPort.postMessage({ kind: 'done' });
