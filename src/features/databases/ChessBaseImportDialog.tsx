'use client';
/**
 * Import a ChessBase database.
 *
 * Takes either a .cbv archive or the files of a database chosen together
 * (the .cbh, .cbg and their siblings share a name). The files are read in
 * the browser and never written to; the games go into a Kingfisher
 * collection with their source named on every game.
 */
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useCompanionStatus } from '@/companion/useCompanion';
import { databaseName } from '@/database/chessbase/database';
import type { ChessBaseInspection } from '@/database/chessbase/types';
import { invalidateGames } from '@/features/persistence/queries';
import {
  inspectSource,
  useChessBaseImport,
  type ChessBaseSource,
  type ImportDestination,
} from '@/stores/chessbase-import-store';

const ACCEPT = '.cbv,.cbh,.cbg,.cba,.cbp,.cbt,.cbc,.cbs,.cbe,.cbj';
const EXTENSIONS = new Set(['cbh', 'cbg', 'cba', 'cbp', 'cbt', 'cbc', 'cbs', 'cbe', 'cbj']);

/** What was chosen, and how to read it. Throws when the choice is not a database. */
function describeChoice(files: readonly File[]): {
  readonly name: string;
  readonly kind: 'archive' | 'files';
  readonly load: () => Promise<ChessBaseSource>;
} {
  const archive = files.find((file) => /\.cbv$/i.test(file.name));
  if (archive) {
    if (files.length > 1)
      throw new Error('Choose one archive, or the files of one database — not both.');
    return {
      name: archive.name.replace(/\.cbv$/i, ''),
      kind: 'archive',
      load: async () => ({
        name: archive.name.replace(/\.cbv$/i, ''),
        archive: await archive.arrayBuffer(),
      }),
    };
  }
  const relevant = files.filter((file) =>
    EXTENSIONS.has(file.name.split('.').pop()?.toLowerCase() ?? ''),
  );
  const name = databaseName(relevant.map((file) => file.name));
  if (!name)
    throw new Error('Choose the files of one database: they share a name and differ in extension.');
  const have = new Set(relevant.map((file) => file.name.split('.').pop()!.toLowerCase()));
  if (!have.has('cbh') || !have.has('cbg'))
    throw new Error(`${name} needs at least its .cbh and .cbg files; choose them together.`);
  return {
    name,
    kind: 'files',
    load: async () => {
      const buffers: Record<string, ArrayBuffer> = {};
      for (const file of relevant)
        buffers[file.name.split('.').pop()!.toLowerCase()] = await file.arrayBuffer();
      return { name, files: buffers };
    },
  };
}

export function ChessBaseImportDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const job = useChessBaseImport();
  const companion = useCompanionStatus();
  const paired = companion.isSuccess && companion.data !== null;
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<ReturnType<typeof describeChoice> | null>(null);
  const [found, setFound] = useState<ChessBaseInspection | null>(null);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState<ImportDestination['kind']>('local');
  const [error, setError] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const inspectAbort = useRef<AbortController | null>(null);
  useEffect(() => () => inspectAbort.current?.abort(), []);

  const choose = async (files: readonly File[]) => {
    setError('');
    setFound(null);
    setChoice(null);
    if (files.length === 0) return;
    let described: ReturnType<typeof describeChoice>;
    try {
      described = describeChoice(files);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return;
    }
    setChoice(described);
    setName(described.name);
    setInspecting(true);
    inspectAbort.current?.abort();
    const controller = new AbortController();
    inspectAbort.current = controller;
    try {
      const { worker, inspection } = await inspectSource(await described.load(), controller.signal);
      worker.terminate();
      setFound(inspection);
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === 'AbortError'))
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setInspecting(false);
    }
  };

  const run = async () => {
    if (!choice || !found) return;
    await job.run(choice.load, name.trim() || choice.name, { kind: destination }, found.games);
    invalidateGames(queryClient);
    await queryClient.invalidateQueries({ queryKey: ['collections'] });
    await queryClient.invalidateQueries({ queryKey: ['companion', 'status'] });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Import ChessBase database"
      description="Read a ChessBase database (.cbh files or a .cbv archive) into a Kingfisher collection. The files are only read, never changed."
      footer={
        <>
          <Button onClick={onClose}>{job.running ? 'Background' : 'Done'}</Button>
          {job.running ? (
            <Button onClick={job.cancel}>Stop import</Button>
          ) : (
            <Button
              variant="accent"
              disabled={!found?.supported || !found.games || inspecting}
              onClick={() => void run()}
            >
              Import {found?.games ? found.games.toLocaleString() : ''} games
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3 p-4 text-xs text-secondary">
        <label className="flex items-center justify-between gap-3 rounded-[4px] border border-line bg-surface-1 px-3 py-2">
          <span className="min-w-0 truncate text-secondary">
            {choice
              ? `${choice.name} · ${choice.kind === 'archive' ? '.cbv archive' : 'database files'}`
              : 'Choose a .cbv archive, or select the .cbh, .cbg and sibling files together'}
          </span>
          <input
            type="file"
            aria-label="ChessBase files"
            accept={ACCEPT}
            multiple
            disabled={job.running || inspecting}
            className="max-w-[230px] text-2xs file:mr-2 file:rounded-[3px] file:border file:border-line file:bg-surface-2 file:px-2 file:py-1 file:text-primary"
            onChange={(event) => void choose([...(event.target.files ?? [])])}
          />
        </label>
        <p className="text-tertiary">
          A ChessBase database is several files with one name: <code>name.cbh</code> (games),{' '}
          <code>name.cbg</code> (moves), <code>name.cba</code> (annotations), <code>name.cbp</code>{' '}
          (players) and so on. Select them all, or the <code>.cbv</code> archive ChessBase exports.
        </p>
        {inspecting ? <p role="status">Reading the database…</p> : null}
        {error ? (
          <p role="alert" className="text-negative">
            {error}
          </p>
        ) : null}
        {found ? (
          <div
            className="space-y-2 rounded border border-line p-3"
            data-testid="chessbase-inspection"
          >
            <p className="font-medium text-primary">ChessBase database: {found.name}</p>
            <p>
              {found.games.toLocaleString()} games
              {found.texts ? ` · ${found.texts} text entries (not imported)` : ''}
              {found.deleted ? ` · ${found.deleted} marked deleted (not imported)` : ''} ·{' '}
              {found.players.toLocaleString()} players · {found.tournaments.toLocaleString()} events
              · {(found.sizeBytes / 1e6).toFixed(1)} MB
            </p>
            {found.firstDate || found.lastDate ? (
              <p>
                {found.firstDate ?? '?'} – {found.lastDate ?? '?'}
              </p>
            ) : null}
            {found.sources.length ? (
              <p>
                Sources named in the database: {found.sources.slice(0, 6).join(', ')}
                {found.sources.length > 6 ? ` and ${found.sources.length - 6} more` : ''}
              </p>
            ) : null}
            <label className="block">
              Collection name
              <input
                aria-label="Imported collection name"
                className="mt-1 block w-full rounded border border-line bg-surface-2 p-2 text-primary"
                disabled={job.running}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <fieldset className="space-y-1">
              <legend className="text-tertiary">Where the games go</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="chessbase-destination"
                  checked={destination === 'local'}
                  onChange={() => setDestination('local')}
                  disabled={job.running}
                />
                My games (this browser)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="chessbase-destination"
                  checked={destination === 'companion'}
                  onChange={() => setDestination('companion')}
                  disabled={job.running || !paired}
                />
                A new collection in the companion
                {paired ? '' : ' (pair the companion in Settings first)'}
              </label>
            </fieldset>
          </div>
        ) : null}
        <p className="text-tertiary">
          Every game keeps the database&apos;s own source and annotator as PGN tags, and a{' '}
          <code>ChessBaseFile</code> tag naming the file it was read from. Moves, variations,
          comments, symbols, coloured squares, arrows and clock times are imported; medals, training
          questions and embedded media have no place in a PGN and are counted below. Chess960 games
          and games in an encoding Kingfisher does not read are reported and skipped.
        </p>
        {job.message ? (
          <div
            role="status"
            className="space-y-1 border-t border-line pt-3"
            data-testid="chessbase-progress"
          >
            <p>{job.message}</p>
            <p>
              {job.examined.toLocaleString()} / {job.total.toLocaleString()} examined ·{' '}
              {job.imported.toLocaleString()} imported · {job.duplicates.toLocaleString()}{' '}
              duplicates · {job.rejected.toLocaleString()} skipped
            </p>
            {job.issues.length ? (
              <details>
                <summary>What the PGN could not hold</summary>
                <ul>
                  {job.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            {job.failures.length ? (
              <details>
                <summary>Skipped games (first 20)</summary>
                <ul>
                  {job.failures.map((failure) => (
                    <li key={failure}>{failure}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
