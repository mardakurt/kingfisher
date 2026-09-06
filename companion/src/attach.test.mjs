/**
 * The one route that takes a path, and everything it refuses.
 *
 * These are not edge cases. A desktop file dialog is a person choosing a file,
 * and people choose the wrong file — the En Croissant database they meant to
 * import, the SQLite file some other program made, a PGN. What matters is that
 * every one of those costs a sentence rather than a schema written into
 * somebody else's data, so each is asserted here by *reading the file back*
 * after the refusal and requiring it to be unchanged.
 */

import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { AttachError, inspectCollection } from './attach.mjs';
import { GameDatabase } from './database.mjs';

const workspace = mkdtempSync(path.join(tmpdir(), 'kingfisher-attach-'));
const at = (name) => path.join(workspace, name);

/** A real Kingfisher collection, made the way the product makes one. */
function collection(name, games = 0) {
  const file = at(name);
  const db = new GameDatabase(file);
  if (games > 0) {
    db.insertGames(
      Array.from({ length: games }, (_, index) => ({
        game: {
          fingerprint: `fp-${index}`,
          white: 'Fischer, Robert J.',
          black: 'Spassky, Boris V.',
          whiteKey: 'fischer, robert j.',
          blackKey: 'spassky, boris v.',
          result: '1-0',
          date: '1972.07.11',
          year: 1972,
          event: 'World Championship',
          site: 'Reykjavik',
          round: String(index + 1),
          whiteRating: 2785,
          blackRating: 2660,
          plyCount: 1,
          importedAt: 1972,
        },
        pgn: '[Event "World Championship"]\n\n1. e4 *',
        positions: [
          {
            positionKey: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
            ply: 0,
            moveUci: 'e2e4',
            moveSan: 'e4',
            mover: 'w',
          },
        ],
      })),
    );
  }
  db.close();
  return file;
}

describe('opening a collection by path', () => {
  it('accepts a Kingfisher collection and describes it', () => {
    const file = collection('Elite.kingfisher.sqlite', 3);
    const described = inspectCollection(file);
    expect(described.name).toBe('Elite');
    expect(described.games).toBe(3);
    expect(described.path).toBe(file);
    expect(described.bytes).toBeGreaterThan(0);
  });

  it('says so when there is no file there', () => {
    expect(() => inspectCollection(at('nothing.sqlite'))).toThrow(AttachError);
    expect(() => inspectCollection(at('nothing.sqlite'))).toThrow(/There is no file/);
  });

  it('refuses a directory', () => {
    expect(() => inspectCollection(workspace)).toThrow(/is not a file/);
  });

  /*
    The refusal that matters most. `GameDatabase`'s constructor runs its schema
    DDL, which writes — so a route that opened whatever it was handed would add
    Kingfisher's tables to a database belonging to something else. The
    byte-for-byte comparison is what makes this a test of the *file* rather
    than of the error message.
  */
  it('refuses a database it did not create, and does not touch it', () => {
    const file = at('someone-elses.sqlite');
    const other = new DatabaseSync(file);
    other.exec(
      'CREATE TABLE invoices (id INTEGER PRIMARY KEY, total REAL); INSERT INTO invoices VALUES (1, 9.99);',
    );
    other.close();
    const before = readFileSync(file);

    expect(() => inspectCollection(file)).toThrow(/is not a Kingfisher collection/);
    expect(readFileSync(file).equals(before)).toBe(true);
  });

  it('names En Croissant rather than lumping it in with the rest', () => {
    const file = at('encroissant.db3');
    const db = new DatabaseSync(file);
    db.exec(
      'CREATE TABLE Games (ID INTEGER PRIMARY KEY); CREATE TABLE Players (ID INTEGER PRIMARY KEY);',
    );
    db.close();
    const before = readFileSync(file);

    let thrown;
    try {
      inspectCollection(file);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AttachError);
    expect(thrown.message).toMatch(/En Croissant database/);
    expect(thrown.remedy).toMatch(/without writing to it/);
    expect(readFileSync(file).equals(before)).toBe(true);
  });

  it('refuses a file that is not a database at all, and leaves it alone', () => {
    const file = at('game.pgn');
    writeFileSync(file, '[Event "Reykjavik"]\n\n1. e4 e5 *\n');
    const before = readFileSync(file);
    expect(() => inspectCollection(file)).toThrow(AttachError);
    expect(readFileSync(file).equals(before)).toBe(true);
  });

  /*
    A collection whose `games` table has been changed out from under Kingfisher
    is a different failure from "not a collection", and it names the column.
  */
  it('refuses a games table it does not recognise, and says which column is missing', () => {
    const file = at('bent.sqlite');
    const db = new DatabaseSync(file);
    db.exec(
      'CREATE TABLE games (id INTEGER PRIMARY KEY, white TEXT);' +
        'CREATE TABLE positions (position_key TEXT, game_id INTEGER, ply INTEGER, move_uci TEXT);',
    );
    db.close();
    let thrown;
    try {
      inspectCollection(file);
    } catch (error) {
      thrown = error;
    }
    expect(thrown.message).toMatch(/games table Kingfisher does not recognise/);
    expect(thrown.remedy).toMatch(/fingerprint/);
  });
});
