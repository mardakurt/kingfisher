import { beforeEach, describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { playSanAt } from '@/chess/game';
import { parsePgn } from '@/chess/pgn';
import { expect as unwrap } from '@/chess/result';
import { createTree, mainlinePath, mustGetNode } from '@/chess/tree/tree';
import type { NodeId } from '@/chess/tree/types';
import { asSan, asUci } from '@/chess/types';
import { createMemoryRepositories } from '@/persistence/repositories';
import type { AppRepositories } from '@/persistence/types';

import { exportRepertoirePgn, repertoireToTree } from './export';
import { lineToKnowledge } from './index';

let repositories: AppRepositories;

beforeEach(() => {
  repositories = createMemoryRepositories();
});

function play(moves: string[]) {
  let tree = createTree(START_FEN);
  let cursor: NodeId = tree.rootId;
  for (const san of moves) {
    const played = unwrap(playSanAt(tree, cursor, san));
    tree = played.tree;
    cursor = played.nodeId;
  }
  return { tree, last: cursor };
}

async function knowledge(
  repertoireId: string,
  moves: string[],
  color: 'w' | 'b',
  role: 'main' | 'alternative' = 'main',
  note?: string,
) {
  const { tree, last } = play(moves);
  for (const entry of lineToKnowledge(tree, last, color, role, note)) {
    const current = await repositories.repertoires.getPosition(repertoireId, entry.positionKey);
    await repositories.repertoires.upsertPosition({
      repertoireId,
      fen: entry.fen,
      sideToMove: entry.sideToMove,
      depth: entry.depth,
      moves: [entry.move],
      ...(current ? { expectedRevision: current.revision } : {}),
    });
  }
}

describe('exporting a repertoire as PGN', () => {
  it('walks stored positions back into a playable line', async () => {
    const created = await repositories.repertoires.create({ title: 'Italian', color: 'w' });
    await knowledge(created.id, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], 'w');
    const stored = await repositories.repertoires.get(created.id);

    const tree = repertoireToTree(stored!.repertoire, stored!.positions);
    const line = mainlinePath(tree)
      .slice(1)
      .map((id) => mustGetNode(tree, id as NodeId).move?.san);

    expect(line).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
  });

  it('produces PGN another program can parse back', async () => {
    const created = await repositories.repertoires.create({ title: 'Italian', color: 'w' });
    await knowledge(created.id, ['e4', 'e5', 'Nf3'], 'w', 'main', 'Open games.');
    const stored = await repositories.repertoires.get(created.id);

    const pgn = exportRepertoirePgn(stored!.repertoire, stored!.positions);
    const reparsed = parsePgn(pgn);

    expect(reparsed.games).toHaveLength(1);
    expect(reparsed.games[0]?.issues).toEqual([]);
    expect(pgn).toContain('[Event "Italian"]');
    expect(pgn).toContain('Open games.');
  });

  it('writes a second answer at one position as a variation', async () => {
    const created = await repositories.repertoires.create({ title: 'First move', color: 'w' });
    await knowledge(created.id, ['e4'], 'w');
    await knowledge(created.id, ['d4'], 'w', 'alternative');
    const stored = await repositories.repertoires.get(created.id);

    const pgn = exportRepertoirePgn(stored!.repertoire, stored!.positions);
    expect(pgn).toContain('1. e4');
    expect(pgn).toContain('(1. d4');
    expect(pgn).toContain('Alternative');
  });

  it('records a rejected move as prose rather than as a played move', async () => {
    const created = await repositories.repertoires.create({ title: 'Rejections', color: 'w' });
    await repositories.repertoires.upsertPosition({
      repertoireId: created.id,
      fen: START_FEN,
      sideToMove: 'w',
      depth: 0,
      moves: [
        { uci: asUci('e2e4'), san: asSan('e4'), role: 'main', updatedAt: 1 },
        { uci: asUci('f2f4'), san: asSan('f4'), role: 'avoid', updatedAt: 1 },
      ],
    });
    const stored = await repositories.repertoires.get(created.id);

    const pgn = exportRepertoirePgn(stored!.repertoire, stored!.positions);
    expect(pgn).toContain('Avoid: f4');
    expect(pgn).not.toMatch(/\bf4\b(?![^{]*})/);
  });

  it('names the repertoire’s own side in the headers', async () => {
    const created = await repositories.repertoires.create({ title: 'Najdorf', color: 'b' });
    await knowledge(created.id, ['e4', 'c5'], 'b');
    const stored = await repositories.repertoires.get(created.id);

    const pgn = exportRepertoirePgn(stored!.repertoire, stored!.positions);
    expect(pgn).toContain('[Black "Najdorf"]');
    expect(pgn).toContain('[RepertoireColor "Black"]');
  });

  it('stops rather than looping when a line transposes into itself', async () => {
    const created = await repositories.repertoires.create({ title: 'Shuffle', color: 'w' });
    // Ng1-f3-g1 returns to a position already on the path.
    await knowledge(created.id, ['Nf3', 'Nf6', 'Ng1', 'Ng8'], 'w');
    const stored = await repositories.repertoires.get(created.id);

    const pgn = exportRepertoirePgn(stored!.repertoire, stored!.positions);
    expect(pgn.length).toBeLessThan(4_000);
    expect(parsePgn(pgn).games).toHaveLength(1);
  });

  it('keeps a line that does not descend from the shallowest position', async () => {
    // 1.e4 from the start, and Nf3 at the Caro-Kann position after
    // 1.e4 c6 2.d4 d5. Both are stored at depth 0, so walking only from the
    // shallowest position never plays Nf3. Re-import is not how this is
    // checked: the PGN has to contain both moves, and the note on Nf3.
    const created = await repositories.repertoires.create({ title: 'Caro-Kann', color: 'w' });
    const caro = play(['e4', 'c6', 'd4', 'd5']);
    const caroFen = mustGetNode(caro.tree, caro.last).fen;
    await repositories.repertoires.upsertPosition({
      repertoireId: created.id,
      fen: START_FEN,
      sideToMove: 'w',
      depth: 0,
      moves: [
        { uci: asUci('e2e4'), san: asSan('e4'), role: 'main', note: 'Open games.', updatedAt: 1 },
      ],
    });
    await repositories.repertoires.upsertPosition({
      repertoireId: created.id,
      fen: caroFen,
      sideToMove: 'w',
      depth: 0,
      note: 'The Caro structure.',
      moves: [
        {
          uci: asUci('g1f3'),
          san: asSan('Nf3'),
          role: 'main',
          note: 'Before c4.',
          updatedAt: 1,
        },
        { uci: asUci('f2f4'), san: asSan('f4'), role: 'avoid', updatedAt: 1 },
      ],
    });
    const stored = await repositories.repertoires.get(created.id);

    const pgn = exportRepertoirePgn(stored!.repertoire, stored!.positions);
    const parsed = parsePgn(pgn);
    expect(parsed.games).toHaveLength(2);
    expect(parsed.games.every((game) => game.issues.length === 0)).toBe(true);
    expect(pgn).toContain('1. e4');
    expect(pgn).toContain('Nf3');
    expect(pgn).toContain('Open games.');
    expect(pgn).toContain('Before c4.');
    expect(pgn).toContain('The Caro structure.');
    expect(pgn).toContain('Avoid: f4');
  });

  it('exports an empty repertoire without failing', async () => {
    const created = await repositories.repertoires.create({ title: 'Empty', color: 'w' });
    const stored = await repositories.repertoires.get(created.id);
    expect(exportRepertoirePgn(stored!.repertoire, stored!.positions)).toContain('[Event "Empty"]');
  });
});
