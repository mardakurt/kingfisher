import { describe, expect, it } from 'vitest';

import { asFen, asSan, asUci } from '@/chess/types';
import type { DatabaseMove, ExplorerResult } from '@/database/types';

import {
  buildPositionReport,
  reportToMarkdown,
  SCORE_SAMPLE_THRESHOLD,
  type PositionReport,
} from './report';

const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

const move = (san: string, overrides: Partial<DatabaseMove> = {}): DatabaseMove => ({
  uci: asUci('e7e5'),
  san: asSan(san),
  games: 100,
  white: 40,
  draws: 20,
  black: 40,
  ...overrides,
});

const explorer = (overrides: Partial<ExplorerResult> = {}): ExplorerResult => ({
  fen: asFen(FEN),
  source: { id: 'lichess-masters', name: 'Lichess Masters' },
  totalGames: 1000,
  white: 400,
  draws: 300,
  black: 300,
  moves: [],
  ...overrides,
});

const section = (report: PositionReport, id: string) =>
  report.sections.find((entry) => entry.id === id);

describe('buildPositionReport', () => {
  it('always produces every section, so nothing is silently missing', () => {
    const report = buildPositionReport({ fen: FEN });
    expect(report.sections.map((entry) => entry.id)).toEqual([
      'opening',
      'reference',
      'moves',
      'tablebase',
      'repertoire',
      'model-games',
      'personal',
      'structure',
      'engine',
      'journal',
    ]);
  });

  /**
   * §38. A section with evidence must say where it came from; a section
   * without evidence must say why it is empty. A blank of either kind is a
   * claim the reader cannot check.
   */
  it('gives every section either provenance or a stated reason for being empty', () => {
    const report = buildPositionReport({
      fen: FEN,
      explorer: explorer({ moves: [move('e5')] }),
    });
    for (const entry of report.sections) {
      if (entry.entries.length > 0) expect(entry.provenance, entry.id).not.toBeNull();
      else expect(entry.emptyReason, entry.id).not.toBeNull();
    }
  });

  it('names the reference source and its size rather than saying "the database"', () => {
    const report = buildPositionReport({ fen: FEN, explorer: explorer({ totalGames: 18_431 }) });
    expect(section(report, 'reference')?.provenance).toBe('Lichess Masters · 18,431 games');
  });

  it('says which source was unavailable rather than reporting zero games', () => {
    const report = buildPositionReport({
      fen: FEN,
      explorerUnavailable: 'Lichess is rate limiting this client.',
    });
    expect(section(report, 'reference')?.emptyReason).toBe('Lichess is rate limiting this client.');
    expect(section(report, 'reference')?.entries).toEqual([]);
  });

  it('distinguishes "this source has no games here" from "no source answered"', () => {
    const report = buildPositionReport({ fen: FEN, explorer: explorer({ totalGames: 0 }) });
    expect(section(report, 'reference')?.emptyReason).toContain('holds no games');
    // It still says which source was asked.
    expect(section(report, 'reference')?.provenance).toContain('Lichess Masters');
  });
});

/**
 * §39. Every highlighted move carries the rule that selected it, and no rule
 * is "best". These tests are the guard against a later change quietly
 * introducing a recommendation.
 */
describe('notable moves', () => {
  it('labels the most played move with that criterion, not with a recommendation', () => {
    const report = buildPositionReport({
      fen: FEN,
      explorer: explorer({
        moves: [move('e5', { games: 600 }), move('c5', { games: 300 })],
      }),
    });
    const entries = section(report, 'moves')?.entries ?? [];
    expect(entries[0]?.primary).toBe('e5');
    expect(entries[0]?.criterion).toBe('Most played');
  });

  it('states the sample threshold in the scoring criterion', () => {
    const report = buildPositionReport({
      fen: FEN,
      explorer: explorer({
        moves: [
          move('e5', { games: 600, white: 200, draws: 200, black: 200 }),
          move('c5', { games: 300, white: 250, draws: 25, black: 25 }),
        ],
      }),
    });
    const scoring = (section(report, 'moves')?.entries ?? []).find((entry) =>
      entry.criterion?.startsWith('Highest scoring'),
    );
    expect(scoring?.primary).toBe('c5');
    expect(scoring?.criterion).toContain(String(SCORE_SAMPLE_THRESHOLD));
  });

  /**
   * The regression this threshold exists for: three games with three wins is
   * not a 100% move, and quoting it as the best-scoring one would be the
   * report's first lie.
   */
  it('refuses to quote a score for a move with too small a sample', () => {
    const report = buildPositionReport({
      fen: FEN,
      explorer: explorer({
        moves: [
          move('e5', { games: 600, white: 200, draws: 200, black: 200 }),
          move('Nh6', { games: 3, white: 3, draws: 0, black: 0 }),
        ],
      }),
    });
    const entries = section(report, 'moves')?.entries ?? [];
    expect(
      entries.some((entry) => entry.primary === 'Nh6' && entry.criterion?.includes('scoring')),
    ).toBe(false);
  });

  it('never labels any move as best, recommended, or strongest', () => {
    const report = buildPositionReport({
      fen: FEN,
      explorer: explorer({
        moves: [move('e5', { games: 600 }), move('c5', { games: 300, lastPlayedYear: 2026 })],
      }),
    });
    const criteria = (section(report, 'moves')?.entries ?? []).map((entry) =>
      (entry.criterion ?? '').toLowerCase(),
    );
    for (const criterion of criteria) {
      expect(criterion).not.toContain('best');
      expect(criterion).not.toContain('recommend');
      expect(criterion).not.toContain('strongest');
      expect(criterion).not.toContain('should');
    }
  });

  it('does not repeat one move under three headings', () => {
    const only = [move('e5', { games: 600, lastPlayedYear: 2026 })];
    const report = buildPositionReport({ fen: FEN, explorer: explorer({ moves: only }) });
    const names = (section(report, 'moves')?.entries ?? []).map((entry) => entry.primary);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('sections that draw on the player’s own work', () => {
  it('reports personal games with their score across them', () => {
    const report = buildPositionReport({
      fen: FEN,
      personalGames: [
        { result: '1-0', white: 'Me', black: 'A' },
        { result: '0-1', white: 'B', black: 'Me' },
      ] as never,
      personalGamesSource: 'My games · IndexedDB',
    });
    const personal = section(report, 'personal');
    expect(personal?.provenance).toBe('My games · IndexedDB');
    expect(personal?.entries[0]?.secondary).toContain('50.0%');
  });

  /**
   * The position index can answer "how many of my games reached this" much
   * more cheaply than "which ones". A count with no list is a fact and is
   * reported as one, rather than being shown as an empty section.
   */
  it('reports a count of personal games when the summaries were not fetched', () => {
    const report = buildPositionReport({
      fen: FEN,
      personalGameCount: 14,
      personalGamesSource: 'Your local collection',
    });
    const personal = section(report, 'personal');
    expect(personal?.entries[0]?.primary).toBe('14 games reached this position');
    expect(personal?.emptyReason).toBeNull();
  });

  it('says plainly when no repertoire covers the position', () => {
    const report = buildPositionReport({ fen: FEN });
    expect(section(report, 'repertoire')?.emptyReason).toBe('No repertoire covers this position.');
  });

  it('versions the structural rules it quotes', () => {
    const report = buildPositionReport({
      fen: FEN,
      structure: { claims: ['isolated-queen-pawn'], definitionVersion: 'structure-rules v2' },
    });
    expect(section(report, 'structure')?.provenance).toContain('structure-rules v2');
  });

  it('keeps engine evidence in its own section, attributed to engine and depth', () => {
    const report = buildPositionReport({
      fen: FEN,
      pinnedLines: [
        {
          engineName: 'Stockfish 18',
          depth: 40,
          pvSan: ['e4', 'e5', 'Nf3'],
          createdAt: Date.UTC(2026, 0, 2),
        },
      ] as never,
    });
    const engine = section(report, 'engine');
    expect(engine?.entries[0]?.secondary).toBe('Stockfish 18 · depth 40');
    // And it is not mixed into the database evidence.
    expect(section(report, 'moves')?.entries ?? []).toHaveLength(0);
  });
});

describe('reportToMarkdown', () => {
  it('carries every section’s provenance into the exported text', () => {
    const report = buildPositionReport({
      fen: FEN,
      explorer: explorer({ totalGames: 18_431, moves: [move('e5', { games: 600 })] }),
      now: Date.UTC(2026, 0, 2),
    });
    const markdown = reportToMarkdown(report);

    expect(markdown).toContain('# Position report');
    expect(markdown).toContain(FEN);
    expect(markdown).toContain('_Source: Lichess Masters · 18,431 games_');
    expect(markdown).toContain('— _Most played_');
  });

  it('writes the reason for an empty section rather than leaving it blank', () => {
    const markdown = reportToMarkdown(buildPositionReport({ fen: FEN }));
    expect(markdown).toContain('No repertoire covers this position.');
  });
});
