import { beforeEach, describe, expect, it } from 'vitest';

import { positionKey, START_FEN } from '@/chess/fen';
import { playSanAt } from '@/chess/game';
import { expect as unwrap } from '@/chess/result';
import { createTree } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import { createMemoryRepositories } from '@/persistence/repositories';
import type { AppRepositories } from '@/persistence/types';

import { indexPositions, lineToEntries, type RepertoireIndex } from './index';
import { groupFindings, scanAgainstRepertoire } from './scan';

let repositories: AppRepositories;

beforeEach(() => {
  repositories = createMemoryRepositories();
});

function play(moves: string[]): { tree: GameTree; last: NodeId } {
  let tree = createTree(START_FEN);
  let cursor = tree.rootId;
  for (const san of moves) {
    const played = unwrap(playSanAt(tree, cursor, san));
    tree = played.tree;
    cursor = played.nodeId;
  }
  return { tree, last: cursor };
}

/** A White repertoire: the Ruy Lopez, closed, to move 5. */
async function ruyLopez(): Promise<RepertoireIndex> {
  const repertoire = await repositories.repertoires.create({ title: 'Ruy', color: 'w' });
  const line = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O'];
  const { tree, last } = play(line);
  for (const entry of lineToEntries(tree, last, 'w', 'main')) {
    const existing = await repositories.repertoires.getPosition(
      repertoire.id,
      positionKey(entry.fen),
    );
    await repositories.repertoires.upsertPosition({
      repertoireId: repertoire.id,
      fen: entry.fen,
      sideToMove: entry.sideToMove,
      depth: entry.depth,
      moves: [entry.move],
      ...(existing ? { expectedRevision: existing.revision } : {}),
    });
  }
  const stored = await repositories.repertoires.get(repertoire.id);
  return indexPositions(stored?.positions ?? []);
}

describe('the repertoire scan', () => {
  it('finds a new move against the line, where the repertoire had prepared replies', async () => {
    const index = await ruyLopez();
    const game = play(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'd6', 'c3']);
    const finding = scanAgainstRepertoire(game.tree, 'w', index, 4);
    expect(finding).toMatchObject({
      kind: 'new-move',
      san: 'd6',
      ply: 8,
      expected: ['Nf6'],
      depth: 7,
    });
  });

  it('finds another choice for the repertoire’s own side', async () => {
    const index = await ruyLopez();
    const game = play(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']);
    const finding = scanAgainstRepertoire(game.tree, 'w', index, 4);
    expect(finding).toMatchObject({ kind: 'own-alternative', san: 'Bc4', expected: ['Bb5'] });
  });

  it('finds where a game went on after the preparation stops', async () => {
    const index = await ruyLopez();
    const game = play(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1']);
    const finding = scanAgainstRepertoire(game.tree, 'w', index, 4);
    expect(finding).toMatchObject({ kind: 'past-preparation', san: 'Be7', expected: [] });
    expect(finding!.depth).toBe(9);
  });

  it('follows a game that transposes back into the line, and reports only its way out', async () => {
    const index = await ruyLopez();
    // 1.Nf3 Nc6 2.e4 e5 reaches the prepared position after 1.e4 e5 2.Nf3 Nc6.
    const game = play(['Nf3', 'Nc6', 'e4', 'e5', 'Bb5', 'a6', 'Ba4', 'd6', 'c3']);
    expect(scanAgainstRepertoire(game.tree, 'w', index, 4)).toMatchObject({
      kind: 'new-move',
      san: 'd6',
      expected: ['Nf6'],
    });
  });

  it('leaves out games that barely touched the repertoire', async () => {
    const index = await ruyLopez();
    const game = play(['e4', 'c5', 'Nf3', 'd6']);
    expect(scanAgainstRepertoire(game.tree, 'w', index)).toBeNull();
    expect(scanAgainstRepertoire(play(['e4', 'c5']).tree, 'w', index, 1)?.kind).toBe('new-move');
  });

  it('says nothing about a game that stayed inside the preparation to its last move', async () => {
    const index = await ruyLopez();
    const game = play(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
    expect(scanAgainstRepertoire(game.tree, 'w', index, 4)).toBeNull();
  });

  it('groups the same move from the same position into one row, deepest first', async () => {
    const index = await ruyLopez();
    const games = [
      play(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'd6']),
      play(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'd6', 'c3']),
      play(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6']),
      play(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']),
    ].map((game, number) => ({
      game: number,
      finding: scanAgainstRepertoire(game.tree, 'w', index, 4)!,
    }));
    const groups = groupFindings(games);
    expect(groups['new-move'].map((group) => [group.san, group.games.length])).toEqual([
      ['d6', 2],
      ['Nf6', 1],
    ]);
    expect(groups['own-alternative'].map((group) => group.san)).toEqual(['Bc4']);
    expect(groups['past-preparation']).toEqual([]);
  });
});
