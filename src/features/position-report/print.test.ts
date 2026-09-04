import { describe, expect, it } from 'vitest';

import { asFen } from '@/chess/types';

import { boardSvg, reportToPrintableHtml } from './print';
import { buildPositionReport, reportToStoredNote } from './report';

const FEN = '8/8/8/4k3/8/8/8/K2R4 w - - 0 1';

const report = buildPositionReport({
  fen: FEN,
  explorerUnavailable: 'The reference source was rate limited.',
  structure: { claims: ['White has a rook'], definitionVersion: 'structure s3' },
});

describe('the printed board', () => {
  it('draws sixty-four squares and fetches nothing', () => {
    const svg = boardSvg(asFen(FEN));
    expect((svg.match(/<rect /g) ?? []).length).toBe(65); // 64 squares plus the border
    /*
      The `xmlns` is an XML namespace identifier, not a URL anything resolves,
      so it is excluded deliberately. What must not appear is a reference the
      printer would have to go and fetch.
    */
    expect(svg).not.toMatch(/<image|xlink:href|url\(/);
    expect(svg.replace(/xmlns="[^"]*"/g, '')).not.toContain('http');
  });

  it('shows the pieces that are on the board', () => {
    const svg = boardSvg(asFen(FEN));
    // A white king, a white rook and a black king; nothing else.
    expect((svg.match(/<text /g) ?? []).length).toBe(3);
    expect(svg).toContain('♔');
    expect(svg).toContain('♖');
    expect(svg).toContain('♚');
  });

  it('flips for a Black-oriented board without changing the position', () => {
    const white = boardSvg(asFen(FEN), 'w');
    const black = boardSvg(asFen(FEN), 'b');
    expect(white).not.toBe(black);
    expect((black.match(/<text /g) ?? []).length).toBe(3);
  });

  it('renders nothing rather than guessing at a FEN it cannot read', () => {
    expect(boardSvg('not a fen')).toBe('');
  });
});

describe('the printable document', () => {
  const html = reportToPrintableHtml(report, { context: 'Carlsen – Firouzja' });

  it('is a self-contained document with no external fetch', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toContain('<link');
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/src="http/);
  });

  it('keeps the FEN and where the position came from', () => {
    expect(html).toContain(FEN);
    expect(html).toContain('Carlsen – Firouzja');
  });

  it('prints the reason a source could not answer, rather than omitting it', () => {
    expect(html).toContain('rate limited');
  });

  it('keeps every section’s provenance line', () => {
    const provenanceLines = (html.match(/class="prov"/g) ?? []).length;
    const withProvenance = report.sections.filter((section) => section.provenance).length;
    expect(provenanceLines).toBe(withProvenance);
  });

  it('says its figures were measurements, not standing facts', () => {
    expect(html).toContain('measurements taken at that moment');
  });

  it('says no move is recommended', () => {
    expect(html).toContain('no move is labelled best');
  });

  it('keeps a section and its evidence on one page', () => {
    expect(html).toContain('break-inside: avoid');
  });

  it('escapes text rather than letting it become markup', () => {
    const dangerous = buildPositionReport({
      fen: FEN,
      explorerUnavailable: '<script>alert(1)</script>',
    });
    const rendered = reportToPrintableHtml(dangerous);
    expect(rendered).not.toContain('<script>alert');
    expect(rendered).toContain('&lt;script&gt;');
  });

  it('shows the opening when the board has one', () => {
    const withOpening = reportToPrintableHtml(report, {
      opening: { eco: 'B90', label: 'Sicilian Defense: Najdorf' },
    });
    expect(withOpening).toContain('B90');
    expect(withOpening).toContain('Najdorf');
  });
});

describe('the note a report becomes when it is stored', () => {
  const note = reportToStoredNote(report, 'Carlsen – Firouzja');

  it('records when it was taken', () => {
    expect(note).toMatch(/recorded \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  });

  it('names where the position came from', () => {
    expect(note).toContain('Carlsen – Firouzja');
  });

  it('warns that its figures are a snapshot, which the clipboard form need not', () => {
    expect(note).toContain('measured when this note was written');
    expect(note).toContain('nothing below is a standing');
  });

  it('keeps the evidence and its sources', () => {
    expect(note).toContain('## Reference statistics');
    expect(note).toContain('rate limited');
  });
});
