/**
 * The reader against a database En Croissant actually wrote.
 *
 * The fixture is shared with the decoder's tests: 60 real broadcast games
 * written by En Croissant 0.15.1's own importer, database format 1.0.0.
 */

import { mkdtempSync, rmSync, writeFileSync, copyFileSync, chmodSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { afterAll, describe, expect, it } from 'vitest';

import { EnCroissantError, inspect, readGames, SUPPORTED_VERSIONS } from './en-croissant.mjs';

const FIXTURE = fileURLToPath(
  new URL('../../src/database/encroissant/__fixtures__/en-croissant-0.15.db', import.meta.url),
);

const directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-ec-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('inspecting an En Croissant database', () => {
  it('reports what the file is, from the file itself', () => {
    const found = inspect(FIXTURE);
    expect(found.format).toBe('en-croissant');
    expect(found.supported).toBe(true);
    expect(found.version).toBe('1.0.0');
    expect(SUPPORTED_VERSIONS).toContain(found.version);
    expect(found.games).toBe(60);
    expect(found.players).toBeGreaterThan(50);
    expect(found.events).toBeGreaterThan(0);
    expect(found.firstDate).toMatch(/^\d{4}\./);
    expect(found.sizeBytes).toBe(statSync(FIXTURE).size);
  });

  it('refuses a version whose column meanings have not been confirmed', () => {
    const file = path.join(directory, 'future.db');
    copyFileSync(FIXTURE, file);
    const database = new DatabaseSync(file);
    database.exec("UPDATE Info SET Value = '9.9.9' WHERE Name = 'Version'");
    database.close();

    const found = inspect(file);
    expect(found.format).toBe('en-croissant');
    expect(found.supported).toBe(false);
    expect(found.reason).toMatch(/Unsupported En Croissant database version 9\.9\.9/);
    // Still describes what it found: an unsupported version is not an unreadable
    // file, and the count is what tells a user they picked the right database.
    expect(found.games).toBe(60);
  });

  it('says plainly when a SQLite file is some other program’s', () => {
    const file = path.join(directory, 'other.db');
    const database = new DatabaseSync(file);
    database.exec('CREATE TABLE Whatever (id INTEGER)');
    database.close();

    const found = inspect(file);
    expect(found.format).toBe('unrecognised');
    expect(found.supported).toBe(false);
    expect(found.reason).toMatch(/Not an En Croissant database/);
  });

  it('refuses a file that is not a database at all', () => {
    const file = path.join(directory, 'notes.txt');
    writeFileSync(file, 'this is not a database');
    expect(() => inspect(file)).toThrow(EnCroissantError);
  });

  it('refuses a path that does not exist', () => {
    expect(() => inspect(path.join(directory, 'absent.db'))).toThrow(/does not exist/);
  });
});

describe('reading games out of it', () => {
  it('returns joined metadata and the undecoded move blob', () => {
    const page = readGames(FIXTURE, { after: 0, limit: 5 });
    expect(page.games).toHaveLength(5);
    const [first] = page.games;
    expect(typeof first.white).toBe('string');
    expect(typeof first.black).toBe('string');
    expect(first.event).toBeTruthy();
    // Declared INTEGER in the schema, written as text by the program.
    expect(first.result).toMatch(/^(1-0|0-1|1\/2-1\/2|\*)$/);
    expect(first.plyCount).toBeGreaterThan(0);
    expect(Buffer.from(first.moves, 'base64').length).toBeGreaterThan(10);
  });

  it('pages by id so a large database is never materialised', () => {
    const seen = [];
    let after = 0;
    for (;;) {
      const page = readGames(FIXTURE, { after, limit: 25 });
      seen.push(...page.games.map((game) => game.id));
      if (page.nextAfter === null) break;
      after = page.nextAfter;
    }
    expect(seen).toHaveLength(60);
    // Strictly ascending, so no game is read twice and none is skipped.
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(new Set(seen).size).toBe(60);
  });

  it('does not modify the database it read', () => {
    const file = path.join(directory, 'untouched.db');
    copyFileSync(FIXTURE, file);
    const before = statSync(file);
    readGames(file, { limit: 60 });
    inspect(file);
    const after = statSync(file);
    expect(after.size).toBe(before.size);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  it('reads a database it has no permission to write', () => {
    const file = path.join(directory, 'readonly.db');
    copyFileSync(FIXTURE, file);
    chmodSync(file, 0o444);
    expect(inspect(file).games).toBe(60);
    expect(readGames(file, { limit: 3 }).games).toHaveLength(3);
  });
});
