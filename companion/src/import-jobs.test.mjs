/**
 * A file import leaves nothing running behind it (Phase 86).
 *
 * Each import worker, having sent its last batch, kept listening on its port
 * for acknowledgements, and a listening port keeps a thread alive — so every
 * large-file import left one idle thread per share, each holding the import
 * kit and the opening index, until the companion quit. Found when the Phase 86
 * import benchmark finished its work and never exited.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { GameDatabase } from './database.mjs';
import { runImport } from './import-jobs.mjs';

const directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-import-jobs-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const ports = () =>
  process.getActiveResourcesInfo().filter((name) => name === 'MessagePort').length;

describe('runImport', () => {
  it('imports a file and leaves no worker thread or port behind', async () => {
    const pgn = Array.from(
      { length: 40 },
      (_, index) =>
        `[Event "Leak ${index}"]\n[White "A${index}"]\n[Black "B${index}"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ${index % 2 ? '4. Ba4' : '4. Bxc6'} 1-0`,
    ).join('\n\n');
    const file = path.join(directory, 'leak.pgn');
    writeFileSync(file, pgn);
    const database = new GameDatabase(path.join(directory, 'leak.sqlite'));
    const before = ports();
    const stats = await runImport(database, { file, workers: 3, keepPositions: true }, () => {});
    expect(stats.imported).toBe(40);
    // Give a terminating thread its turn of the event loop.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(ports()).toBe(before);
    database.close();
  }, 60_000);
});
