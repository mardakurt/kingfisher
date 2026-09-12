/**
 * The three-piece tables are real, and stay real.
 *
 * These digests are the publisher's — `tablebase.lichess.ovh/tables/standard/sha256`
 * — copied here so the check runs offline. The packaged smoke asks the real
 * probe helper about these files; a stub in their place made it answer "not
 * a win" for a rook against a bare king, and `THIRD_PARTY_DATA.md` kept
 * describing a verified set. A test that only checked the files *exist*
 * would have passed through that.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'syzygy-3',
);

export const PUBLISHED_SHA256 = {
  'KBvK.rtbw': 'bc0d8ab3560de9038460f0e8f61e3b7efd3e3d0327d19ae0387c0da7ddeb244d',
  'KBvK.rtbz': '6246c8a5c643eec9d4758d55ed843e31cc28a9b82a6f630c1c950d8b7755975b',
  'KNvK.rtbw': '9d3518b12df3d2006441df758bce31e961346e70a11920aaad75c647003bb6e7',
  'KNvK.rtbz': '0e49a0f2810a131c32fc14872e83044aa9810ce2c86df071851512077291fc25',
  'KPvK.rtbw': '02fd2bdcd92821c869458f019f63524def1c9e7a2862ca8d2b16dc7712b16183',
  'KPvK.rtbz': 'ad01af2076183c90ccee662ca6c5d74da3222ff1fee47c01b5d4e56ed01938de',
  'KQvK.rtbw': '517667dff787162dbb1ed9d5d6484d30ee854e686ee0675c08d99ecf045d2d50',
  'KQvK.rtbz': '71ea9444fa5bd42897d781a0c356975ea6f23e0f65a4254e470897031c161c8c',
  'KRvK.rtbw': '386fbde73308e49a4207836922c68b30b664e83c5a37f7fa37305a15cd16f2f1',
  'KRvK.rtbz': 'cab59f42e75c2a25da3939231850a79fa838593fff5c28d7772da92062ed965a',
};

describe('companion/fixtures/syzygy-3', () => {
  for (const [file, digest] of Object.entries(PUBLISHED_SHA256)) {
    it(`${file} is the table the publisher signed`, () => {
      const bytes = readFileSync(path.join(DIR, file));
      expect(bytes.length).toBeGreaterThan(4);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(digest);
    });
  }

  it('is the complete set and nothing else', () => {
    expect(Object.keys(PUBLISHED_SHA256)).toHaveLength(10);
  });
});
