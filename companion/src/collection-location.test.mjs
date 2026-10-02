import { afterAll, expect, it } from 'vitest';
import { mkdtempSync, realpathSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  collectionLocation,
  reserveCollection,
  checkImportStorage,
} from './collection-location.mjs';
const directory = mkdtempSync(path.join(tmpdir(), 'kf-location-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
it('creates only in the chosen directory and refuses an existing file', () => {
  const file = collectionLocation(directory, '../reference');
  expect(path.dirname(file)).toBe(realpathSync(directory));
  reserveCollection(file);
  writeFileSync(file, 'owner data');
  expect(() => reserveCollection(file)).toThrow();
  expect(readFileSync(file, 'utf8')).toBe('owner data');
  expect(() => collectionLocation('relative', 'reference')).toThrow();
});
it('checks database and WAL bytes and the free-space reserve', () => {
  const file = path.join(directory, 'budget.sqlite');
  writeFileSync(file, Buffer.alloc(1024 ** 2));
  expect(() => checkImportStorage(file, 1024 ** 2, 0)).toThrow('disk limit');
  writeFileSync(file, 'small');
  writeFileSync(file + '-wal', Buffer.alloc(1024 ** 2));
  expect(() => checkImportStorage(file, 1024 ** 2, 0)).toThrow('disk limit');
  rmSync(file + '-wal');
  expect(() => checkImportStorage(file, 1024 ** 3, Number.MAX_SAFE_INTEGER)).toThrow('Free-space');
});
