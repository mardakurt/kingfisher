'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { PathField } from '@/components/ui/PathField';
import { companionClient } from '@/companion/session';
import type { EnCroissantInspection } from '@/database/encroissant/types';
import { useEnCroissantImport } from '@/stores/en-croissant-import-store';

export function EnCroissantImportDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const job = useEnCroissantImport();
  const [path, setPath] = useState(job.path);
  const [name, setName] = useState('En Croissant import');
  const [found, setFound] = useState<EnCroissantInspection | null>(null);
  const [error, setError] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const queryClient = useQueryClient();
  const inspect = async () => {
    setError('');
    setFound(null);
    setInspecting(true);
    try {
      const client = companionClient();
      if (!client) throw new Error('Pair the companion in Settings → Companion first.');
      const result = await client.inspectEnCroissant(path.trim());
      setFound(result);
      if (result.title) setName(result.title);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setInspecting(false);
    }
  };
  const run = async () => {
    if (!found?.supported || !found.games) return;
    await job.run(found.file, name.trim() || 'En Croissant import', found.games);
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
        <p className="text-tertiary">
          Enter the full path on the computer running the companion. Pages are decoded in a worker;
          you can keep using the workspace during import.
        </p>
        <Button disabled={job.running || inspecting || !path.trim()} onClick={() => void inspect()}>
          {inspecting ? 'Inspecting…' : 'Inspect database'}
        </Button>
        {error ? (
          <p role="alert" className="text-negative">
            {error}
          </p>
        ) : null}
        {found ? (
          <div className="space-y-2 rounded border border-line p-3">
            <p className="font-medium text-primary">
              {found.supported ? 'En Croissant database detected' : found.reason}
            </p>
            <p>
              {found.games?.toLocaleString()} games · format {found.version ?? 'unknown'} ·{' '}
              {(found.sizeBytes / 1e6).toFixed(1)} MB
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
