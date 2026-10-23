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

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { invalidateGames } from '@/features/persistence/queries';
import { importGames } from '@/persistence/import-game';
import {
  describeImportFilter,
  isActiveFilter,
  type ImportFilter,
} from '@/persistence/import-filter';
import {
  browserCollectionKey,
  browserCollectionRepositories,
} from '@/persistence/browser-collections';
import { getRepositories } from '@/persistence/repositories';
import { gameTitle } from '@/persistence/describe';
import type { ImportProgress } from '@/persistence/types';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import { useImportJob } from './import-job-store';
import { detectImport as detect } from './paste-import';

/** The filter as typed: text in the fields until the import reads it. */
interface FilterDraft {
  readonly minRating: string;
  readonly ratingOf: 'both' | 'either';
  readonly player: string;
  readonly fromYear: string;
  readonly toYear: string;
}

const EMPTY_FILTER: FilterDraft = {
  minRating: '',
  ratingOf: 'both',
  player: '',
  fromYear: '',
  toYear: '',
};

const wholeNumber = (text: string): number | undefined => {
  const value = Number(text.trim());
  return text.trim() !== '' && Number.isInteger(value) && value > 0 ? value : undefined;
};

function filterOf(draft: FilterDraft): ImportFilter | undefined {
  const minRating = wholeNumber(draft.minRating);
  const fromYear = wholeNumber(draft.fromYear);
  const toYear = wholeNumber(draft.toYear);
  const filter: ImportFilter = {
    ...(minRating ? { minRating, ratingOf: draft.ratingOf } : {}),
    ...(draft.player.trim() ? { player: draft.player.trim() } : {}),
    ...(fromYear ? { fromYear } : {}),
    ...(toYear ? { toYear } : {}),
  };
  return isActiveFilter(filter) ? filter : undefined;
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
  // Opened from a collection kept beside My games: its games go there.
  const target = useUi((state) => state.importTarget);
  const notify = useUi((state) => state.notify);
  const loadFen = useAnalysis((state) => state.loadFen);
  const openDocument = useAnalysis((state) => state.openDocument);
  const client = useQueryClient();

  // A paste on the page arrives here as the box's first content.
  const [text, setText] = useState(() => useUi.getState().importPrefill);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [filterDraft, setFilterDraft] = useState<FilterDraft>(EMPTY_FILTER);
  const filter = filterOf(filterDraft);
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
        const repositories = target
          ? await browserCollectionRepositories(browserCollectionKey(target.id))
          : await getRepositories();
        const summary = await importGames(file ?? text, repositories.games, {
          signal,
          onProgress,
          ...(filter ? { filter } : {}),
        });
        const filtered = summary.filtered ?? 0;
        const filterText = describeImportFilter(filter);

        invalidateGames(client);
        if (target) {
          await client.invalidateQueries({ queryKey: ['collections'] });
          await client.invalidateQueries({ queryKey: ['collection-games', target.id] });
        }

        if (summary.firstGame && target) {
          // A stored game opens by its id in My games; this one is elsewhere,
          // so it opens as source material named after its collection.
          openDocument({
            tree: summary.firstGame.tree,
            document: {
              kind: 'untitled',
              title: `${gameTitle(summary.firstGame)} (${target.name})`,
            },
          });
        } else if (summary.firstGame) {
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
            : summary.imported === 0 && filtered === summary.games
              ? `No game in that PGN matched the filter (${filterText}).`
              : summary.imported === 0
                ? `Every game in that PGN was already in ${target ? `“${target.name}”` : 'your database'}.`
                : `${summary.imported} game${summary.imported === 1 ? '' : 's'} added to ${target ? `“${target.name}”` : 'your database'}.`,
          detail: [
            filtered > 0 && summary.imported + summary.duplicates > 0
              ? `${filtered.toLocaleString()} game${filtered === 1 ? '' : 's'} left out by the filter (${filterText}).`
              : null,
            summary.duplicates > 0 ? `${summary.duplicates} duplicate(s) skipped.` : null,
            summary.indexedPositions > 0
              ? `${summary.indexedPositions.toLocaleString()} positions indexed.`
              : null,
            summary.refusedDetail ? summary.refusedDetail : null,
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
  }, [client, file, filter, notify, openDocument, runImport, setOpen, target, text]);

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
        // Above the phone's bottom navigation and the home bar.
        className="fixed right-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 w-[340px] md:bottom-[calc(2.5rem+env(safe-area-inset-bottom))] max-w-[calc(100vw-1.5rem)] rounded-[var(--radius-panel)] border border-line-strong bg-surface-1 p-3
          shadow-[var(--shadow-popover)]"
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
      title={target ? `Import games into “${target.name}”` : 'Import a game or position'}
      description={
        target
          ? `Paste a PGN or choose a file. Every game in it is added to ${target.name}, kept in this browser; My games is not changed.`
          : 'Paste a PGN or a FEN. The format is detected automatically, and every game in a PGN is added to your local database.'
      }
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
      <label className="mb-2 flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line bg-surface-1 px-3 py-2 text-xs text-secondary">
        <span className="min-w-0 truncate">
          {file ? `${file.name} · ${(file.size / 1_000_000).toFixed(1)} MB` : 'Choose a PGN file'}
        </span>
        <input
          type="file"
          accept=".pgn,application/x-chess-pgn,text/plain"
          disabled={busy}
          className="max-w-[230px] text-2xs file:mr-2 file:rounded-[var(--radius-control)] file:border file:border-line file:bg-surface-2 file:px-2 file:py-1 file:text-primary"
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
        className="h-56 w-full resize-none rounded-[var(--radius-control)] border border-line bg-surface-inset px-3 py-2 font-mono text-[11.5px] leading-relaxed text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60 read-only:opacity-60"
      />

      {kind === 'pgn' ? (
        <ImportFilterFields draft={filterDraft} onChange={setFilterDraft} disabled={busy} />
      ) : null}

      {storageWarning ? (
        <p className="mt-2 rounded-[var(--radius-control)] border border-caution/40 bg-caution/10 px-3 py-2 text-2xs text-secondary">
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

/**
 * Selective import, folded away until asked for: most imports want every
 * game, and the fields would be noise over the paste box. Opened, it says
 * plainly that a game which cannot be shown to match is left out.
 */
function ImportFilterFields({
  draft,
  onChange,
  disabled,
}: {
  readonly draft: FilterDraft;
  readonly onChange: (draft: FilterDraft) => void;
  readonly disabled: boolean;
}) {
  const active = isActiveFilter(filterOf(draft));
  const field =
    'h-7 rounded-[var(--radius-control)] border border-line bg-surface-inset px-2 text-xs text-primary outline-none focus:border-accent/60';
  const set = (patch: Partial<FilterDraft>) => onChange({ ...draft, ...patch });
  return (
    <details
      className="mt-2 rounded-[var(--radius-control)] border border-line px-3 py-2 text-xs"
      data-import-filter
    >
      <summary className="cursor-pointer text-secondary select-none">
        Keep only some games
        {active ? (
          <span className="ml-2 text-primary">— {describeImportFilter(filterOf(draft))}</span>
        ) : null}
      </summary>
      <fieldset disabled={disabled} className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="flex flex-wrap items-center gap-1.5 text-secondary">
          Rating at least
          <input
            inputMode="numeric"
            aria-label="Lowest rating"
            placeholder="2200"
            value={draft.minRating}
            onChange={(event) => set({ minRating: event.target.value })}
            className={`${field} w-16`}
          />
          <select
            aria-label="Whose rating"
            value={draft.ratingOf}
            onChange={(event) => set({ ratingOf: event.target.value as FilterDraft['ratingOf'] })}
            className={field}
          >
            <option value="both">for both players</option>
            <option value="either">for either player</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-secondary">
          Player
          <input
            aria-label="Player"
            placeholder="Carlsen, Magnus"
            value={draft.player}
            onChange={(event) => set({ player: event.target.value })}
            className={`${field} min-w-0 flex-1`}
          />
        </label>
        <label className="flex items-center gap-1.5 text-secondary">
          Played from
          <input
            inputMode="numeric"
            aria-label="From year"
            placeholder="2015"
            value={draft.fromYear}
            onChange={(event) => set({ fromYear: event.target.value })}
            className={`${field} w-16`}
          />
          to
          <input
            inputMode="numeric"
            aria-label="To year"
            placeholder="2024"
            value={draft.toYear}
            onChange={(event) => set({ toYear: event.target.value })}
            className={`${field} w-16`}
          />
        </label>
      </fieldset>
      <p className="mt-2 text-2xs text-tertiary">
        Read from each game&apos;s tags. A player is found by whole name, in either order. A game
        with no rating or no date is left out by a rating or year condition, because it cannot be
        shown to meet it.
      </p>
    </details>
  );
}
