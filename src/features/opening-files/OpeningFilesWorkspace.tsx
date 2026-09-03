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

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { positionKey } from '@/chess/fen';
import { createTree } from '@/chess/tree/tree';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { Opening } from '@/components/icons';
import { NavButton } from '@/features/shell/NavButton';
import { CanonicalBoardSurface } from '@/features/workspace/CanonicalBoardSurface';
import { WorkspaceToolDock } from '@/features/workspace/WorkspaceToolDock';
import {
  invalidateOpeningFiles,
  useOpeningFile,
  useOpeningFiles,
} from '@/features/preparation/queries';
import { useRepertoires, useStudies } from '@/features/persistence/queries';
import { getRepositories } from '@/persistence/repositories';
import type { OpeningFileRecord } from '@/persistence/domain';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/cn';
import { writeLine } from '@/features/preparation/sheet-export';

export function OpeningFilesWorkspace() {
  const client = useQueryClient();
  const notify = useUi((state) => state.notify);
  const openDocument = useAnalysis((state) => state.openDocument);
  const node = useAnalysis((state) => state.tree.nodes[state.currentId]);
  const wide = useMediaQuery('(min-width: 1100px)');

  const files = useOpeningFiles();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const file = useOpeningFile(selectedId).data ?? null;
  const repertoires = useRepertoires().data ?? [];
  const studies = useStudies().data ?? [];
  const [creating, setCreating] = useState(false);

  const create = async (input: { name: string; color: 'w' | 'b'; eco?: string }) => {
    try {
      const repositories = await getRepositories();
      const created = await repositories.openingFiles.create({
        ...input,
        ...(node ? { positionKey: positionKey(node.fen), fen: node.fen } : {}),
      });
      invalidateOpeningFiles(client);
      setSelectedId(created.id);
    } catch (error) {
      notify({
        tone: 'error',
        message: 'Could not create the file.',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  };

  /** Every mutation re-reads the record, so it writes against the live revision. */
  const mutate = async (
    change: (
      repositories: Awaited<ReturnType<typeof getRepositories>>,
      current: OpeningFileRecord,
    ) => Promise<unknown>,
  ) => {
    if (!selectedId) return;
    try {
      const repositories = await getRepositories();
      const current = await repositories.openingFiles.get(selectedId);
      if (!current) throw new Error('That opening file no longer exists.');
      await change(repositories, current);
      invalidateOpeningFiles(client);
    } catch (error) {
      notify({
        tone: 'error',
        message: 'Could not update the file.',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="density-row flex h-10 shrink-0 items-center gap-2 border-b border-line-subtle bg-surface-1 px-2 sm:px-3">
        <NavButton />
        <Opening className="h-4 w-4 text-accent" />
        <h1 className="text-xs font-semibold text-primary">Opening files</h1>
        <Button className="ml-auto" onClick={() => setCreating(true)}>
          New file
        </Button>
      </header>

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-y-auto',
          wide && 'grid grid-cols-[260px_minmax(0,1fr)_380px] overflow-hidden',
        )}
      >
        <aside
          className={cn(
            'min-h-0 min-w-0 bg-surface-1',
            wide ? 'border-r border-line-subtle' : 'order-3 border-t border-line-subtle',
          )}
        >
          <Panel className="h-full">
            <PanelHeader>Files</PanelHeader>
            <PanelBody>
              {files.isPending ? (
                <p className="px-3 py-3 text-2xs text-tertiary">Reading files…</p>
              ) : (files.data?.length ?? 0) === 0 ? (
                <EmptyState
                  title="No opening files yet."
                  description="A file is a subject — “Black vs 1.e4, Najdorf” — and everything already stored about it. It holds references, never copies."
                />
              ) : (
                <ul className="divide-y divide-line-subtle">
                  {files.data?.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(entry.id)}
                        className={cn(
                          'w-full px-3 py-2 text-left transition-colors hover:bg-surface-2',
                          entry.id === selectedId && 'bg-surface-2',
                        )}
                      >
                        <p className="truncate text-[11.5px] text-primary">{entry.name}</p>
                        <p className="mt-0.5 text-[10px] text-tertiary tabular">
                          {entry.color === 'w' ? 'White' : 'Black'}
                          {entry.eco ? ` · ${entry.eco}` : ''} · {entry.positions.length} positions
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </PanelBody>
          </Panel>
        </aside>

        <section className="flex min-h-[560px] min-w-0 flex-col wide:min-h-0">
          <CanonicalBoardSurface
            mode="interactive"
            className="min-h-[420px] flex-1 px-3 py-3 sm:px-5 sm:py-4 wide:min-h-0"
          />
          {file ? (
            <div className="shrink-0 border-t border-line-subtle px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="text-[11.5px] text-primary">{file.name}</p>
                <Button
                  className="ml-auto"
                  disabled={!node}
                  onClick={() =>
                    void mutate((repositories, current) =>
                      repositories.openingFiles.addPosition(current.id, current.revision, {
                        positionKey: positionKey(node!.fen),
                        fen: node!.fen,
                        line: [],
                      }),
                    )
                  }
                >
                  Add this position
                </Button>
              </div>
              {file.positions.length > 0 ? (
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {file.positions.map((entry) => (
                    <li key={entry.positionKey} className="flex items-baseline gap-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left font-mono text-[10.5px] text-secondary hover:text-accent"
                        onClick={() =>
                          openDocument({
                            tree: createTree(entry.fen, { Event: file.name, Result: '*' }),
                            document: { kind: 'untitled', title: file.name },
                            orientation: file.color,
                          })
                        }
                      >
                        {entry.line.length ? writeLine(entry.line) : entry.positionKey}
                      </button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          void mutate((repositories, current) =>
                            repositories.openingFiles.removePosition(
                              current.id,
                              current.revision,
                              entry.positionKey,
                            ),
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
          ) : null}
        </section>

        <WorkspaceToolDock
          workspace="opening-files"
          fill={wide}
          contextLabel="File"
          contextPanel={
            file ? (
              <FileReferences
                file={file}
                repertoires={repertoires}
                studies={studies}
                onToggleRepertoire={(id, linked) =>
                  void mutate((repositories, current) =>
                    linked
                      ? repositories.openingFiles.removeReference(
                          current.id,
                          current.revision,
                          'repertoireIds',
                          id,
                        )
                      : repositories.openingFiles.addReference(
                          current.id,
                          current.revision,
                          'repertoireIds',
                          id,
                        ),
                  )
                }
                onNotes={(notes) =>
                  void mutate((repositories, current) =>
                    repositories.openingFiles.update(current.id, current.revision, { notes }),
                  )
                }
              />
            ) : (
              <EmptyState
                title="No file selected."
                description="Choose one on the left, or create a file for the opening you are working on."
              />
            )
          }
        />
      </div>

      {creating ? (
        <NewFileDialog
          onClose={() => setCreating(false)}
          onCreate={(input) => {
            void create(input);
            setCreating(false);
          }}
        />
      ) : null}
    </div>
  );
}

function FileReferences({
  file,
  repertoires,
  studies,
  onToggleRepertoire,
  onNotes,
}: {
  readonly file: OpeningFileRecord;
  readonly repertoires: readonly { id: string; title: string; color: 'w' | 'b' }[];
  readonly studies: readonly { id: string; title: string }[];
  readonly onToggleRepertoire: (id: string, linked: boolean) => void;
  readonly onNotes: (notes: string) => void;
}) {
  const [notes, setNotes] = useState(file.notes ?? '');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader>{file.name}</PanelHeader>
      <PanelBody className="px-3 py-3">
        <h4 className="text-[9.5px] uppercase tracking-wide text-tertiary">Repertoires</h4>
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
                      onChange={() => onToggleRepertoire(entry.id, linked)}
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

        <h4 className="mt-3 text-[9.5px] uppercase tracking-wide text-tertiary">Chapters</h4>
        <p className="mt-1 text-[10.5px] text-tertiary">
          {file.chapterIds.length} linked of {studies.length} studies. Link a chapter from the study
          itself, so the reference is made where the work is.
        </p>

        <h4 className="mt-3 text-[9.5px] uppercase tracking-wide text-tertiary">Model games</h4>
        <p className="mt-1 text-[10.5px] text-tertiary tabular">
          {file.modelGameLinkIds.length} linked
        </p>

        <label className="mt-3 block text-[10px] text-tertiary">
          Notes
          <textarea
            rows={5}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => onNotes(notes)}
            placeholder="What this file is for, and what you have concluded."
            className="mt-1 w-full resize-y rounded-[4px] border border-line bg-surface-inset px-2 py-1.5 text-[11px] leading-relaxed text-primary outline-none focus:border-accent/60"
          />
        </label>
      </PanelBody>
    </div>
  );
}

function NewFileDialog({
  onClose,
  onCreate,
}: {
  readonly onClose: () => void;
  readonly onCreate: (input: { name: string; color: 'w' | 'b'; eco?: string }) => void;
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
            className="h-8 rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none focus:border-accent/60"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-2xs text-tertiary">
            Side
            <select
              value={color}
              onChange={(event) => setColor(event.target.value as 'w' | 'b')}
              className="h-8 rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary"
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
              className="h-8 rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none focus:border-accent/60"
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
