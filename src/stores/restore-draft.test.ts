import { beforeEach, expect, it, vi } from 'vitest';
import { START_FEN } from '@/chess/fen';
import { createTree } from '@/chess/tree/tree';
import type { AppRepositories, ChapterRecord, DraftRecord } from '@/persistence/types';
import { useAnalysis } from './analysis-store';
import {
  beginDocumentRequest,
  cancelDocumentRequests,
  observeDocumentRequest,
} from './document-request';
import { restoreWorkspaceDraft } from './restore-draft';

const chapter: ChapterRecord = {
  id: 'chapter',
  studyId: 'study',
  title: 'Saved chapter',
  order: 0,
  tree: createTree(START_FEN, { Event: 'Saved chapter' }),
  createdAt: 1,
  updatedAt: 2,
  revision: 3,
};
const draft: DraftRecord = {
  id: 'active',
  document: {
    kind: 'study-chapter',
    title: chapter.title,
    studyId: chapter.studyId,
    studyTitle: 'Study',
    chapterId: chapter.id,
    revision: chapter.revision,
  },
  tree: chapter.tree,
  currentId: chapter.tree.rootId,
  orientation: 'b',
  updatedAt: 2,
  unsaved: false,
};
const getChapter = vi.fn<(id: string) => Promise<ChapterRecord | null>>();
const repositories = { studies: { getChapter } } as unknown as AppRepositories;

beforeEach(() => {
  getChapter.mockReset();
  getChapter.mockResolvedValue(chapter);
  useAnalysis.getState().newGame();
  useAnalysis.setState({ revision: 0, savedRevision: 0, recovery: null });
});

it.each(['edit', 'replace', 'leave', 'new request'] as const)(
  'a slow chapter restore cannot overwrite the workspace after %s',
  async (action) => {
    let release!: (value: ChapterRecord) => void;
    getChapter.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = restoreWorkspaceDraft(repositories, draft);
    await vi.waitFor(() => expect(getChapter).toHaveBeenCalledOnce());
    if (action === 'edit') expect(useAnalysis.getState().playSan('d4').ok).toBe(true);
    else if (action === 'replace') useAnalysis.getState().newGame();
    else if (action === 'leave') cancelDocumentRequests();
    else beginDocumentRequest();
    const current = useAnalysis.getState();
    release(chapter);
    expect(await pending).toBe(false);
    expect(useAnalysis.getState().tree).toBe(current.tree);
    expect(useAnalysis.getState().document).toBe(current.document);
    expect(useAnalysis.getState().orientation).toBe(current.orientation);
  },
);

it('restores a current chapter with its cursor and orientation', async () => {
  expect(await restoreWorkspaceDraft(repositories, draft)).toBe(true);
  expect(useAnalysis.getState().tree).toBe(chapter.tree);
  expect(useAnalysis.getState().document.kind).toBe('study-chapter');
  expect(useAnalysis.getState().currentId).toBe(draft.currentId);
  expect(useAnalysis.getState().orientation).toBe('b');
});

it('boot recovery survives navigation without taking ownership away from a later user request', async () => {
  const boot = observeDocumentRequest('workspace');
  cancelDocumentRequests();
  expect(boot()).toBe(true);
  const chosenGame = beginDocumentRequest();
  expect(await restoreWorkspaceDraft(repositories, draft, { isCurrent: boot })).toBe(false);
  expect(chosenGame()).toBe(true);
  expect(getChapter).not.toHaveBeenCalled();
});

it('boot recovery may finish after a route switch when no document was requested', async () => {
  let release!: (value: ChapterRecord) => void;
  getChapter.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = restoreWorkspaceDraft(repositories, draft, {
    isCurrent: observeDocumentRequest('workspace'),
  });
  await vi.waitFor(() => expect(getChapter).toHaveBeenCalledOnce());
  cancelDocumentRequests();
  release(chapter);
  expect(await pending).toBe(true);
  expect(useAnalysis.getState().tree).toBe(chapter.tree);
});
