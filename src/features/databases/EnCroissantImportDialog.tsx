'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { PathField } from '@/components/ui/PathField';
import { companionClient } from '@/companion/session';
import { useCompanionStatus } from '@/companion/useCompanion';
import type {
  BrowserReaderRequest,
  BrowserReaderResponse,
} from '@/database/encroissant/browser-reader-protocol';
import type { BrowserEnCroissantInspection } from '@/database/encroissant/sqlite-read';
import type { EnCroissantInspection } from '@/database/encroissant/types';
import { useEnCroissantImport } from '@/stores/en-croissant-import-store';

/**
 * What was found, whichever way it was read: a file chosen here, or a path
 * the companion opened.
 */
type Found =
  | ({ readonly via: 'browser'; readonly file: File } & BrowserEnCroissantInspection)
  | ({ readonly via: 'companion' } & EnCroissantInspection);

/** Inspect a chosen file in the reader worker, then let the worker go. */
function inspectInBrowser(file: File): Promise<BrowserEnCroissantInspection> {
  const worker = new Worker(
    new URL('../../database/encroissant/browser-reader.worker.ts', import.meta.url),
    { type: 'module' },
  );
  return new Promise<BrowserEnCroissantInspection>((resolve, reject) => {
    worker.onerror = (event) => reject(new Error(event.message || 'The file could not be read.'));
    worker.onmessage = (event: MessageEvent<BrowserReaderResponse>) => {
      if (event.data.type === 'opened') resolve(event.data.inspection);
      else if (event.data.type === 'error') reject(new Error(event.data.error));
      else reject(new Error('The file could not be read.'));
    };
    worker.postMessage({ type: 'open', file } satisfies BrowserReaderRequest);
  }).finally(() => worker.terminate());
}

export function EnCroissantImportDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const job = useEnCroissantImport();
  const companion = useCompanionStatus();
  const paired = companion.isSuccess && companion.data !== null;
  const [path, setPath] = useState(job.path.startsWith('browser:') ? '' : job.path);
  const [name, setName] = useState('En Croissant import');
  const [found, setFound] = useState<Found | null>(null);
  const [error, setError] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const queryClient = useQueryClient();

  const inspectFile = async (file: File | undefined) => {
    setError('');
    setFound(null);
    if (!file) return;
    setInspecting(true);
    try {
      const result = await inspectInBrowser(file);
      setFound({ via: 'browser', file, ...result });
      if (result.title) setName(result.title);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setInspecting(false);
    }
  };

  const inspectPath = async () => {
    setError('');
    setFound(null);
    setInspecting(true);
    try {
      const client = companionClient();
      if (!client) throw new Error('Pair the companion in Settings → Companion first.');
      const result = await client.inspectEnCroissant(path.trim());
      setFound({ via: 'companion', ...result });
      if (result.title) setName(result.title);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setInspecting(false);
    }
  };

  const run = async () => {
    if (!found?.supported || !found.games) return;
    const named = name.trim() || 'En Croissant import';
    if (found.via === 'browser') await job.runInBrowser(found.file, named, found.games);
    else await job.run(found.file, named, found.games);
    await queryClient.invalidateQueries({ queryKey: ['collections'] });
    await queryClient.invalidateQueries({ queryKey: ['companion', 'status'] });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Import En Croissant database"
      description="Read an existing database into a Kingfisher collection. The source file stays unchanged."
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
              Import as Kingfisher collection
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3 p-4 text-xs text-secondary">
        <label className="block">
          <span className="text-primary">Choose the database file</span>
          <input
            type="file"
            aria-label="En Croissant database file"
            accept=".db3,.db,.sqlite,application/vnd.sqlite3,application/x-sqlite3"
            disabled={job.running || inspecting}
            className="mt-1 block w-full text-2xs file:mr-2 file:rounded-[var(--radius-control)] file:border file:border-line file:bg-surface-2 file:px-2 file:py-1 file:text-primary"
            onChange={(event) => void inspectFile(event.target.files?.[0])}
          />
        </label>
        <p className="text-tertiary">
          Read here, in this browser, and imported into a new collection kept in this browser.
          Nothing to install. En Croissant keeps its databases in its application data folder, as
          files ending in .db3.
        </p>
        {paired ? (
          <details>
            <summary className="cursor-pointer text-secondary">
              Or read it by path through the companion, into a SQLite collection
            </summary>
            <div className="mt-2 space-y-2">
              <PathField
                label="En Croissant file path"
                dialogTitle="Choose an En Croissant database"
                extensions={['db3', 'sqlite', 'db']}
                value={path}
                disabled={job.running || inspecting}
                onChange={(next) => {
                  setPath(next);
                  setFound(null);
                }}
                placeholder="/Users/you/Databases/games.db3"
              />
              <Button
                disabled={job.running || inspecting || !path.trim()}
                onClick={() => void inspectPath()}
              >
                {inspecting ? 'Inspecting…' : 'Inspect database'}
              </Button>
            </div>
          </details>
        ) : null}
        {inspecting ? <p role="status">Reading the database…</p> : null}
        {error ? (
          <p role="alert" className="text-negative">
            {error}
          </p>
        ) : null}
        {found ? (
          <div className="space-y-2 rounded border border-line p-3" data-en-croissant-found>
            <p className="font-medium text-primary">
              {found.supported ? 'En Croissant database detected' : found.reason}
            </p>
            <p>
              {found.games?.toLocaleString()} games · format {found.version ?? 'unknown'} ·{' '}
              {((found.via === 'browser' ? found.file.size : found.sizeBytes) / 1e6).toFixed(1)} MB
            </p>
            <p>
              {found.firstDate} – {found.lastDate}
            </p>
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
          </div>
        ) : null}
        <p className="text-tertiary">
          Imports stored headers, moves, comments, annotations, variations and standard FEN starts.
          Extra PGN tags that En Croissant did not store cannot be recovered. Unreadable games are
          reported and skipped.
        </p>
        {job.message ? (
          <div role="status" className="space-y-1 border-t border-line pt-3">
            <p>{job.message}</p>
            <p>
              {job.examined.toLocaleString()} / {job.total.toLocaleString()} examined ·{' '}
              {job.imported.toLocaleString()} imported · {job.duplicates.toLocaleString()}{' '}
              duplicates · {job.rejected.toLocaleString()} rejected
            </p>
            {job.failures.length ? (
              <details>
                <summary>Rejected game details (first 20)</summary>
                <ul>
                  {job.failures.map((failure, i) => (
                    <li key={i}>{failure}</li>
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
