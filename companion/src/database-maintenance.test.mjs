import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DatabaseMaintenance } from './database-maintenance.mjs';
import { writeTextSchemaFixture, readTextPositions } from './__fixtures__/text-schema.mjs';

/*
  Both created per test. The directory used to be made once at module load and
  removed in `afterEach`, which works for exactly one test and leaves the
  second unable to open a database in a directory that is no longer there.
*/
let jobs;
let directory;
beforeEach(() => {
  jobs = new DatabaseMaintenance();
  directory = mkdtempSync(path.join(tmpdir(), 'kf-maintenance-'));
});
afterEach(async () => {
  await jobs.close();
  rmSync(directory, { recursive: true, force: true });
});

it('runs real migration and read-only integrity off the companion event loop', async () => {
  const file = path.join(directory, 'test.sqlite');
  writeTextSchemaFixture(file, { games: 1000, pliesPerGame: 10 });
  const before = readTextPositions(file);
  jobs.start('test', file, 'compact');
  expect(jobs.busy('test')).toBe(true);
  expect(() => jobs.start('test', file, 'compact')).toThrow('already');
  let ticks = 0;
  const timer = setInterval(() => {
    ticks += 1;
  }, 5);
  try {
    await expect.poll(() => jobs.status('test').status).toBe('completed');
    expect(ticks).toBeGreaterThan(1);
    expect(readTextPositions(file)).toEqual(before);
    jobs.start('test', file, 'integrity');
    await expect.poll(() => jobs.status('test').status).toBe('completed');
    expect(jobs.status('test').result).toMatchObject({ consistent: true, sqlite: ['ok'] });
    expect(readTextPositions(file)).toEqual(before);
  } finally {
    clearInterval(timer);
  }
});

it('leaves the collection exactly as it was when a compaction is cancelled', async () => {
  /*
    The claim Phase 18 makes about cancelling is not "it stops" but "it stops
    without changing anything", and that is the half worth testing. A migration
    commits per chunk, so a cancel lands between two committed transactions;
    what must survive it is a collection that still reads as the text-schema
    collection it was, row for row.
  */
  const file = path.join(directory, 'cancel.sqlite');
  writeTextSchemaFixture(file, { games: 4000, pliesPerGame: 12 });
  const before = readTextPositions(file);
  expect(before).toHaveLength(48_000);

  jobs.start('cancel', file, 'compact');
  await expect.poll(() => jobs.status('cancel').phase, { timeout: 10_000 }).toBeTruthy();
  jobs.cancel('cancel');

  await expect.poll(() => jobs.status('cancel').status, { timeout: 20_000 }).not.toBe('running');
  // Cancelled, not failed: the difference is whether the user asked for it.
  expect(jobs.status('cancel').status).toBe('cancelled');

  // Every position still readable, and identical to what was there before.
  expect(readTextPositions(file)).toEqual(before);
});

it('refuses an operation it does not know, rather than starting a worker for it', () => {
  const file = path.join(directory, 'unknown.sqlite');
  writeTextSchemaFixture(file, { games: 2, pliesPerGame: 2 });
  expect(() => jobs.start('unknown', file, 'vacuum-everything')).toThrow('Unknown maintenance');
  expect(jobs.status('unknown')).toBeNull();
});
