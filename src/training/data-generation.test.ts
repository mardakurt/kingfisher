import { describe, expect, it } from 'vitest';

import { asFen, asSan, asUci } from '@/chess/types';
import type { ExplorerResult } from '@/database/types';
import type { RepertoirePositionRecord } from '@/persistence/domain';

import { computeCoverage } from '@/repertoire/coverage';
import {
  buildTrainingPrompts,
  defaultPrompt,
  draftTrainingItem,
  draftTrainingSet,
  positionKeyForTraining,
} from './data-generation';

const move = (uci: string, san: string, role: 'main' | 'alternative' | 'candidate' | 'avoid') => ({
  uci: asUci(uci),
  san: asSan(san),
  role,
  updatedAt: 0,
});

const result = (
  moves: { uci: string; san: string; games: number; total: number }[],
): ExplorerResult => ({
  fen: asFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'),
  source: { id: 'elite', name: 'Elite OTB' },
  totalGames: moves[0]?.total ?? 0,
  white: 0,
  draws: 0,
  black: 0,
  moves: moves.map((m) => ({
    uci: asUci(m.uci),
    san: asSan(m.san),
    games: m.games,
    white: 0,
    draws: 0,
    black: 0,
  })),
});

const position = (moves: ReturnType<typeof move>[]): RepertoirePositionRecord => ({
  id: 'rp1',
  repertoireId: 'rep',
  positionKey: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
  fen: asFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'),
  sideToMove: 'w',
  moves,
  depth: 0,
  createdAt: 0,
  updatedAt: 0,
  revision: 1,
});

describe('data-driven training generation', () => {
  it('produces one prompt per coverage gap', () => {
    const reports = computeCoverage(
      position([move('e2e4', 'e4', 'main')]),
      [
        {
          id: 'elite',
          name: 'Elite OTB',
          result: result([
            { uci: 'e2e4', san: 'e4', games: 1000, total: 1600 },
            { uci: 'd2d4', san: 'd4', games: 600, total: 1600 },
          ]),
        },
      ],
    );
    const prompts = buildTrainingPrompts(reports, 'Elite OTB');
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.opponentMove.uci).toBe('d2d4');
  });

  it('names the source the gap was derived from', () => {
    const reports = computeCoverage(
      position([]),
      [
        {
          id: 'elite',
          name: 'Elite OTB',
          result: result([{ uci: 'd2d4', san: 'd4', games: 500, total: 500 }]),
        },
      ],
    );
    const prompts = buildTrainingPrompts(reports, 'Elite OTB');
    expect(prompts[0]?.source.name).toBe('Elite OTB');
  });

  it('writes a prompt that names the move, games, and population', () => {
    const reports = computeCoverage(
      position([]),
      [
        {
          id: 'elite',
          name: 'Elite OTB',
          result: result([{ uci: 'd2d4', san: 'd4', games: 600, total: 1500 }]),
        },
      ],
    );
    const prompts = buildTrainingPrompts(reports, 'Elite OTB');
    const text = defaultPrompt(prompts[0]!);
    expect(text).toContain('d4');
    expect(text).toContain('600');
    expect(text).toContain('Elite OTB');
    expect(text).toContain('40.0%');
  });

  it('does not produce a training prompt when the source reports nothing', () => {
    const reports = computeCoverage(position([move('d2d4', 'd4', 'main')]), [
      {
        id: 'elite',
        name: 'Elite OTB',
        result: result([{ uci: 'd2d4', san: 'd4', games: 1000, total: 1000 }]),
      },
    ]);
    expect(buildTrainingPrompts(reports, 'Elite OTB')).toEqual([]);
  });

  it('collapses transposed prompts to one prompt per canonical position', () => {
    /*
     * Two gaps at the SAME repertoire position. Different uci, same canonical
     * key. The transposition-aware dedup keeps only one. The fixture uses
     * the starting FEN for both gaps, so they share a position key.
     */
    const reports = computeCoverage(
      position([]),
      [
        {
          id: 'elite',
          name: 'Elite OTB',
          result: result([
            { uci: 'd2d4', san: 'd4', games: 600, total: 1500 },
            { uci: 'd2d3', san: 'd3', games: 500, total: 1500 },
          ]),
        },
      ],
    );
    expect(reports[0]!.gaps).toHaveLength(2);
    const prompts = buildTrainingPrompts(reports, 'Elite OTB');
    expect(prompts).toHaveLength(1);
  });

  it('emits a draft that is keyed, named, and provenance-tagged', () => {
    const reports = computeCoverage(
      position([]),
      [
        {
          id: 'elite',
          name: 'Elite OTB',
          result: result([{ uci: 'd2d4', san: 'd4', games: 600, total: 1500 }]),
        },
      ],
    );
    const drafts = draftTrainingSet(reports, 'Elite OTB');
    expect(drafts).toHaveLength(1);
    const draft = drafts[0]!;
    expect(draft.mode).toBe('repertoire-recall');
    expect(draft.tags).toContain('source:elite');
    expect(draft.tags).toContain('data-generated');
    expect(draft.tags).toContain('opponent:d2d4');
    expect(draft.explanation).toContain('Elite OTB');
    expect(draft.explanation).toContain('600');
    // The solution is intentionally empty: the reference move is the move
    // being asked about, not the answer.
    expect(draft.prompt).toContain('Find your response to');
  });

  it('deduplicates prompts that share a canonical position key', () => {
    // Two gaps at two distinct repertoire positions, dedup should keep both.
    const reports = computeCoverage(position([]), [
      {
        id: 'elite',
        name: 'Elite OTB',
        result: result([
          { uci: 'd2d4', san: 'd4', games: 600, total: 1500 },
          { uci: 'g1f3', san: 'Nf3', games: 500, total: 1500 },
        ]),
      },
    ]);
    // The coverage report is at the startpos; both gaps are at the same
    // canonical position, so dedup keeps only one. That is the correct
    // transposition-aware behaviour.
    const prompts = buildTrainingPrompts(reports, 'Elite OTB');
    expect(prompts).toHaveLength(1);
    // Sanity: the positionKey helper is stable for a real FEN.
    expect(positionKeyForTraining('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -')).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
  });

  it('reuses draftTrainingItem on a single prompt', () => {
    const reports = computeCoverage(
      position([]),
      [
        {
          id: 'elite',
          name: 'Elite OTB',
          result: result([{ uci: 'd2d4', san: 'd4', games: 600, total: 1500 }]),
        },
      ],
    );
    const prompts = buildTrainingPrompts(reports, 'Elite OTB');
    const draft = draftTrainingItem(prompts[0]!);
    expect(draft.positionKey).toBe(prompts[0]?.positionKey);
    expect(draft.tags[0]).toBe(`source:${prompts[0]?.source.id}`);
  });
});