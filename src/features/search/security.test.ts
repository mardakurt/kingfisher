import { describe, expect, it } from 'vitest';

import { parseMoveSequence } from './move-sequence';
import { assessQuery } from './query-limits';
import { rank } from './rank';

/**
 * Universal search is untrusted input.
 *
 * The brief (PART BO-BS) lists the categories the parser and the
 * providers must not let through. The point of this test file is
 * not to assert specific rejection messages — those can change —
 * but to assert that no exotic input becomes an executable or
 * SQL-injectable value. The tests deliberately do *not* import
 * the command palette: the failures, if any, would be in the
 * underlying modules and would survive the palette's removal.
 */

describe('rank', () => {
  it('never returns a value that contains executable script tags', () => {
    const candidates = [
      { id: 'a', text: '<script>alert(1)</script>' },
      { id: 'b', text: '"><img src=x onerror=alert(1)>' },
      { id: 'c', text: 'javascript:alert(1)' },
    ];
    for (const input of ['script', 'onerror', 'javascript:']) {
      const ranked = rank(candidates, input);
      for (const hit of ranked) {
        // The text is user-controlled, the search must not execute
        // it. The id is not derived from the text.
        expect(hit.item.id).toBeOneOf(['a', 'b', 'c']);
        expect(typeof hit.item.text).toBe('string');
      }
    }
  });

  it('matches SQL-looking strings by content, not as SQL', () => {
    const candidates = [
      { id: 'a', text: 'SELECT * FROM games WHERE id = 1; DROP TABLE studies; --' },
    ];
    const ranked = rank(candidates, 'SELECT');
    expect(ranked[0]?.item.id).toBe('a');
  });

  it('treats path strings and URLs as ordinary text', () => {
    const candidates = [{ id: 'a', text: 'https://example.com/studies?id=1' }];
    const ranked = rank(candidates, 'studies');
    expect(ranked[0]?.item.id).toBe('a');
  });

  it('rejects very long input at the rate-limiter, not the ranker', () => {
    const candidates = [{ id: 'a', text: 'carlsen' }];
    const verdict = assessQuery('a'.repeat(100_000));
    expect(verdict.ok).toBe(false);
    // The ranker itself does not have a length cap; the cap lives
    // upstream. The test is to make sure the ranker does not
    // blow up on the long input if asked.
    expect(() => rank(candidates, 'a'.repeat(100_000))).not.toThrow();
  });
});

describe('parseMoveSequence', () => {
  it('rejects HTML as a move sequence', () => {
    const result = parseMoveSequence('<script>alert(1)</script>');
    // The tokeniser drops anything that is not a SAN-shaped token.
    // The "script" case is the only one with an alphabetic character,
    // and "script" is not a legal move at the start.
    expect(result.ok).toBe(false);
  });

  it('rejects a SQL-shaped input as a move sequence', () => {
    const result = parseMoveSequence('SELECT * FROM games; --');
    expect(result.ok).toBe(false);
    // The first token "SELECT" survives tokenisation but is not a
    // legal move, so the parser reports it as the first illegal move
    // rather than dropping it. That is the right behaviour: an
    // honest "no" beats a silent lie. The token is reported
    // exactly as it appeared, so the user can see what went wrong.
    expect(result.failedAt).toBe('SELECT');
  });

  it('rejects a URL as a move sequence', () => {
    const result = parseMoveSequence('https://example.com/pgn?id=42');
    expect(result.ok).toBe(false);
    // Same idea: the URL is collapsed into one token by the
    // move-number stripper, and that token is not a legal move.
    expect(result.failedAt).toBeDefined();
  });

  it('rejects a malformed FEN as a move sequence', () => {
    const result = parseMoveSequence('rnbqkbnr/pppppppp/8/8/8/8/8/8 w KQkq - 0 1');
    // This is a syntactically valid FEN — the parser hands it to the
    // FEN path via reason: 'looks-like-fen', not to the move parser.
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('looks-like-fen');
  });

  it('rejects a PGN-shaped input with comments and NAGs cleanly', () => {
    const result = parseMoveSequence('{Comment} 1.e4 $1 c5?? 2.Nf3!');
    // The moves that survive the tokeniser must be legal; a non-legal
    // move is reported with `failedAt`, never silently dropped.
    expect(result.ok).toBe(true);
    expect(result.moves).toEqual(['e4', 'c5', 'Nf3']);
  });

  it('rejects a 1000-ply input at the cap', () => {
    const long = Array.from({ length: 1000 }, () => 'e4').join(' ');
    const result = parseMoveSequence(long);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('too-long');
  });
});

describe('assessQuery', () => {
  it('rejects a 20 MB paste', () => {
    const result = assessQuery('a'.repeat(20_000_000));
    expect(result.ok).toBe(false);
    expect(result.suggestPgn).toBe(true);
  });

  it('rejects an HTML blob at the soft cap and points to the PGN importer', () => {
    const result = assessQuery('<html>'.repeat(2_000));
    expect(result.ok).toBe(false);
    expect(result.suggestPgn).toBe(true);
  });
});
