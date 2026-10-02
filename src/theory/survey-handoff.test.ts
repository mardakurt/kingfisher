import { expect, it } from 'vitest';
import { createTree, setComment } from '@/chess/tree/tree';
import { chapterQuestions } from '@/chess/tree/questions';
import { playUciAt } from '@/chess/game';
import { START_FEN } from '@/chess/fen';
import type { Uci } from '@/chess/types';
import { surveyHandoff } from './survey-handoff';

it('retains chosen answers, ancestors and dated evidence without changing the survey', () => {
  let tree = setComment(createTree(START_FEN), 'r', 'Snapshot 2026-10-02. Source A.');
  const first = playUciAt(tree, 'r', 'e2e4' as Uci);
  if (!first.ok) throw new Error('fixture');
  tree = first.value.tree;
  const answer = playUciAt(tree, first.value.nodeId, 'e7e5' as Uci);
  if (!answer.ok) throw new Error('fixture');
  tree = setComment(answer.value.tree, answer.value.nodeId, '3 of 10 source games.');
  const other = playUciAt(tree, 'r', 'd2d4' as Uci);
  if (!other.ok) throw new Error('fixture');
  tree = other.value.tree;
  const prepared = surveyHandoff(tree, [answer.value.nodeId]);
  expect(Object.keys(prepared.nodes)).toHaveLength(3);
  expect(prepared.nodes.r!.comment).toContain('Snapshot 2026-10-02');
  expect(chapterQuestions(prepared)).toMatchObject([
    { solutionUci: ['e7e5'], explanation: '3 of 10 source games.' },
  ]);
  expect(chapterQuestions(tree)).toEqual([]);
  expect(() => surveyHandoff(tree, ['missing'])).toThrow();
});

it('carries selected questions through a portable backup', async () => {
  const { createMemoryRepositories } = await import('@/persistence/repositories');
  const { createWorkspaceBackup, restoreWorkspaceBackup } = await import('@/persistence/backup');
  const played = playUciAt(createTree(START_FEN), 'r', 'e2e4');
  if (!played.ok) throw new Error('fixture');
  const tree = surveyHandoff(played.value.tree, [played.value.nodeId]);
  const source = createMemoryRepositories();
  const study = await source.studies.create({ title: 'Preparation' });
  const chapter = await source.studies.createChapter({ studyId: study.id, title: 'Answers', tree });
  const backup = await createWorkspaceBackup(source.raw, {});
  const target = createMemoryRepositories();
  await restoreWorkspaceBackup(target.raw, backup, 'replace');
  expect(chapterQuestions((await target.studies.getChapter(chapter.id))!.tree)).toMatchObject([
    { solutionUci: ['e2e4'] },
  ]);
});

it('treats transposed parent positions as one intention', () => {
  let tree = createTree(START_FEN);
  const path = (moves: string[]) => {
    let node = tree.rootId;
    for (const uci of moves) {
      const played = playUciAt(tree, node, uci as Uci);
      if (!played.ok) throw new Error('fixture');
      tree = played.value.tree;
      node = played.value.nodeId;
    }
    return node;
  };
  const first = path(['g1f3', 'g8f6', 'g2g3', 'g7g6', 'c2c4']);
  const second = path(['g2g3', 'g7g6', 'g1f3', 'g8f6', 'd2d4']);
  expect(() => surveyHandoff(tree, [first, second])).toThrow('one intended answer per position');
});
