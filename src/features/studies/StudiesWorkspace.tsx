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

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { START_FEN } from '@/chess/fen';
import { serializePgn } from '@/chess/pgn';
import { createTree, mainlinePath, nodeCount } from '@/chess/tree/tree';
import {
  ArrowDown,
  ArrowLeft,
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
import { EmptyState, PanelHeader } from '@/components/ui/Panel';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { MiniBoard } from '@/features/board/MiniBoard';
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
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

import { exportStudyPgn } from './export';
import { NavButton } from '@/features/shell/NavButton';

type Prompt =
  | { readonly kind: 'create-study' }
  | { readonly kind: 'rename-study'; readonly study: StudyRecord }
  | { readonly kind: 'create-chapter'; readonly studyId: StudyId }
  | { readonly kind: 'rename-chapter'; readonly chapter: ChapterRecord };

type Confirmation =
  | { readonly kind: 'delete-study'; readonly study: StudyRecord }
  | { readonly kind: 'delete-chapter'; readonly chapter: ChapterRecord };

export function StudiesWorkspace() {
  const router = useRouter();
  const notify = useUi((state) => state.notify);
  const openDocument = useAnalysis((state) => state.openDocument);
  const prefs = usePreferences();
  const wide = useMediaQuery('(min-width: 900px)');

  /*
    Selection is derived, not synchronised. Storing "the user picked this" and
    resolving it against the current data each render means a study deleted in
    another tab, or a chapter that vanishes under a reorder, simply falls back
    to the first available one — with no effect chasing the query cache and no
    render where the screen points at something that no longer exists.
  */
  const [chosenStudyId, setChosenStudyId] = useState<StudyId | null>(null);
  const [chosenChapterId, setChosenChapterId] = useState<string | null>(null);
  const [pane, setPane] = useState<'studies' | 'chapters' | 'chapter'>('studies');
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

  const open = (target: ChapterRecord) => {
    const parent = study.data?.study;
    openDocument({
      tree: target.tree,
      document: {
        kind: 'study-chapter',
        title: target.title,
        studyId: target.studyId,
        studyTitle: parent?.title ?? 'Study',
        chapterId: target.id,
      },
    });
    router.push('/analysis');
  };

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

  // One pane at a time on narrow screens; the wide layout shows all three.
  const mobilePane = pane;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line-subtle bg-surface-1 px-2 sm:px-3">
        <NavButton />
        <Notebook className="h-4 w-4 shrink-0 text-accent" />
        <h1 className="text-xs font-semibold text-primary">Studies</h1>
        <span className="hidden text-2xs text-tertiary sm:inline">
          Notebooks of chapters, saved on this device.
        </span>
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
        <div className={cn('flex min-h-0 flex-1', wide ? 'flex-row' : 'flex-col')}>
          {(wide || mobilePane === 'studies') && (
            <StudyList
              studies={studies.data ?? []}
              loading={studies.isPending}
              selectedId={studyId}
              onSelect={(id) => {
                setChosenStudyId(id);
                setChosenChapterId(null);
                setPane('chapters');
              }}
              onCreate={() => setPrompt({ kind: 'create-study' })}
              wide={wide}
            />
          )}

          {(wide || mobilePane === 'chapters') && (
            <ChapterList
              study={study.data?.study ?? null}
              chapters={chapters}
              loading={study.isPending && studyId !== null}
              selectedId={chapterId}
              wide={wide}
              onBack={() => setPane('studies')}
              onSelect={(id) => {
                setChosenChapterId(id);
                if (!wide) setPane('chapter');
              }}
              onOpen={open}
              onCreate={() => studyId && setPrompt({ kind: 'create-chapter', studyId })}
              onRenameStudy={() =>
                study.data && setPrompt({ kind: 'rename-study', study: study.data.study })
              }
              onDeleteStudy={() =>
                study.data && setConfirmation({ kind: 'delete-study', study: study.data.study })
              }
              onExportStudy={() => void exportStudy()}
              onMove={move}
              onDuplicate={(target) =>
                duplicateChapter.mutate(
                  { id: target.id, studyId: target.studyId },
                  { onError: (error) => notify({ tone: 'error', message: error.message }) },
                )
              }
              onRename={(target) => setPrompt({ kind: 'rename-chapter', chapter: target })}
              onDelete={(target) => setConfirmation({ kind: 'delete-chapter', chapter: target })}
            />
          )}

          {(wide || mobilePane === 'chapter') && (
            <ChapterPreview
              chapter={chapter}
              studyTitle={study.data?.study.title ?? ''}
              description={study.data?.study.description}
              boardTheme={prefs.boardTheme}
              pieceSet={prefs.pieceSet}
              wide={wide}
              onBack={() => setPane('chapters')}
              onOpen={open}
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
            setPane('chapters');
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

interface StudyListProps {
  readonly studies: readonly StudyRecord[];
  readonly loading: boolean;
  readonly selectedId: StudyId | null;
  readonly onSelect: (id: StudyId) => void;
  readonly onCreate: () => void;
  readonly wide: boolean;
}

function StudyList({ studies, loading, selectedId, onSelect, onCreate, wide }: StudyListProps) {
  return (
    <section
      className={cn(
        'flex min-h-0 flex-col bg-surface-1',
        wide ? 'w-[clamp(190px,20vw,260px)] shrink-0 border-r border-line-subtle' : 'flex-1',
      )}
    >
      <PanelHeader>Studies</PanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {loading ? (
          <p className="px-2 py-4 text-2xs text-tertiary">Opening local storage…</p>
        ) : studies.length === 0 ? (
          <EmptyState
            title="No studies yet."
            description="Create a study to organise analysis, openings, games, or positions."
            action={
              <Button variant="subtle" icon={<Plus />} onClick={onCreate}>
                Create a study
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-px">
            {studies.map((study) => (
              <li key={study.id}>
                <button
                  type="button"
                  onClick={() => onSelect(study.id)}
                  aria-current={study.id === selectedId}
                  className={cn(
                    'w-full rounded-[4px] px-2 py-1.5 text-left transition-colors',
                    study.id === selectedId
                      ? 'bg-surface-3 text-primary'
                      : 'text-secondary hover:bg-surface-2 hover:text-primary',
                  )}
                >
                  <span className="block truncate text-xs font-medium">{study.title}</span>
                  <span className="block truncate text-[10.5px] text-tertiary">
                    edited {relativeTime(study.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

interface ChapterListProps {
  readonly study: StudyRecord | null;
  readonly chapters: readonly ChapterRecord[];
  readonly loading: boolean;
  readonly selectedId: string | null;
  readonly wide: boolean;
  readonly onBack: () => void;
  readonly onSelect: (id: string) => void;
  readonly onOpen: (chapter: ChapterRecord) => void;
  readonly onCreate: () => void;
  readonly onRenameStudy: () => void;
  readonly onDeleteStudy: () => void;
  readonly onExportStudy: () => void;
  readonly onMove: (chapter: ChapterRecord, delta: number) => void;
  readonly onDuplicate: (chapter: ChapterRecord) => void;
  readonly onRename: (chapter: ChapterRecord) => void;
  readonly onDelete: (chapter: ChapterRecord) => void;
}

function ChapterList(props: ChapterListProps) {
  const { chapters, selectedId, wide } = props;

  if (!props.study) {
    return (
      <section className={cn('flex min-h-0 flex-1 flex-col bg-surface-0')}>
        <EmptyState
          title="No study selected"
          description="Choose a study on the left, or create one."
        />
      </section>
    );
  }

  return (
    <section
      className={cn(
        'flex min-h-0 flex-col bg-surface-0',
        wide ? 'w-[clamp(230px,26vw,340px)] shrink-0 border-r border-line-subtle' : 'flex-1',
      )}
    >
      <PanelHeader
        actions={
          <>
            <IconButton label="Copy the whole study as PGN" onClick={props.onExportStudy}>
              <Export />
            </IconButton>
            <IconButton label="Rename this study" onClick={props.onRenameStudy}>
              <Pencil />
            </IconButton>
            <IconButton label="Delete this study" tone="danger" onClick={props.onDeleteStudy}>
              <Trash />
            </IconButton>
          </>
        }
      >
        {!wide && (
          <IconButton label="Back to studies" onClick={props.onBack} className="-ml-1">
            <ArrowLeft />
          </IconButton>
        )}
        <span className="truncate normal-case tracking-normal text-secondary">
          {props.study.title}
        </span>
      </PanelHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {props.loading ? (
          <p className="px-2 py-4 text-2xs text-tertiary">Loading chapters…</p>
        ) : chapters.length === 0 ? (
          <EmptyState
            title="No chapters yet."
            description="A chapter holds one line of investigation: a game, an opening, a position."
            action={
              <Button variant="subtle" icon={<Plus />} onClick={props.onCreate}>
                Create a chapter
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-px">
            {chapters.map((chapter, index) => (
              <li key={chapter.id} className="group">
                <div
                  className={cn(
                    'flex items-center gap-1 rounded-[4px] pr-0.5 transition-colors',
                    chapter.id === selectedId ? 'bg-surface-3' : 'hover:bg-surface-2',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => props.onSelect(chapter.id)}
                    onDoubleClick={() => props.onOpen(chapter)}
                    aria-current={chapter.id === selectedId}
                    className="min-w-0 flex-1 px-2 py-1.5 text-left"
                  >
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="shrink-0 text-[10.5px] text-tertiary tabular">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span
                        className={cn(
                          'truncate text-xs',
                          chapter.id === selectedId ? 'text-primary' : 'text-secondary',
                        )}
                      >
                        {chapter.title}
                      </span>
                    </span>
                    <span className="ml-6 block truncate text-[10.5px] text-tertiary">
                      {nodeCount(chapter.tree)} move{nodeCount(chapter.tree) === 1 ? '' : 's'}
                    </span>
                  </button>

                  {/*
                    Row actions appear on hover on a pointer device, and are
                    always present for keyboard and touch users, who have no
                    hover to reveal them with.
                  */}
                  <span className="flex shrink-0 items-center opacity-100 mid:opacity-0 mid:transition-opacity mid:focus-within:opacity-100 mid:group-hover:opacity-100">
                    <IconButton
                      label="Move chapter up"
                      disabled={index === 0}
                      onClick={() => props.onMove(chapter, -1)}
                      className="h-6 w-6"
                    >
                      <ArrowUp />
                    </IconButton>
                    <IconButton
                      label="Move chapter down"
                      disabled={index === chapters.length - 1}
                      onClick={() => props.onMove(chapter, 1)}
                      className="h-6 w-6"
                    >
                      <ArrowDown />
                    </IconButton>
                    <IconButton
                      label="Duplicate chapter"
                      onClick={() => props.onDuplicate(chapter)}
                      className="h-6 w-6"
                    >
                      <Copy />
                    </IconButton>
                    <IconButton
                      label="Rename chapter"
                      onClick={() => props.onRename(chapter)}
                      className="h-6 w-6"
                    >
                      <Pencil />
                    </IconButton>
                    <IconButton
                      label="Delete chapter"
                      tone="danger"
                      onClick={() => props.onDelete(chapter)}
                      className="h-6 w-6"
                    >
                      <Trash />
                    </IconButton>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="shrink-0 border-t border-line-subtle p-1.5">
        <Button variant="subtle" icon={<Plus />} onClick={props.onCreate} className="w-full">
          New chapter
        </Button>
      </footer>
    </section>
  );
}

interface ChapterPreviewProps {
  readonly chapter: ChapterRecord | null;
  readonly studyTitle: string;
  readonly description?: string | undefined;
  readonly boardTheme: ReturnType<typeof usePreferences.getState>['boardTheme'];
  readonly pieceSet: ReturnType<typeof usePreferences.getState>['pieceSet'];
  readonly wide: boolean;
  readonly onBack: () => void;
  readonly onOpen: (chapter: ChapterRecord) => void;
}

function ChapterPreview({
  chapter,
  studyTitle,
  description,
  boardTheme,
  pieceSet,
  wide,
  onBack,
  onOpen,
}: ChapterPreviewProps) {
  const notify = useUi((state) => state.notify);

  if (!chapter) {
    return (
      <section className="flex min-h-0 flex-1 flex-col bg-surface-1">
        <EmptyState
          title="Nothing selected"
          description={description ?? 'Select a chapter to see its position and opening moves.'}
        />
      </section>
    );
  }

  const path = mainlinePath(chapter.tree);
  const lastId = path.at(-1);
  const finalFen = lastId
    ? (chapter.tree.nodes[lastId]?.fen ?? chapter.tree.startFen)
    : chapter.tree.startFen;
  const preview = path
    .slice(1, 13)
    .map((id) => chapter.tree.nodes[id]?.move?.san)
    .filter(Boolean)
    .join(' ');

  const copyChapter = async () => {
    try {
      await navigator.clipboard.writeText(serializePgn(chapter.tree));
      notify({ tone: 'success', message: 'Chapter copied as PGN.' });
    } catch {
      notify({ tone: 'error', message: 'The clipboard is not available in this context.' });
    }
  };

  return (
    <section
      className={cn(
        'flex min-h-0 flex-col bg-surface-1',
        wide ? 'min-w-0 flex-1 border-l border-line-subtle' : 'flex-1',
      )}
    >
      <PanelHeader>
        {!wide && (
          <IconButton label="Back to chapters" onClick={onBack} className="-ml-1">
            <ArrowLeft />
          </IconButton>
        )}
        <span className="truncate normal-case tracking-normal text-secondary">Preview</span>
      </PanelHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mx-auto flex w-full max-w-[380px] flex-col gap-3">
          <MiniBoard fen={finalFen} theme={boardTheme} pieceSet={pieceSet} />

          <div className="min-w-0">
            <p className="truncate text-2xs text-tertiary">{studyTitle}</p>
            <h2 className="truncate text-[13px] font-semibold text-primary">{chapter.title}</h2>
          </div>

          {preview && (
            <p className="text-[11.5px] leading-relaxed text-secondary [overflow-wrap:anywhere]">
              {preview}
              {path.length > 13 && <span className="text-tertiary"> …</span>}
            </p>
          )}

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px]">
            <dt className="text-tertiary">Moves</dt>
            <dd className="text-secondary tabular">{nodeCount(chapter.tree)}</dd>
            <dt className="text-tertiary">Created</dt>
            <dd className="text-secondary">{relativeTime(chapter.createdAt)}</dd>
            <dt className="text-tertiary">Edited</dt>
            <dd className="text-secondary">{relativeTime(chapter.updatedAt)}</dd>
          </dl>

          <div className="flex flex-wrap gap-1.5">
            <Button variant="accent" onClick={() => onOpen(chapter)}>
              Open in analysis
            </Button>
            <Button variant="subtle" icon={<Export />} onClick={() => void copyChapter()}>
              Copy PGN
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Coarse and honest: exact timestamps mean nothing to someone reading a list. */
function relativeTime(value: number): string {
  const elapsed = Date.now() - value;
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)} d ago`;
  return new Date(value).toLocaleDateString();
}
