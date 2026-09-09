import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { positionKey } from '@/chess/fen';
import { Position } from '@/chess/position';

import {
  OPENING_DATASET_DIGEST,
  OPENING_DEEPEST_PLY,
  OPENING_ENTRY_COUNT,
  OPENING_LABELS,
  OPENING_POSITIONS,
} from './opening-index.generated';

/**
 * The generated index against the files it was generated from.
 *
 * A generated artefact checked into the repository has exactly one failure
 * mode worth guarding: somebody edits the source and forgets to regenerate, or
 * edits the generated file by hand. Both leave a build whose opening names no
 * longer come from the dataset it claims to come from — and neither shows up in
 * any other test, because every other test asks the index what it thinks rather
 * than whether it is current.
 *
 * The digest check is the cheap half. The replay is the honest half: it takes
 * the dataset's own move lists and confirms the keys in the generated file are
 * the ones this application's rules code produces today, not the ones some
 * earlier version of it produced.
 */

const DATA = path.join(process.cwd(), 'data', 'openings');

const datasetDigest = () => {
  const hash = createHash('sha256');
  for (const file of readdirSync(DATA).sort()) {
    if (!file.endsWith('.tsv')) continue;
    hash.update(file);
    hash.update(readFileSync(path.join(DATA, file)));
  }
  return hash.digest('hex').slice(0, 16);
};

function datasetRows() {
  const rows: { eco: string; name: string; pgn: string }[] = [];
  for (const volume of ['a', 'b', 'c', 'd', 'e']) {
    const lines = readFileSync(path.join(DATA, `${volume}.tsv`), 'utf8').split('\n');
    for (const line of lines.slice(1)) {
      if (line.trim().length === 0) continue;
      const [eco, name, pgn] = line.split('\t');
      if (!eco || !name || !pgn) continue;
      rows.push({ eco: eco.trim(), name: name.trim(), pgn: pgn.trim() });
    }
  }
  return rows;
}

const movesOf = (pgn: string) =>
  pgn
    .split(/\s+/)
    .map((token) => token.replace(/^\d+\.(\.\.)?/, ''))
    .filter((token) => token.length > 0 && !/^\d+\.?$/.test(token));

describe('the generated opening index', () => {
  it('was built from the vendored dataset as it stands now', () => {
    expect(OPENING_DATASET_DIGEST).toBe(datasetDigest());
  });

  it('has one entry per position and agrees with its own counters', () => {
    expect(Object.keys(OPENING_POSITIONS)).toHaveLength(OPENING_ENTRY_COUNT);
    const deepest = Math.max(...Object.values(OPENING_POSITIONS).map((entry) => entry[2]));
    expect(deepest).toBe(OPENING_DEEPEST_PLY);
  });

  it('references only labels that exist', () => {
    for (const [eco, label] of Object.values(OPENING_POSITIONS)) {
      expect(OPENING_LABELS[eco]).toMatch(/^[A-E]\d{2}$/);
      expect(typeof OPENING_LABELS[label]).toBe('string');
      expect(OPENING_LABELS[label]?.length).toBeGreaterThan(0);
    }
  });

  it(
    "holds the keys this build's rules code produces for every dataset line",
    () => {
      const rows = datasetRows();
      expect(rows.length).toBeGreaterThan(3000);

      let missing = 0;
      for (const row of rows) {
        let position = Position.initial();
        for (const san of movesOf(row.pgn)) {
          const played = position.playSan(san);
          expect(played.ok, `${row.eco} ${row.name}: ${san}`).toBe(true);
          if (!played.ok) return;
          position = Position.fromTrustedFen(played.value.after);
        }
        if (!OPENING_POSITIONS[positionKey(position.fen)]) missing += 1;
      }
      expect(missing).toBe(0);
    },
    120_000,
  );
});
