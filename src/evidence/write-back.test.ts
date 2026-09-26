import { describe, expect, it } from 'vitest';

import { cp } from '@/chess/evaluation';
import { positionKey } from '@/chess/fen';
import { parsePgn } from '@/chess/pgn';
import { mainlinePath, setEvaluation } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';
import { asFen, asUci } from '@/chess/types';
import type { StoredEngineEvidenceRecord } from '@/persistence/domain';
import { MemoryPersistenceDatabase } from '@/persistence/indexeddb/memory';
import { LocalAnalysisWriteBackRepository } from '@/persistence/repositories/analysis-write-back-repository';
import { LocalStudyRepository } from '@/persistence/repositories/study-repository';
import { STORE_NAMES } from '@/persistence/schema/migrations';

import { applyWriteBack, planWriteBack, undoWriteBack } from './write-back';

function treeOf(pgn: string): GameTree {
  const game = parsePgn(pgn).games[0];
  if (!game) throw new Error('fixture did not parse');
  return game.tree;
}

const evidence = (
  key: string,
  depth: number,
  score: number,
  analysedAt = depth,
): StoredEngineEvidenceRecord => ({
  id: `${key}-${depth}-${analysedAt}`,
  jobId: 'job',
  gameId: 'some-other-game',
  nodeId: 'n',
  positionKey: key,
  fen: asFen(`${key} 0 1`),
  engineId: 'stockfish',
  engineName: 'Stockfish 18',
  score: cp(score),
  depth,
  nodes: 1000 * depth,
  timeMs: 100,
  pv: [asUci('e7e5')],
  analysedAt,
});

/** Stored evidence for every main-line position but the last, and two depths at the first. */
function held(tree: GameTree) {
  const keys = mainlinePath(tree).map((id) => positionKey(tree.nodes[id]!.fen));
  const map = new Map<string, StoredEngineEvidenceRecord[]>();
  keys.slice(0, -1).forEach((key, index) => map.set(key, [evidence(key, 20, 10 * index)]));
  map.get(keys[0]!)!.push(evidence(keys[0]!, 32, 25));
  return { keys, at: (key: string) => map.get(key) ?? [] };
}

const PGN = '[Event "W"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 *';

describe('writing stored evaluations into a chapter', () => {
  it('uses the deepest evaluation held, by canonical position, from any game', () => {
    const tree = treeOf(PGN);
    const { keys, at } = held(tree);
    const plan = planWriteBack(tree, at);
    expect(plan.entries).toHaveLength(keys.length - 1);
    expect(plan.notAnalysed).toBe(1);
    expect(plan.entries[0]!.evaluation).toMatchObject({
      depth: 32,
      score: cp(25),
      engine: 'Stockfish 18',
    });
  });

  it('never writes over an evaluation a node already carries', () => {
    const tree = treeOf(PGN);
    const second = mainlinePath(tree)[1]!;
    const authored = setEvaluation(tree, second, { score: cp(-40), depth: 50, engine: 'Mine' });
    const plan = planWriteBack(authored, held(authored).at);
    expect(plan.keptExisting).toBe(1);
    expect(plan.entries.some((entry) => entry.nodeId === second)).toBe(false);
    const written = applyWriteBack(authored, plan.entries);
    expect(written.nodes[second]!.evaluation).toEqual({
      score: cp(-40),
      depth: 50,
      engine: 'Mine',
    });
  });

  it('undoes exactly what it wrote, and keeps an evaluation changed since', () => {
    const tree = treeOf(PGN);
    const plan = planWriteBack(tree, held(tree).at);
    const written = applyWriteBack(tree, plan.entries);
    const edited = setEvaluation(written, plan.entries[2]!.nodeId, {
      score: cp(99),
      engine: 'Edited',
    });
    const undone = undoWriteBack(edited, plan.entries);
    expect(undone.removed).toBe(plan.entries.length - 1);
    expect(undone.keptChanged).toBe(1);
    expect(undone.tree.nodes[plan.entries[2]!.nodeId]!.evaluation).toEqual({
      score: cp(99),
      engine: 'Edited',
    });
    expect(undone.tree.nodes[plan.entries[0]!.nodeId]!.evaluation).toBeUndefined();
  });
});

describe('the chapter write, one transaction and one undo', () => {
  async function setup() {
    const database = new MemoryPersistenceDatabase();
    const studies = new LocalStudyRepository(database);
    const study = await studies.create({ title: 'Prep' });
    const chapter = await studies.createChapter({
      studyId: study.id,
      title: 'Ruy',
      tree: treeOf(PGN),
    });
    return {
      database,
      studies,
      chapter,
      repository: new LocalAnalysisWriteBackRepository(database),
    };
  }

  it('writes the chapter and its batch together, and one undo takes the batch back out', async () => {
    const { studies, chapter, repository } = await setup();
    const { at } = held(chapter.tree);
    const applied = await repository.apply({
      chapterId: chapter.id,
      expectedRevision: chapter.revision,
      plan: (current) => planWriteBack(current.tree, at),
    });
    if (applied.status !== 'applied') throw new Error(applied.status);
    expect(applied.chapter.revision).toBe(chapter.revision + 1);
    expect((await studies.getChapter(chapter.id))!.tree).toEqual(applied.chapter.tree);
    expect((await repository.latestApplied(chapter.id))?.id).toBe(applied.batch.id);

    const undone = await repository.undo(applied.batch.id, applied.chapter.revision);
    if (undone.status !== 'undone') throw new Error(undone.status);
    expect(undone.batch.undo).toEqual({ removed: applied.batch.entries.length, keptChanged: 0 });
    // The tree is the one before the write, evaluations and all.
    expect((await studies.getChapter(chapter.id))!.tree).toEqual(chapter.tree);
    expect(await repository.latestApplied(chapter.id)).toBeNull();
    expect(await repository.undo(applied.batch.id, undone.chapter.revision)).toEqual({
      status: 'already-undone',
    });
  });

  it('writes nothing over a chapter that changed since it was loaded, and says so', async () => {
    const { studies, chapter, repository } = await setup();
    const moved = await studies.saveChapter({ ...chapter, title: 'Ruy Lopez, edited elsewhere' });
    const outcome = await repository.apply({
      chapterId: chapter.id,
      expectedRevision: chapter.revision,
      plan: (current) => planWriteBack(current.tree, held(current.tree).at),
    });
    expect(outcome.status).toBe('blocked-on-merge');
    expect(outcome.status === 'blocked-on-merge' && outcome.current.revision).toBe(moved.revision);
    expect((await studies.getChapter(chapter.id))!.tree).toEqual(chapter.tree);
    expect(await repository.latestApplied(chapter.id)).toBeNull();
  });

  it('leaves neither the chapter nor a batch when the write fails part way', async () => {
    const { database, studies, chapter, repository } = await setup();
    // The study vanishes: the transaction throws after deciding what to write.
    await database.delete(STORE_NAMES.studies, chapter.studyId);
    await expect(
      repository.apply({
        chapterId: chapter.id,
        expectedRevision: chapter.revision,
        plan: (current) => planWriteBack(current.tree, held(current.tree).at),
      }),
    ).rejects.toThrow(/study no longer exists/);
    expect((await studies.getChapter(chapter.id))!.revision).toBe(chapter.revision);
    expect(await database.getAll(STORE_NAMES.analysisWriteBacks)).toEqual([]);
  });
});
