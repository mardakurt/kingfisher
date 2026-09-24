import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { crc32, zipStored } from './zip';

describe('a stored ZIP', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('is an archive the system unzip reads back byte for byte', () => {
    const entries = [
      { name: 'Study.cbh', bytes: Uint8Array.from([0, 1, 2, 3, 255]) },
      { name: 'Study.cbg', bytes: new Uint8Array(70_000).map((_, i) => i % 251) },
      { name: 'notes.txt', bytes: new TextEncoder().encode('Zürich') },
    ];
    const directory = mkdtempSync(path.join(tmpdir(), 'kf-zip-'));
    const file = path.join(directory, 'out.zip');
    writeFileSync(file, zipStored(entries, new Date(2026, 8, 24, 12, 30, 10)));
    // `unzip` is on macOS and on the Linux CI image; its test mode checks every CRC.
    const tested = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
    expect(tested).toMatch(/No errors detected/);
    execFileSync('unzip', ['-o', '-q', file, '-d', directory]);
    for (const entry of entries) {
      expect(new Uint8Array(readFileSync(path.join(directory, entry.name)))).toEqual(entry.bytes);
    }
  });
});
