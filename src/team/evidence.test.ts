import { describe, expect, it } from 'vitest';

import { cp } from '@/chess/evaluation';
import { parsePgn } from '@/chess/pgn';
import { setEvaluation } from '@/chess/tree/tree';
import type { NodeId } from '@/chess/tree/types';

import { describeEvidence, handoverEvidence } from './evidence';

const tree = () => parsePgn('1. e4 e5 {Solid.} 2. Nf3 (2. Nc3 {Also fine.}) Nc6 *').games[0]!.tree;

describe('handoverEvidence', () => {
  it('counts every position and none of them as evaluated when nothing was stored', () => {
    const evidence = handoverEvidence(tree());
    // root + e4 e5 Nf3 Nc3 Nc6
    expect(evidence.positions).toBe(6);
    expect(evidence.evaluated).toBe(0);
    expect(evidence.engines).toEqual([]);
    expect(evidence.moves).toBe(4);
    expect(evidence.variations).toBe(1);
    expect(evidence.comments).toBe(2);
    expect(describeEvidence(evidence)).toBe(
      '4 moves · 1 variation · 2 comments · 6 positions · no engine evaluations recorded.',
    );
  });

  it('groups stored evaluations by engine with the depth range actually recorded', () => {
    let t = tree();
    const ids = Object.keys(t.nodes) as NodeId[];
    t = setEvaluation(t, ids[1]!, { score: cp(30), depth: 18, engine: 'Stockfish 17.1' });
    t = setEvaluation(t, ids[2]!, { score: cp(20), depth: 26, engine: 'Stockfish 17.1' });
    t = setEvaluation(t, ids[3]!, { score: cp(10), depth: 12, engine: 'Lc0' });
    const evidence = handoverEvidence(t);
    expect(evidence.evaluated).toBe(3);
    expect(evidence.engines).toEqual([
      { name: 'Stockfish 17.1', positions: 2, minDepth: 18, maxDepth: 26 },
      { name: 'Lc0', positions: 1, minDepth: 12, maxDepth: 12 },
    ]);
    expect(describeEvidence(evidence)).toBe(
      '4 moves · 1 variation · 2 comments · 3 of 6 positions evaluated · Stockfish 17.1, depth 18–26; Lc0, depth 12.',
    );
  });

  it('shows nothing for counts a handover written before them does not carry', () => {
    expect(describeEvidence({ positions: 3, evaluated: 0, engines: [] })).toBe(
      '3 positions · no engine evaluations recorded.',
    );
  });
});
