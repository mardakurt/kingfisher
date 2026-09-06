import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { DatabaseMaintenance } from './database-maintenance.mjs';
import { writeTextSchemaFixture, readTextPositions } from './__fixtures__/text-schema.mjs';

const jobs = new DatabaseMaintenance();
const directory = mkdtempSync(path.join(tmpdir(), 'kf-maintenance-'));
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
