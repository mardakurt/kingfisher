import { beforeEach, describe, expect, it } from 'vitest';

import { useAnalysis } from './analysis-store';
import { flaggedNodes, useScoresheet } from './scoresheet-store';

describe('the scoresheet session', () => {
  beforeEach(() => {
    useAnalysis.getState().newGame();
    useScoresheet.getState().reset();
  });

  it('plays a cell onto the board and flags what it could not read exactly', () => {
    for (const token of ['e4', 'c5', 'Sf3', 'd6', 'd4', 'cd', 'N?d4']) {
      useScoresheet.getState().enter(token);
    }
    const { tree } = useAnalysis.getState();
    const sans: string[] = [];
    let cursor = tree.nodes[tree.rootId];
    while (cursor?.children[0]) {
      cursor = tree.nodes[cursor.children[0]];
      if (cursor?.move) sans.push(cursor.move.san);
    }
    expect(sans.join(' ')).toBe('e4 c5 Nf3 d6 d4 cxd4 Nxd4');
    const flags = flaggedNodes();
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ san: 'Nxd4' });
    expect(flags[0]!.note).toContain('N?d4');
  });
});
