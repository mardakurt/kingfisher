'use client';

/**
 * Opening files: the subject, and everything already stored about it.
 *
 * The gap is organisational rather than chess-technical. A player working on
 * "Black vs 1.e4, Najdorf" has repertoire positions, two study chapters, a
 * handful of model games and a training set — all correct, all findable, and
 * all somewhere different. This is the one place that knows they belong
 * together.
 *
 * It stores references. Nothing here is a copy of a line, because every line
 * it would copy already lives somewhere with a revision on it, and a second
 * copy is a second thing to keep in step.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { START_FEN, positionKey } from '@/chess/fen';
import { createTree, movesTo } from '@/chess/tree/tree';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { Opening } from '@/components/icons';
import { WorkspaceFrame } from '@/features/workspace/WorkspaceFrame';
import {
  invalidateOpeningFiles,
  useOpeningFile,
  useOpeningFiles,
} from '@/features/preparation/queries';
import { useRepertoires } from '@/features/persistence/queries';
import { openStoredGame } from '@/features/games/open-game';
import { gameTitle } from '@/persistence/describe';
import { getRepositories } from '@/persistence/repositories';
import type { OpeningFileReferenceField } from '@/persistence/repositories/opening-file-repository';
import type { OpeningFileRecord } from '@/persistence/domain';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import { cn } from '@/lib/cn';
import { writeLine } from '@/features/preparation/sheet-export';

export function OpeningFilesWorkspace() {
  const client = useQueryClient();
  const notify = useUi((state) => state.notify);
  const openDocument = useAnalysis((state) => state.openDocument);
  const node = useAnalysis((state) => state.tree.nodes[state.currentId]);
  const tree = useAnalysis((state) => state.tree);

  const files = useOpeningFiles();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const file = useOpeningFile(selectedId).data ?? null;
  const repertoires = useRepertoires().data ?? [];
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [positionNote, setPositionNote] = useState('');

  const create = async (input: { name: string; color: 'w' | 'b'; eco?: string }) => {
    try {
      const repositories = await getRepositories();
      const created = await repositories.openingFiles.create({
        ...input,
        ...(node ? { positionKey: positionKey(node.fen), fen: node.fen } : {}),
      });
      invalidateOpeningFiles(client);
      setSelectedId(created.id);
      notify({ tone: 'success', message: `Created ${created.name}.` });
      return true;
    } catch (error) {
      notify({
        tone: 'error',
        message: 'Could not create the file.',
        detail: error instanceof Error ? error.message : undefined,
      });
      return false;
    }
  };

  /**
   * Every mutation re-reads the record, so it writes against the live
   * revision, and says what it did: a click with no answer is a click the
   * player repeats.
   */
  const mutate = useCallback(
    async (
      change: (repositories: Repositories, current: OpeningFileRecord) => Promise<unknown>,
      done?: string,
    ): Promise<boolean> => {
      if (!selectedId) return false;
      try {
        const repositories = await getRepositories();
        const current = await repositories.openingFiles.get(selectedId);
        if (!current) throw new Error('That opening file no longer exists.');
        await change(repositories, current);
        invalidateOpeningFiles(client);
        if (done) notify({ tone: 'success', message: done });
        return true;
      } catch (error) {
        notify({
          tone: 'error',
          message: 'Could not update the file.',
          detail: error instanceof Error ? error.message : undefined,
        });
        return false;
      }
    },
    [client, notify, selectedId],
  );

  /*
    The line to this position, when the board's game starts from the initial
    position: "1.e4 c5 2.Nf3 d6" is how a player recognises an opening
    position, and a FEN is not. From a set-up position there is no line to
    name, and none is invented.
  */
  const lineHere =
    node && positionKey(tree.nodes[tree.rootId]?.fen ?? START_FEN) === positionKey(START_FEN)
      ? movesTo(tree, node.id).map((move) => move.san)
      : [];
  const inFile = Boolean(
    node && file?.positions.some((entry) => entry.positionKey === positionKey(node.fen)),
  );

  const addPosition = async () => {
    if (!node || !file) return;
    const note = positionNote.trim();
    const ok = await mutate(
      (repositories, current) =>
        repositories.openingFiles.addPosition(current.id, current.revision, {
          positionKey: positionKey(node.fen),
          fen: node.fen,
          line: lineHere,
          ...(note ? { note } : {}),
        }),
      `Added ${lineHere.length ? writeLine(lineHere) : 'this position'} to ${file.name}.`,
    );
    if (ok) setPositionNote('');
  };

  const remove = async () => {
    if (!file) return;
    try {
      await (await getRepositories()).openingFiles.delete(file.id);
      invalidateOpeningFiles(client);
      setSelectedId(null);
      notify({ tone: 'success', message: `Deleted ${file.name}. What it linked to is untouched.` });
    } catch (error) {
      notify({
        tone: 'error',
        message: 'Could not delete the file.',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
    setDeleting(false);
  };

  const railContent = files.isPending ? (
    <p className="px-3 py-3 text-2xs text-tertiary">Reading files…</p>
  ) : files.isError ? (
    <p className="px-3 py-3 text-2xs text-negative" role="alert">
      Could not read your opening files:{' '}
      {files.error instanceof Error ? files.error.message : 'unknown error'}
    </p>
  ) : (files.data?.length ?? 0) === 0 ? (
    <EmptyState
      title="No opening files yet."
      description="A file is a subject — “Black vs 1.e4, Najdorf” — and everything already stored about it. It holds references, never copies."
      action={<Button onClick={() => setCreating(true)}>New file</Button>}
    />
  ) : (
    <ul className="divide-y divide-line-subtle" data-opening-files>
      {files.data?.map((entry) => (
        <li key={entry.id}>
          <button
            type="button"
            onClick={() => setSelectedId(entry.id)}
            aria-current={entry.id === selectedId ? 'true' : undefined}
            className={cn(
              'w-full px-3 py-2 text-left transition-colors hover:bg-surface-2',
              entry.id === selectedId && 'bg-surface-2',
            )}
          >
            <p className="truncate text-[11.5px] text-primary">{entry.name}</p>
            <p className="mt-0.5 text-[10px] text-tertiary tabular">
              {entry.color === 'w' ? 'White' : 'Black'}
              {entry.eco ? ` · ${entry.eco}` : ''} · {entry.positions.length}{' '}
              {entry.positions.length === 1 ? 'position' : 'positions'}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <WorkspaceFrame
      workspace="opening-files"
      title="Opening files"
      subtitle={file ? file.name : 'One subject, and everything already stored about it.'}
      icon={<Opening />}
      routeActions={[
        { id: 'create', label: 'New file', onClick: () => setCreating(true) },
        ...(file ? [{ id: 'delete', label: 'Delete file', onClick: () => setDeleting(true) }] : []),
      ]}
      rail={{ label: 'Files', width: 250, content: railContent }}
      board={{ mode: 'interactive', showEvaluationArtifacts: true }}
      belowBoard={
        file ? (
          <div
            className="shrink-0 border-t border-line-subtle px-3 py-2"
            data-opening-file-positions
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="min-w-0 truncate text-[11.5px] text-primary">
                {file.positions.length === 0
                  ? 'No positions yet — play or open one on the board, then add it.'
                  : `${file.positions.length} ${file.positions.length === 1 ? 'position' : 'positions'} in ${file.name}`}
              </p>
            </div>
            <form
              className="mt-1.5 flex flex-wrap items-center gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                void addPosition();
              }}
            >
              <input
                aria-label="Why this position (optional)"
                value={positionNote}
                onChange={(event) => setPositionNote(event.target.value)}
                placeholder="Why this position (optional)"
                disabled={!node || inFile}
                className="h-7 min-w-[10rem] flex-1 rounded-[6px] border border-line bg-surface-inset px-2 text-[11px] text-primary outline-none focus:border-accent/60 disabled:opacity-50"
              />
              <Button type="submit" disabled={!node || inFile}>
                {inFile ? 'This position is in the file' : 'Add this position'}
              </Button>
            </form>
            {file.positions.length > 0 ? (
              <ul className="mt-1.5 flex flex-col gap-0.5">
                {file.positions.map((entry) => (
                  <li
                    key={entry.positionKey}
                    className="flex items-baseline gap-2"
                    data-opening-file-position
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left font-mono text-[10.5px] text-secondary hover:text-accent"
                      title={entry.note ? `${entry.fen} — ${entry.note}` : entry.fen}
                      onClick={() =>
                        openDocument({
                          tree: createTree(entry.fen, { Event: file.name, Result: '*' }),
                          document: { kind: 'untitled', title: file.name },
                          orientation: file.color,
                        })
                      }
                    >
                      {entry.line.length ? writeLine(entry.line) : 'Set-up position'}
                      {entry.note ? (
                        <span className="ml-2 font-sans text-tertiary">{entry.note}</span>
                      ) : null}
                    </button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        void mutate(
                          (repositories, current) =>
                            repositories.openingFiles.removePosition(
                              current.id,
                              current.revision,
                              entry.positionKey,
                            ),
                          `Removed ${entry.line.length ? writeLine(entry.line) : 'the position'} from ${file.name}.`,
                        )
                      }
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : undefined
      }
      contextLabel="File"
      contextPanel={
        file ? (
          <FileReferences key={file.id} file={file} repertoires={repertoires} mutate={mutate} />
        ) : (
          <EmptyState
            title="No file selected."
            description="Choose one on the left, or create a file for the opening you are working on."
          />
        )
      }
    >
      {creating ? (
        <NewFileDialog
          onClose={() => setCreating(false)}
          onCreate={async (input) => {
            if (await create(input)) setCreating(false);
          }}
        />
      ) : null}
      {deleting && file ? (
        <Dialog
          open
          title={`Delete ${file.name}?`}
          onClose={() => setDeleting(false)}
          footer={
            <>
              <Button onClick={() => setDeleting(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => void remove()}>
                Delete file
              </Button>
            </>
          }
        >
          <p className="text-xs text-secondary">
            The file’s positions, notes and links go. The repertoires, chapters and games it links
            to are not touched.
          </p>
        </Dialog>
      ) : null}
    </WorkspaceFrame>
  );
}

type Repositories = Awaited<ReturnType<typeof getRepositories>>;

interface Linked {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly open?: () => Promise<void> | void;
  /** The target was deleted; only the reference is left. */
  readonly missing?: boolean;
}

/**
 * The references a file holds, resolved to what they name now: a chapter
 * that was deleted says so rather than vanishing from the count.
 */
function useResolvedReferences(file: OpeningFileRecord) {
  return useQuery({
    queryKey: ['persistence', 'opening-file', file.id, 'resolved', file.revision],
    queryFn: async () => {
      const repositories = await getRepositories();
      const chapters = await Promise.all(
        file.chapterIds.map(async (id) => {
          const chapter = await repositories.studies.getChapter(id);
          if (!chapter) return { id, missing: true };
          const study = await repositories.studies.get(chapter.studyId);
          return {
            id,
            studyId: chapter.studyId,
            title: chapter.title,
            studyTitle: study?.study.title ?? 'Study',
          };
        }),
      );
      const links = await repositories.modelGames.list();
      const byId = new Map(links.map((link) => [link.id, link]));
      const keys = new Set([
        ...(file.positionKey ? [file.positionKey] : []),
        ...file.positions.map((entry) => entry.positionKey),
      ]);
      const summaries = await Promise.all(
        [...new Set(links.map((link) => link.gameId))].map(
          async (gameId) => [gameId, await repositories.games.get(gameId)] as const,
        ),
      );
      const games = new Map(summaries);
      const label = (gameId: string) => {
        const game = games.get(gameId);
        return game ? gameTitle(game) : null;
      };
      return {
        chapters,
        modelGames: file.modelGameLinkIds.map((id) => {
          const link = byId.get(id);
          return link
            ? {
                id,
                gameId: link.gameId,
                title: label(link.gameId),
                note: link.purpose ?? link.note,
              }
            : { id, gameId: null, title: null, note: undefined };
        }),
        suggested: links
          .filter(
            (link) =>
              link.openingFileId === file.id ||
              (link.positionKey !== undefined && keys.has(link.positionKey)),
          )
          .filter((link) => !file.modelGameLinkIds.includes(link.id))
          .map((link) => ({ id: link.id, gameId: link.gameId, title: label(link.gameId) })),
      };
    },
  });
}

function FileReferences({
  file,
  repertoires,
  mutate,
}: {
  readonly file: OpeningFileRecord;
  readonly repertoires: readonly { id: string; title: string; color: 'w' | 'b' }[];
  readonly mutate: (
    change: (repositories: Repositories, current: OpeningFileRecord) => Promise<unknown>,
    done?: string,
  ) => Promise<boolean>;
}) {
  const router = useRouter();
  const notify = useUi((state) => state.notify);
  const document = useAnalysis((state) => state.document);
  const resolved = useResolvedReferences(file).data;

  const link = (field: OpeningFileReferenceField, id: string, linked: boolean, done: string) =>
    void mutate(
      (repositories, current) =>
        linked
          ? repositories.openingFiles.removeReference(current.id, current.revision, field, id)
          : repositories.openingFiles.addReference(current.id, current.revision, field, id),
      done,
    );

  const openGame = async (gameId: string) => {
    try {
      await openStoredGame(gameId);
      router.push('/analysis');
    } catch (error) {
      notify({
        tone: 'error',
        message: 'That game is no longer in your games.',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const chapters: readonly Linked[] = (resolved?.chapters ?? []).map((entry) =>
    'missing' in entry
      ? { id: entry.id, title: 'A chapter that was deleted', missing: true }
      : {
          id: entry.id,
          title: entry.title,
          subtitle: entry.studyTitle,
          open: () =>
            router.push(
              `/studies?study=${encodeURIComponent(entry.studyId)}&chapter=${encodeURIComponent(entry.id)}`,
            ),
        },
  );
  const modelGames: readonly Linked[] = (resolved?.modelGames ?? []).map((entry) =>
    entry.gameId === null
      ? { id: entry.id, title: 'A model game that was removed', missing: true }
      : {
          id: entry.id,
          title: entry.title ?? 'A game no longer in your games',
          ...(entry.note ? { subtitle: entry.note } : {}),
          ...(entry.title ? { open: () => openGame(entry.gameId) } : { missing: true }),
        },
  );
  const openChapter =
    document.kind === 'study-chapter' && !file.chapterIds.includes(document.chapterId)
      ? document
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col" data-opening-file-panel>
      <FileHeader file={file} mutate={mutate} />
      <PanelBody className="px-3 py-3">
        <h4 className="text-[9.5px] text-tertiary">Repertoires</h4>
        {repertoires.length === 0 ? (
          <p className="mt-1 text-[10.5px] text-tertiary">No repertoires yet.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-0.5">
            {repertoires.map((entry) => {
              const linked = file.repertoireIds.includes(entry.id);
              return (
                <li key={entry.id}>
                  <label className="flex items-center gap-1.5 text-[11px] text-primary">
                    <input
                      type="checkbox"
                      checked={linked}
                      onChange={() =>
                        link(
                          'repertoireIds',
                          entry.id,
                          linked,
                          linked ? `Unlinked ${entry.title}.` : `Linked ${entry.title}.`,
                        )
                      }
                      className="accent-accent"
                    />
                    <span className="min-w-0 truncate">{entry.title}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-tertiary">
                      {entry.color === 'w' ? 'White' : 'Black'}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <h4 className="mt-3 text-[9.5px] text-tertiary">Chapters</h4>
        <LinkedList
          items={chapters}
          kind="chapter"
          empty="No chapters linked."
          onUnlink={(entry) => link('chapterIds', entry.id, true, `Unlinked ${entry.title}.`)}
        />
        {openChapter ? (
          <Button
            size="sm"
            variant="subtle"
            className="mt-1.5"
            onClick={() =>
              link('chapterIds', openChapter.chapterId, false, `Linked ${openChapter.title}.`)
            }
          >
            Link the open chapter, “{openChapter.title}”
          </Button>
        ) : document.kind !== 'study-chapter' ? (
          <p className="mt-1 text-[10.5px] text-tertiary">
            Open a study chapter on the board, then come back here to link it.
          </p>
        ) : null}

        <h4 className="mt-3 text-[9.5px] text-tertiary">Model games</h4>
        <LinkedList
          items={modelGames}
          kind="model-game"
          empty="No model games linked."
          onUnlink={(entry) => link('modelGameLinkIds', entry.id, true, `Unlinked ${entry.title}.`)}
        />
        {(resolved?.suggested ?? []).length > 0 ? (
          <div className="mt-1.5" data-opening-file-suggested>
            <p className="text-[10.5px] text-tertiary">
              Your model games saved for this file or at one of its positions:
            </p>
            <ul className="mt-0.5 flex flex-col gap-0.5">
              {resolved?.suggested.map((entry) => (
                <li key={entry.id} className="flex items-center gap-2 text-[11px]">
                  <span className="min-w-0 flex-1 truncate text-secondary">
                    {entry.title ?? 'A game no longer in your games'}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      link(
                        'modelGameLinkIds',
                        entry.id,
                        false,
                        `Linked ${entry.title ?? 'the model game'}.`,
                      )
                    }
                  >
                    Link
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-1 text-[10.5px] text-tertiary">
            Model games saved at one of this file’s positions are offered here to link.
          </p>
        )}

        <NotesEditor file={file} mutate={mutate} />
      </PanelBody>
    </div>
  );
}

function LinkedList({
  items,
  kind,
  empty,
  onUnlink,
}: {
  readonly items: readonly Linked[];
  readonly kind: string;
  readonly empty: string;
  readonly onUnlink: (entry: Linked) => void;
}) {
  if (items.length === 0) return <p className="mt-1 text-[10.5px] text-tertiary">{empty}</p>;
  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {items.map((entry) => (
        <li
          key={entry.id}
          className="flex items-center gap-1.5 text-[11px]"
          data-opening-file-linked={kind}
        >
          {entry.open ? (
            <button
              type="button"
              onClick={() => void entry.open?.()}
              className="min-w-0 flex-1 truncate text-left text-primary hover:text-accent"
              title={entry.subtitle ? `${entry.title} — ${entry.subtitle}` : entry.title}
            >
              {entry.title}
              {entry.subtitle ? (
                <span className="ml-1.5 text-[10px] text-tertiary">{entry.subtitle}</span>
              ) : null}
            </button>
          ) : (
            <span className="min-w-0 flex-1 truncate text-tertiary">{entry.title}</span>
          )}
          <Button size="sm" variant="ghost" onClick={() => onUnlink(entry)}>
            Unlink
          </Button>
        </li>
      ))}
    </ul>
  );
}

function FileHeader({
  file,
  mutate,
}: {
  readonly file: OpeningFileRecord;
  readonly mutate: (
    change: (repositories: Repositories, current: OpeningFileRecord) => Promise<unknown>,
    done?: string,
  ) => Promise<boolean>;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(file.name);
  const commit = async () => {
    const next = name.trim();
    if (!next || next === file.name) {
      setRenaming(false);
      setName(file.name);
      return;
    }
    const ok = await mutate(
      (repositories, current) =>
        repositories.openingFiles.update(current.id, current.revision, { name: next }),
      `Renamed to ${next}.`,
    );
    if (ok) setRenaming(false);
  };
  return (
    <PanelHeader>
      {renaming ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            void commit();
          }}
        >
          <input
            autoFocus
            aria-label="File name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setRenaming(false);
                setName(file.name);
              }
            }}
            className="h-6 min-w-0 flex-1 rounded-[5px] border border-line bg-surface-inset px-1.5 text-[11px] text-primary outline-none focus:border-accent/60"
          />
          <Button size="sm" type="submit">
            Save
          </Button>
        </form>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <Button size="sm" variant="ghost" onClick={() => setRenaming(true)}>
            Rename
          </Button>
        </div>
      )}
    </PanelHeader>
  );
}

type NotesState = 'saved' | 'unsaved' | 'saving' | 'conflict' | 'error';

/**
 * The file's notes, saved as they are typed.
 *
 * Kept on blur alone, a note written and followed by closing the window was
 * lost, and nothing said whether it had been kept. It is written a moment
 * after typing stops, on blur, and when the panel goes; and a note another
 * tab changed meanwhile is not overwritten — the text stays in the box and
 * the page says so.
 */
function NotesEditor({
  file,
  mutate,
}: {
  readonly file: OpeningFileRecord;
  readonly mutate: (
    change: (repositories: Repositories, current: OpeningFileRecord) => Promise<unknown>,
    done?: string,
  ) => Promise<boolean>;
}) {
  const [notes, setNotes] = useState(file.notes ?? '');
  const [state, setState] = useState<NotesState>('saved');
  const base = useRef(file.notes ?? '');
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const text = pending.current;
    if (text === null) return;
    pending.current = null;
    setState('saving');
    let conflict = false;
    const ok = await mutate(async (repositories, current) => {
      if ((current.notes ?? '') !== base.current && (current.notes ?? '') !== text) {
        conflict = true;
        return;
      }
      await repositories.openingFiles.update(current.id, current.revision, { notes: text });
    });
    if (conflict) {
      setState('conflict');
      return;
    }
    if (ok) base.current = text;
    setState(ok ? (pending.current === null ? 'saved' : 'unsaved') : 'error');
  }, [mutate]);

  // Whatever is still unsaved is written when the panel goes.
  useEffect(
    () => () => {
      if (pending.current !== null) void save();
    },
    [save],
  );

  return (
    <label className="mt-3 block text-[10px] text-tertiary">
      <span className="flex items-baseline gap-2">
        Notes
        <span className="ml-auto" data-opening-file-notes-state={state} aria-live="polite">
          {state === 'saved'
            ? 'Saved'
            : state === 'saving'
              ? 'Saving…'
              : state === 'unsaved'
                ? 'Not saved yet'
                : state === 'conflict'
                  ? 'Changed in another tab — your text is kept here, not saved'
                  : 'Not saved'}
        </span>
      </span>
      <textarea
        rows={5}
        value={notes}
        onChange={(event) => {
          setNotes(event.target.value);
          pending.current = event.target.value;
          setState('unsaved');
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void save(), 800);
        }}
        onBlur={() => void save()}
        placeholder="What this file is for, and what you have concluded."
        className="mt-1 w-full resize-y rounded-[6px] border border-line bg-surface-inset px-2 py-1.5 text-[11px] leading-relaxed text-primary outline-none focus:border-accent/60"
      />
    </label>
  );
}

function NewFileDialog({
  onClose,
  onCreate,
}: {
  readonly onClose: () => void;
  readonly onCreate: (input: { name: string; color: 'w' | 'b'; eco?: string }) => unknown;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<'w' | 'b'>('w');
  const [eco, setEco] = useState('');

  return (
    <Dialog open title="New opening file" onClose={onClose}>
      <form
        className="flex flex-col gap-3 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          onCreate({ name: name.trim(), color, ...(eco.trim() ? { eco: eco.trim() } : {}) });
        }}
      >
        <label className="flex flex-col gap-1 text-2xs text-tertiary">
          Name
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Black vs 1.e4 — Najdorf"
            className="h-8 rounded-[6px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none focus:border-accent/60"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-2xs text-tertiary">
            Side
            <select
              value={color}
              onChange={(event) => setColor(event.target.value as 'w' | 'b')}
              className="h-8 rounded-[6px] border border-line bg-surface-inset px-2 text-xs text-primary"
            >
              <option value="w">White</option>
              <option value="b">Black</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-2xs text-tertiary">
            ECO
            <input
              value={eco}
              onChange={(event) => setEco(event.target.value)}
              placeholder="B90"
              className="h-8 rounded-[6px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none focus:border-accent/60"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-line-subtle pt-3">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" disabled={!name.trim()}>
            Create file
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
