import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BRAND_ICON_VERSION, versionedIcon } from './brand-icon-version';

describe('the brand icon version', () => {
  it('is the hash of the master mark, so a redrawn mark changes every icon URL', () => {
    const master = readFileSync(path.join(process.cwd(), 'brand', 'kingfisher-mark.svg'));
    const digest = createHash('sha256').update(master).digest('hex').slice(0, 12);
    expect(BRAND_ICON_VERSION).toBe(digest);
  });

  it('appends itself to a bare path', () => {
    expect(versionedIcon('/icon-192.png')).toBe(`/icon-192.png?v=${BRAND_ICON_VERSION}`);
  });
});
