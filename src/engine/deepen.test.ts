import { describe, expect, it } from 'vitest';

import { cp, mate } from '@/chess/evaluation';
import { positionKey, START_FEN } from '@/chess/fen';
import { Position } from '@/chess/position';
import type { Fen, Uci } from '@/chess/types';

import {
  backedUp,
  changedMinds,
  countMoves,
  deepen,
  pendingFrontier,
  positionsFor,
  principalLine,
  type DeepenSearch,
} from './deepen';

/** The position after a list of UCI moves from the start. */
function after(...moves: string[]): Fen {
  let position = Position.fromTrustedFen(START_FEN);
  for (const move of moves) {
    const played = position.playUci(move);
    if (!played.ok) throw new Error(move);
    position = Position.fromTrustedFen(played.value.after);
  }
  return position.fen;
}

/**
 * A scripted engine: what it says at each position, keyed by position. A
 * position it has no script for answers with no line, which the walk must
 * treat as a leaf rather than a failure.
 */
function engine(script: Record<string, readonly [string[], number][]>) {
  const asked: string[] = [];
  const byKey = new Map(Object.entries(script).map(([fen, lines]) => [positionKey(fen), lines]));
  const evaluate = async (fen: Fen): Promise<DeepenSearch> => {
    asked.push(fen);
    const lines = byKey.get(positionKey(fen)) ?? [];
    return {
      lines: lines.map(([moves, score]) => ({
        moves: moves as Uci[],
        score: cp(score),
        depth: 20,
      })),
      depth: 20,
      nodes: 1_000_000,
      timeMs: 1000,
    };
  };
  return { evaluate, asked };
}

const SCRIPT = {
  [START_FEN]: [
    [['e2e4', 'e7e5'], 30],
    [['d2d4', 'd7d5'], 25],
    [['a2a3', 'e7e5'], -20],
  ],
  [after('e2e4')]: [
    [['c7c5', 'g1f3'], 35],
    [['e7e5', 'g1f3'], 30],
  ],
  [after('d2d4')]: [[['g8f6', 'c2c4'], 20]],
  [after('e2e4', 'c7c5')]: [[['g1f3', 'd7d6'], 40]],
  // The line predicted 2.Nf3 here; the search of this position prefers 2.f4.
  [after('e2e4', 'e7e5')]: [[['f2f4', 'e5f4'], 10]],
  [after('d2d4', 'g8f6')]: [[['c2c4', 'e7e6'], 25]],
} satisfies Record<string, readonly [string[], number][]>;

describe('deepen', () => {
  it('keeps the moves within the margin, breadth first, and searches every kept position', async () => {
    const { evaluate, asked } = engine(SCRIPT);
    const result = await deepen(
      START_FEN,
      { breadth: 3, marginCp: 20, maxPlies: 2, budget: 100 },
      evaluate,
    );
    // a3 is 50 behind e4, outside a 20 margin; d4 is inside it.
    expect(result.root.children.map((child) => child.move?.san)).toEqual(['e4', 'd4']);
    // Black's view: c5 (+0.35) and e5 (+0.30) are 5 apart, both kept.
    expect(result.root.children[0]!.children.map((child) => child.move?.san)).toEqual(['c5', 'e5']);
    // Start, then each kept move one ply down, and nothing at the ply limit.
    expect(asked.map(positionKey)).toEqual(
      [START_FEN, after('e2e4'), after('d2d4')].map(positionKey),
    );
    expect(result).toMatchObject({ searched: 3, stopped: false });
    expect(countMoves(result.root)).toBe(5);
  });

  it('keeps one move with breadth 1, and stops at the budget', async () => {
    const { evaluate } = engine(SCRIPT);
    const result = await deepen(
      START_FEN,
      { breadth: 1, marginCp: 100, maxPlies: 10, budget: 3 },
      evaluate,
    );
    expect(principalLine(result.root).map((node) => node.move?.san)).toEqual(['e4', 'c5', 'Nf3']);
    expect(result.searched).toBe(3);
  });

  it('reports where a position’s own search disagreed with the line that led to it', async () => {
    const { evaluate } = engine(SCRIPT);
    const result = await deepen(
      START_FEN,
      { breadth: 2, marginCp: 20, maxPlies: 3, budget: 100 },
      evaluate,
    );
    const minds = changedMinds(result.root);
    // The start's lines expected 1...e5 and 1...d5; the searches of those
    // positions prefer c5 and Nf6. After 1.e4 e5 the line expected 2.Nf3; the
    // search there prefers f4. After 1.e4 c5 it agreed, so it is not listed.
    expect(minds.map((mind) => [mind.expected.san, mind.found.san])).toEqual([
      ['e5', 'c5'],
      ['Nf3', 'f4'],
      ['d5', 'Nf6'],
    ]);
  });

  it('backs scores up from each side’s point of view, and never invents one', async () => {
    const { evaluate } = engine(SCRIPT);
    const result = await deepen(
      START_FEN,
      { breadth: 2, marginCp: 20, maxPlies: 3, budget: 100 },
      evaluate,
    );
    // Black picks the lower of c5 (+0.40 after Nf3) and e5 (+0.10 after f4): +0.10.
    expect(backedUp(result.root.children[0]!)).toEqual(cp(10));
    // White then prefers d4 (+0.25) to e4 (+0.10): the tree changed the first choice.
    expect(backedUp(result.root)).toEqual(cp(25));
    expect(principalLine(result.root)[0]!.move?.san).toBe('d4');
    // The root's own search said e4 at +0.30, and that is kept, not overwritten.
    expect(result.root.evaluation?.bestMove).toBe('e2e4');
  });

  it('orders mates above any centipawn score', async () => {
    const { evaluate } = engine({});
    const root = (
      await deepen(START_FEN, { breadth: 1, marginCp: 0, maxPlies: 1, budget: 1 }, evaluate)
    ).root;
    root.children.push(
      { fen: after('e2e4'), depthFromRoot: 1, lineScore: cp(900), children: [] },
      { fen: after('d2d4'), depthFromRoot: 1, lineScore: mate(3), children: [] },
    );
    expect(backedUp(root)).toEqual(mate(3));
  });

  it('stops when asked, keeping what it has', async () => {
    const controller = new AbortController();
    const { evaluate } = engine(SCRIPT);
    const result = await deepen(
      START_FEN,
      { breadth: 2, marginCp: 50, maxPlies: 4, budget: 100 },
      async (fen) => {
        const answer = await evaluate(fen);
        controller.abort();
        return answer;
      },
      controller.signal,
    );
    expect(result).toMatchObject({ stopped: true, searched: 1 });
    expect(result.root.children).toHaveLength(2);
  });

  it('estimates the positions a breadth and depth cost', () => {
    expect(positionsFor(1, 8)).toBe(8);
    expect(positionsFor(2, 4)).toBe(1 + 2 + 4 + 8);
  });
});

describe('graftDeepening', () => {
  it('adds the tree as variations with its evaluations, and names where the engine changed its mind', async () => {
    const { graftDeepening } = await import('./deepen-graft');
    const { createTree, mainlinePath } = await import('@/chess/tree/tree');
    const { playUciAt } = await import('@/chess/game');
    const { evaluate } = engine(SCRIPT);
    const result = await deepen(
      START_FEN,
      { breadth: 2, marginCp: 20, maxPlies: 3, budget: 100 },
      evaluate,
    );

    // The game on the board already has 1.d4 as its main line.
    let game = createTree(START_FEN);
    const d4 = playUciAt(game, game.rootId, 'd2d4');
    if (!d4.ok) throw new Error('d4');
    game = d4.value.tree;

    const grafted = graftDeepening(game, game.rootId, result.root, 'Stockfish 18', 1);
    const tree = grafted.tree;
    // The main line is untouched: 1.d4 first, 1.e4 a variation.
    expect(
      mainlinePath(tree)
        .slice(1)
        .map((id) => tree.nodes[id]!.move?.san)[0],
    ).toBe('d4');
    const rootChildren = tree.nodes[tree.rootId]!.children.map((id) => tree.nodes[id]!);
    expect(rootChildren.map((node) => node.move?.san)).toEqual(['d4', 'e4']);
    // d4 existed; e4, c5, e5, Nf3, f4, Nf6, c4 are new.
    expect(grafted.added).toBe(7);
    expect(tree.nodes[tree.rootId]!.evaluation).toMatchObject({
      engine: 'Stockfish 18',
      depth: 20,
      bestMove: 'e2e4',
    });
    const e5 = Object.values(tree.nodes).find((node) => node.move?.san === 'e5')!;
    expect(e5.comment).toBe(
      'Deepening: the line that led here expected Nf3; a search of this position prefers f4 (+0.1, depth 20).',
    );
    // Once, however often it is written.
    const again = graftDeepening(tree, tree.rootId, result.root, 'Stockfish 18', 1);
    expect(again.added).toBe(0);
    const e5Again = Object.values(again.tree.nodes).find((node) => node.move?.san === 'e5')!;
    expect(e5Again.comment).toBe(e5.comment);
  });
});

/*
  Phase 85: a run survives a reload, a sleep or a quit because it can be
  resumed from its checkpoint. The proof is that interrupting a run anywhere,
  saving the tree as JSON and resuming it gives exactly the tree, and asks the
  engine exactly the positions, an uninterrupted run does.
*/
describe('resuming a deep analysis', () => {
  const OPTIONS = { breadth: 2, marginCp: 50, maxPlies: 3, budget: 50 };
  const strip = (value: unknown) => JSON.parse(JSON.stringify(value));

  it('resumed from any checkpoint, gives the tree an uninterrupted run gives', async () => {
    const whole = engine(SCRIPT);
    const reference = await deepen(START_FEN as Fen, OPTIONS, whole.evaluate);
    expect(reference.searched).toBeGreaterThan(3);

    for (let stopAt = 1; stopAt < reference.searched; stopAt += 1) {
      const first = engine(SCRIPT);
      const controller = new AbortController();
      let saved: unknown = null;
      await deepen(
        START_FEN as Fen,
        OPTIONS,
        first.evaluate,
        controller.signal,
        undefined,
        undefined,
        (checkpoint) => {
          saved = strip(checkpoint);
          if (checkpoint.searched === stopAt) controller.abort();
        },
      );
      const second = engine(SCRIPT);
      const resumed = await deepen(
        START_FEN as Fen,
        OPTIONS,
        second.evaluate,
        undefined,
        undefined,
        saved as { root: never; searched: number },
      );
      expect(strip(resumed.root), `stopped after ${stopAt}`).toEqual(strip(reference.root));
      expect(resumed.searched).toBe(reference.searched);
      // Nothing searched twice, nothing skipped.
      expect([...first.asked.slice(0, stopAt), ...second.asked]).toEqual(whole.asked);
    }
  });

  it('keeps an interrupted search on the frontier, and refuses another start position', async () => {
    const { evaluate } = engine(SCRIPT);
    const controller = new AbortController();
    const result = await deepen(
      START_FEN as Fen,
      OPTIONS,
      async (fen, signal) => {
        if (fen !== START_FEN) {
          controller.abort();
          throw new DOMException('Stopped.', 'AbortError');
        }
        void signal;
        return evaluate(fen);
      },
      controller.signal,
    );
    expect(result.stopped).toBe(true);
    const pending = pendingFrontier(strip(result.root));
    // The first child's search was in flight when it stopped: it is still pending.
    expect(pending[0]!.move?.uci).toBe('e2e4');
    await expect(
      deepen(after('e2e4'), OPTIONS, evaluate, undefined, undefined, {
        root: strip(result.root),
        searched: result.searched,
      }),
    ).rejects.toThrow(/another position/);
  });
});
