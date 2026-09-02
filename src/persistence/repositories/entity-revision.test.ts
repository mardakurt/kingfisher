import { describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { asSan, asUci } from '@/chess/types';
import {
  StaleRepertoirePositionWriteError,
  StaleTrainingItemWriteError,
} from '@/persistence/domain';
import { createMemoryRepositories } from '@/persistence/repositories';

describe('repertoire and training authoring revisions', () => {
  it('refuses a stale write to the same canonical repertoire position', async () => {
    const repositories = createMemoryRepositories();
    const repertoire = await repositories.repertoires.create({ title: 'White', color: 'w' });
    const original = await repositories.repertoires.upsertPosition({
      repertoireId: repertoire.id,
      fen: START_FEN,
      sideToMove: 'w',
      depth: 0,
      moves: [{ uci: asUci('e2e4'), san: asSan('e4'), role: 'main', updatedAt: 0 }],
    });
    expect(original.revision).toBe(0);

    const written = await repositories.repertoires.upsertPosition({
      repertoireId: repertoire.id,
      fen: START_FEN,
      sideToMove: 'w',
      depth: 0,
      expectedRevision: original.revision,
      moves: [{ ...original.moves[0]!, note: 'First tab' }],
    });
    expect(written.revision).toBe(1);

    await expect(
      repositories.repertoires.upsertPosition({
        repertoireId: repertoire.id,
        fen: START_FEN,
        sideToMove: 'w',
        depth: 0,
        expectedRevision: original.revision,
        moves: [{ ...original.moves[0]!, note: 'Stale tab' }],
      }),
    ).rejects.toBeInstanceOf(StaleRepertoirePositionWriteError);
    expect(
      (await repositories.repertoires.getPosition(repertoire.id, original.positionKey))?.moves,
    ).toEqual(written.moves);
  });

  it('protects training authoring while review history remains append-only', async () => {
    const repositories = createMemoryRepositories();
    const original = await repositories.training.create(
      {
        mode: 'best-move',
        positionKey: 'start',
        fen: START_FEN,
        sideToMove: 'w',
        prompt: 'Find the move',
        solutionUci: [asUci('e2e4')],
        solutionSan: [asSan('e4')],
        candidatesUci: [],
        plans: [],
        tags: [],
      },
      1_000,
    );
    expect(original.revision).toBe(0);

    const written = await repositories.training.update({ ...original, prompt: 'First tab' });
    await expect(
      repositories.training.update({ ...original, prompt: 'Stale tab' }),
    ).rejects.toBeInstanceOf(StaleTrainingItemWriteError);

    const reviewed = await repositories.training.review(written.id, 'good', true, 2_000);
    expect(reviewed.revision).toBe(written.revision);
    const edited = await repositories.training.update({ ...written, prompt: 'After review' });
    expect(edited.schedule.reviewCount).toBe(1);
    expect(await repositories.training.history(written.id)).toHaveLength(1);
  });
});
