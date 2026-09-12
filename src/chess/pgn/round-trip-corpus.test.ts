/**
 * Phase 49, Part AV: one corpus, every PGN feature Kingfisher claims to keep,
 * imported → exported → imported again, and the two trees compared node by
 * node — move, comment, NAGs, shapes, clock, evaluation, and the position
 * each node stands on. "It parses" is not the claim; "nothing is lost" is.
 */
import { describe, expect, it } from 'vitest';

import { mustGetNode } from '../tree/tree';
import type { GameTree, NodeId } from '../tree/types';
import { parseSingleGame } from './parse';
import { serializePgn } from './serialize';
import { expect as unwrap } from '../result';

interface Flat {
  readonly path: string;
  readonly san: string | null;
  readonly fen: string;
  readonly comment?: string;
  readonly nags: readonly number[];
  readonly shapes: number;
  readonly clockSeconds?: number;
  readonly evaluation?: unknown;
  readonly children: number;
}

/** Every node, depth-first, with the variation path that reaches it. */
function flatten(tree: GameTree): Flat[] {
  const out: Flat[] = [];
  const walk = (id: NodeId, path: string) => {
    const node = mustGetNode(tree, id);
    out.push({
      path,
      san: node.move?.san ?? null,
      fen: node.fen,
      ...(node.comment !== undefined ? { comment: node.comment } : {}),
      nags: node.nags,
      shapes: node.shapes.length,
      ...(node.meta.clockSeconds !== undefined ? { clockSeconds: node.meta.clockSeconds } : {}),
      ...(node.evaluation ? { evaluation: node.evaluation.score } : {}),
      children: node.children.length,
    });
    node.children.forEach((child, index) => walk(child, `${path}/${index}`));
  };
  walk(tree.rootId, '');
  return out;
}

const CORPUS: readonly { readonly name: string; readonly pgn: string }[] = [
  {
    name: 'mainline with nested variations, comments, NAGs, Unicode and clocks',
    pgn: `[Event "Phase 49 corpus"]
[Site "Ærø, Danmark"]
[Date "2026.09.12"]
[Round "1"]
[White "Gąsior, Łukasz"]
[Black "Nguyễn, Văn"]
[Result "1-0"]
[Annotator "Kingfisher"]

1. e4 {[%clk 1:30:00] Der Königsbauer — 王翼} c5 $5 {[%clk 1:29:45]} 2. Nf3 (2. c3 {Alapin} d5 3. exd5 Qxd5 (3... Nf6 $6 4. c4 e6 5. dxe6 Bxe6)) 2... d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 $1 {Najdorf — «la ligne principale» ½ point de plus} 6. Be3 (6. Bg5 e6 7. f4 Qb6 $5 {Poisoned Pawn [%cal Rb6b2] [%csl Rb2]} 8. Qd2 Qxb2 $3) 6... e5 $14 7. Nb3 Be6 8. f3 {[%eval 0.31] [%clk 1:20:03]} h5 $146 1-0
`,
  },
  {
    name: 'a set-up position with castling both ways, en passant and promotion',
    pgn: `[Event "Set up"]
[SetUp "1"]
[FEN "r3k2r/pp1p1ppp/8/2pPp3/8/8/PPP2PPP/R3K2R w KQkq e6 0 12"]
[Result "*"]

12. dxe6 {en passant [%clk 0:05:00]} O-O-O (12... O-O 13. exd7 $18) 13. O-O d5 14. e7 $16 Rhf8 15. exf8=Q Rxf8 (15... Kc7 $4) *
`,
  },
  {
    name: 'underpromotion with check, and a comment before the first move',
    pgn: `[Event "Promotion"]
[SetUp "1"]
[FEN "8/1P1k4/8/8/8/8/8/4K3 w - - 0 60"]
[Result "1-0"]

{White to play and promote.} 60. b8=N+ $1 {a knight, with check} Kc7 (60... Kd6 61. Kd2) 61. Kd2 1-0
`,
  },
];

describe('the PGN corpus survives import → export → import', () => {
  for (const { name, pgn } of CORPUS) {
    it(name, () => {
      const first = unwrap(parseSingleGame(pgn));
      expect(first.issues ?? []).toEqual([]);
      const text = serializePgn(first.tree);
      const second = unwrap(parseSingleGame(text));
      expect(second.issues ?? []).toEqual([]);
      expect(flatten(second.tree)).toEqual(flatten(first.tree));
      // The serializer completes the Seven Tag Roster with "?" placeholders,
      // which is standard PGN; every header the source had is kept as it was.
      expect(second.tree.headers).toEqual(expect.objectContaining(first.tree.headers));
      expect(second.tree.startFen).toBe(first.tree.startFen);
      // And a third pass is byte-stable: the serializer is a fixed point.
      expect(serializePgn(second.tree)).toBe(text);
    });
  }

  it('keeps the features the corpus was written to exercise', () => {
    const first = unwrap(parseSingleGame(CORPUS[0]!.pgn));
    const nodes = flatten(first.tree);
    expect(nodes.some((n) => n.comment?.includes('王翼'))).toBe(true);
    expect(nodes.some((n) => n.comment?.includes('«la ligne principale»'))).toBe(true);
    expect(nodes.some((n) => n.clockSeconds === 90 * 60)).toBe(true);
    expect(nodes.some((n) => n.nags.includes(146))).toBe(true);
    expect(nodes.some((n) => n.shapes === 2)).toBe(true);
    expect(nodes.some((n) => n.evaluation !== undefined)).toBe(true);
    expect(nodes.filter((n) => n.path.split('/').length > 2).length).toBeGreaterThan(3);
    const setUp = flatten(unwrap(parseSingleGame(CORPUS[1]!.pgn)).tree);
    expect(setUp.map((n) => n.san)).toEqual(
      expect.arrayContaining(['dxe6', 'O-O-O', 'O-O', 'exf8=Q', 'exd7']),
    );
    expect(first.tree.headers.White).toBe('Gąsior, Łukasz');
  });
});
