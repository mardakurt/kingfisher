'use client';

/**
 * The study library.
 *
 * Laid out as a research notebook shelf rather than a dashboard of cards:
 * studies on the left, that study's chapters in the middle, and the selected
 * chapter previewed on the right. Three narrow columns fit far more of a real
 * repertoire on screen than a grid of tiles, and the reading order matches how
 * a player thinks about the material — collection, then chapter, then position.
 *
 * On narrow screens the same three panes become one, with an explicit step
 * back, because a three-column layout at 320px is unusable however it is
 * squeezed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { START_FEN } from '@/chess/fen';
import { createTree, nodeCount } from '@/chess/tree/tree';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Export,
  Notebook,
  Pencil,
  Plus,
  Trash,
} from '@/components/icons';
import { Button, IconButton } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/Panel';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { CanonicalBoardSurface } from '@/features/workspace/CanonicalBoardSurface';
import { MoveTreePanel } from '@/features/movetree/MoveTreePanel';
import { WorkspaceLowerPanel } from '@/features/workspace/WorkspaceLowerPanel';
import { WorkspaceToolDock } from '@/features/workspace/WorkspaceToolDock';
import {
  invalidateStudies,
  useRepositoryMutation,
  useStudies,
  useStudy,
} from '@/features/persistence/queries';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/cn';
import type { ChapterRecord, StudyId, StudyRecord } from '@/persistence/types';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

import { exportStudyPgn } from './export';
import { NavButton } from '@/features/shell/NavButton';
import { ChapterReferences } from './ChapterReferences';

type Prompt =
  | { readonly kind: 'create-study' }
  | { readonly kind: 'rename-study'; readonly study: StudyRecord }
  | { readonly kind: 'create-chapter'; readonly studyId: StudyId }
  | { readonly kind: 'rename-chapter'; readonly chapter: ChapterRecord };

type Confirmation =
  | { readonly kind: 'delete-study'; readonly study: StudyRecord }
  | { readonly kind: 'delete-chapter'; readonly chapter: ChapterRecord };

export function StudiesWorkspace() {
  const notify = useUi((state) => state.notify);
  const openDocument = useAnalysis((state) => state.openDocument);
  const wide = useMediaQuery('(min-width: 1100px)');

  /*
    Selection is derived, not synchronised. Storing "the user picked this" and
    resolving it against the current data each render means a study deleted in
    another tab, or a chapter that vanishes under a reorder, simply falls back
    to the first available one — with no effect chasing the query cache and no
    render where the screen points at something that no longer exists.
  */
  const [chosenStudyId, setChosenStudyId] = useState<StudyId | null>(null);
  const [chosenChapterId, setChosenChapterId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const studies = useStudies();
  const list = useMemo(() => studies.data ?? [], [studies.data]);

  const studyId =
    chosenStudyId && list.some((entry) => entry.id === chosenStudyId)
      ? chosenStudyId
      : (list[0]?.id ?? null);

  const study = useStudy(studyId);
  const chapters = useMemo(() => study.data?.chapters ?? [], [study.data]);

  const chapterId =
    chosenChapterId && chapters.some((entry) => entry.id === chosenChapterId)
      ? chosenChapterId
      : (chapters[0]?.id ?? null);

  const chapter = chapters.find((candidate) => candidate.id === chapterId) ?? null;

  const createStudy = useRepositoryMutation(
    (repositories, input: { title: string; description: string }) =>
      repositories.studies.create({
        title: input.title,
        ...(input.description ? { description: input.description } : {}),
      }),
    (queryClient) => invalidateStudies(queryClient),
  );

  const renameStudy = useRepositoryMutation(
    (repositories, input: { id: StudyId; title: string; description: string }) =>
      repositories.studies.update(input.id, {
        title: input.title,
        description: input.description,
      }),
    (queryClient, input) => invalidateStudies(queryClient, input.id),
  );

  const deleteStudy = useRepositoryMutation(
    (repositories, input: { id: StudyId }) => repositories.studies.delete(input.id),
    (queryClient) => invalidateStudies(queryClient),
  );

  const createChapter = useRepositoryMutation(
    (repositories, input: { studyId: StudyId; title: string }) =>
      repositories.studies.createChapter({
        studyId: input.studyId,
        title: input.title,
        tree: createTree(START_FEN, { Event: input.title, Result: '*' }),
      }),
    (queryClient, input) => invalidateStudies(queryClient, input.studyId),
  );

  const renameChapter = useRepositoryMutation(
    (repositories, input: { id: string; studyId: StudyId; title: string }) =>
      repositories.studies.renameChapter(input.id, input.title),
    (queryClient, input) => invalidateStudies(queryClient, input.studyId),
  );

  const deleteChapter = useRepositoryMutation(
    (repositories, input: { id: string; studyId: StudyId }) =>
      repositories.studies.deleteChapter(input.id),
    (queryClient, input) => invalidateStudies(queryClient, input.studyId),
  );

  const duplicateChapter = useRepositoryMutation(
    (repositories, input: { id: string; studyId: StudyId }) =>
      repositories.studies.duplicateChapter(input.id),
    (queryClient, input) => invalidateStudies(queryClient, input.studyId),
  );

  const reorderChapters = useRepositoryMutation(
    (repositories, input: { studyId: StudyId; orderedIds: readonly string[] }) =>
      repositories.studies.reorderChapters(input.studyId, input.orderedIds),
    (queryClient, input) => invalidateStudies(queryClient, input.studyId),
  );

  const move = (target: ChapterRecord, delta: number) => {
    const ids = chapters.map((entry) => entry.id);
    const index = ids.indexOf(target.id);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= ids.length) return;
    const reordered = [...ids];
    reordered[index] = reordered[next] as string;
    reordered[next] = target.id;
    reorderChapters.mutate(
      { studyId: target.studyId, orderedIds: reordered },
      { onError: (error) => notify({ tone: 'error', message: error.message }) },
    );
  };

  const open = useCallback(
    (target: ChapterRecord) => {
      const parent = study.data?.study;
      openDocument({
        tree: target.tree,
        document: {
          kind: 'study-chapter',
          title: target.title,
          studyId: target.studyId,
          studyTitle: parent?.title ?? 'Study',
          chapterId: target.id,
          revision: target.revision,
        },
      });
    },
    [openDocument, study.data?.study],
  );

  const loadedChapter = useRef<string | null>(null);
  useEffect(() => {
    if (!chapter || loadedChapter.current === chapter.id) return;
    loadedChapter.current = chapter.id;
    open(chapter);
  }, [chapter, open]);

  const exportStudy = async () => {
    if (!study.data) return;
    try {
      await navigator.clipboard.writeText(exportStudyPgn(study.data));
      notify({
        tone: 'success',
        message: `${study.data.chapters.length} chapter(s) copied as PGN.`,
      });
    } catch {
      notify({ tone: 'error', message: 'The clipboard is not available in this context.' });
    }
  };

  const failed = studies.isError ? studies.error : study.isError ? study.error : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-line-subtle bg-surface-1 px-3 md:px-5">
        <NavButton />
        <Notebook className="h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-primary">
            {study.data?.study.title ?? 'Studies'}
          </h1>
          <p className="hidden truncate text-xs text-tertiary sm:block">
            {chapter ? chapter.title : 'Notebooks of chapters, saved on this device.'}
          </p>
        </div>
        <Button
          variant="accent"
          icon={<Plus />}
          className="ml-auto"
          onClick={() => setPrompt({ kind: 'create-study' })}
        >
          New study
        </Button>
      </header>

      {failed ? (
        <EmptyState
          title="Local storage is unavailable"
          description={
            failed instanceof Error
              ? failed.message
              : 'This browser refused access to its database, so studies cannot be read.'
          }
        />
      ) : (
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col overflow-y-auto',
            wide && 'flex-row overflow-hidden',
          )}
        >
          <aside
            className={cn(
              'shrink-0 border-b border-line-subtle bg-surface-1',
              wide ? 'w-[260px] border-r border-b-0' : 'max-h-[300px]',
            )}
          >
            <div className="flex items-center gap-1 border-b border-line-subtle px-3 py-2">
              <select
                aria-label="Study"
                value={studyId ?? ''}
                onChange={(event) => {
                  setChosenStudyId(event.target.value as StudyId);
                  setChosenChapterId(null);
                }}
                className="h-8 min-w-0 flex-1 rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary"
              >
                {list.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.title}
                  </option>
                ))}
              </select>
              {study.data ? (
                <IconButton
                  label="Rename study"
                  onClick={() => setPrompt({ kind: 'rename-study', study: study.data!.study })}
                >
                  <Pencil />
                </IconButton>
              ) : null}
              <IconButton label="Copy study as PGN" onClick={() => void exportStudy()}>
                <Export />
              </IconButton>
            </div>
            <div className="flex items-center border-b border-line-subtle px-3 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-tertiary">
                Chapters
              </h2>
              <IconButton
                label="New chapter"
                className="ml-auto"
                onClick={() => studyId && setPrompt({ kind: 'create-chapter', studyId })}
              >
                <Plus />
              </IconButton>
            </div>
            <div className="max-h-[230px] overflow-y-auto p-2 wide:max-h-none">
              {chapters.length === 0 ? (
                <EmptyState
                  title="No chapters yet."
                  description="Create a chapter to open the board and research tools."
                />
              ) : (
                <ol className="space-y-1">
                  {chapters.map((entry, index) => (
                    <li
                      key={entry.id}
                      className={cn(
                        'rounded-[4px] border',
                        entry.id === chapterId
                          ? 'border-accent/70 bg-accent-muted'
                          : 'border-transparent hover:bg-surface-2',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setChosenChapterId(entry.id)}
                        className="w-full px-3 py-2 text-left"
                      >
                        <span className="block truncate text-sm text-primary">
                          {index + 1}. {entry.title}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-tertiary">
                          {nodeCount(entry.tree)} moves
                        </span>
                      </button>
                      {entry.id === chapterId ? (
                        <div className="flex border-t border-line-subtle px-1 py-1">
                          <IconButton
                            label="Move chapter up"
                            disabled={index === 0}
                            onClick={() => move(entry, -1)}
                          >
                            <ArrowUp />
                          </IconButton>
                          <IconButton
                            label="Move chapter down"
                            disabled={index === chapters.length - 1}
                            onClick={() => move(entry, 1)}
                          >
                            <ArrowDown />
                          </IconButton>
                          <IconButton
                            label="Duplicate chapter"
                            onClick={() =>
                              duplicateChapter.mutate({ id: entry.id, studyId: entry.studyId })
                            }
                          >
                            <Copy />
                          </IconButton>
                          <IconButton
                            label="Rename chapter"
                            onClick={() => setPrompt({ kind: 'rename-chapter', chapter: entry })}
                          >
                            <Pencil />
                          </IconButton>
                          <IconButton
                            label="Delete chapter"
                            tone="danger"
                            onClick={() =>
                              setConfirmation({ kind: 'delete-chapter', chapter: entry })
                            }
                          >
                            <Trash />
                          </IconButton>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </aside>

          {chapter ? (
            <div className="flex min-h-[720px] min-w-0 flex-1 flex-col wide:min-h-0 wide:flex-row">
              <section className="flex min-h-[650px] min-w-0 flex-1 flex-col wide:min-h-0">
                <CanonicalBoardSurface
                  mode="interactive"
                  className="min-h-[500px] flex-1 px-2 py-2 wide:min-h-0"
                />
                <WorkspaceLowerPanel
                  workspace="studies"
                  contextLabel="References"
                  withMoveTree
                  moveTreePanel={<MoveTreePanel withHeader={false} />}
                />
              </section>
              <WorkspaceToolDock
                workspace="studies"
                contextLabel="References"
                contextPanel={<ChapterReferences chapter={chapter} />}
                withMoveTree
                moveTreePanel={<MoveTreePanel withHeader={false} />}
              />
            </div>
          ) : (
            <EmptyState
              title="Create or select a chapter."
              description="A chapter opens the canonical board, move tree, comments and every research tool in one place."
            />
          )}
        </div>
      )}

      {prompt?.kind === 'create-study' && (
        <PromptDialog
          open
          title="New study"
          description="A study is a notebook: opening lines, endgame technique, preparation, or anything else worth keeping."
          label="Title"
          placeholder="Najdorf"
          confirmLabel="Create study"
          noteLabel="Description (optional)"
          onCancel={() => setPrompt(null)}
          onSubmit={async (title, description) => {
            const created = await createStudy.mutateAsync({ title, description });
            setChosenStudyId(created.id);
            setChosenChapterId(null);
            setPrompt(null);
          }}
        />
      )}

      {prompt?.kind === 'rename-study' && (
        <PromptDialog
          open
          title="Rename study"
          label="Title"
          initialValue={prompt.study.title}
          noteLabel="Description (optional)"
          initialNote={prompt.study.description ?? ''}
          onCancel={() => setPrompt(null)}
          onSubmit={async (title, description) => {
            await renameStudy.mutateAsync({ id: prompt.study.id, title, description });
            setPrompt(null);
          }}
        />
      )}

      {prompt?.kind === 'create-chapter' && (
        <PromptDialog
          open
          title="New chapter"
          description="A chapter can be a game, an opening line, a position, or an endgame — it does not have to start from the initial position."
          label="Title"
          placeholder="Introduction"
          confirmLabel="Create chapter"
          onCancel={() => setPrompt(null)}
          onSubmit={async (title) => {
            const created = await createChapter.mutateAsync({ studyId: prompt.studyId, title });
            setChosenChapterId(created.id);
            setPrompt(null);
          }}
        />
      )}

      {prompt?.kind === 'rename-chapter' && (
        <PromptDialog
          open
          title="Rename chapter"
          label="Title"
          initialValue={prompt.chapter.title}
          onCancel={() => setPrompt(null)}
          onSubmit={async (title) => {
            await renameChapter.mutateAsync({
              id: prompt.chapter.id,
              studyId: prompt.chapter.studyId,
              title,
            });
            setPrompt(null);
          }}
        />
      )}

      {confirmation?.kind === 'delete-study' && (
        <ConfirmDialog
          open
          title={`Delete “${confirmation.study.title}”?`}
          description="The study and every chapter in it will be removed from this device. This cannot be undone."
          confirmLabel="Delete study"
          onCancel={() => setConfirmation(null)}
          onConfirm={async () => {
            await deleteStudy.mutateAsync({ id: confirmation.study.id });
            setChosenStudyId(null);
            setChosenChapterId(null);
            setConfirmation(null);
          }}
        />
      )}

      {confirmation?.kind === 'delete-chapter' && (
        <ConfirmDialog
          open
          title={`Delete “${confirmation.chapter.title}”?`}
          description="The chapter and its analysis will be removed from this device. This cannot be undone."
          confirmLabel="Delete chapter"
          onCancel={() => setConfirmation(null)}
          onConfirm={async () => {
            await deleteChapter.mutateAsync({
              id: confirmation.chapter.id,
              studyId: confirmation.chapter.studyId,
            });
            setConfirmation(null);
          }}
        />
      )}
    </div>
  );
}
