import { beforeEach, describe, expect, it } from 'vitest';

import { positionKey, START_FEN } from '@/chess/fen';
import { playSanAt } from '@/chess/game';
import { expect as unwrap } from '@/chess/result';
import { createTree, mustGetNode, nodePath } from '@/chess/tree/tree';
import { moveNumberOfPly, type GameTree, type NodeId } from '@/chess/tree/types';
import type { Fen, San, Uci } from '@/chess/types';
import type { DatabaseMove } from '@/database/types';
import { createMemoryRepositories } from '@/persistence/repositories';
import type { AppRepositories } from '@/persistence/types';
import type { RepertoirePositionRecord } from '@/persistence/domain';

import {
  coverage,
  findDeviation,
  findGaps,
  indexPositions,
  lineToEntries,
  lineToKnowledge,
  lookup,
  mergeMove,
  roleOf,
} from './index';

let repositories: AppRepositories;

beforeEach(() => {
  repositories = createMemoryRepositories();
});

function play(moves: string[]): { tree: GameTree; last: NodeId } {
  let tree = createTree(START_FEN);
  let cursor = tree.rootId;
  for (const san of moves) {
    const played = unwrap(playSanAt(tree, cursor, san));
    tree = played.tree;
    cursor = played.nodeId;
  }
  return { tree, last: cursor };
}

/** Store every own-side move of a line into a repertoire. */
async function addLine(
  repertoireId: string,
  moves: string[],
  color: 'w' | 'b',
  role: 'main' | 'alternative' | 'candidate' | 'avoid' = 'main',
) {
  const { tree, last } = play(moves);
  for (const entry of lineToEntries(tree, last, color, role)) {
    const existing = await repositories.repertoires.getPosition(
      repertoireId,
      positionKey(entry.fen),
    );
    await repositories.repertoires.upsertPosition({
      repertoireId,
      fen: entry.fen,
      sideToMove: entry.sideToMove,
      depth: entry.depth,
      moves: [entry.move],
      ...(existing ? { expectedRevision: existing.revision } : {}),
    });
  }
  return { tree, last };
}

describe('turning a line into repertoire entries', () => {
  it('records only the moves of the repertoire’s own side', () => {
    const { tree, last } = play(['e4', 'c5', 'Nf3', 'd6']);
    const white = lineToEntries(tree, last, 'w');
    const black = lineToEntries(tree, last, 'b');

    expect(white.map((entry) => entry.move.san)).toEqual(['e4', 'Nf3']);
    expect(black.map((entry) => entry.move.san)).toEqual(['c5', 'd6']);
  });

  it('keys each entry on the position the move is played from', () => {
    const { tree, last } = play(['e4', 'c5']);
    const [first] = lineToEntries(tree, last, 'w');
    expect(first?.positionKey).toBe(positionKey(START_FEN));
    expect(first?.depth).toBe(0);
  });

  /**
   * Depth counts plies inside the line; ply is the move's real number in the
   * game. They diverge the moment a line starts from a position rather than
   * from move one, which is what happens when preparation is written from a
   * board opened at a coverage gap.
   */
  it('keeps the real move number when a line starts mid-game', () => {
    const opening = play(['e4', 'c6']);
    const midGame = createTree(mustGetNode(opening.tree, opening.last).fen);
    const played = unwrap(playSanAt(midGame, midGame.rootId, 'd4'));

    const [entry] = lineToKnowledge(played.tree, played.nodeId, 'w');
    expect(entry?.depth).toBe(0);
    expect(entry?.ply).toBe(3);
    expect(moveNumberOfPly(entry!.ply)).toBe(2);
  });

  it('records opponent continuations separately from the user’s decisions', () => {
    const { tree, last } = play(['e4', 'c5', 'Nf3']);
    const knowledge = lineToKnowledge(tree, last, 'w');

    expect(knowledge.map((entry) => entry.move.san)).toEqual(['e4', 'c5', 'Nf3']);
    expect(knowledge.map((entry) => entry.move.expected ?? false)).toEqual([false, true, false]);
  });

  it('merges a repeated move instead of listing it twice', () => {
    const move = { uci: 'e2e4' as Uci, san: 'e4' as San, role: 'main' as const, updatedAt: 1 };
    const once = mergeMove([], move);
    const twice = mergeMove(once, { ...move, role: 'alternative', updatedAt: 2 });

    expect(twice).toHaveLength(1);
    expect(twice[0]?.role).toBe('alternative');
  });
});

/**
 * The property the whole design exists for. Two move orders reaching one
 * position must be one piece of knowledge, not two.
 */
describe('transpositions', () => {
  it('stores one entry for a position reached by two move orders', async () => {
    const repertoire = await repositories.repertoires.create({ title: 'd4', color: 'w' });

    await addLine(repertoire.id, ['d4', 'd5', 'Nf3'], 'w');
    await addLine(repertoire.id, ['Nf3', 'd5', 'd4'], 'w');

    const stored = await repositories.repertoires.get(repertoire.id);
    const keys = stored?.positions.map((position) => position.positionKey) ?? [];
    expect(new Set(keys).size).toBe(keys.length);

    // 1.d4 d5 2.Nf3 and 1.Nf3 d5 2.d4 reach the same position after Black's
    // reply, so the entry for the position *after* the transposition is shared.
    const { tree, last } = play(['d4', 'd5', 'Nf3']);
    const viaOther = play(['Nf3', 'd5', 'd4']);
    expect(positionKey(mustGetNode(tree, last).fen)).toBe(
      positionKey(mustGetNode(viaOther.tree, viaOther.last).fen),
    );
  });

  it('answers the same question whichever route reached the position', async () => {
    const repertoire = await repositories.repertoires.create({ title: 'd4', color: 'w' });
    // Prepare 3.c4 in the transposed position, entering by one move order...
    await addLine(repertoire.id, ['d4', 'd5', 'Nf3', 'Nf6', 'c4'], 'w');

    const stored = await repositories.repertoires.get(repertoire.id);
    const index = indexPositions(stored?.positions ?? []);

    // ...and ask by the other.
    const other = play(['Nf3', 'Nf6', 'd4', 'd5']);
    const answer = lookup(index, mustGetNode(other.tree, other.last).fen);

    expect(answer).toBeDefined();
    expect(roleOf(answer, 'c2c4')).toBe('main');
  });

  it('keeps the shallowest depth when a position is reached twice', async () => {
    const repertoire = await repositories.repertoires.create({ title: 'r', color: 'w' });
    const { fen } = { fen: START_FEN };

    await repositories.repertoires.upsertPosition({
      repertoireId: repertoire.id,
      fen,
      sideToMove: 'w',
      depth: 6,
      moves: [{ uci: 'e2e4' as Uci, san: 'e4' as San, role: 'main', updatedAt: 1 }],
    });
    const merged = await repositories.repertoires.upsertPosition({
      repertoireId: repertoire.id,
      fen,
      sideToMove: 'w',
      depth: 0,
      expectedRevision: 0,
      moves: [{ uci: 'd2d4' as Uci, san: 'd4' as San, role: 'alternative', updatedAt: 2 }],
    });

    expect(merged.depth).toBe(0);
    expect(merged.moves).toHaveLength(2);
  });
});

describe('repertoire persistence', () => {
  it('creates, reads back and deletes with its positions', async () => {
    const repertoire = await repositories.repertoires.create({
      title: 'Najdorf',
      color: 'b',
      description: 'Everything after 5...a6.',
    });
    await addLine(repertoire.id, ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6'], 'b');

    const stored = await repositories.repertoires.get(repertoire.id);
    expect(stored?.repertoire.color).toBe('b');
    expect(stored?.repertoire.description).toBe('Everything after 5...a6.');
    expect(stored?.positions.length).toBe(4);

    await repositories.repertoires.delete(repertoire.id);
    expect(await repositories.repertoires.get(repertoire.id)).toBeNull();
    expect(await repositories.repertoires.findByPosition(positionKey(START_FEN))).toEqual([]);
  });

  it('adds an alternative alongside the main move at one position', async () => {
    const repertoire = await repositories.repertoires.create({ title: 'e4', color: 'w' });
    await addLine(repertoire.id, ['e4'], 'w');
    await addLine(repertoire.id, ['d4'], 'w', 'alternative');

    const position = await repositories.repertoires.getPosition(
      repertoire.id,
      positionKey(START_FEN),
    );
    expect(position?.moves).toHaveLength(2);
    expect(roleOf(position ?? undefined, 'e2e4')).toBe('main');
    expect(roleOf(position ?? undefined, 'd2d4')).toBe('alternative');
  });

  it('removes a move, and drops the entry once nothing is left', async () => {
    const repertoire = await repositories.repertoires.create({ title: 'e4', color: 'w' });
    await addLine(repertoire.id, ['e4'], 'w');
    const position = await repositories.repertoires.getPosition(
      repertoire.id,
      positionKey(START_FEN),
    );
    expect(position).not.toBeNull();

    await repositories.repertoires.removeMove(
      (position as RepertoirePositionRecord).id,
      'e2e4',
      (position as RepertoirePositionRecord).revision,
    );
    expect(
      await repositories.repertoires.getPosition(repertoire.id, positionKey(START_FEN)),
    ).toBeNull();
  });

  it('finds every repertoire that speaks about a position', async () => {
    const white = await repositories.repertoires.create({ title: 'White', color: 'w' });
    const other = await repositories.repertoires.create({ title: 'Also White', color: 'w' });
    await addLine(white.id, ['e4'], 'w');
    await addLine(other.id, ['d4'], 'w');

    const both = await repositories.repertoires.findByPosition(positionKey(START_FEN));
    expect(both).toHaveLength(2);
  });

  it('refuses to write into a repertoire that has been deleted', async () => {
    const repertoire = await repositories.repertoires.create({ title: 'Gone', color: 'w' });
    await repositories.repertoires.delete(repertoire.id);

    await expect(
      repositories.repertoires.upsertPosition({
        repertoireId: repertoire.id,
        fen: START_FEN,
        sideToMove: 'w',
        depth: 0,
        moves: [{ uci: 'e2e4' as Uci, san: 'e4' as San, role: 'main', updatedAt: 1 }],
      }),
    ).rejects.toThrow(/no longer exists/i);
  });
});

describe('coverage', () => {
  const position = (over: Partial<RepertoirePositionRecord> = {}): RepertoirePositionRecord => ({
    id: 'p',
    repertoireId: 'r',
    positionKey: 'k',
    fen: START_FEN,
    sideToMove: 'w',
    moves: [],
    depth: 0,
    createdAt: 0,
    updatedAt: 0,
    revision: 0,
    ...over,
  });

  const move = (role: 'main' | 'alternative' | 'candidate' | 'avoid') => ({
    uci: 'e2e4' as Uci,
    san: 'e4' as San,
    role,
    updatedAt: 0,
  });

  it('separates answered positions from ones that only record a rejection', () => {
    const result = coverage([
      position({ id: 'a', moves: [move('main')], depth: 2 }),
      position({ id: 'b', moves: [move('alternative')], depth: 4 }),
      position({ id: 'c', moves: [move('candidate')] }),
      position({ id: 'd', moves: [move('avoid')] }),
    ]);

    expect(result.answeredPositions).toBe(2);
    expect(result.candidatePositions).toBe(1);
    expect(result.unansweredPositions).toBe(1);
    expect(result.maxDepth).toBe(4);
    expect(result.averageDepth).toBe(3);
  });

  it('breaks the move total down by role, so the headline can be checked', () => {
    const result = coverage([
      position({ id: 'a', moves: [move('main'), { ...move('alternative'), uci: 'd2d4' as Uci }] }),
      position({ id: 'b', moves: [move('candidate')] }),
      position({ id: 'c', moves: [move('avoid'), { ...move('main'), expected: true }] }),
    ]);

    expect(result.mainMoves).toBe(1);
    expect(result.alternativeMoves).toBe(1);
    expect(result.candidateMoves).toBe(1);
    expect(result.avoidMoves).toBe(1);
    expect(result.expectedReplies).toBe(1);
    expect(
      result.mainMoves + result.alternativeMoves + result.candidateMoves + result.avoidMoves,
    ).toBe(result.totalMoves);
  });

  it('does not count opponent continuations as prepared answers', () => {
    const result = coverage([
      position({
        moves: [{ ...move('main'), expected: true }],
      }),
    ]);

    expect(result.answeredPositions).toBe(0);
    expect(result.unansweredPositions).toBe(0);
    expect(result.totalMoves).toBe(0);
    expect(result.expectedReplies).toBe(1);
  });

  it('reports zeroes for an empty repertoire rather than dividing by zero', () => {
    const result = coverage([]);
    expect(result.averageDepth).toBe(0);
    expect(result.totalMoves).toBe(0);
  });
});

describe('gap detection', () => {
  const dbMove = (san: string, uci: string, games: number): DatabaseMove => ({
    uci: uci as Uci,
    san: san as San,
    games,
    white: games,
    draws: 0,
    black: 0,
  });

  it('reports opponent moves that lead somewhere unprepared, most played first', () => {
    const prepared: RepertoirePositionRecord = {
      id: 'p',
      repertoireId: 'r',
      positionKey: 'root',
      fen: START_FEN,
      sideToMove: 'w',
      moves: [{ uci: 'e2e4' as Uci, san: 'e4' as San, role: 'main', updatedAt: 0 }],
      depth: 4,
      createdAt: 0,
      updatedAt: 0,
      revision: 0,
    };
    const answered: RepertoirePositionRecord = { ...prepared, id: 'q', positionKey: 'known' };

    const gaps = findGaps(indexPositions([prepared, answered]), [
      {
        position: prepared,
        replies: [
          { move: dbMove('h3', 'h2h3', 37), resultingKey: 'unknown', resultingFen: START_FEN },
          { move: dbMove('a3', 'a2a3', 5), resultingKey: 'also-unknown', resultingFen: START_FEN },
          { move: dbMove('Be3', 'c1e3', 60), resultingKey: 'known', resultingFen: START_FEN },
        ],
      },
    ]);

    expect(gaps.map((gap) => gap.opponentMove.san)).toEqual(['h3', 'a3']);
    expect(gaps[0]?.games).toBe(37);
    expect(gaps[0]?.depth).toBe(5);
  });

  it('ignores moves below the evidence threshold', () => {
    const prepared: RepertoirePositionRecord = {
      id: 'p',
      repertoireId: 'r',
      positionKey: 'root',
      fen: START_FEN,
      sideToMove: 'w',
      moves: [],
      depth: 0,
      createdAt: 0,
      updatedAt: 0,
      revision: 0,
    };

    const gaps = findGaps(
      indexPositions([prepared]),
      [
        {
          position: prepared,
          replies: [{ move: dbMove('h3', 'h2h3', 2), resultingKey: 'x', resultingFen: START_FEN }],
        },
      ],
      10,
    );
    expect(gaps).toEqual([]);
  });

  it('reports one hole when two opponent moves transpose into it', () => {
    const prepared: RepertoirePositionRecord = {
      id: 'p',
      repertoireId: 'r',
      positionKey: 'root',
      fen: START_FEN,
      sideToMove: 'w',
      moves: [],
      depth: 2,
      createdAt: 0,
      updatedAt: 0,
      revision: 0,
    };
    const other: RepertoirePositionRecord = { ...prepared, id: 'q', positionKey: 'other' };

    const gaps = findGaps(indexPositions([prepared, other]), [
      {
        position: prepared,
        replies: [
          { move: dbMove('Nf6', 'g8f6', 40), resultingKey: 'same', resultingFen: START_FEN },
        ],
      },
      {
        position: other,
        replies: [
          { move: dbMove('d5', 'd7d5', 12), resultingKey: 'same', resultingFen: START_FEN },
        ],
      },
    ]);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.opponentMove.san).toBe('Nf6');
  });

  it('treats a position that only says "avoid" as still unprepared', () => {
    const rejected: RepertoirePositionRecord = {
      id: 'p',
      repertoireId: 'r',
      positionKey: 'rejected',
      fen: START_FEN,
      sideToMove: 'w',
      moves: [{ uci: 'g1f3' as Uci, san: 'Nf3' as San, role: 'avoid', updatedAt: 0 }],
      depth: 1,
      createdAt: 0,
      updatedAt: 0,
      revision: 0,
    };

    const gaps = findGaps(indexPositions([rejected]), [
      {
        position: rejected,
        replies: [
          { move: dbMove('e5', 'e7e5', 12), resultingKey: 'rejected', resultingFen: START_FEN },
        ],
      },
    ]);
    expect(gaps).toHaveLength(1);
  });
});

describe('deviation from a repertoire', () => {
  async function addKnowledge(
    repertoireId: string,
    moves: string[],
    color: 'w' | 'b',
  ): Promise<void> {
    const { tree, last } = play(moves);
    for (const entry of lineToKnowledge(tree, last, color)) {
      await repositories.repertoires.upsertPosition({
        repertoireId,
        fen: entry.fen,
        sideToMove: entry.sideToMove,
        depth: entry.depth,
        moves: [entry.move],
      });
    }
  }

  it('reports an opponent deviation only where expected replies were recorded', async () => {
    const repertoire = await repositories.repertoires.create({ title: 'e4', color: 'w' });
    await addKnowledge(repertoire.id, ['e4', 'e5', 'Nf3'], 'w');
    const stored = await repositories.repertoires.get(repertoire.id);

    const game = play(['e4', 'c5']);
    const report = findDeviation(
      game.tree,
      game.last,
      'w',
      indexPositions(stored?.positions ?? []),
    );

    expect(report.own).toBeNull();
    expect(report.opponent?.playedSan).toBe('c5');
    expect(report.opponent?.expected.map((move) => move.san)).toEqual(['e5']);
  });

  it('names the move where the user left their own preparation', async () => {
    const repertoire = await repositories.repertoires.create({ title: 'e4', color: 'w' });
    await addLine(repertoire.id, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], 'w');
    const stored = await repositories.repertoires.get(repertoire.id);
    const index = indexPositions(stored?.positions ?? []);

    // The same game, but White plays 3.Bc4 instead of the prepared 3.Bb5.
    const game = play(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
    const report = findDeviation(game.tree, game.last, 'w', index);

    expect(report.own?.playedSan).toBe('Bc4');
    expect(report.own?.color).toBe('w');
    expect(report.own?.ply).toBe(5);
    expect(report.own?.expected.map((move) => move.san)).toContain('Bb5');
    expect(report.opponent).toBeNull();
    expect(report.inBookPlies).toBe(4);
  });

  it('reports no deviation when the game follows the book', async () => {
    const repertoire = await repositories.repertoires.create({ title: 'e4', color: 'w' });
    await addLine(repertoire.id, ['e4', 'e5', 'Nf3'], 'w');
    const stored = await repositories.repertoires.get(repertoire.id);

    const game = play(['e4', 'e5', 'Nf3']);
    const report = findDeviation(
      game.tree,
      game.last,
      'w',
      indexPositions(stored?.positions ?? []),
    );

    expect(report.own).toBeNull();
    expect(report.opponent).toBeNull();
  });

  it('stops at the end of preparation rather than calling it a deviation', async () => {
    const repertoire = await repositories.repertoires.create({ title: 'e4', color: 'w' });
    await addLine(repertoire.id, ['e4'], 'w');
    const stored = await repositories.repertoires.get(repertoire.id);

    // The repertoire says nothing about move 2; playing one is not deviating.
    const game = play(['e4', 'e5', 'Nf3']);
    const report = findDeviation(
      game.tree,
      game.last,
      'w',
      indexPositions(stored?.positions ?? []),
    );
    expect(report.own).toBeNull();
  });

  it('never reports the wrong side as having deviated', async () => {
    const repertoire = await repositories.repertoires.create({ title: 'Black', color: 'b' });
    await addLine(repertoire.id, ['e4', 'c5', 'Nf3', 'd6'], 'b');
    const stored = await repositories.repertoires.get(repertoire.id);
    const index = indexPositions(stored?.positions ?? []);

    // Black follows the book; White plays a different second move.
    const game = play(['e4', 'c5', 'Nc3']);
    const report = findDeviation(game.tree, game.last, 'b', index);

    expect(report.own).toBeNull();
    expect(report.opponent).toBeNull();
  });
});

describe('the full repertoire scenario', () => {
  /** The workflow the phase brief specifies, end to end. */
  it('survives a reload with its transposed knowledge intact', async () => {
    const created = await repositories.repertoires.create({ title: 'Sicilian', color: 'b' });
    await addLine(created.id, ['e4', 'c5', 'Nf3', 'd6'], 'b');
    await addLine(created.id, ['e4', 'c5', 'Nf3', 'Nc6'], 'b', 'alternative');

    const before = await repositories.repertoires.get(created.id);
    const beforeKeys = (before?.positions ?? []).map((p) => p.positionKey).sort();

    // Reopening the same store is what a reload does to a repository.
    const reloaded = await repositories.repertoires.get(created.id);
    const afterKeys = (reloaded?.positions ?? []).map((p) => p.positionKey).sort();

    expect(afterKeys).toEqual(beforeKeys);

    const afterC5 = play(['e4', 'c5', 'Nf3']);
    const index = indexPositions(reloaded?.positions ?? []);
    const answer = lookup(index, mustGetNode(afterC5.tree, afterC5.last).fen);

    expect(answer?.moves.map((move) => move.san).sort()).toEqual(['Nc6', 'd6']);
    expect(roleOf(answer, 'd7d6')).toBe('main');
    expect(roleOf(answer, 'b8c6')).toBe('alternative');
  });
});

/** Guards the assumption every helper above relies on. */
describe('path helpers', () => {
  it('walks a line root-first', () => {
    const { tree, last } = play(['e4', 'e5']);
    const path = nodePath(tree, last);
    expect(path[0]).toBe(tree.rootId);
    expect(mustGetNode(tree, path[2] as NodeId).move?.san).toBe('e5');
  });

  it('produces a usable FEN for every entry', () => {
    const { tree, last } = play(['e4', 'c5']);
    for (const entry of lineToEntries(tree, last, 'w')) {
      expect(entry.fen as Fen).toMatch(/ [wb] /);
    }
  });
});
