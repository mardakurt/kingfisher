import { beforeEach, describe, expect, it } from 'vitest';

import { toggleShape as toggleShapeOn } from '@/chess/tree/tree';
import { cp, mate } from '@/chess/evaluation';
import { START_FEN } from '@/chess/fen';
import { playSanAt } from '@/chess/game';
import { parsePgn, serializePgn } from '@/chess/pgn';
import { expect as unwrap } from '@/chess/result';
import {
  createTree,
  mainlinePath,
  mustGetNode,
  nodeCount,
  setComment,
  setEvaluation,
  setNags,
} from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import type { Square } from '@/chess/types';

import { normalizeGame } from '../import-game';
import type { AppRepositories, ChapterRecord } from '../types';
import { createMemoryRepositories } from './index';

let repositories: AppRepositories;

beforeEach(() => {
  repositories = createMemoryRepositories();
});

function line(moves: string[], tree = createTree(START_FEN)): { tree: GameTree; ids: NodeId[] } {
  let current = tree;
  let cursor = current.rootId;
  const ids: NodeId[] = [];
  for (const san of moves) {
    const played = unwrap(playSanAt(current, cursor, san));
    current = played.tree;
    cursor = played.nodeId;
    ids.push(cursor);
  }
  return { tree: current, ids };
}

describe('study repository', () => {
  it('creates, lists and reads a study back', async () => {
    const created = await repositories.studies.create({
      title: 'Najdorf',
      description: 'Everything after 5...a6.',
    });

    expect(created.id).toMatch(/^study-/);
    expect(await repositories.studies.list()).toHaveLength(1);

    const loaded = await repositories.studies.get(created.id);
    expect(loaded?.study.title).toBe('Najdorf');
    expect(loaded?.study.description).toBe('Everything after 5...a6.');
    expect(loaded?.chapters).toEqual([]);
  });

  it('names an untitled study rather than storing an empty one', async () => {
    const created = await repositories.studies.create({ title: '   ' });
    expect(created.title).toBe('Untitled Study');
  });

  it('keeps chapters in their own order, not insertion order', async () => {
    const study = await repositories.studies.create({ title: 'Rook endgames' });
    const lucena = await repositories.studies.createChapter({
      studyId: study.id,
      title: 'Lucena',
      tree: line(['e4']).tree,
    });
    const philidor = await repositories.studies.createChapter({
      studyId: study.id,
      title: 'Philidor',
      tree: line(['d4']).tree,
    });

    expect(lucena.order).toBe(0);
    expect(philidor.order).toBe(1);

    await repositories.studies.reorderChapters(study.id, [philidor.id, lucena.id]);
    const reordered = await repositories.studies.get(study.id);
    expect(reordered?.chapters.map((chapter) => chapter.title)).toEqual(['Philidor', 'Lucena']);
  });

  it('refuses a reorder that does not account for every chapter', async () => {
    const study = await repositories.studies.create({ title: 'Study' });
    const first = await repositories.studies.createChapter({
      studyId: study.id,
      title: 'One',
      tree: createTree(START_FEN),
    });
    await repositories.studies.createChapter({
      studyId: study.id,
      title: 'Two',
      tree: createTree(START_FEN),
    });

    await expect(repositories.studies.reorderChapters(study.id, [first.id])).rejects.toThrow(
      /does not match/i,
    );
  });

  it('closes the gap in chapter order when one is deleted', async () => {
    const study = await repositories.studies.create({ title: 'Study' });
    const titles = ['One', 'Two', 'Three'];
    const created: ChapterRecord[] = [];
    for (const title of titles) {
      created.push(
        await repositories.studies.createChapter({
          studyId: study.id,
          title,
          tree: createTree(START_FEN),
        }),
      );
    }

    await repositories.studies.deleteChapter((created[1] as ChapterRecord).id);

    const remaining = await repositories.studies.get(study.id);
    expect(remaining?.chapters.map((chapter) => [chapter.title, chapter.order])).toEqual([
      ['One', 0],
      ['Three', 2 - 1],
    ]);
  });

  it('deletes a study together with its chapters', async () => {
    const study = await repositories.studies.create({ title: 'Doomed' });
    const chapter = await repositories.studies.createChapter({
      studyId: study.id,
      title: 'Chapter',
      tree: line(['e4', 'e5']).tree,
    });

    await repositories.studies.delete(study.id);

    expect(await repositories.studies.get(study.id)).toBeNull();
    expect(await repositories.studies.getChapter(chapter.id)).toBeNull();
  });

  it('duplicates a chapter without sharing its identity', async () => {
    const study = await repositories.studies.create({ title: 'Study' });
    const original = await repositories.studies.createChapter({
      studyId: study.id,
      title: 'Main',
      tree: line(['e4', 'e5', 'Nf3']).tree,
    });

    const copy = await repositories.studies.duplicateChapter(original.id);

    expect(copy.id).not.toBe(original.id);
    expect(copy.title).toBe('Main copy');
    expect(nodeCount(copy.tree)).toBe(nodeCount(original.tree));
    expect((await repositories.studies.get(study.id))?.chapters).toHaveLength(2);
  });

  it('refuses to save a chapter that has been deleted, rather than resurrecting it', async () => {
    const study = await repositories.studies.create({ title: 'Study' });
    const chapter = await repositories.studies.createChapter({
      studyId: study.id,
      title: 'Chapter',
      tree: createTree(START_FEN),
    });
    await repositories.studies.deleteChapter(chapter.id);

    await expect(
      repositories.studies.saveChapter({ ...chapter, tree: line(['e4']).tree }),
    ).rejects.toThrow(/no longer exists/i);
  });

  it('touches the study when one of its chapters is saved', async () => {
    const study = await repositories.studies.create({ title: 'Study' });
    const chapter = await repositories.studies.createChapter({
      studyId: study.id,
      title: 'Chapter',
      tree: createTree(START_FEN),
    });
    const before = (await repositories.studies.get(study.id))?.study.updatedAt ?? 0;

    await new Promise((resolve) => setTimeout(resolve, 2));
    await repositories.studies.saveChapter({ ...chapter, tree: line(['e4']).tree });

    const after = (await repositories.studies.get(study.id))?.study.updatedAt ?? 0;
    expect(after).toBeGreaterThan(before);
  });
});

/**
 * The test the brief calls critical: a chapter with everything a serious
 * annotator attaches, written to storage and read back, must be the same
 * analysis — not merely the same moves.
 */
describe('chapter round trip', () => {
  const complexChapter = (): GameTree => {
    let tree = createTree(START_FEN, { Event: 'Round trip', Result: '*' });

    // Main line.
    const main = line(['e4', 'c5', 'Nf3', 'd6'], tree);
    tree = main.tree;
    const [e4, c5, nf3] = main.ids;

    // A nested variation off 2.Nf3, with its own sub-variation.
    const alternative = unwrap(playSanAt(tree, c5 as NodeId, 'Nc3'));
    tree = alternative.tree;
    const nested = unwrap(playSanAt(tree, alternative.nodeId, 'Nc6'));
    tree = nested.tree;
    const deeper = unwrap(playSanAt(tree, alternative.nodeId, 'd6'));
    tree = deeper.tree;

    tree = setComment(tree, e4 as NodeId, 'The main move.\nSecond line of prose.');
    tree = setNags(tree, e4 as NodeId, [1, 14]);
    tree = setComment(tree, alternative.nodeId, 'The Closed Sicilian.');
    tree = setNags(tree, alternative.nodeId, [5]);

    tree = toggleShapeOn(tree, nf3 as NodeId, {
      kind: 'arrow',
      from: 'g1' as Square,
      to: 'f3' as Square,
      brush: 'green',
    });
    tree = toggleShapeOn(tree, nf3 as NodeId, {
      kind: 'square',
      square: 'd5' as Square,
      brush: 'red',
    });

    tree = setEvaluation(tree, nf3 as NodeId, {
      score: cp(31),
      depth: 28,
      engine: 'Stockfish 16',
      recordedAt: 1_700_000_000_000,
    });
    tree = setEvaluation(tree, deeper.nodeId, {
      score: mate(4),
      depth: 30,
      engine: 'Stockfish 16',
    });

    return tree;
  };

  it('returns semantically identical analysis after a save and a reload', async () => {
    const study = await repositories.studies.create({ title: 'Round trip' });
    const original = complexChapter();

    const saved = await repositories.studies.createChapter({
      studyId: study.id,
      title: 'Everything',
      tree: original,
    });

    const reloaded = await repositories.studies.getChapter(saved.id);
    expect(reloaded).not.toBeNull();
    const tree = (reloaded as ChapterRecord).tree;

    expect(tree.rootId).toBe(original.rootId);
    expect(tree.startFen).toBe(original.startFen);
    expect(tree.nextId).toBe(original.nextId);
    expect(Object.keys(tree.nodes).sort()).toEqual(Object.keys(original.nodes).sort());

    for (const [id, node] of Object.entries(original.nodes)) {
      const restored = mustGetNode(tree, id);
      expect(restored.parentId).toBe(node.parentId);
      expect(restored.children).toEqual(node.children);
      expect(restored.fen).toBe(node.fen);
      expect(restored.ply).toBe(node.ply);
      expect(restored.comment).toBe(node.comment);
      expect(restored.nags).toEqual(node.nags);
      expect(restored.shapes).toEqual(node.shapes);
      expect(restored.evaluation).toEqual(node.evaluation);
      expect(restored.move?.san).toBe(node.move?.san);
      expect(restored.move?.uci).toBe(node.move?.uci);
    }
  });

  it('survives the further trip out through PGN and back in', async () => {
    const study = await repositories.studies.create({ title: 'Round trip' });
    const saved = await repositories.studies.createChapter({
      studyId: study.id,
      title: 'Everything',
      tree: complexChapter(),
    });
    const stored = (await repositories.studies.getChapter(saved.id)) as ChapterRecord;

    const exported = serializePgn(stored.tree);
    const reimported = parsePgn(exported).games[0];
    expect(reimported).toBeDefined();
    const tree = (reimported as NonNullable<typeof reimported>).tree;

    const sanOf = (source: GameTree) =>
      mainlinePath(source)
        .slice(1)
        .map((id) => mustGetNode(source, id).move?.san);
    expect(sanOf(tree)).toEqual(sanOf(stored.tree));

    const firstMove = mustGetNode(tree, mainlinePath(tree)[1] as NodeId);
    expect(firstMove.comment).toContain('The main move.');
    expect(firstMove.nags).toEqual([1, 14]);

    const third = mustGetNode(tree, mainlinePath(tree)[3] as NodeId);
    expect(third.shapes).toEqual(
      expect.arrayContaining([
        { kind: 'arrow', from: 'g1', to: 'f3', brush: 'green' },
        { kind: 'square', square: 'd5', brush: 'red' },
      ]),
    );
    expect(third.evaluation?.score).toEqual(cp(31));

    // The side line and its own branches must come back too.
    const root = mustGetNode(tree, tree.rootId);
    const e4 = mustGetNode(tree, root.children[0] as NodeId);
    const c5 = mustGetNode(tree, e4.children[0] as NodeId);
    expect(c5.children).toHaveLength(2);
    const sideLine = mustGetNode(tree, c5.children[1] as NodeId);
    expect(sideLine.move?.san).toBe('Nc3');
    expect(sideLine.comment).toBe('The Closed Sicilian.');
    expect(sideLine.children).toHaveLength(2);
  });
});

describe('draft repository', () => {
  it('stores and restores the active workspace', async () => {
    const tree = line(['d4', 'd5']).tree;
    await repositories.drafts.save({
      id: 'active',
      document: { kind: 'untitled', title: 'Untitled analysis' },
      tree,
      currentId: mainlinePath(tree)[2] as NodeId,
      orientation: 'b',
      updatedAt: Date.now(),
    });

    const draft = await repositories.drafts.get();
    expect(draft?.orientation).toBe('b');
    expect(draft?.document.kind).toBe('untitled');
    expect(nodeCount(draft?.tree as GameTree)).toBe(2);
  });

  it('reports a corrupted draft rather than handing back nonsense', async () => {
    const database = createMemoryRepositories();
    await expect(
      database.drafts.save({
        id: 'active',
        document: { kind: 'untitled', title: 'x' },
        tree: { rootId: 'r', nodes: {}, startFen: 'not a fen', headers: {}, nextId: 1 } as never,
        currentId: 'r',
        orientation: 'w',
        updatedAt: 1,
      }),
    ).rejects.toThrow(/corrupted|unsupported/i);
  });

  it('starts empty and clears cleanly', async () => {
    expect(await repositories.drafts.get()).toBeNull();
    await repositories.drafts.clear();
    expect(await repositories.drafts.get()).toBeNull();
  });
});

describe('game repository', () => {
  const gameFrom = (pgn: string) => {
    const parsed = parsePgn(pgn).games[0];
    if (!parsed) throw new Error('fixture did not parse');
    return normalizeGame(parsed.tree);
  };

  it('reads the metadata a chess player searches by out of the headers', () => {
    const game = gameFrom(
      '[Event "Linares"]\n[Site "Linares ESP"]\n[Date "1999.02.20"]\n[Round "4"]\n' +
        '[White "Kasparov, Garry"]\n[Black "Topalov, Veselin"]\n[Result "1-0"]\n' +
        '[WhiteElo "2812"]\n[BlackElo "2700"]\n[ECO "B07"]\n[Opening "Pirc"]\n\n1. e4 d6 1-0',
    );

    expect(game.white).toBe('Kasparov, Garry');
    expect(game.black).toBe('Topalov, Veselin');
    expect(game.result).toBe('1-0');
    expect(game.year).toBe(1999);
    expect(game.event).toBe('Linares');
    expect(game.round).toBe('4');
    expect(game.whiteRating).toBe(2812);
    expect(game.blackRating).toBe(2700);
    expect(game.eco).toBe('B07');
    expect(game.opening).toBe('Pirc');
  });

  it('preserves PGN tags it has no column for', () => {
    const game = gameFrom('[White "A"]\n[Black "B"]\n[Annotator "Nunn"]\n\n1. e4 *');
    expect(game.tree.headers.Annotator).toBe('Nunn');
  });

  it('skips a game that is already stored instead of duplicating it', async () => {
    const pgn = '[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 1-0';

    const first = await repositories.games.persist(gameFrom(pgn), []);
    const second = await repositories.games.persist(gameFrom(pgn), []);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.game.id).toBe(first.game.id);
    expect(await repositories.games.count()).toBe(1);
  });

  it('treats a genuinely different game as different, even between the same players', async () => {
    const a = gameFrom('[White "A"]\n[Black "B"]\n\n1. e4 e5 *');
    const b = gameFrom('[White "A"]\n[Black "B"]\n\n1. d4 d5 *');

    await repositories.games.persist(a, []);
    await repositories.games.persist(b, []);

    expect(await repositories.games.count()).toBe(2);
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('filters by player, colour, result, rating and year', async () => {
    await repositories.games.persist(
      gameFrom(
        '[White "Carlsen"]\n[Black "Nepo"]\n[Result "1-0"]\n[Date "2021.12.03"]\n[WhiteElo "2855"]\n\n1. d4 *',
      ),
      [],
    );
    await repositories.games.persist(
      gameFrom(
        '[White "Nepo"]\n[Black "Carlsen"]\n[Result "0-1"]\n[Date "2018.11.20"]\n[WhiteElo "2200"]\n\n1. e4 *',
      ),
      [],
    );

    expect((await repositories.games.search({ player: 'carlsen' })).total).toBe(2);
    expect((await repositories.games.search({ player: 'carlsen', playerColor: 'w' })).total).toBe(
      1,
    );
    expect((await repositories.games.search({ result: '1-0' })).total).toBe(1);
    expect((await repositories.games.search({ minRating: 2800 })).total).toBe(1);
    expect((await repositories.games.search({ fromYear: 2020 })).total).toBe(1);
    expect((await repositories.games.search({ text: 'nepo' })).total).toBe(2);
  });

  it('sorts by the column asked for, in the direction asked for', async () => {
    await repositories.games.persist(gameFrom('[White "Zukertort"]\n[Black "X"]\n\n1. e4 *'), []);
    await repositories.games.persist(gameFrom('[White "Anderssen"]\n[Black "Y"]\n\n1. d4 *'), []);

    const ascending = await repositories.games.search({ sortBy: 'white', sortDirection: 'asc' });
    expect(ascending.games.map((game) => game.white)).toEqual(['Anderssen', 'Zukertort']);

    const descending = await repositories.games.search({ sortBy: 'white', sortDirection: 'desc' });
    expect(descending.games.map((game) => game.white)).toEqual(['Zukertort', 'Anderssen']);
  });

  it('deletes a game and everything indexed for it', async () => {
    const game = gameFrom('[White "A"]\n[Black "B"]\n\n1. e4 e5 *');
    await repositories.games.persist(game, [
      {
        id: 'p1',
        positionKey: 'k1',
        gameId: game.id,
        ply: 1,
        moveUci: 'e2e4' as never,
        moveSan: 'e4' as never,
        mover: 'w',
      },
    ]);

    await repositories.games.delete(game.id);

    expect(await repositories.games.count()).toBe(0);
    expect(await repositories.games.get(game.id)).toBeNull();
  });
});
