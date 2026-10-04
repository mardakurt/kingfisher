import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GameDatabase } from './database.mjs';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
const game = (id, headers) => ({
  game: {
    fingerprint: id,
    white: 'W',
    black: 'B',
    whiteKey: 'w',
    blackKey: 'b',
    result: '1-0',
    year: 2026,
    importedAt: 1,
    plyCount: 1,
  },
  pgn: `${headers}\n\n1. e4 {[Annotator "a comment, not a tag"]} 1-0`,
  positions: [{ positionKey: START, ply: 0, moveUci: 'e2e4', moveSan: 'e4', mover: 'w' }],
});

describe('tag keys', () => {
  let directory;
  let database;
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-tags-'));
    database = new GameDatabase(path.join(directory, 'tags.sqlite'));
  });
  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('reads the header tags only, page by page', () => {
    database.insertGames([
      game(
        'a',
        '[White "W"]\n[Annotator "Kasparov, G"]\n[Source "Mega \\"2026\\""]\n[WhiteTeam "Baku"]',
      ),
      game('b', '[White "W"]\n[Annotator "?"]'),
    ]);
    const first = database.tagKeys(null, 1);
    expect(first.games).toEqual([
      { id: first.games[0].id, annotator: 'Kasparov, G', source: 'Mega "2026"', whiteTeam: 'Baku' },
    ]);
    const second = database.tagKeys(first.nextAfter, 1);
    // "?" is no annotator, and a tag inside a comment is not a header.
    expect(second.games).toEqual([{ id: second.games[0].id }]);
    expect(database.tagKeys(second.nextAfter, 1)).toEqual({ games: [], nextAfter: null });
  });
});
