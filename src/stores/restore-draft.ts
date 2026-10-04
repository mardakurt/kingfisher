import { sameGameTree } from '@/chess/tree/equal';
import type { AppRepositories, DraftRecord } from '@/persistence/types';
import { useAnalysis, UNTITLED_DOCUMENT } from './analysis-store';
import { beginDocumentRequest } from './document-request';
import { useUi } from './ui-store';

/**
 * Reopen what was on screen.
 *
 * For a chapter the stored chapter normally wins over the draft copy of its
 * tree: the chapter is the record the user believes in. The exception is a
 * draft still marked `unsaved`, which means the last chapter write never
 * landed — a crash, a refused revision, a full disk. That draft holds work the
 * chapter does not, so it is offered rather than silently discarded, and
 * silently *applied* would be just as wrong: the user has to be told which
 * version they are looking at.
 */
export async function restoreWorkspaceDraft(
  repositories: AppRepositories,
  draft: DraftRecord,
  options: { readonly continuation?: boolean; readonly isCurrent?: () => boolean } = {},
): Promise<boolean> {
  const isCurrent = options.isCurrent ?? beginDocumentRequest();
  if (!isCurrent()) return false;
  const analysis = useAnalysis.getState();

  if (draft.document.kind === 'study-chapter') {
    const chapter = await repositories.studies.getChapter(draft.document.chapterId);
    // Recheck after the last I/O: edits and newer requests made during a
    // chapter read outrank recovery of the previous session.
    if (!isCurrent()) return false;
    if (chapter) {
      /*
        A draft this session wrote as the page went away, on a chapter nobody
        has written since (the revision it was edited from is still the
        chapter's): it is the same document a moment later, not a rival
        version, so it is put back as the work in progress — dirty, so
        autosave writes it to the chapter — rather than offered as a recovery.
      */
      if (
        options.continuation &&
        draft.unsaved &&
        draft.document.revision === chapter.revision &&
        !sameGameTree(draft.tree, chapter.tree)
      ) {
        analysis.openDocument({
          tree: draft.tree,
          document: { ...draft.document, title: chapter.title, revision: chapter.revision },
          currentId: draft.tree.nodes[draft.currentId] ? draft.currentId : draft.tree.rootId,
          orientation: draft.orientation,
          clean: false,
        });
        return true;
      }
      if (draft.unsaved && !sameGameTree(draft.tree, chapter.tree)) {
        analysis.openDocument({
          tree: chapter.tree,
          document: { ...draft.document, title: chapter.title, revision: chapter.revision },
          currentId: chapter.tree.nodes[draft.currentId] ? draft.currentId : chapter.tree.rootId,
          orientation: draft.orientation,
        });
        analysis.offerRecovery({
          draft,
          chapterTitle: chapter.title,
          savedAt: chapter.updatedAt,
        });
        return true;
      }
      analysis.openDocument({
        tree: chapter.tree,
        document: { ...draft.document, title: chapter.title, revision: chapter.revision },
        currentId: draft.currentId,
        orientation: draft.orientation,
      });
      return true;
    }
    // The chapter was deleted elsewhere; keep the work rather than lose it.
    analysis.openDocument({
      tree: draft.tree,
      document: UNTITLED_DOCUMENT,
      currentId: draft.currentId,
      orientation: draft.orientation,
      clean: false,
    });
    useUi.getState().notify({
      tone: 'info',
      message: 'The chapter you were editing no longer exists.',
      detail: 'Your analysis was reopened as an untitled analysis.',
    });
    return true;
  }

  analysis.openDocument({
    tree: draft.tree,
    document: draft.document,
    currentId: draft.currentId,
    orientation: draft.orientation,
  });
  return true;
}
