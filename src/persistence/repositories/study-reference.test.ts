import { describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { createTree } from '@/chess/tree/tree';
import { asSan, asUci } from '@/chess/types';
import { scanIntegrity } from '@/persistence/integrity';
import { createMemoryRepositories } from '@/persistence/repositories';

describe('study references', () => {
  it('links typed chess evidence without copying it and reports a deleted target', async () => {
    const repositories = createMemoryRepositories();
    const study = await repositories.studies.create({ title: 'Najdorf' });
    const chapter = await repositories.studies.createChapter({
      studyId: study.id,
      title: '6.Be3',
      tree: createTree(START_FEN),
    });
    const repertoire = await repositories.repertoires.create({
      title: 'Black Najdorf',
      color: 'b',
    });
    const position = await repositories.repertoires.upsertPosition({
      repertoireId: repertoire.id,
      fen: START_FEN,
      sideToMove: 'w',
      depth: 0,
      moves: [{ uci: asUci('e2e4'), san: asSan('e4'), role: 'main', updatedAt: 0 }],
    });
    const item = await repositories.training.create({
      mode: 'best-move',
      positionKey: position.positionKey,
      fen: START_FEN,
      sideToMove: 'w',
      prompt: 'Candidate moves after 14...Rc8',
      solutionUci: [asUci('e2e4')],
      solutionSan: [asSan('e4')],
      candidatesUci: [],
      plans: [],
      tags: [],
    });

    await repositories.references.create({
      chapterId: chapter.id,
      kind: 'repertoire-position',
      targetId: position.id,
      label: 'Black Najdorf → 6.Be3',
    });
    const trainingReference = await repositories.references.create({
      chapterId: chapter.id,
      kind: 'training-item',
      targetId: item.id,
      label: item.prompt,
    });
    // Exact duplicates converge on the same typed link.
    expect(
      await repositories.references.create({
        chapterId: chapter.id,
        kind: 'training-item',
        targetId: item.id,
        label: item.prompt,
      }),
    ).toEqual(trainingReference);

    expect(await repositories.references.forChapter(chapter.id)).toHaveLength(2);
    expect((await repositories.references.resolve(trainingReference)).missing).toBe(false);

    await repositories.training.delete(item.id);
    const missing = await repositories.references.resolve(trainingReference);
    expect(missing).toMatchObject({ missing: true, label: item.prompt });
    expect((await scanIntegrity(repositories.raw)).issues).toEqual([
      expect.objectContaining({
        title: 'Study references pointing at deleted records',
        ids: [trainingReference.id],
        repairable: true,
      }),
    ]);
  });

  it('removes owned references when their chapter is deleted', async () => {
    const repositories = createMemoryRepositories();
    const study = await repositories.studies.create({ title: 'Endgames' });
    const chapter = await repositories.studies.createChapter({
      studyId: study.id,
      title: 'Rook ending',
      tree: createTree(START_FEN),
    });
    await repositories.references.create({
      chapterId: chapter.id,
      kind: 'model-game',
      targetId: 'missing-game',
      label: 'Model game',
    });
    await repositories.studies.deleteChapter(chapter.id);
    expect(await repositories.references.forChapter(chapter.id)).toEqual([]);
  });
});
