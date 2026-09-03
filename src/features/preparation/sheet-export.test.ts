import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import type { PreparationSessionRecord } from '@/persistence/domain';
import {
  cardsBySource,
  sheetHeading,
  sheetToMarkdown,
  sheetToPgn,
  sheetToPrintableHtml,
  writeLine,
} from './sheet-export';

const session = (over: Partial<PreparationSessionRecord> = {}): PreparationSessionRecord =>
  ({
    id: 'p1',
    title: 'Round 6',
    opponent: 'Carlsen, Magnus',
    myColor: 'b',
    event: 'Candidates',
    round: '6',
    gameDate: '2026-04-12',
    repertoireIds: [],
    studyIds: [],
    openingFileIds: [],
    modelGameLinkIds: [],
    reviewItemIds: [],
    sheet: [
      {
        id: 'c1',
        positionKey: 'k1',
        fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',
        line: ['e4', 'c5'],
        why: 'He always opens 1.e4',
        intendedSan: 'Nc6',
        source: 'explorer',
        createdAt: 1,
      },
    ],
    createdAt: 1,
    updatedAt: 1,
    revision: 0,
    ...over,
  }) as PreparationSessionRecord;

describe('writing a line', () => {
  it('numbers from the start the way it would be written on paper', () => {
    expect(writeLine(['e4', 'c5', 'Nf3'])).toBe('1.e4 c5 2.Nf3');
    expect(writeLine([])).toBe('');
    // Starting mid-game keeps the real move numbers.
    expect(writeLine(['Nf6', 'Nc3'], 5)).toBe('Nf6 4.Nc3');
  });
});

describe('the printable sheet', () => {
  it('names the game in its heading', () => {
    expect(sheetHeading(session())).toBe('Round 6 · vs Carlsen, Magnus · Candidates · Round 6');
    expect(sheetHeading(session({ opponent: undefined, event: undefined, round: undefined }))).toBe(
      'Round 6',
    );
  });

  it('is self-contained, with no external references to fail at print time', () => {
    const html = sheetToPrintableHtml(session());
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('@page');
    // Nothing to fetch: a stylesheet that has not loaded when the print dialog
    // opens produces an unusable sheet at exactly the wrong moment.
    expect(html).not.toMatch(/<link[^>]+href/);
    expect(html).not.toMatch(/<script/);
    expect(html).toContain('1.e4 c5');
    expect(html).toContain('Playing Black');
  });

  it('escapes content rather than letting it become markup', () => {
    const html = sheetToPrintableHtml(
      session({ opponent: '<script>alert(1)</script>', title: 'Round & 6' }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Round &amp; 6');
  });

  it('says the sheet is empty rather than printing a bare page', () => {
    expect(sheetToPrintableHtml(session({ sheet: [] }))).toContain('No positions on the sheet');
  });
});

describe('the markdown sheet', () => {
  it('carries the FEN for every card, so a position can be set up again', () => {
    const markdown = sheetToMarkdown(session());
    expect(markdown).toContain('# Round 6');
    expect(markdown).toContain('### 1. 1.e4 c5');
    expect(markdown).toContain('**Why:** He always opens 1.e4');
    expect(markdown).toContain('**Intend to play:** Nc6');
    expect(markdown).toContain('rnbqkbnr/pp1ppppp');
  });

  it('includes the session notes when there are any', () => {
    expect(sheetToMarkdown(session({ notes: 'Watch the clock.' }))).toContain('Watch the clock.');
    expect(sheetToMarkdown(session({ notes: '   ' }))).not.toContain('## Notes');
  });
});

describe('the PGN export', () => {
  it('produces PGN Kingfisher itself can read back', () => {
    const pgn = sheetToPgn(session());
    const parsed = parsePgn(pgn);

    expect(parsed.games).toHaveLength(1);
    const [game] = parsed.games;
    expect(game!.tree.headers.Event).toContain('Round 6');
    // The line is real movetext, not a comment containing moves.
    expect(pgn).toContain('1.e4 c5');
  });

  it('writes a setup header for a card with no line to replay', () => {
    const pgn = sheetToPgn(
      session({
        sheet: [
          {
            id: 'c1',
            positionKey: 'k',
            fen: '8/8/8/3k4/8/3K4/8/8 w - - 0 1',
            line: [],
            createdAt: 1,
          },
        ],
      } as unknown as Partial<PreparationSessionRecord>),
    );
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain('8/8/8/3k4/8/3K4/8/8 w - - 0 1');
  });

  it('cannot be broken by a quote in a name or a brace in a note', () => {
    const pgn = sheetToPgn(
      session({
        opponent: 'O"Brien, "Mad" Pat',
        sheet: [
          {
            id: 'c1',
            positionKey: 'k',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            line: ['e4'],
            why: 'Braces {like these} would end the comment',
            createdAt: 1,
          },
        ],
      } as unknown as Partial<PreparationSessionRecord>),
    );

    expect(parsePgn(pgn).games).toHaveLength(1);
    // Tag values cannot contain a raw quote, and comments cannot contain braces.
    expect(pgn).not.toMatch(/\[Black "[^"]*"[^\]]/);
    expect(pgn).not.toContain('{like these}');
  });

  it('is empty when the sheet is', () => {
    expect(sheetToPgn(session({ sheet: [] }))).toBe('');
  });
});

describe('sheet composition', () => {
  it('counts where the cards came from', () => {
    const counts = cardsBySource(session().sheet);
    expect(counts.get('explorer')).toBe(1);
    expect(counts.get('repertoire')).toBeUndefined();
  });
});
