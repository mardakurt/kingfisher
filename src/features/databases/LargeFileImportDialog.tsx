'use client';

/**
 * Importing a large file into a companion collection (Phase 85): a PGN, a
 * Lichess `.pgn.zst` archive or a ChessBase `.cbh` database of millions of
 * games, read by the companion itself from the file chosen in the Mac's own
 * dialog (`companion/src/import-jobs.mjs`). The browser cannot hold such a
 * file; the companion streams it and never writes to it. The person names the
 * licence they hold it under, and the collection keeps that with the file's
 * name and size.
 */

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { CompanionFileImport } from '@/companion/client';
import { companionClient } from '@/companion/session';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { desktop } from '@/desktop/bridge';
import { useUi } from '@/stores/ui-store';

import { formatBytes } from './CollectionList';

const FINISHED = new Set(['done', 'stopped', 'failed']);

export function LargeFileImportDialog({ onClose }: { readonly onClose: () => void }) {
  const notify = useUi((state) => state.notify);
  const queryClient = useQueryClient();
  const bridge = desktop();
  const [path, setPath] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [licence, setLicence] = useState('');
  const [job, setJob] = useState<{ id: string; key: string } | null>(null);
  const [status, setStatus] = useState<CompanionFileImport | null>(null);

  useEffect(() => {
    if (!job) return;
    const client = companionClient();
    if (!client) return;
    let live = true;
    const poll = async () => {
      try {
        const next = await client.importFileStatus(job.id);
        if (!live) return;
        setStatus(next);
        if (FINISHED.has(next.phase)) {
          void queryClient.invalidateQueries({ queryKey: ['collections'] });
          void queryClient.invalidateQueries({ queryKey: ['companion'] });
          return;
        }
      } catch {
        /* The next poll asks again. */
      }
      if (live) timer = window.setTimeout(() => void poll(), 1_000);
    };
    let timer = window.setTimeout(() => void poll(), 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [job, queryClient]);

  const choose = async () => {
    const choice = await bridge?.chooseFile({
      title: 'A PGN, a .pgn.zst archive or a ChessBase .cbh',
      extensions: ['pgn', 'zst', 'gz', 'cbh'],
    });
    if (!choice || choice.canceled || !choice.path) return;
    setPath(choice.path);
    if (!name) {
      setName(
        (choice.path.split('/').pop() ?? 'Imported')
          .replace(/\.(pgn\.zst|pgn\.gz|pgn|cbh)$/i, '')
          .slice(0, 80),
      );
    }
  };

  const start = async () => {
    const client = companionClient();
    if (!client || !path) return;
    try {
      const created = await client.createDatabase(name.trim() || 'Imported');
      const started = await client.importFile(created.key, path, {
        ...(licence.trim() ? { licence: licence.trim() } : {}),
      });
      setJob({ id: started.jobId, key: created.key });
    } catch (error) {
      notify({
        tone: 'error',
        message: 'The import could not start.',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const running = job && (!status || !FINISHED.has(status.phase));
  const seconds = (status?.elapsedMs ?? 0) / 1000;
  return (
    <Dialog
      open
      onClose={running ? () => undefined : onClose}
      title="Import a large file"
      description="For millions of games: the companion reads the file from disk, streams it, and never writes to it. The games go into a new collection."
      width="w-[560px]"
      footer={
        <>
          {running ? (
            <Button
              onClick={() => {
                if (job) void companionClient()?.cancelImportFile(job.id);
              }}
            >
              Stop
            </Button>
          ) : (
            <Button onClick={onClose}>Close</Button>
          )}
          {!job ? (
            <Button
              variant="accent"
              disabled={!path || !companionClient()}
              onClick={() => void start()}
            >
              Import
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-3 text-sm" data-large-import>
        {!bridge ? (
          <p className="text-secondary">
            A file this size is read by the companion from its place on disk, which needs the Mac
            application&apos;s file dialog. In a browser, import through Import PGN.
          </p>
        ) : null}
        {bridge && !job ? (
          <>
            <div className="flex items-center gap-2">
              <Button onClick={() => void choose()}>Choose a file…</Button>
              <span
                className="min-w-0 flex-1 truncate text-xs text-secondary"
                data-large-import-path
              >
                {path ?? 'No file chosen'}
              </span>
            </div>
            <label className="block text-xs text-secondary">
              Collection name
              <input
                className="mt-1 h-8 w-full rounded-[6px] border border-line bg-surface-inset px-2 text-sm text-primary"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="block text-xs text-secondary">
              The licence you hold it under (kept with the collection)
              <input
                className="mt-1 h-8 w-full rounded-[6px] border border-line bg-surface-inset px-2 text-sm text-primary"
                placeholder="e.g. Mega Database 2026, my licence · Lichess database, CC0"
                value={licence}
                onChange={(event) => setLicence(event.target.value)}
              />
            </label>
          </>
        ) : null}
        {job && status ? (
          <div
            className="space-y-1 text-xs text-secondary tabular"
            data-large-import-status={status.phase}
          >
            <p>
              {status.phase === 'indexing'
                ? 'Building the indexes and the explorer totals once, over every game…'
                : status.phase === 'done'
                  ? 'Done.'
                  : status.phase === 'stopped'
                    ? 'Stopped; the games read so far are in the collection.'
                    : status.phase === 'failed'
                      ? `Failed: ${status.error ?? 'unknown error'}`
                      : 'Importing…'}
            </p>
            <p>
              {(status.imported ?? 0).toLocaleString()} games imported of{' '}
              {(status.read ?? 0).toLocaleString()} read
              {status.duplicates ? ` · ${status.duplicates.toLocaleString()} already there` : ''}
              {status.rejected ? ` · ${status.rejected.toLocaleString()} could not be read` : ''}
            </p>
            <p>
              {seconds > 0 ? `${Math.round(seconds).toLocaleString()} s · ` : ''}
              {seconds > 0 && status.imported
                ? `${Math.round(status.imported / seconds).toLocaleString()} games a second · `
                : ''}
              {status.bytes ? `${formatBytes(status.bytes)} file · ` : ''}
              {status.peakRssBytes ? `peak memory ${formatBytes(status.peakRssBytes)}` : ''}
              {status.workers ? ` · ${status.workers} workers` : ''}
            </p>
            {status.failures?.length ? (
              <p className="text-caution">
                For example, game {status.failures[0]!.id}: {status.failures[0]!.reason}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
