/**
 * The native file workflows.
 *
 * The rules under test are the ones that decide what Kingfisher will open at
 * all, which is a security boundary as much as a convenience: a shell that
 * opens whatever it is handed is a shell that can be handed anything.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { RecentDocuments, isDatabasePath, isPgnPath, openableFromArgv, readPgn } from './files.mjs';

const workspace = mkdtempSync(path.join(tmpdir(), 'kingfisher-files-'));

describe('what Kingfisher will open', () => {
  it('recognises a PGN and a SQLite collection, whatever the case', () => {
    expect(isPgnPath('/games/Tal.pgn')).toBe(true);
    expect(isPgnPath('/games/Tal.PGN')).toBe(true);
    expect(isDatabasePath('/db/mine.kingfisher.sqlite')).toBe(true);
    expect(isDatabasePath('/db/encroissant.db3')).toBe(true);
  });

  it('refuses everything else, including things that merely contain the word', () => {
    for (const file of [
      '/games/notes.txt',
      '/games/pgn',
      '/games/report.pgn.zip',
      '/bin/stockfish',
      '/games/archive.pgn.zst',
      '/etc/passwd',
    ]) {
      expect(isPgnPath(file), file).toBe(false);
      expect(isDatabasePath(file), file).toBe(false);
    }
  });

  /*
    A double-clicked document arrives as an argument on Windows and Linux, in
    an argv that also carries Electron's own switches. Taking everything that
    is not a switch would mean opening whatever a shortcut had been edited to
    include; taking only what Kingfisher opens is the whole check.
  */
  it('takes documents out of an argv and leaves the switches alone', () => {
    expect(
      openableFromArgv([
        '/Applications/Kingfisher.app/Contents/MacOS/Kingfisher',
        '--inspect=9229',
        '/games/Fischer-Spassky.pgn',
        '--enable-logging',
        '/db/elite.sqlite',
        '/games/readme.md',
      ]),
    ).toEqual(['/games/Fischer-Spassky.pgn', '/db/elite.sqlite']);
  });

  it('finds nothing in an argv that names nothing', () => {
    expect(openableFromArgv(['/Applications/Kingfisher.app/Contents/MacOS/Kingfisher'])).toEqual(
      [],
    );
  });
});

describe('reading a chosen PGN', () => {
  it('hands back the text with the file it came from', async () => {
    const file = path.join(workspace, 'game.pgn');
    writeFileSync(file, '[Event "Test"]\n\n1. e4 e5 *\n');
    const document = await readPgn(file);
    expect(document.name).toBe('game.pgn');
    expect(document.path).toBe(file);
    expect(document.text).toContain('1. e4 e5');
  });

  /*
    The cap is not about what people import — a large archive goes through the
    streaming importer. It is about the path that hands a file straight to the
    renderer's parser, which holds it in memory. The failure has to name the
    other route, or it is just a refusal.
  */
  it('refuses a file too large to hold in memory, and says where to take it', async () => {
    const file = path.join(workspace, 'huge.pgn');
    writeFileSync(file, 'x');
    await expect(readPgn(file, { maxBytes: 0 })).rejects.toThrow(/Databases → Import/);
  });
});

describe('recent documents', () => {
  it('puts the newest first and never repeats one', () => {
    const recent = new RecentDocuments(5);
    recent.add('/games/a.pgn');
    recent.add('/games/b.pgn');
    recent.add('/games/a.pgn');
    expect(recent.list().map((entry) => entry.name)).toEqual(['a.pgn', 'b.pgn']);
  });

  it('is bounded', () => {
    const recent = new RecentDocuments(3);
    for (const name of ['a', 'b', 'c', 'd', 'e']) recent.add(`/games/${name}.pgn`);
    expect(recent.list().map((entry) => entry.name)).toEqual(['e.pgn', 'd.pgn', 'c.pgn']);
  });

  it('says which kind each entry is, so two names can be told apart', () => {
    const recent = new RecentDocuments();
    recent.add('/db/elite.sqlite');
    recent.add('/games/elite.pgn');
    expect(recent.list()).toEqual([
      { path: '/games/elite.pgn', name: 'elite.pgn', kind: 'pgn' },
      { path: '/db/elite.sqlite', name: 'elite.sqlite', kind: 'database' },
    ]);
  });

  it('clears, and forgets one', () => {
    const recent = new RecentDocuments();
    recent.add('/games/a.pgn');
    recent.add('/games/b.pgn');
    expect(recent.remove('/games/a.pgn').map((e) => e.name)).toEqual(['b.pgn']);
    expect(recent.clear()).toEqual([]);
  });
});
