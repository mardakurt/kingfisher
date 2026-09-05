import { describe, expect, it } from 'vitest';

import { positionKey, START_FEN } from '@/chess/fen';
import { playSanAt } from '@/chess/game';
import { createTree } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';
import { classifyPath } from './useOpeningClassification';
import { asFen } from '@/chess/types';

import {
  attributeOpening,
  classifyGameTree,
  classifyLine,
  classifyPosition,
  loadOpeningIndex,
  openingLabel,
  openingLineage,
} from './openings';

/** Play a main line from the start, the way an import would. */
function treeFrom(moves: readonly string[]): GameTree {
  let tree = createTree(START_FEN);
  let node = tree.rootId;
  for (const san of moves) {
    const played = playSanAt(tree, node, san);
    if (!played.ok) throw new Error(`${san}: ${played.error.message}`);
    tree = played.value.tree;
    node = played.value.nodeId;
  }
  return tree;
}

const index = await loadOpeningIndex();

describe('the opening index', () => {
  it('loads every vendored entry', () => {
    expect(index.entries).toBe(3810);
    expect(index.deepestPly).toBeGreaterThan(20);
    expect(index.digest).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is the same object on a second load', async () => {
    expect(await loadOpeningIndex()).toBe(index);
  });

  it('knows the position after 1.e4', () => {
    const tree = treeFrom(['e4']);
    const hit = classifyGameTree(index, tree);
    expect(hit?.eco).toBe('B00');
    expect(hit?.name).toBe("King's Pawn Game");
    expect(hit?.lineage).toEqual(["King's Pawn Game"]);
  });

  it('declines a position it has no entry for', () => {
    // Legal, reachable, and not in any opening table.
    expect(classifyPosition(index, asFen('8/5k2/8/8/3Q4/8/5K2/8 w - - 0 60'))).toBeNull();
  });

  it('holds at the last named position rather than inventing a deeper one', () => {
    /*
      1.Na3 is named ("Sodium Attack"); the knight shuffle after it is not.
      The classification stays at ply 1 instead of losing the name or
      attaching it to a position the dataset never saw.
    */
    const tree = treeFrom(['Na3', 'Nh6', 'Nb1', 'Ng8', 'Na3']);
    const hit = classifyGameTree(index, tree);
    expect(hit?.name).toBe('Sodium Attack');
    expect(hit?.datasetPlies).toBe(1);
  });
});

describe('classifying by the deepest known position', () => {
  it('names the Najdorf rather than the Sicilian', () => {
    const najdorf = treeFrom(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']);
    const hit = classifyGameTree(index, najdorf);
    expect(hit?.eco).toBe('B90');
    expect(openingLabel(hit!)).toContain('Najdorf');
    expect(hit?.lineage).toEqual(expect.arrayContaining(['Sicilian Defense', 'Najdorf Variation']));
    expect(hit?.ply).toBe(10);
  });

  it('keeps the deeper name when the line continues past it', () => {
    const shallow = classifyGameTree(index, treeFrom(['e4', 'c5']));
    const deep = classifyGameTree(
      index,
      treeFrom(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']),
    );
    expect(shallow?.name).toBe('Sicilian Defense');
    expect(shallow?.variation).toBeUndefined();
    expect(deep?.variation).toContain('Najdorf');
    expect(deep!.ply).toBeGreaterThan(shallow!.ply);
  });

  it('ignores variations and classifies what was played', () => {
    // Main line is a French; a sideline reaches a Sicilian position.
    let tree = treeFrom(['e4']);
    const french = playSanAt(
      tree,
      Object.keys(tree.nodes).find((id) => tree.nodes[id]?.ply === 1)!,
      'e6',
    );
    expect(french.ok).toBe(true);
    if (!french.ok) return;
    tree = french.value.tree;
    const sicilian = playSanAt(tree, tree.nodes[french.value.nodeId]!.parentId!, 'c5');
    expect(sicilian.ok).toBe(true);
    if (!sicilian.ok) return;
    tree = sicilian.value.tree;

    const hit = classifyGameTree(index, tree);
    expect(hit?.name).toBe('French Defense');
  });
});

describe('opening lineage', () => {
  it('keeps identity levels distinct from explorer and repertoire evidence', () => {
    expect(
      openingLineage('Sicilian Defense', 'Najdorf Variation, English Attack, Anti-English'),
    ).toEqual(['Sicilian Defense', 'Najdorf Variation', 'English Attack', 'Anti-English']);
  });

  it('has only the family when the dataset declares no variation', () => {
    expect(openingLineage('Sicilian Defense')).toEqual(['Sicilian Defense']);
  });
});

describe('transpositions', () => {
  it('recognizes a delayed transposition beyond the dataset maximum ply', () => {
    const shuffle = Array.from({ length: 10 }, () => ['Nf3', 'Nf6', 'Ng1', 'Ng8']).flat();
    const tree = treeFrom([
      ...shuffle,
      'e4',
      'c5',
      'Nf3',
      'd6',
      'd4',
      'cxd4',
      'Nxd4',
      'Nf6',
      'Nc3',
      'a6',
    ]);
    const nodes = Object.values(tree.nodes).sort((a, b) => a.ply - b.ply);
    const expected = { eco: 'B90', ply: 50, datasetPlies: 10 };
    expect(classifyGameTree(index, tree)).toMatchObject(expected);
    expect(classifyPath(index, tree, nodes.at(-1)!.id)).toMatchObject(expected);
    expect(
      classifyLine(
        index,
        nodes.slice(1).map((node) => node.fen),
      ),
    ).toMatchObject(expected);
    expect(classifyLine(index, [nodes.at(-1)!.fen], 50)).toMatchObject(expected);
  });
  it('converges on one classification through different move orders', () => {
    const direct = classifyGameTree(index, treeFrom(['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4']));
    const transposed = classifyGameTree(index, treeFrom(['c4', 'e6', 'Nc3', 'Bb4', 'd4', 'Nf6']));
    expect(direct).not.toBeNull();
    expect(transposed?.eco).toBe(direct?.eco);
    expect(transposed?.name).toBe(direct?.name);
    expect(transposed?.variation).toBe(direct?.variation);
    expect(direct?.name).toBe('Nimzo-Indian Defense');
  });

  it('converges when the move orders differ in length reaching the position', () => {
    // Both reach the Queen's Gambit Declined tabiya.
    const a = treeFrom(['d4', 'd5', 'c4', 'e6']);
    const b = treeFrom(['c4', 'e6', 'd4', 'd5']);
    const keyA = positionKey([...Object.values(a.nodes)].sort((x, y) => y.ply - x.ply)[0]!.fen);
    const keyB = positionKey([...Object.values(b.nodes)].sort((x, y) => y.ply - x.ply)[0]!.fen);
    expect(keyA).toBe(keyB);
    expect(classifyGameTree(index, a)?.eco).toBe(classifyGameTree(index, b)?.eco);
  });

  it('classifies a bare position without knowing how it was reached', () => {
    const hit = classifyPosition(
      index,
      asFen('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'),
    );
    expect(hit?.name).toBe('Sicilian Defense');
  });
});

describe('classifyLine', () => {
  it('takes the deepest hit in a sequence of positions', () => {
    const tree = treeFrom(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    const fens = [...Object.values(tree.nodes)]
      .filter((node) => node.ply > 0)
      .sort((a, b) => a.ply - b.ply)
      .map((node) => node.fen);
    const hit = classifyLine(index, fens);
    expect(hit?.name).toMatch(/Ruy Lopez|Spanish/);
    expect(hit?.ply).toBe(5);
  });

  it('returns null for a line with nothing known in it', () => {
    expect(classifyLine(index, [asFen('8/8/8/4k3/8/8/4K3/8 w - - 0 1')])).toBeNull();
  });
});

describe('declared versus computed', () => {
  const computed = {
    eco: 'B90',
    name: 'Sicilian Defense',
    variation: 'Najdorf',
    lineage: ['Sicilian Defense', 'Najdorf'],
    datasetPlies: 10,
    ply: 10,
  };

  it('reports agreement when the codes match', () => {
    const result = attributeOpening(computed, { eco: 'B90', opening: 'Sicilian' });
    expect(result.agreement).toBe('agree');
    expect(result.declared?.eco).toBe('B90');
    expect(result.computed?.eco).toBe('B90');
  });

  it('reports a difference without discarding either side', () => {
    const result = attributeOpening(computed, { eco: 'B20', opening: 'Sicilian Defence' });
    expect(result.agreement).toBe('differ');
    expect(result.declared?.eco).toBe('B20');
    expect(result.computed?.eco).toBe('B90');
  });

  it('does not call a naming difference a disagreement', () => {
    const spanish = {
      eco: 'C60',
      name: 'Ruy Lopez',
      lineage: ['Ruy Lopez'],
      datasetPlies: 5,
      ply: 5,
    };
    expect(attributeOpening(spanish, { eco: 'C60', opening: 'Spanish Game' }).agreement).toBe(
      'agree',
    );
  });

  it('treats a name-only tag as agreement, having nothing comparable to disagree with', () => {
    expect(attributeOpening(computed, { opening: 'Sicilian' }).agreement).toBe('agree');
  });

  it('distinguishes the three ways a game can be partly classified', () => {
    expect(attributeOpening(null, { eco: 'A00' }).agreement).toBe('only-declared');
    expect(attributeOpening(computed, null).agreement).toBe('only-computed');
    expect(attributeOpening(null, null).agreement).toBe('unclassified');
    expect(attributeOpening(null, {}).agreement).toBe('unclassified');
  });
});
