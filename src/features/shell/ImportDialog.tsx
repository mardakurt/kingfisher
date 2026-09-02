'use client';

/**
 * One paste box for both formats.
 *
 * Asking the user whether they are pasting a FEN or a PGN is a question the
 * software can answer itself: a FEN is one line with six fields, a PGN has tag
 * pairs or move numbers. Getting this right removes a decision from a very
 * common action.
 *
 * A PGN is not merely opened. Every game in it is parsed, fingerprinted,
 * stored and indexed by position, which is what turns "My games" in the
 * explorer into a real database; the first game is then opened for analysis as
 * source material rather than as the user's own work.
 */

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { parseFen } from '@/chess/fen';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { invalidateGames } from '@/features/persistence/queries';
import { importGames } from '@/persistence/import-game';
import { getRepositories } from '@/persistence/repositories';
import { gameTitle } from '@/persistence/describe';
import type { ImportProgress } from '@/persistence/types';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import { useImportJob } from './import-job-store';

type Detected = 'fen' | 'pgn' | 'empty' | 'unknown';

function detect(text: string): Detected {
  const trimmed = text.trim();
  if (trimmed === '') return 'empty';
  if (!trimmed.includes('\n') && parseFen(trimmed).ok) return 'fen';
  if (/\[\s*\w+\s+"/.test(trimmed) || /\d+\s*\.\s*[A-Za-z]/.test(trimmed)) return 'pgn';
  if (parseFen(trimmed.split('\n')[0] ?? '').ok) return 'fen';
  return 'unknown';
}

const STAGE_TEXT: Record<ImportProgress['stage'], string> = {
  parsing: 'Reading the file',
  importing: 'Storing games',
  indexing: 'Indexing positions',
  complete: 'Finished',
};

export function ImportDialog() {
  const open = useUi((state) => state.importOpen);
  // Mounted only while open, so the paste box always starts empty.
  return open ? <ImportForm /> : null;
}

function ImportForm() {
  const setOpen = useUi((state) => state.setImportOpen);
  const notify = useUi((state) => state.notify);
  const loadFen = useAnalysis((state) => state.loadFen);
  const openDocument = useAnalysis((state) => state.openDocument);
  const client = useQueryClient();

  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const progress = useImportJob((state) => state.progress);
  const busy = useImportJob((state) => state.running);
  const minimized = useImportJob((state) => state.minimized);
  const setMinimized = useImportJob((state) => state.setMinimized);
  const cancelImport = useImportJob((state) => state.cancel);
  const runImport = useImportJob((state) => state.run);

  const kind = file ? 'pgn' : detect(text);

  const importPgn = useCallback(async () => {
    setError(null);

    try {
      await runImport(async (signal, onProgress) => {
        const repositories = await getRepositories();
        const summary = await importGames(file ?? text, repositories.games, {
          signal,
          onProgress,
        });

        invalidateGames(client);

        if (summary.firstGame) {
          openDocument({
            tree: summary.firstGame.tree,
            document: {
              kind: 'database-game',
              title: gameTitle(summary.firstGame),
              gameId: summary.firstGame.id,
            },
          });
        }

        /*
        A cancelled import still added the batches that had already committed,
        so it gets the same accounting as a finished one. Reporting nothing —
        which is what happened while cancellation was thrown away — left the
        user unsure whether to import the file again.
      */
        notify({
          tone: summary.cancelled ? 'info' : summary.issues > 0 ? 'info' : 'success',
          message: summary.cancelled
            ? `Import stopped. ${summary.imported} of ${summary.games} game(s) were added.`
            : summary.imported === 0
              ? 'Every game in that PGN was already in your database.'
              : `${summary.imported} game${summary.imported === 1 ? '' : 's'} added to your database.`,
          detail: [
            summary.duplicates > 0 ? `${summary.duplicates} duplicate(s) skipped.` : null,
            summary.indexedPositions > 0
              ? `${summary.indexedPositions.toLocaleString()} positions indexed.`
              : null,
            summary.issues > 0 ? `${summary.issues} part(s) could not be read.` : null,
            summary.cancelled
              ? 'Importing the same file again will skip what is already there.'
              : null,
          ]
            .filter(Boolean)
            .join(' '),
        });
        setOpen(false);
      });
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === 'AbortError') return;
      setError(failure instanceof Error ? failure.message : 'The import failed.');
    }
  }, [client, file, notify, openDocument, runImport, setOpen, text]);

  const submit = () => {
    if (busy) return;
    if (kind === 'fen') {
      const result = loadFen(text.trim());
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      notify({ tone: 'success', message: 'Position loaded.' });
      setOpen(false);
      return;
    }
    void importPgn();
  };

  const close = () => {
    if (busy) {
      setMinimized(true);
      return;
    }
    setOpen(false);
  };

  if (minimized && busy) {
    return (
      <aside
        className="fixed right-3 bottom-10 z-50 w-[340px] max-w-[calc(100vw-1.5rem)] rounded-[6px] border border-line-strong bg-surface-1 p-3 shadow-2xl"
        aria-live="polite"
      >
        <p className="text-xs font-medium text-primary">Import continues in the background</p>
        <p className="mt-1 text-2xs text-secondary">
          {progress ? STAGE_TEXT[progress.stage] : 'Preparing'}
          {progress && progress.completed > 0
            ? ` · ${progress.completed.toLocaleString()} games`
            : ''}
        </p>
        <div className="mt-2 flex justify-end gap-2">
          <Button onClick={cancelImport}>Cancel import</Button>
          <Button variant="accent" onClick={() => setMinimized(false)}>
            Show progress
          </Button>
        </div>
      </aside>
    );
  }

  return (
    <Dialog
      open
      onClose={close}
      title="Import a game or position"
      description="Paste a PGN or a FEN. The format is detected automatically, and every game in a PGN is added to your local database."
      width="w-[620px]"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {busy ? 'Continue in background' : 'Cancel'}
          </Button>
          {busy ? <Button onClick={cancelImport}>Cancel import</Button> : null}
          <Button
            variant="accent"
            onClick={submit}
            disabled={kind === 'empty' || kind === 'unknown' || busy}
          >
            {busy ? 'Importing…' : kind === 'fen' ? 'Load position' : 'Import games'}
          </Button>
        </>
      }
    >
      <label className="mb-2 flex items-center justify-between gap-3 rounded-[4px] border border-line bg-surface-1 px-3 py-2 text-xs text-secondary">
        <span className="min-w-0 truncate">
          {file ? `${file.name} · ${(file.size / 1_000_000).toFixed(1)} MB` : 'Choose a PGN file'}
        </span>
        <input
          type="file"
          accept=".pgn,application/x-chess-pgn,text/plain"
          disabled={busy}
          className="max-w-[230px] text-2xs file:mr-2 file:rounded-[3px] file:border file:border-line file:bg-surface-2 file:px-2 file:py-1 file:text-primary"
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            setFile(selected);
            setError(null);
            setStorageWarning(null);
            if (selected && navigator.storage?.estimate) {
              void navigator.storage.estimate().then(({ usage = 0, quota = 0 }) => {
                const remaining = Math.max(0, quota - usage);
                if (quota > 0 && selected.size * 2.5 > remaining) {
                  setStorageWarning(
                    'This import may exceed the browser storage estimate. Consider a companion SQLite collection or export a backup first.',
                  );
                }
              });
            }
          }}
        />
      </label>
      <textarea
        value={text}
        autoFocus
        readOnly={busy || file !== null}
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit();
        }}
        spellCheck={false}
        placeholder={
          '[Event "…"]\n\n1. e4 e5 2. Nf3 Nc6 …\n\nor\n\nrnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        }
        className="h-56 w-full resize-none rounded-[4px] border border-line bg-surface-inset px-3 py-2 font-mono text-[11.5px] leading-relaxed text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60 read-only:opacity-60"
      />

      {storageWarning ? (
        <p className="mt-2 rounded-[4px] border border-caution/40 bg-caution/10 px-3 py-2 text-2xs text-secondary">
          {storageWarning}
        </p>
      ) : null}

      {/*
        Stage-based rather than a percentage: parsing reports no total until it
        is done, and inventing a progress bar that jumps from 0 to 100 tells the
        user less than naming the step honestly does.
      */}
      {progress && (
        <div className="mt-2 flex items-center gap-2 text-2xs text-secondary" aria-live="polite">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
          <span>{STAGE_TEXT[progress.stage]}</span>
          {progress.total > 0 && (
            <span className="text-tertiary tabular">
              {progress.completed} / {progress.total}
            </span>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-3 text-2xs">
        <span className="text-tertiary">
          {kind === 'fen' && 'Detected a FEN position.'}
          {kind === 'pgn' && (file ? 'PGN file selected.' : 'Detected a PGN game.')}
          {kind === 'unknown' && 'This does not look like a PGN or a FEN.'}
          {kind === 'empty' && 'Paste a game or a position. ⌘↵ to load.'}
        </span>
        {error && <span className="text-negative">{error}</span>}
      </div>
    </Dialog>
  );
}
