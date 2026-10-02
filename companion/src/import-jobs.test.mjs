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
import { createHash } from 'node:crypto';
import { readGameTexts } from './pgn-stream.mjs';
import { runImport, loadKit } from './import-jobs.mjs';

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

it('verifies before writes and records a verified, deduplicated update', async () => {
  const pgn = '[White "Checksum"]\n[Black "Test"]\n[Result "*"]\n\n1. e4 e5 *';
  const file = path.join(directory, 'checksum.pgn');
  writeFileSync(file, pgn);
  const db = new GameDatabase(path.join(directory, 'checksum.sqlite'));
  try {
    await expect(runImport(db, { file, workers: 1, sha256: '0'.repeat(64) })).rejects.toThrow(
      'checksum mismatch',
    );
    expect(db.count()).toBe(0);
    const sha256 = createHash('sha256').update(pgn).digest('hex');
    const first = await runImport(db, { file, workers: 1, sha256, licence: 'Test fixture only' });
    expect(first.imported).toBe(1);
    const again = await runImport(db, { file, workers: 1, sha256 });
    expect(again.imported).toBe(0);
    expect(again.duplicates).toBe(1);
    expect(db.sources()[0].note).toContain(sha256);
  } finally {
    db.close();
  }
}, 60000);

it.each(['rows', 'postings'])(
  'rolls back only new update records after reopening (%s)',
  async (layout) => {
    const file = path.join(directory, `updates-${layout}.pgn`);
    const base = '[White "Original"]\n[Black "Game"]\n[Result "*"]\n\n1. e4 e5 *';
    const added = '[White "Added"]\n[Black "Game"]\n[Result "*"]\n\n1. d4 d5 *';
    const dbFile = path.join(directory, `updates-${layout}.sqlite`);
    const kit = await loadKit();
    let db = new GameDatabase(dbFile, { layout, kit });
    try {
      writeFileSync(file, base);
      await runImport(db, { file, workers: 1 });
      writeFileSync(file, base + '\n\n' + added);
      await runImport(db, { file, workers: 1 });
      expect(db.count()).toBe(2);
      const update = db.updates()[0];
      expect(update.retainedGames).toBe(1);
      db.close();
      db = new GameDatabase(dbFile, { kit });
      expect(db.rollbackUpdate(update.id)).toEqual({ deleted: 1 });
      expect(db.count()).toBe(1);
      expect(db.rollbackUpdate(update.id)).toEqual({ deleted: 0 });
      expect(db.updates()[0].status).toBe('rolled-back');
    } finally {
      db.close();
    }
  },
  60000,
);

it('filters headers without losing selected PGN annotations or variations', async () => {
  const file = path.join(directory, 'filtered.pgn');
  writeFileSync(
    file,
    '[WhiteElo "1000"]\n\n1. Qh9 *\n\n[WhiteElo "2500"]\n\n1. e4 {Keep this note.} (1. d4) e5 *\n',
  );
  let rejected = 0;
  const texts = [];
  for await (const text of readGameTexts(file, {
    accept: (tags) => Number(tags.WhiteElo) >= 2400,
    onRejected: () => {
      rejected += 1;
    },
  }))
    texts.push(text);
  expect(rejected).toBe(1);
  expect(texts).toHaveLength(1);
  expect(texts[0]).toContain('{Keep this note.} (1. d4)');
});
