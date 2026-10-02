import { expect, it } from 'vitest';
import { cp } from '@/chess/evaluation';
import { START_FEN } from '@/chess/fen';
import { Position } from '@/chess/position';
import { parsePgn } from '@/chess/pgn';
import { serializePgn } from '@/chess/pgn/serialize';
import { createMemoryRepositories } from '@/persistence/repositories';
import { createWorkspaceBackup, restoreWorkspaceBackup } from '@/persistence/backup';
import { experimentTree, readExperiment, type PlayoutExperiment } from './playout-experiment';
import { playOut, type Playout } from './playouts';

const experiment: PlayoutExperiment = {
  format: 'kingfisher-playout-experiment',
  version: 1,
  fen: START_FEN,
  engineId: 'test-boundary',
  identity: { name: 'Scripted search' },
  parameters: { threads: 1, hashMb: 32 },
  options: { playouts: 4, msPerMove: 50, multiPv: 3, marginCp: 30, maxPlies: 6, seed: 42 },
  createdAt: '2026-10-02T00:00:00Z',
  updatedAt: '2026-10-02T00:00:00Z',
  completed: [],
};
const search = async (fen: typeof START_FEN) =>
  Position.fromTrustedFen(fen)
    .legalMoves()
    .map((move) => ({ moves: [move.uci], score: cp(0) }));
it('resumes at a game checkpoint with the same random streams', async () => {
  const abort = new AbortController();
  let completed: readonly Playout[] = [];
  const partial = await playOut(
    START_FEN,
    experiment.identity.name,
    experiment.options,
    search,
    abort.signal,
    undefined,
    {
      completed: [],
      save: async (games) => {
        completed = games;
        if (games.length === 2) abort.abort();
      },
    },
  );
  expect(partial.stopped).toBe(true);
  expect(completed).toHaveLength(2);
  const resumed = await playOut(
    START_FEN,
    experiment.identity.name,
    experiment.options,
    search,
    undefined,
    undefined,
    { completed, save: async () => {} },
  );
  const uninterrupted = await playOut(
    START_FEN,
    experiment.identity.name,
    experiment.options,
    search,
  );
  expect(resumed.playouts).toEqual(uninterrupted.playouts);
  const checkpoint = { ...experiment, completed };
  expect(readExperiment(parsePgn(serializePgn(experimentTree(checkpoint))).games[0]!.tree)).toEqual(
    checkpoint,
  );
  const source = createMemoryRepositories();
  const study = await source.studies.create({ title: 'Experiment' });
  const chapter = await source.studies.createChapter({
    studyId: study.id,
    title: 'Checkpoint',
    tree: experimentTree(checkpoint),
  });
  const backup = await createWorkspaceBackup(source.raw, {});
  const target = createMemoryRepositories();
  await restoreWorkspaceBackup(target.raw, backup, 'replace');
  expect(readExperiment((await target.studies.getChapter(chapter.id))!.tree)).toEqual(checkpoint);
  expect(() =>
    readExperiment(
      experimentTree({
        ...checkpoint,
        completed: [{ moves: [], ending: 'checkmate', winner: 'w' }],
      }),
    ),
  ).toThrow('outcome');
});
