import { expect, it } from 'vitest';
import { openingReportMarkdown } from './opening-report-export';

it('retains position, snapshot date, source separation, sample limits and unavailable evidence', () => {
  const markdown = openingReportMarkdown({
    fen: 'example position',
    generatedAt: 0,
    branches: [],
    plans: null,
    sections: [
      {
        id: 'a',
        title: 'Population A',
        provenance: 'A · 123 games',
        entries: [
          { primary: 'e4', secondary: '20 of 123 games', criterion: 'sample capped at 123' },
        ],
        emptyReason: null,
      },
      {
        id: 'b',
        title: 'Population B',
        provenance: null,
        entries: [],
        emptyReason: 'Source unavailable',
      },
    ],
  });
  expect(markdown).toContain('1970-01-01T00:00:00.000Z');
  expect(markdown).toContain('`example position`');
  expect(markdown).toContain('A · 123 games');
  expect(markdown).toContain('20 of 123 games');
  expect(markdown).toContain('sample capped at 123');
  expect(markdown).toContain('## Population B\n\nSource unavailable');
});
