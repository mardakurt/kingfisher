import { describe, expect, it } from 'vitest';

import { cp } from '@/chess/evaluation';
import { START_FEN, positionKey } from '@/chess/fen';
import { playSanAt } from '@/chess/game';
import { expect as unwrap } from '@/chess/result';
import { createTree, mainlinePath, setMeta } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import {
  moveLabel,
  repertoireDeviationSignal,
  suggestReviewCandidates,
  tablebaseChangeSignal,
  type EvidencePoint,
} from './candidates';

/** Build a mainline and hand back the node ids in order. */
function line(moves: readonly string[]): { tree: GameTree; path: readonly NodeId[] } {
  let tree = createTree(START_FEN);
  let cursor: NodeId = tree.rootId;
  for (const san of moves) {
    const played = unwrap(playSanAt(tree, cursor, san));
    tree = played.tree;
    cursor = played.nodeId;
  }
  return { tree, path: mainlinePath(tree) };
}

const evidenceAt = (path: readonly NodeId[], scores: readonly (number | null)[]): EvidencePoint[] =>
  scores.flatMap((value, index) =>
    value === null ? [] : [{ nodeId: path[index] as NodeId, score: cp(value) }],
  );

describe('suggesting review candidates', () => {
  it('says nothing when nothing moved', () => {
    const { tree, path } = line(['e4', 'e5', 'Nf3', 'Nc6']);
    const evidence = evidenceAt(path, [20, 25, 22, 24, 21]);
    expect(suggestReviewCandidates(tree, evidence, positionKey)).toEqual([]);
  });

  it('names the facts behind a change, and no verdict', () => {
    const { tree, path } = line(['e4', 'e5', 'Nf3', 'Nc6']);
    // White's third move loses a lot of expected result: +0.40 to −1.10.
    const evidence = evidenceAt(path, [20, 25, 40, -110, -105]);
    const candidates = suggestReviewCandidates(tree, evidence, positionKey);

    expect(candidates).toHaveLength(1);
    const candidate = candidates[0]!;
    expect(candidate.reason).toBe(
      'Suggested because engine evaluation changed from +0.40 to -1.10 after 2.Nf3.',
    );
    expect(candidate.signals.map((signal) => signal.kind)).toEqual(['evaluation-swing']);
    expect(candidate.signals[0]?.detail).toBe('+0.40 → -1.10');
    expect(candidate.playedSan).toBe('Nf3');
    expect(candidate.sideToMove).toBe('w');
    // Not a label. Nothing in the output says what kind of move it was.
    const text = JSON.stringify(candidate).toLowerCase();
    expect(text).not.toContain('blunder');
    expect(text).not.toContain('mistake');
    expect(text).not.toContain('inaccuracy');
  });

  it('measures a change against the side that actually moved', () => {
    const { tree, path } = line(['e4', 'e5', 'Nf3']);
    /*
      White is +0.40 after 1.e4; Black's reply hands over a lot, so the score
      rises for White. Without the colour flip this would read as Black's
      position collapsing and White's move being at fault.
    */
    const evidence = evidenceAt(path, [20, 40, 250, 245]);
    const candidates = suggestReviewCandidates(tree, evidence, positionKey);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.sideToMove).toBe('b');
    expect(candidates[0]?.playedSan).toBe('e5');
  });

  it('ignores a large change in an already decided position', () => {
    const { tree, path } = line(['e4', 'e5', 'Nf3']);
    // +6.00 to +5.00 is a whole pawn and changes almost nothing practical.
    const evidence = evidenceAt(path, [600, 600, 500, 500]);
    expect(suggestReviewCandidates(tree, evidence, positionKey)).toEqual([]);
  });

  it('needs evidence on both sides of a move', () => {
    const { tree, path } = line(['e4', 'e5', 'Nf3']);
    const evidence = evidenceAt(path, [20, null, 250, null]);
    expect(suggestReviewCandidates(tree, evidence, positionKey)).toEqual([]);
  });

  it('adds the engine first choice only beside a measured change', () => {
    const { tree, path } = line(['e4', 'e5', 'Nf3']);
    const quiet = suggestReviewCandidates(
      tree,
      [
        { nodeId: path[0] as NodeId, score: cp(20), bestMoveUci: 'd2d4' },
        { nodeId: path[1] as NodeId, score: cp(18) },
      ],
      positionKey,
    );
    expect(quiet).toEqual([]);

    const loud = suggestReviewCandidates(
      tree,
      [
        { nodeId: path[0] as NodeId, score: cp(20), bestMoveUci: 'd2d4' },
        { nodeId: path[1] as NodeId, score: cp(-200) },
      ],
      positionKey,
    );
    expect(loud[0]?.signals.map((signal) => signal.kind)).toEqual([
      'evaluation-swing',
      'best-move-change',
    ]);
    expect(loud[0]?.signals[1]?.detail).toContain('d2d4');
  });

  it('always includes a position the player marked, with no number', () => {
    const { tree, path } = line(['e4', 'e5']);
    const marked = setMeta(tree, path[1] as NodeId, { critical: 'calculation' });
    const candidates = suggestReviewCandidates(marked, [], positionKey);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.category).toBe('calculation');
    expect(candidates[0]?.reason).toBe('You marked this position for review (calculation).');
    expect(candidates[0]?.magnitude).toBe(0);
  });

  it('puts a hand-marked position ahead of a computed one', () => {
    const { tree, path } = line(['e4', 'e5', 'Nf3']);
    const marked = setMeta(tree, path[3] as NodeId, { critical: 'endgame' });
    const candidates = suggestReviewCandidates(
      marked,
      evidenceAt(path, [20, 40, 250, 245]),
      positionKey,
    );
    expect(candidates[0]?.category).toBe('endgame');
    expect(candidates).toHaveLength(2);
  });

  it('honours the threshold and the limit', () => {
    const { tree, path } = line(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']);
    const swinging = evidenceAt(path, [0, 150, 0, 150, 0, 150, 0]);
    expect(suggestReviewCandidates(tree, swinging, positionKey, { swingThreshold: 0.9 })).toEqual(
      [],
    );
    expect(
      suggestReviewCandidates(tree, swinging, positionKey, { limit: 2 }).length,
    ).toBeLessThanOrEqual(2);
  });

  it('is deterministic', () => {
    const { tree, path } = line(['e4', 'e5', 'Nf3', 'Nc6']);
    const evidence = evidenceAt(path, [20, 25, 40, -110, -105]);
    expect(suggestReviewCandidates(tree, evidence, positionKey)).toEqual(
      suggestReviewCandidates(tree, evidence, positionKey),
    );
  });
});

describe('the other two signals', () => {
  it('reports a repertoire deviation only when the move actually left it', () => {
    expect(repertoireDeviationSignal('Nf3', ['Nf3', 'd4'])).toBeNull();
    expect(repertoireDeviationSignal('Nf3', [])).toBeNull();
    expect(repertoireDeviationSignal('h3', ['Nf3', 'd4'])?.detail).toBe(
      'Your repertoire says Nf3 or d4 here; h3 was played.',
    );
  });

  it('reports a tablebase result only when it changed', () => {
    expect(tablebaseChangeSignal('win', 'win')).toBeNull();
    expect(tablebaseChangeSignal('win', 'draw')?.detail).toBe(
      'Tablebase result changed from win to draw.',
    );
  });
});

describe('move labels', () => {
  it('writes a move the way a player would', () => {
    expect(moveLabel(1, 'e4')).toBe('1.e4');
    expect(moveLabel(2, 'e5')).toBe('1...e5');
    expect(moveLabel(47, 'Rd1')).toBe('24.Rd1');
    expect(moveLabel(48, 'Rd8')).toBe('24...Rd8');
  });
});
