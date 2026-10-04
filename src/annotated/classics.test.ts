import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePgn, serializePgn } from '@/chess/pgn';
import { Position } from '@/chess/position';
import { mainlinePath } from '@/chess/tree/tree';

const file = 'public/data/annotated/famous-games-and-championship-classics.pgn';
const pgn = readFileSync(file, 'utf8');

describe('credited classic scores', () => {
  it('contains 100 complete distinct games with source revisions and survives PGN export', () => {
    const parsed = parsePgn(pgn);
    expect(parsed.refused).toEqual([]);
    expect(parsed.issues).toEqual([]);
    expect(parsed.games).toHaveLength(100);
    const lines = new Set<string>();
    for (const game of parsed.games) {
      expect(game.issues).toEqual([]);
      expect(game.tree.headers.Source).toMatch(
        /^https:\/\/(?:commons\.wikimedia|en\.wikipedia)\.org\/w\/index\.php\?title=.+&oldid=\d+$/,
      );
      expect(game.tree.headers.SourceLicense).toBe('CC BY-SA 4.0');
      const path = mainlinePath(game.tree);
      const moves = path.slice(1).map((id) => game.tree.nodes[id]!.move!.uci);
      lines.add(moves.join(' '));
      const roundtrip = parsePgn(serializePgn(game.tree));
      expect(roundtrip.games[0]!.issues).toEqual([]);
      expect(mainlinePath(roundtrip.games[0]!.tree)).toHaveLength(path.length);
    }
    expect(lines.size).toBe(100);
    const catalog = JSON.parse(readFileSync('public/data/annotated/catalog.json', 'utf8'));
    const row = catalog.sets.find((set: { file: string }) => set.file === file.split('/').at(-1));
    expect(row.games).toBe(100);
    expect(row.notes).toBe(0);
    expect(row.sha256).toBe(createHash('sha256').update(pgn).digest('hex'));
  });

  it('includes the actual mating finishes of the Immortal, Evergreen and Opera games', () => {
    const parsed = parsePgn(pgn);
    for (const [title, lastMove] of [
      ['Immortal Game, 1851', 'Be7#'],
      ['Evergreen Game, 1852', 'Bxe7#'],
      ['Opera Game, 1858', 'Rd8#'],
    ]) {
      const game = parsed.games.find((item) => item.tree.headers.Title === title);
      expect(game, title).toBeDefined();
      const last = game!.tree.nodes[mainlinePath(game!.tree).at(-1)!]!;
      expect(last.move!.san).toBe(lastMove);
      const position = Position.fromFen(last.fen);
      expect(position.ok && position.value.isCheckmate()).toBe(true);
    }
  });
});
