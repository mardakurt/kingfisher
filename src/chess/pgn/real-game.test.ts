import { describe, expect, it } from 'vitest';
import { parsePgn } from '@/chess/pgn';
import { serializePgn } from '@/chess/pgn';
import { mainlinePath, mustGetNode } from '@/chess/tree/tree';
import { outcomeAt } from '@/chess/game';

const OPERA = `[Event "Paris Opera"]
[Site "Paris FRA"]
[Date "1858.11.02"]
[White "Morphy, Paul"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 {The losing move.} 4. dxe5 Bxf3 5. Qxf3 dxe5
6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 (8. Qxb7 Qb4+ {and Black survives.}) 8... c6
9. Bg5 b5 10. Nxb5! cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6
15. Bxd7+ Nxd7 16. Qb8+! Nxb8 17. Rd8# 1-0`;

describe('a complete annotated game from a real source', () => {
  it('parses without issues, ends in mate, and round-trips', () => {
    const { games } = parsePgn(OPERA);
    expect(games).toHaveLength(1);
    const game = games[0]!;
    expect(game.issues).toEqual([]);

    const line = mainlinePath(game.tree);
    expect(line).toHaveLength(34);
    const last = line.at(-1)!;
    expect(mustGetNode(game.tree, last).move?.san).toBe('Rd8#');
    expect(outcomeAt(game.tree, last)).toEqual({ kind: 'checkmate', winner: 'w' });

    const again = parsePgn(serializePgn(game.tree)).games[0]!;
    expect(again.issues).toEqual([]);
    expect(mainlinePath(again.tree)).toHaveLength(34);
    expect(mustGetNode(again.tree, mainlinePath(again.tree).at(-1)!).move?.san).toBe('Rd8#');
  });
});
