/**
 * The companion's search code is the application's, type-stripped
 * (`scripts/companion-shared.mjs`). A copy that differs from what the
 * TypeScript generates today is a second implementation, and fails here.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { generate, SHARED } from '../../scripts/companion-shared.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

describe('the companion’s shared search code', () => {
  it.each(SHARED)('%s.mjs is what src/search/%s.ts generates', (name) => {
    expect(readFileSync(path.join(HERE, 'shared', `${name}.mjs`), 'utf8')).toBe(generate(name));
  });

  it('loads in plain Node and answers', async () => {
    const { parseMaterialQuery, materialMatches } = await import('./shared/material-query.mjs');
    const query = parseMaterialQuery('R v B');
    expect(materialMatches('4k3/8/8/8/8/8/4b3/R3K3 w - - 0 1', query.query)).toBe(true);
    const { decodeLineIndex } = await import('./shared/line-index.mjs');
    expect(decodeLineIndex(new Uint8Array([9]))).toBeNull();
  });
});
