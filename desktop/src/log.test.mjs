import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { log, openLog } from './log.mjs';

it('sanitizes unknown URL credentials and home paths before writing them to disk', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-log-test-'));
  try {
    const file = openLog(directory);
    log(
      'test',
      'https://alice:private-password@example.org/manifest.json?key=private-key#private-fragment /Users/alice/log /home/bob/log C:\\Users\\Carol\\log',
    );
    const written = readFileSync(file, 'utf8');
    for (const value of [
      'alice',
      'private-password',
      'private-key',
      'private-fragment',
      'bob',
      'Carol',
    ])
      expect(written).not.toContain(value);
    expect(written).toContain('https://example.org/manifest.json');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
