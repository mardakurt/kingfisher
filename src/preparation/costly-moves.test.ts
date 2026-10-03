import { describe, expect, it } from 'vitest';

import type { Score } from '@/chess/evaluation';
import { positionKey } from '@/chess/fen';
import { parseSingleGame } from '@/chess/pgn';
import { normalizeGame } from '@/persistence/prepare-game';
import type { GameRecord } from '@/persistence/types';

import {
  costOf,
  evaluateGame,
  opponentMoves,
  phaseOf,
  summarise,
  type EngineView,
} from './costly-moves';

const record = (pgn: string): GameRecord => {
  const parsed = parseSingleGame(pgn);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return { ...normalizeGame(parsed.value.tree), id: 'g1' } as GameRecord;
};

// Scholar's mate: Black's 3...Nf6 allows 4.Qxf7#.
const SCHOLAR = `[White "Hunter, A"]\n[Black "Prey, B"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

describe('costOf', () => {
  it('is what the mover gave up, never negative', () => {
    const level: Score = { kind: 'cp', cp: 0 };
    const whiteMates: Score = { kind: 'mate', moves: 1 };
    expect(costOf(level, whiteMates, 'b')).toBeCloseTo(0.5);
    expect(costOf(level, whiteMates, 'w')).toBe(0);
  });
});

describe('phaseOf', () => {
  it('names the opening by move number and the endgame by pieces', () => {
    expect(phaseOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe('opening');
    expect(phaseOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 13')).toBe('middlegame');
    expect(phaseOf('4k3/8/8/8/8/8/4P3/R3K3 w - - 0 5')).toBe('endgame');
  });
});

describe('the report over one game', () => {
  it('finds the move that allowed mate, and counts only the opponent’s moves', async () => {
    const game = record(SCHOLAR);
    const moves = opponentMoves(game, ['Prey, B']);
    expect(moves?.colour).toBe('b');
    expect(moves?.moves.map((move) => move.san)).toEqual(['e5', 'Nc6', 'Nf6']);

    // A scripted engine: level everywhere except after 3...Nf6, where White mates in one.
    const afterNf6 = moves!.moves[2]!.after;
    const asked: string[] = [];
    const evaluate = async (fen: string): Promise<EngineView> => {
      asked.push(fen);
      return positionKey(fen) === positionKey(afterNf6)
        ? { score: { kind: 'mate', moves: 1 }, depth: 12 }
        : { score: { kind: 'cp', cp: 20 }, bestSan: 'g6', depth: 12 };
    };
    const { entries, unanswered } = await evaluateGame(moves!, evaluate, new Map());
    expect(unanswered).toBe(0);
    // Each position is asked about once: before and after every Black move, shared where they meet.
    expect(new Set(asked).size).toBe(asked.length);

    const report = summarise(entries, { threshold: 'serious', games: 1, unanswered });
    expect(report.moves).toBe(3);
    expect(report.costly).toHaveLength(1);
    expect(report.costly[0]).toMatchObject({
      label: '3…',
      playedSan: 'Nf6',
      bestSan: 'g6',
      phase: 'opening',
      colour: 'b',
    });
    expect(report.byPhase.opening).toEqual({ moves: 3, costly: 1 });
    expect(report.byColour.b).toEqual({ moves: 3, costly: 1 });
    expect(report.gamesWithCostly).toBe(1);
  });

  it('scores a mate on the board by the rules, without the engine', async () => {
    const game = record(SCHOLAR);
    const moves = opponentMoves(game, ['Hunter, A'])!;
    const asked: string[] = [];
    const { entries } = await evaluateGame(
      moves,
      async (fen) => {
        asked.push(fen);
        return { score: { kind: 'cp', cp: 0 }, depth: 1 };
      },
      new Map(),
    );
    const mating = entries.find((entry) => entry.playedSan === 'Qxf7#')!;
    expect(mating.after).toEqual({ kind: 'mate', moves: 1 });
    expect(mating.cost).toBe(0);
    expect(asked).not.toContain(moves.moves.at(-1)!.after);
  });

  it('skips a game the player is not in', () => {
    expect(opponentMoves(record(SCHOLAR), ['Somebody, Else'])).toBeNull();
  });
});
