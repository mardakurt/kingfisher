import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import { mainlinePath } from '@/chess/tree/tree';
import type { Fen } from '@/chess/types';

import { ecoMarks, ecoMarksByNode } from './tree-eco';
import type { OpeningClassification, OpeningIndex } from './openings';

type Entry = Omit<OpeningClassification, 'datasetPlies'> & { readonly datasetPlies?: number };

/** An index that answers from a table of position keys, as the real one does. */
function index(table: Record<string, Entry>): OpeningIndex {
  return {
    digest: 'test',
    deepestPly: 40,
    lookup: (key: string) => {
      const entry = table[key];
      return entry ? { datasetPlies: 1, ...entry } : null;
    },
  } as unknown as OpeningIndex;
}

const tree = parsePgn('[Event "?"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 *')
  .games[0]!.tree;
const path = mainlinePath(tree);
const keyOf = (ply: number): string => {
  const fen = tree.nodes[path[ply]!]!.fen as Fen;
  return fen.split(' ').slice(0, 4).join(' ');
};

describe('ecoMarks', () => {
  it('marks a move only when the name changes, not at every named position', () => {
    const marks = ecoMarks(
      index({
        [keyOf(1)]: { eco: 'B20', name: 'Sicilian Defense' },
        [keyOf(2)]: { eco: 'B20', name: 'Sicilian Defense' },
        [keyOf(3)]: { eco: 'B50', name: 'Sicilian Defense', variation: 'Modern' },
        [keyOf(9)]: { eco: 'B90', name: 'Sicilian Defense', variation: 'Najdorf' },
      }),
      tree,
      path,
    );
    expect(marks.map((mark) => [mark.ply, mark.eco, mark.variation ?? ''])).toEqual([
      [1, 'B20', ''],
      [3, 'B50', 'Modern'],
      [9, 'B90', 'Najdorf'],
    ]);
  });

  it('says nothing where the dataset names nothing — a deep position inherits', () => {
    const marks = ecoMarks(
      index({ [keyOf(1)]: { eco: 'B20', name: 'Sicilian Defense' } }),
      tree,
      path,
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]!.ply).toBe(1);
  });

  it('marks nothing at all when nothing on the line is named', () => {
    expect(ecoMarks(index({}), tree, path)).toEqual([]);
  });

  it('treats a changed variation under one code as a change', () => {
    const marks = ecoMarks(
      index({
        [keyOf(1)]: { eco: 'B20', name: 'Sicilian Defense' },
        [keyOf(2)]: { eco: 'B20', name: 'Sicilian Defense', variation: 'Open' },
      }),
      tree,
      path,
    );
    expect(marks).toHaveLength(2);
    expect(marks[1]!.variation).toBe('Open');
  });

  it('indexes marks by node for a renderer that walks rows', () => {
    const marks = ecoMarks(
      index({ [keyOf(1)]: { eco: 'B20', name: 'Sicilian Defense' } }),
      tree,
      path,
    );
    const byNode = ecoMarksByNode(marks);
    expect(byNode.get(path[1]!)?.eco).toBe('B20');
    expect(byNode.get(path[2]!)).toBeUndefined();
  });
});
