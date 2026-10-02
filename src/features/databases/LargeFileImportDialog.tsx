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

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

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
  const [directory, setDirectory] = useState<string | undefined>();
  const [maxGiB, setMaxGiB] = useState(10);
  const [minRating, setMinRating] = useState(0);
  const [excludeBots, setExcludeBots] = useState(true);
  const [sha256, setSha256] = useState('');
  const [target, setTarget] = useState('');
  const [keepPositions, setKeepPositions] = useState(true);
  const [selectedJob, setJob] = useState<{ id: string; key: string } | null>(null);
  const [status, setStatus] = useState<CompanionFileImport | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const imports = useQuery({
    queryKey: ['companion-file-imports'],
    retry: false,
    queryFn: async () => {
      const client = companionClient();
      if (!client) return [];
      return (await client.importFileJobs()).jobs;
    },
  });
  const job = useMemo(() => {
    if (selectedJob) return selectedJob;
    const active = imports.data?.find((entry) => !FINISHED.has(entry.status.phase));
    return active ? { id: active.id, key: active.key } : null;
  }, [imports.data, selectedJob]);

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
        setConnectionError(null);
        if (FINISHED.has(next.phase)) {
          void queryClient.invalidateQueries({ queryKey: ['collections'] });
          void queryClient.invalidateQueries({ queryKey: ['companion'] });
          void queryClient.invalidateQueries({ queryKey: ['collection-sources'] });
          void queryClient.invalidateQueries({ queryKey: ['collection-updates'] });
          void queryClient.invalidateQueries({ queryKey: ['collection-games'] });
          void queryClient.invalidateQueries({ queryKey: ['explorer'] });
          return;
        }
      } catch (error) {
        if (live)
          setConnectionError(
            error instanceof Error ? error.message : 'The companion did not answer.',
          );
        /* Keep the last evidence and retry while the companion reconnects. */
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
      const created = target
        ? { key: target }
        : await client.createDatabase(name.trim() || 'Imported', 'postings', directory);
      const started = await client.importFile(created.key, path, {
        ...(licence.trim() ? { licence: licence.trim() } : {}),
        ...(sha256.trim() ? { sha256: sha256.trim() } : {}),
        maxBytes: Math.floor(maxGiB * 1024 ** 3),
        keepPositions,
        minRating,
        excludeBots,
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
      onClose={onClose}
      title="Import a large file"
      description="For millions of games: the companion reads the file from disk, streams it, and never writes to it. Games go into the chosen collection. You can close this dialog while the companion keeps importing."
      width="w-[560px]"
      footer={
        <>
          {running ? (
            <>
              <Button onClick={onClose}>Keep importing in background</Button>
              <Button
                onClick={() => {
                  if (job)
                    void companionClient()
                      ?.cancelImportFile(job.id)
                      .catch((error: unknown) =>
                        setConnectionError(
                          error instanceof Error ? error.message : 'The companion did not answer.',
                        ),
                      );
                }}
              >
                Stop
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>Close</Button>
          )}
          {!job ? (
            <Button
              variant="accent"
              disabled={
                !path ||
                !companionClient() ||
                !Number.isFinite(maxGiB) ||
                !Number.isInteger(minRating) ||
                minRating < 0 ||
                minRating > 4000 ||
                maxGiB < 1 ||
                (!!sha256.trim() && !/^[a-f0-9]{64}$/i.test(sha256.trim()))
              }
              onClick={() => void start()}
            >
              Import
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-3 text-sm" data-large-import>
        {imports.data?.length ? (
          <label className="block">
            Recent companion imports
            <select
              aria-label="Recent companion imports"
              value={job?.id ?? ''}
              onChange={(event) => {
                const selected = imports.data?.find((entry) => entry.id === event.target.value);
                setJob(selected ? { id: selected.id, key: selected.key } : null);
                setStatus(selected?.status ?? null);
              }}
            >
              <option value="">New import</option>
              {imports.data.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {(entry.status.file ?? 'Archive').split(/[\\/]/).pop()} · {entry.status.phase}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {imports.error ? <p role="alert">{imports.error.message}</p> : null}
        {connectionError ? (
          <p role="alert">
            {connectionError} Last recorded progress is retained; reconnect the companion.
          </p>
        ) : null}
        <p className="text-secondary">
          Reopen this dialog after navigation or reload to recover a running import. The companion
          must still be running. After a companion restart, reimport the source to retain committed
          games through deduplication.
        </p>
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
            <Button
              onClick={() =>
                void bridge
                  .chooseDirectory({
                    title: 'Choose collection storage (an external drive is recommended)',
                  })
                  .then((choice) => {
                    if (!choice.canceled && choice.path) setDirectory(choice.path);
                  })
              }
            >
              Choose storage folder…
            </Button>
            <p>
              {directory ?? 'Companion data directory'}. The archive stays where you put it; the new
              compact index and game records go here.
            </p>
            <label className="block">
              Collection disk limit (GiB)
              <input
                aria-label="Collection disk limit"
                type="number"
                min={1}
                max={1000}
                value={maxGiB}
                onChange={(event) => setMaxGiB(Number(event.target.value))}
              />
            </label>
            <p>
              Imports stop between batches at the disk limit or a 2 GiB free-space reserve. Index
              finalisation and a batch can exceed the limit; leave headroom.
            </p>
            <label className="block">
              <input
                type="checkbox"
                checked={keepPositions}
                onChange={(event) => setKeepPositions(event.target.checked)}
              />{' '}
              Index all positions (compact; supports the Explorer)
            </label>
            <label>
              Minimum rating for both players (PGN archives)
              <input
                aria-label="Archive rating floor"
                type="number"
                min={0}
                max={4000}
                value={minRating}
                onChange={(event) => setMinRating(Number(event.target.value))}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={excludeBots}
                onChange={(event) => setExcludeBots(event.target.checked)}
              />{' '}
              Exclude games explicitly tagged BOT (PGN archives)
            </label>
            <p>
              Rating 0 retains unrated games. A positive floor requires both ratings. Filtered PGNs
              are skipped before parsing, keeping high-rated online populations manageable.
            </p>
            <p>
              Without position indexing, game search remains available; the Explorer cannot query
              these games. Compact indexes do not support pawn-structure or positional-claim
              searches.
            </p>
            <label className="block">
              Existing companion collection key (optional, to add an update)
              <input
                aria-label="Update collection key"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              />
            </label>
            <label className="block">
              Publisher archive SHA-256 (optional)
              <input
                aria-label="Archive checksum"
                value={sha256}
                onChange={(event) => setSha256(event.target.value)}
              />
            </label>
            <p>
              With a checksum, Kingfisher verifies the entire selected archive before importing.
              Repeated games are deduplicated. Save a collection backup before applying an update if
              you need to roll it back.
            </p>
            <p>
              <a href="https://database.lichess.org/" target="_blank" rel="noreferrer">
                Lichess open database
              </a>{' '}
              · CC0 standard games, including computer evaluations where available. Download a month
              and its published SHA-256 to your chosen drive. These are online games and engine
              annotations, not an annotated master-game collection.
            </p>
            <label className="block text-xs text-secondary">
              Collection name
              <input
                className="mt-1 h-8 w-full rounded-[var(--radius-control)] border border-line bg-surface-inset px-2 text-sm text-primary"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="block text-xs text-secondary">
              The licence you hold it under (kept with the collection)
              <input
                className="mt-1 h-8 w-full rounded-[var(--radius-control)] border border-line bg-surface-inset px-2 text-sm text-primary"
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
              {status.phase === 'verifying'
                ? 'Checking the archive against the supplied SHA-256 before any writes…'
                : status.phase === 'indexing'
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
              {status.filtered
                ? ` · ${status.filtered.toLocaleString()} excluded by archive header filters`
                : ''}
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
            {status.coverage ? (
              <p>
                Accepted archive coverage (includes duplicates):{' '}
                {status.coverage.annotated.toLocaleString()} with comments, symbols or variations ·{' '}
                {status.coverage.evaluated.toLocaleString()} with evaluations ·{' '}
                {status.coverage.dated.toLocaleString()} dated ·{' '}
                {status.coverage.rated.toLocaleString()} with both ratings.
              </p>
            ) : null}
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
