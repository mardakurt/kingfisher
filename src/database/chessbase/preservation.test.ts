import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { CHESSBASE_PRESERVATION, lossReport, tallyIssue } from './preservation';

const root = new URL('../../../', import.meta.url);

describe('the ChessBase preservation matrix', () => {
  it('names a test that exists for every row, and the document lists every field', () => {
    const doc = readFileSync(new URL('docs/data/chessbase-preservation-matrix.md', root), 'utf8');
    for (const row of CHESSBASE_PRESERVATION) {
      // Only a row that says it is unverified may name no test, and it must say why.
      if (row.read === 'unverified' || row.write === 'unverified') {
        expect(row.detail, row.field).toMatch(/unverified/);
      } else {
        expect(row.evidence.length, row.field).toBeGreaterThan(0);
      }
      for (const file of row.evidence) expect(existsSync(new URL(file, root)), file).toBe(true);
      expect(doc, `the matrix document lists "${row.field}"`).toContain(row.field);
    }
  });

  it('reports what an import left behind by games and by items', () => {
    const tally = new Map<string, { games: number; items: number }>();
    tallyIssue(tally, '3 annotation(s) of type 0x22 have no place in a PGN');
    tallyIssue(tally, '1 annotation(s) of type 0x22 have no place in a PGN');
    tallyIssue(tally, 'annotation offset is outside the file');
    const report = lossReport({
      source: 'mega.cbh',
      examined: 10,
      imported: 8,
      duplicates: 1,
      refused: 1,
      tally,
      refusedGames: ['Game 7: a Chess960 game, which Kingfisher does not play'],
      now: 0,
    });
    expect(report.leftBehind).toEqual([
      { what: 'annotation(s) of type 0x22 have no place in a PGN', games: 2, items: 4 },
      { what: 'annotation offset is outside the file', games: 1, items: 1 },
    ]);
    expect(report.generatedAt).toBe('1970-01-01T00:00:00.000Z');
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});
