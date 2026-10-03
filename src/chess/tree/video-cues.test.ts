import { describe, expect, it } from 'vitest';
import { parseSingleGame, serializePgn } from '@/chess/pgn';
import { clearVideoLesson, setVideoCue, videoCues, videoNodeAt } from './video-cues';
import { createMemoryRepositories } from '@/persistence/repositories';
import { createWorkspaceBackup, restoreWorkspaceBackup } from '@/persistence/backup';

function lesson() {
  const parsed = parseSingleGame(`[KFVideoFilename "lesson.webm"]
{[%kfvideo 0]} 1. e4 {[%kfvideo 3.25]} e5 (1... c5 {[%kfvideo 9]}) 2. Nf3 {[%kfvideo 12]} *`);
  if (!parsed.ok) throw new Error('Invalid fixture');
  return parsed.value.tree;
}

describe('local video lesson cues', () => {
  it('carries lesson metadata through an actual portable backup and restore', async () => {
    const original = createMemoryRepositories();
    const study = await original.studies.create({ title: 'Local lesson' });
    const chapter = await original.studies.createChapter({
      studyId: study.id,
      title: 'Part one',
      tree: lesson(),
    });
    const backup = await createWorkspaceBackup(original.raw, {});
    const restored = createMemoryRepositories();
    await restoreWorkspaceBackup(restored.raw, backup, 'replace');
    const read = await restored.studies.getChapter(chapter.id);
    expect(read?.tree.headers.KFVideoFilename).toBe('lesson.webm');
    expect(read && videoCues(read.tree).map((cue) => cue.seconds)).toEqual([0, 3.25, 9, 12]);
    expect(JSON.stringify(backup)).not.toContain('blob:');
  });
  it('keeps a root cue, fractional time and a variation through PGN round trips', () => {
    const tree = lesson();
    const exported = serializePgn(tree);
    const read = parseSingleGame(exported);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(videoCues(read.value.tree).map(({ seconds, label }) => ({ seconds, label }))).toEqual([
      { seconds: 0, label: 'Starting position' },
      { seconds: 3.25, label: '1. e4' },
      { seconds: 9, label: '1… c5' },
      { seconds: 12, label: '2. Nf3' },
    ]);
    expect(read.value.tree.headers.KFVideoFilename).toBe('lesson.webm');
    expect(serializePgn(read.value.tree).match(/\[%kfvideo /g)).toHaveLength(4);
  });

  it('follows seeking forwards and backwards, including into a variation', () => {
    const tree = lesson();
    expect(tree.nodes[videoNodeAt(tree, 11)]?.move?.san).toBe('c5');
    expect(tree.nodes[videoNodeAt(tree, 5)]?.move?.san).toBe('e4');
    expect(videoNodeAt(tree, 0)).toBe(tree.rootId);
    expect(tree.nodes[videoNodeAt(tree, 99)]?.move?.san).toBe('Nf3');
  });

  it('replaces a cue at the same time immutably, rejects bad input and removes cues', () => {
    const tree = lesson();
    const e5 = Object.values(tree.nodes).find((node) => node.move?.san === 'e5')!;
    const next = setVideoCue(tree, e5.id, 3.25);
    expect(videoCues(next).filter((cue) => cue.seconds === 3.25)).toEqual([
      { nodeId: e5.id, seconds: 3.25, label: '1… e5' },
    ]);
    expect(videoCues(tree).find((cue) => cue.seconds === 3.25)?.label).toBe('1. e4');
    for (const value of [-1, NaN, Infinity, 86_401])
      expect(setVideoCue(tree, e5.id, value)).toBe(tree);
    expect(videoCues(setVideoCue(next, e5.id, null))).toHaveLength(3);
    const cleared = clearVideoLesson(tree);
    expect(cleared.headers.KFVideoFilename).toBeUndefined();
    expect(videoCues(cleared)).toEqual([]);
    expect(Object.keys(cleared.nodes)).toEqual(Object.keys(tree.nodes));
  });

  it('refuses malformed and out-of-range PGN times', () => {
    for (const value of ['-1', 'NaN', 'Infinity', '86401', '1e3', '']) {
      const parsed = parseSingleGame(`1. e4 {[%kfvideo ${value}]} *`);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(videoCues(parsed.value.tree)).toEqual([]);
    }
  });
});
