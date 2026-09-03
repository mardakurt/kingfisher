import { beforeEach, describe, expect, it } from 'vitest';

import { positionKey, START_FEN } from '@/chess/fen';
import { parsePgn } from '@/chess/pgn';

import { normalizeGame } from './import-game';
import { createMemoryRepositories } from './repositories';
import { searchWorkspace } from './search';
import type { AppRepositories } from './types';

let repositories: AppRepositories;

beforeEach(() => {
  repositories = createMemoryRepositories();
});

const gameFrom = (pgn: string) => {
  const parsed = parsePgn(pgn).games[0];
  if (!parsed) throw new Error('fixture did not parse');
  return normalizeGame(parsed.tree, 1);
};

describe('workspace entity search', () => {
  it('finds studies, chapters, repertoires, training prompts, games and players', async () => {
    const study = await repositories.studies.create({ title: 'Sicilian structures' });
    await repositories.studies.createChapter({
      studyId: study.id,
      title: 'Najdorf poison pawn',
      tree: gameFrom('1. e4 *').tree,
    });
    await repositories.repertoires.create({ title: 'Najdorf as Black', color: 'b' });
    await repositories.training.create({
      mode: 'plan',
      positionKey: positionKey(START_FEN),
      fen: START_FEN,
      sideToMove: 'w',
      prompt: 'Find the Najdorf plan',
      solutionUci: [],
      solutionSan: [],
      candidatesUci: [],
      plans: [{ color: 'w', text: 'Control d5.' }],
      tags: ['najdorf'],
    });
    const game = gameFrom(
      '[White "Carlsen, Magnus"]\n[Black "Nakamura, Hikaru"]\n[Opening "Sicilian Najdorf"]\n\n1. e4 c5 *',
    );
    await repositories.games.persist(game, []);

    const najdorf = await searchWorkspace(repositories, 'najdorf');
    expect(new Set(najdorf.map((hit) => hit.kind))).toEqual(
      new Set(['chapter', 'repertoire', 'training', 'game', 'tag']),
    );

    const player = await searchWorkspace(repositories, 'magnus');
    expect(player.some((hit) => hit.kind === 'player' && hit.title === 'Carlsen, Magnus')).toBe(
      true,
    );
  });

  it('finds a model game by its tags without duplicating the game content', async () => {
    const game = gameFrom('[White "A"]\n[Black "B"]\n\n1. d4 d5 *');
    await repositories.games.persist(game, []);
    await repositories.modelGames.create({
      gameId: game.id,
      kinds: ['strategic'],
      tags: ['minority attack'],
      note: 'Classic queenside plan.',
    });

    const hits = await searchWorkspace(repositories, 'minority');
    expect(hits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'model-game', targetId: game.id }),
        expect.objectContaining({ kind: 'tag', title: 'minority attack' }),
      ]),
    );
  });

  it('does no broad store work for one-character input', async () => {
    expect(await searchWorkspace(repositories, 'a')).toEqual([]);
  });

  it('finds decision notes, critical themes and training sets', async () => {
    const decision = await repositories.review.createDecision({
      positionKey: positionKey(START_FEN),
      fen: START_FEN,
      sideToMove: 'w',
      candidates: [],
      plan: 'Avoid the queen trade and improve the knight.',
    });
    await repositories.review.annotateDecision(decision.id, decision.revision, {
      themes: ['trade-decision'],
    });
    const critical = await repositories.review.upsertReviewItem({
      positionKey: positionKey(START_FEN),
      fen: START_FEN,
      sideToMove: 'w',
      source: 'manual',
      reason: 'Queen trade decision needs review.',
    });
    await repositories.review.updateReviewItem(critical.id, critical.revision, {
      themes: ['trade-decision'],
    });
    await repositories.trainingSets.create({
      name: 'Queen trade positions',
      kind: 'dynamic',
      query: { themes: ['trade-decision'] },
    });

    const hits = await searchWorkspace(repositories, 'queen trade');
    expect(new Set(hits.map((hit) => hit.kind))).toEqual(
      new Set(['decision', 'critical-position', 'training-set']),
    );
    expect(
      (await searchWorkspace(repositories, 'trade-decision')).some((hit) => hit.kind === 'theme'),
    ).toBe(true);
  });
});
