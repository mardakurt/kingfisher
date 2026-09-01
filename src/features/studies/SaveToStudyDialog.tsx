'use client';

/**
 * Turning an analysis into something the user owns.
 *
 * An untitled analysis and an imported database game are both temporary by
 * design: the first has never been filed, and the second belongs to the
 * imported record, which must not be silently overwritten because someone
 * played a few moves on it. Saving to a study is the one action that changes
 * ownership, so it is explicit, it names the destination, and it hands the
 * workspace over to the new chapter afterwards.
 */

import { useState } from 'react';

import { setHeaders } from '@/chess/tree/tree';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import {
  invalidateStudies,
  useRepositoryMutation,
  useStudies,
} from '@/features/persistence/queries';
import type { StudyId } from '@/persistence/types';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

const NEW_STUDY = '__new__';

export function SaveToStudyDialog() {
  const open = useUi((state) => state.saveToStudyOpen);
  return open ? <SaveToStudyForm /> : null;
}

function SaveToStudyForm() {
  const setOpen = useUi((state) => state.setSaveToStudyOpen);
  const notify = useUi((state) => state.notify);
  const document = useAnalysis((state) => state.document);
  const openDocument = useAnalysis((state) => state.openDocument);

  const studies = useStudies();
  const [studyId, setStudyId] = useState<StudyId | typeof NEW_STUDY | ''>('');
  const [newStudyTitle, setNewStudyTitle] = useState('');
  const [chapterTitle, setChapterTitle] = useState(defaultChapterTitle(document.title));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = studies.data ?? [];
  // Default to the most recently edited study, which is almost always the one
  // being worked on; "New study" stays one keystroke away.
  const effectiveStudyId = studyId || (list[0]?.id ?? NEW_STUDY);
  const creatingStudy = effectiveStudyId === NEW_STUDY;

  const save = useRepositoryMutation(
    async (
      repositories,
      input: { studyId: StudyId | null; studyTitle: string; chapterTitle: string },
    ) => {
      const study = input.studyId ? await repositories.studies.get(input.studyId) : null;
      const target =
        study?.study ?? (await repositories.studies.create({ title: input.studyTitle }));

      const tree = useAnalysis.getState().tree;
      return {
        study: target,
        chapter: await repositories.studies.createChapter({
          studyId: target.id,
          title: input.chapterTitle,
          // The chapter title is the one thing the exported PGN cannot infer.
          tree: setHeaders(tree, {
            ...tree.headers,
            Event: tree.headers.Event ?? input.chapterTitle,
          }),
        }),
      };
    },
    (client) => invalidateStudies(client),
  );

  const submit = async () => {
    const title = chapterTitle.trim() || 'Untitled chapter';
    if (creatingStudy && !newStudyTitle.trim()) {
      setError('Name the new study.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await save.mutateAsync({
        studyId: creatingStudy ? null : (effectiveStudyId as StudyId),
        studyTitle: newStudyTitle.trim(),
        chapterTitle: title,
      });
      openDocument({
        tree: result.chapter.tree,
        document: {
          kind: 'study-chapter',
          title: result.chapter.title,
          studyId: result.study.id,
          studyTitle: result.study.title,
          chapterId: result.chapter.id,
        },
        currentId: useAnalysis.getState().currentId,
      });
      notify({
        tone: 'success',
        message: `Saved to ${result.study.title}.`,
        detail: `This analysis is now the chapter “${result.chapter.title}” and saves automatically.`,
      });
      setOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The chapter could not be saved.');
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => (busy ? undefined : setOpen(false))}
      title="Save to study"
      description={
        document.kind === 'database-game'
          ? 'The imported game stays as it was. This saves a copy of your analysis as a chapter you own.'
          : 'A chapter is saved on this device and keeps saving as you work.'
      }
      width="w-[480px]"
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Saving…' : 'Save chapter'}
          </Button>
        </>
      }
    >
      <label className="block text-2xs text-tertiary">
        Study
        <select
          value={effectiveStudyId}
          onChange={(event) => setStudyId(event.target.value)}
          className="mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none focus:border-accent/60"
        >
          {list.map((study) => (
            <option key={study.id} value={study.id}>
              {study.title}
            </option>
          ))}
          <option value={NEW_STUDY}>New study…</option>
        </select>
      </label>

      {creatingStudy && (
        <label className="mt-3 block text-2xs text-tertiary">
          New study title
          <input
            autoFocus
            value={newStudyTitle}
            onChange={(event) => setNewStudyTitle(event.target.value)}
            placeholder="Najdorf"
            className="mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2.5 text-xs text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60"
          />
        </label>
      )}

      <label className="mt-3 block text-2xs text-tertiary">
        Chapter title
        <input
          value={chapterTitle}
          onChange={(event) => setChapterTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void submit();
            }
          }}
          className="mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2.5 text-xs text-primary outline-none focus:border-accent/60"
        />
      </label>

      {error && <p className="mt-2 text-2xs text-negative">{error}</p>}
    </Dialog>
  );
}

const defaultChapterTitle = (title: string): string =>
  title === 'Untitled analysis' ? 'Chapter 1' : title;
