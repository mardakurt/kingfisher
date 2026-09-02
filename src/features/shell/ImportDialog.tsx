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

import { useCallback, useRef, useState } from 'react';
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
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const abort = useRef<AbortController | null>(null);

  const kind = detect(text);
  const busy = progress !== null && progress.stage !== 'complete';

  const importPgn = useCallback(async () => {
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setProgress({ stage: 'parsing', completed: 0, total: 0 });

    try {
      const repositories = await getRepositories();
      const summary = await importGames(text, repositories.games, {
        signal: controller.signal,
        onProgress: setProgress,
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
    } catch (failure) {
      setProgress(null);
      if (failure instanceof DOMException && failure.name === 'AbortError') return;
      setError(failure instanceof Error ? failure.message : 'The import failed.');
    } finally {
      abort.current = null;
    }
  }, [client, notify, openDocument, setOpen, text]);

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
    abort.current?.abort();
    setOpen(false);
  };

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
            {busy ? 'Cancel import' : 'Cancel'}
          </Button>
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
      <textarea
        value={text}
        autoFocus
        readOnly={busy}
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
          {kind === 'pgn' && 'Detected a PGN game.'}
          {kind === 'unknown' && 'This does not look like a PGN or a FEN.'}
          {kind === 'empty' && 'Paste a game or a position. ⌘↵ to load.'}
        </span>
        {error && <span className="text-negative">{error}</span>}
      </div>
    </Dialog>
  );
}
