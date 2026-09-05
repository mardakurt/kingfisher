/**
 * Where Kingfisher's reference data comes from.
 *
 * One entry per upstream archive, with its licence recorded beside its URL so
 * that `THIRD_PARTY_DATA.md` can be checked against this file rather than
 * against memory. Nothing is fetched from anywhere not listed here, and every
 * download is verified against the digest the upstream publisher itself
 * serves — not one this project computed after the fact, which would only
 * prove the file had not changed since Kingfisher first downloaded it.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

export const LICHESS_BROADCAST = {
  id: 'lichess-broadcast',
  name: 'Lichess broadcast archive',
  page: 'https://database.lichess.org/#broadcasts',
  base: 'https://database.lichess.org/broadcast/',
  checksums: 'https://database.lichess.org/broadcast/sha256sums.txt',
  license: {
    id: 'CC-BY-SA-4.0',
    name: 'Creative Commons Attribution-ShareAlike 4.0 International',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attribution: 'Lichess broadcast archive — lichess.org, CC BY-SA 4.0',
  },
  description:
    'Games relayed through Lichess broadcasts, ' +
    'published monthly as PGN and released under CC BY-SA 4.0.',
};

export const LICHESS_STANDARD = {
  id: 'lichess-standard',
  name: 'Lichess standard rated games database',
  page: 'https://database.lichess.org/#standard_games',
  base: 'https://database.lichess.org/standard/',
  checksums: 'https://database.lichess.org/standard/sha256sums.txt',
  license: {
    id: 'CC0-1.0',
    name: 'Creative Commons Zero v1.0 Universal',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'Lichess standard rated games database — lichess.org, CC0 1.0',
  },
  description:
    'Every rated game played on Lichess, published monthly as zstd-compressed ' +
    'PGN and dedicated to the public domain.',
  /*
    Streamed, never stored. A month of this archive is close to thirty
    gigabytes compressed and several hundred decompressed, so the builder pipes
    it from the socket through a zstd decoder and discards every game it does
    not keep. `fetchVerified` below downloads into the cache, which is right for
    the broadcast archives and impossible here.
  */
  streaming: true,
};

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

/** The upstream digest list, as published, parsed into `file → sha256`. */
export async function fetchChecksums(source) {
  const response = await fetch(source.checksums);
  if (!response.ok) throw new Error(`${source.checksums} → HTTP ${response.status}`);
  const text = await response.text();
  const digests = new Map();
  for (const line of text.split('\n')) {
    const match = /^([0-9a-f]{64})\s+(\S+)$/.exec(line.trim());
    if (match) digests.set(match[2], match[1]);
  }
  if (digests.size === 0) throw new Error(`${source.checksums} listed no digests.`);
  return digests;
}

/**
 * Download `file` into `dir` unless a byte-identical copy is already there.
 *
 * A file whose digest does not match the published one is deleted rather than
 * kept, because a half-downloaded archive that stays on disk is a build that
 * silently produces a smaller pack the next time it runs.
 */
export async function fetchVerified(source, file, expected, dir, onProgress) {
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, file);

  if (existsSync(target) && statSync(target).size > 0) {
    const local = sha256(readFileSync(target));
    if (local === expected) return { file, path: target, sha256: local, cached: true };
  }

  const url = new URL(file, source.base).toString();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const digest = sha256(buffer);
  if (digest !== expected) {
    throw new Error(`${file}: published digest ${expected}, downloaded ${digest}.`);
  }
  writeFileSync(target, buffer);
  onProgress?.({ file, bytes: buffer.length });
  return { file, path: target, sha256: digest, cached: false };
}

export { sha256 };
