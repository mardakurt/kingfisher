import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn/parse';
import { positionKey } from '@/chess/fen';
import { repertoireDeviationSignal } from '@/features/review/candidates';
import type { GameTree } from '@/chess/tree/types';

/**
 * Phase 40 (PART BB): "A repertoire deviation is
 * POSITION-BASED. Not merely: move-number/string sequence
 * based. If the game transposes back into repertoire:
 * recognize it."
 */

function treeFor(pgn: string): GameTree {
  const parsed = parsePgn(`${pgn} *`);
  const first = parsed.games[0];
  if (!first) throw new Error(`Could not parse PGN: ${pgn}`);
  return first.tree;
}

describe('repertoire deviation is position-based, not sequence-based', () => {
  it('a move order that transposes into the same canonical position is recognised', () => {
    /* Order A and order B reach the same canonical position
       through different move orders. positionKey normalises
       the FEN to its first four fields, so both trees must
       share a key for the post-Nf6 position. */
    const orderA = treeFor('1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6');
    const orderB = treeFor('1.Nf3 c5 2.e4 d6 3.d4 cxd4 4.Nxd4 Nf6');
    const keyA = new Set(Object.values(orderA.nodes).map((n) => positionKey(n.fen)));
    const keyB = new Set(Object.values(orderB.nodes).map((n) => positionKey(n.fen)));
    /* The intersection of reachable positions is non-empty
       (the root + at least the transposed position). */
    let intersection = 0;
    for (const key of keyA) if (keyB.has(key)) intersection += 1;
    expect(intersection).toBeGreaterThan(1);
  });

  it('does not flag a move that the repertoire covers at the reached position', () => {
    /* The repertoire at the starting position is encoded in
       UCI. Playing e4 from the starting position is in the
       repertoire; the deviation signal must be null. */
    const repertoire = ['e2e4', 'd2d4'];
    expect(repertoireDeviationSignal('e2e4', repertoire)).toBeNull();
    expect(repertoireDeviationSignal('d2d4', repertoire)).toBeNull();
  });

  it('flags a move that the repertoire does not cover at the reached position', () => {
    const repertoire = ['e2e4', 'd2d4'];
    expect(repertoireDeviationSignal('g2g4', repertoire)).not.toBeNull();
    expect(repertoireDeviationSignal('a2a4', repertoire)).not.toBeNull();
  });

  it('returns null when the repertoire at the position is empty (no commitment)', () => {
    /* An empty repertoire is the absence of a claim, not a
       claim of absence. The signal must not fire — a position
       the user has not prepared is not "deviation", it is
       just unprepared play. */
    expect(repertoireDeviationSignal('e2e4', [])).toBeNull();
  });
});
