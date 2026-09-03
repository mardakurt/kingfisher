import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseSyzygyName, probeLocalTablebase, scanTablebaseDirectory } from './tablebase.mjs';

describe('reading a Syzygy filename', () => {
  it('derives the material and the piece count, kings included', () => {
    expect(parseSyzygyName('KQvK.rtbw')).toEqual({ material: 'KQvK', pieces: 3 });
    expect(parseSyzygyName('KRPvKR.rtbz')).toEqual({ material: 'KRPvKR', pieces: 5 });
    expect(parseSyzygyName('KQQvKQQ.rtbw')).toEqual({ material: 'KQQvKQQ', pieces: 6 });
  });

  it('ignores anything that is not a table, rather than guessing', () => {
    expect(parseSyzygyName('README.md')).toBeNull();
    expect(parseSyzygyName('notes.txt')).toBeNull();
    expect(parseSyzygyName('KQvKX.rtbw')).toBeNull();
    expect(parseSyzygyName('.DS_Store')).toBeNull();
  });
});

describe('scanning a tablebase directory', () => {
  let directory;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-tb-'));
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  const write = (name) => writeFileSync(path.join(directory, name), '');

  it('reports the real piece limit from the files present', () => {
    write('KQvK.rtbw');
    write('KQvK.rtbz');
    write('KRPvKR.rtbw');
    write('KRPvKR.rtbz');
    write('README.md');

    const scan = scanTablebaseDirectory(directory);

    expect(scan).toMatchObject({ configured: true, exists: true, maxPieces: 5 });
    expect(scan.wdl).toEqual(['KQvK', 'KRPvKR']);
    expect(scan.dtz).toEqual(['KQvK', 'KRPvKR']);
  });

  it('distinguishes having WDL tables from having DTZ tables', () => {
    // A real and common state: someone downloaded the WDL set and stopped.
    write('KQvK.rtbw');
    const scan = scanTablebaseDirectory(directory);

    expect(scan.wdl).toEqual(['KQvK']);
    expect(scan.dtz).toEqual([]);
  });

  it('says a directory is empty rather than claiming a limit', () => {
    expect(scanTablebaseDirectory(directory)).toMatchObject({ exists: true, maxPieces: 0 });
  });

  it('reports an unusable path instead of throwing', () => {
    const missing = scanTablebaseDirectory(path.join(directory, 'nope'));
    expect(missing).toMatchObject({ configured: true, exists: false, maxPieces: 0 });
    expect(missing.error).toBeTruthy();

    const file = path.join(directory, 'a-file');
    writeFileSync(file, '');
    expect(scanTablebaseDirectory(file)).toMatchObject({ exists: false });
  });

  it('says nothing is configured when nothing is', () => {
    expect(scanTablebaseDirectory(null)).toEqual({
      configured: false,
      path: null,
      exists: false,
      maxPieces: 0,
      wdl: [],
      dtz: [],
    });
  });

  it('finds nested files only where they are, not recursively', () => {
    mkdirSync(path.join(directory, 'inner'));
    writeFileSync(path.join(directory, 'inner', 'KQvK.rtbw'), '');
    // Syzygy directories are flat; recursing would report tables a probe
    // configured with this path could not actually open.
    expect(scanTablebaseDirectory(directory).maxPieces).toBe(0);
  });
});

describe('probing a local server', () => {
  it('reports a missing configuration as a condition, not an error', async () => {
    const probe = await probeLocalTablebase(null, '8/8/8/8/8/8/8/K6k w - - 0 1');
    expect(probe.ok).toBe(false);
    expect(probe.reason).toMatch(/No local tablebase server/);
  });

  it('reports an unreachable server so the caller can fall back', async () => {
    // Port 1 is reserved and nothing listens there.
    const probe = await probeLocalTablebase(
      'http://127.0.0.1:1',
      '8/8/8/8/8/8/8/K6k w - - 0 1',
      500,
    );
    expect(probe.ok).toBe(false);
    expect(probe.reason).toBeTruthy();
  });
});
