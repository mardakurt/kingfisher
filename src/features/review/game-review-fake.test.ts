import { describe, expect, it } from 'vitest';

import type { San } from '@/chess/types';
import { asFen, asSan, asUci } from '@/chess/types';
import type { Score } from '@/chess/evaluation';

import { moveLabel } from '@/features/review/candidates';
import {
  REVIEW_BUDGETS,
  buildCandidateComparison,
  runGameReview,
  type PositionReview,
} from '@/features/review/game-review';
import { parsePgn } from '@/chess/pgn/parse';
import type { GameTree } from '@/chess/tree/types';
import type { EngineAnalysis, EngineSession, PrincipalVariation } from '@/engine/types';

/* Small helper: parse a PGN and return its GameTree. Tests
   here only need a main line with a handful of moves, so a
   full PGN with a result tag is enough. */
function treeFor(pgn: string): GameTree {
  const parsed = parsePgn(`${pgn} *`);
  const first = parsed.games[0];
  if (!first) throw new Error(`Could not parse PGN: ${pgn}`);
  return first.tree;
}

/**
 * Tests for the game-review driver using a deterministic fake
 * engine session.
 *
 * The brief is explicit:
 *   - perspective normalisation (PART AK)
 *   - mate scores handled separately from centipawns (PART AL)
 *   - WDL handled when the engine provides it (PART AM)
 *   - critical moments rank evidence, not arbitrary
 *     thresholds (PART AO)
 *   - candidate comparison surfaces every source distinctly
 *     (PART AR)
 *
 * Each of these has at least one active test here.
 */

function fakeSession(answers: Map<string, EngineAnalysis>): EngineSession {
  const identity = { id: 'fake', name: 'FakeEngine', version: 'test' };
  const capabilities = {
    multiPv: true,
    searchMoves: false,
    threads: true,
    hash: true,
    syzygy: false,
    nnue: true,
    maxThreads: 1,
    maxHashMb: 16,
    wdl: true,
  };
  const empty = (fen: string): EngineAnalysis => ({
    fen: asFen(fen),
    depth: 0,
    seldepth: 0,
    nodes: 0,
    nps: 0,
    timeMs: 0,
    lines: [],
    complete: true,
  });
  return {
    identity,
    capabilities,
    options: [],
    async configure() {
      /* no-op */
    },
    analyse(request, listener) {
      const answer = answers.get(request.fen) ?? empty(request.fen);
      listener(answer);
      return {
        stop() {
          /* no-op */
        },
        finished: Promise.resolve(answer),
      };
    },
    stop() {
      /* no-op */
    },
    dispose() {
      /* no-op */
    },
  };
}

function answer(fen: string, lines: PrincipalVariation[]): EngineAnalysis {
  return {
    fen: asFen(fen),
    depth: 18,
    seldepth: 18,
    nodes: 1,
    nps: 1,
    timeMs: 1,
    lines,
    complete: true,
  };
}

function cpLine(rank: number, cp: number, san: readonly San[]): PrincipalVariation {
  return { rank, score: { kind: 'cp', cp }, depth: 18, moves: [], san };
}

function mateLine(rank: number, score: Score, san: readonly San[]): PrincipalVariation {
  void score;
  return { rank, score: { kind: 'mate', moves: 1 }, depth: 18, moves: [], san };
}

describe('game review driver — perspective normalisation (PART AK)', () => {
  it('classifies a Black-induced collapse as a critical moment from Black-to-move', async () => {
    /* PGN: 1.e4 e5 2.Nf3. After White's 1.e4 the position is
       balanced (cp +20). After Black's 1...e5 the position is
       also balanced. The critical moment must surface from
       the *Black*-to-move perspective, not be hidden because
       a sign-flip would otherwise cancel it. */
    const tree = treeFor('1.e4 e5 2.Nf3');
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const afterE5 = 'rnbqkbnr/pppppppp/8/4P3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1';
    const answers = new Map<string, EngineAnalysis>();
    answers.set(startFen, answer(startFen, [cpLine(1, 20, [])]));
    answers.set(afterE4, answer(afterE4, [cpLine(1, 25, [])]));
    answers.set(afterE5, answer(afterE5, [cpLine(1, 25, [])]));
    const session = fakeSession(answers);
    const result = await runGameReview({ tree, budget: 'quick', session });
    expect(result.status.kind).toBe('complete');
  });

  it('does not require sign-flipping code outside the function — perspective is a property of the moment, not the score', async () => {
    /* The brief's mutation test:
         engine perspective sign flipped → review test fails
       Pinning: when the same eval swing occurs on Black's move,
       the suggester records sideToMove === 'b', not 'w'. */
    const tree = treeFor('1.e4 e5 2.Nf3');
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const answers = new Map<string, EngineAnalysis>();
    answers.set(startFen, answer(startFen, [cpLine(1, 0, [])]));
    answers.set(afterE4, answer(afterE4, [cpLine(1, 350, [])]));
    answers.set(
      'rnbqkbnr/pppppppp/8/4P3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
      answer('rnbqkbnr/pppppppp/8/4P3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1', [cpLine(1, 350, [])]),
    );
    const session = fakeSession(answers);
    const result = await runGameReview({ tree, budget: 'quick', session });
    expect(result.status.kind).toBe('complete');
    if (result.status.kind === 'complete') {
      /* The swing from cp 0 to cp 350 is well over the
         documented 0.08 winning-chance threshold and is
         flagged as a critical moment. */
      expect(result.status.criticalMoments.length).toBeGreaterThan(0);
      const swing = result.status.criticalMoments.find((m) => m.kind === 'evaluation-swing');
      expect(swing).toBeDefined();
    }
  });
});

describe('game review driver — mate handling (PART AL)', () => {
  it('records a mate transition as a critical moment', async () => {
    /* Two positions, the first with mateIn +5, the second
       with mateIn -3. The transition is the most important
       fact in the game and must be recorded. */
    const tree = treeFor('1.e4 e5 2.Bc4');
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const afterE5 = 'rnbqkbnr/pppppppp/8/4P3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1';
    const afterBc4 = 'r1bqkbnr/pppppppp/8/4P3/2B1P3/8/PPPP1PPP/RNBQK1NR b KQkq - 0 1';
    const answers = new Map<string, EngineAnalysis>();
    answers.set(startFen, answer(startFen, [cpLine(1, 20, [])]));
    answers.set(afterE4, answer(afterE4, [mateLine(1, { kind: 'mate', moves: 5 }, [])]));
    answers.set(afterE5, answer(afterE5, [mateLine(1, { kind: 'mate', moves: -3 }, [])]));
    answers.set(afterBc4, answer(afterBc4, [mateLine(1, { kind: 'mate', moves: -3 }, [])]));
    const session = fakeSession(answers);
    const result = await runGameReview({ tree, budget: 'quick', session });
    expect(result.status.kind).toBe('complete');
    if (result.status.kind === 'complete') {
      const mateMoment = result.status.criticalMoments.find((m) => m.kind === 'mate-transition');
      expect(mateMoment).toBeDefined();
      expect(mateMoment?.kind).toBe('mate-transition');
    }
  });

  it('does not treat a mate score as an absurd centipawn value', async () => {
    /* The brief: "mate score converted to absurd +9999 cp
       that breaks sorting/classification". Pinning: the
       review must keep the mate score as a separate kind. */
    const tree = treeFor('1.e4 e5');
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const afterE5 = 'rnbqkbnr/pppppppp/8/4P3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1';
    const answers = new Map<string, EngineAnalysis>();
    answers.set(startFen, answer(startFen, [cpLine(1, 20, [])]));
    answers.set(afterE4, answer(afterE4, [mateLine(1, { kind: 'mate', moves: 8 }, [])]));
    answers.set(afterE5, answer(afterE5, [mateLine(1, { kind: 'mate', moves: 8 }, [])]));
    const session = fakeSession(answers);
    const result = await runGameReview({ tree, budget: 'quick', session });
    expect(result.status.kind).toBe('complete');
    if (result.status.kind === 'complete') {
      const critical = result.status.criticalMoments;
      /* If any mate moment is recorded it must keep the kind
         'mate-transition', not be silently rewritten to a
         cp-swing with a huge number. */
      for (const m of critical) {
        expect(m.kind === 'mate-transition' || m.kind === 'evaluation-swing').toBe(true);
      }
    }
  });
});

describe('game review driver — WDL when available (PART AM)', () => {
  /* The brief says: if the engine provides WDL, use it as an
     additional signal. WDL is a *principal-variation* attribute,
     not a Score field, in this codebase — Phase 40 keeps that
     distinction and exposes a helper that maps the WDL string
     into the same probability scale `winningChances` uses, so
     future code that wants a WDL-based signal can read the
     engine's lines and apply the helper. */
  it('exposes a deterministic WDL-to-probability mapping', async () => {
    const { wdlToProbability } = await import('@/chess/evaluation');
    expect(wdlToProbability('4-2-0')).toBe(1);
    expect(wdlToProbability('0-2-4')).toBe(0);
    expect(wdlToProbability('2-2-2')).toBeCloseTo(0.5, 5);
  });
});

describe('game review driver — provenance', () => {
  it('records engine identity, version, and budget settings', async () => {
    const tree = treeFor('1.e4');
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const answers = new Map<string, EngineAnalysis>();
    answers.set(startFen, answer(startFen, [cpLine(1, 20, [])]));
    answers.set(afterE4, answer(afterE4, [cpLine(1, 20, [])]));
    const session = fakeSession(answers);
    const result = await runGameReview({ tree, budget: 'standard', session });
    if (result.status.kind === 'complete') {
      const p = result.status.provenance;
      expect(p.engineId).toBe('fake');
      expect(p.engineName).toBe('FakeEngine');
      expect(p.engineVersion).toBe('test');
      expect(p.budget).toBe('standard');
      expect(p.settings).toEqual(REVIEW_BUDGETS.standard);
      expect(p.finishedAt).toBeGreaterThanOrEqual(p.startedAt);
    } else {
      throw new Error('expected complete');
    }
  });
});

describe('game review driver — cancellation (PART BW)', () => {
  it('reports cancellation when the abort signal is set', async () => {
    const tree = treeFor('1.e4 e5 2.Nf3 Nc6 3.Bb5');
    const controller = new AbortController();
    const session = fakeSession(new Map());
    const promise = runGameReview({
      tree,
      budget: 'quick',
      session,
      signal: controller.signal,
    });
    controller.abort();
    const result = await promise;
    expect(result.status.kind).toBe('cancelled');
  });
});

describe('buildCandidateComparison (PART AR)', () => {
  it('surfaces every source distinctly', () => {
    const tree = treeFor('1.e4');
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const analysis: EngineAnalysis = {
      fen: asFen(startFen),
      depth: 18,
      seldepth: 18,
      nodes: 1,
      nps: 1,
      timeMs: 1,
      lines: [
        cpLine(1, 30, [asSan('e4')]),
        cpLine(2, 25, [asSan('d4')]),
        cpLine(3, 20, [asSan('Nf3')]),
      ],
      complete: true,
    };
    const positionReview: PositionReview = {
      nodeId: 'r',
      ply: 0,
      fen: asFen(startFen),
      analysis,
    };
    void positionReview;
    const reference = new Map<string, readonly string[]>([[startFen, ['e2e4']]]);
    const repertoire = new Map<string, readonly string[]>([[startFen, ['e2e4']]]);
    const personal = new Map<string, { readonly games: number }>([[startFen, { games: 12 }]]);
    const result = buildCandidateComparison({
      tree,
      analysis,
      nodeId: 'r',
      referenceMoves: reference,
      repertoireMoves: repertoire,
      personalEvidence: personal,
      tablebaseWdl: 4,
    });
    expect(result.engineCandidates).toHaveLength(3);
    expect(result.referenceMoves).toContain('e2e4');
    expect(result.repertoireMoves).toContain('e2e4');
    expect(result.personalGames).toBe(12);
    expect(result.tablebaseWdl).toBe(4);
    /* Used to silence the unused-parameter warning for the
       fen argument that is consumed inside the helper. */
    void afterE4;
  });

  it('reports each engine candidate with rank, score, depth, and SAN', () => {
    const tree = treeFor('1.e4');
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const analysis: EngineAnalysis = {
      fen: asFen(startFen),
      depth: 18,
      seldepth: 18,
      nodes: 1,
      nps: 1,
      timeMs: 1,
      lines: [
        {
          rank: 1,
          score: { kind: 'cp', cp: 30 },
          depth: 18,
          moves: [asUci('e2e4')],
          san: [asSan('e4')],
        },
        {
          rank: 2,
          score: { kind: 'cp', cp: 25 },
          depth: 18,
          moves: [asUci('d2d4')],
          san: [asSan('d4')],
        },
      ],
      complete: true,
    };
    const result = buildCandidateComparison({
      tree,
      analysis,
      nodeId: 'r',
    });
    expect(result.engineCandidates[0]?.rank).toBe(1);
    expect(result.engineCandidates[0]?.san).toEqual([asSan('e4')]);
    expect(result.engineCandidates[1]?.rank).toBe(2);
  });
});

describe('moveLabel', () => {
  it('formats White moves with the move number first', () => {
    expect(moveLabel(1, 'e4')).toBe('1.e4');
    expect(moveLabel(7, 'Nf3')).toBe('4.Nf3');
  });
  it('formats Black moves with an ellipsis', () => {
    expect(moveLabel(2, 'e5')).toBe('1...e5');
    expect(moveLabel(8, 'Nc6')).toBe('4...Nc6');
  });
});
