'use client';

/**
 * Choosing a Syzygy directory, and seeing what it gives you.
 *
 * The whole setup is now a folder path. Before Phase 12 it was a folder path
 * *and* a separately-started `lila-tablebase` server, which is a reasonable
 * thing to ask of a developer and not of a chess player — it was the largest
 * remaining "you have to go and do something outside Kingfisher" left.
 *
 * The panel reports the two halves separately because they fail separately:
 * what is on disk, and whether anything can read it. A user with six-piece
 * tables and no compiler needs to be told the second thing rather than shown a
 * piece limit that is not real.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Check, Warning } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { companionClient } from '@/companion/session';
import { useUi } from '@/stores/ui-store';

export function TablebaseSettings() {
  const notify = useUi((state) => state.notify);
  const queryClient = useQueryClient();
  const [directory, setDirectory] = useState('');
  const [probe, setProbe] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ['tablebase-status'],
    retry: false,
    queryFn: async () => {
      const client = companionClient();
      if (!client) throw new Error('The companion is not connected.');
      return client.tablebaseStatus();
    },
  });

  const configure = useMutation({
    mutationFn: async (path: string) => {
      const client = companionClient();
      if (!client) throw new Error('The companion is not connected.');
      return client.configureTablebase(path);
    },
    onSuccess: (result) => {
      notify({
        tone: result.configured && result.available ? 'success' : 'info',
        message: result.configured
          ? result.available
            ? `Reading Syzygy tables up to ${result.largest} pieces.`
            : 'Directory saved, but nothing readable was opened.'
          : 'Tablebase directory cleared.',
        ...(result.reason ? { detail: result.reason } : {}),
      });
      setDirectory('');
      void queryClient.invalidateQueries({ queryKey: ['tablebase-status'] });
      void queryClient.invalidateQueries({ queryKey: ['tablebase'] });
    },
    onError: (error) =>
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That directory could not be set.',
      }),
  });

  /**
   * A real probe of a position whose answer is known.
   *
   * A rook against a bare king is won, and any working three-piece table says
   * so. Testing with a position whose answer the user can check themselves is
   * worth more than a green tick that only asserts a connection opened.
   */
  const test = useMutation({
    mutationFn: async () => {
      const client = companionClient();
      if (!client) throw new Error('The companion is not connected.');
      return client.probeTablebase('8/8/8/4k3/8/8/8/K2R4 w - - 0 1');
    },
    onSuccess: (result) => {
      const raw = result.result as { wdl?: number; dtz?: number; category?: string };
      const won = raw.wdl === 4 || raw.category === 'win';
      setProbe(
        won
          ? `Answered by the ${result.source === 'helper' ? 'local helper' : 'tablebase server'}: rook against a bare king is a win${
              raw.dtz ? `, DTZ ${raw.dtz}` : ''
            }.`
          : `Answered, but did not report a win for a rook against a bare king. That is wrong, and this source should not be trusted.`,
      );
    },
    onError: (error) => setProbe(error instanceof Error ? error.message : 'The probe failed.'),
  });

  const data = status.data;
  const helper = data?.helper;

  return (
    <section className="border-t border-line-subtle pt-3">
      <h3 className="text-xs text-primary">Tablebases</h3>
      <p className="mt-1 text-2xs leading-relaxed text-tertiary">
        Point Kingfisher at a folder of Syzygy files and it reads them itself — no second program to
        start. Without one, endgame evidence comes from the public Lichess service, and the board
        always says which answered.
      </p>

      {status.isError ? (
        <p className="mt-2 text-2xs text-tertiary">
          Pair the companion to use local tables. The remote tablebase works either way.
        </p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-y-1 text-[10.5px]">
            <dt className="text-tertiary">Directory</dt>
            <dd className="truncate text-right text-secondary" title={data?.path ?? undefined}>
              {data?.path ?? 'not set'}
            </dd>
            <dt className="text-tertiary">Files found</dt>
            <dd className="text-right text-secondary tabular">
              {data ? `${data.wdl.length} WDL · ${data.dtz.length} DTZ` : '—'}
            </dd>
            <dt className="text-tertiary">Largest complete set</dt>
            <dd className="text-right text-secondary tabular">
              {data?.maxPieces ? `${data.maxPieces} pieces` : 'none'}
            </dd>
            <dt className="text-tertiary">Local probe</dt>
            <dd className="flex items-center justify-end gap-1 text-right text-secondary">
              {data?.canProbe ? (
                <>
                  <Check className="h-3 w-3 text-positive" />
                  {data.prober === 'server' ? 'external server' : 'built in'}
                  {data.probeLimit ? ` · up to ${data.probeLimit} pieces` : ''}
                </>
              ) : (
                <>
                  <Warning className="h-3 w-3 text-caution" />
                  unavailable
                </>
              )}
            </dd>
            {helper ? (
              <>
                <dt className="text-tertiary">Probe helper</dt>
                <dd className="text-right text-secondary">
                  {helper.built
                    ? helper.running
                      ? `running${helper.restarts > 0 ? ` · ${helper.restarts} restarts` : ''}`
                      : 'built, not running'
                    : 'not built'}
                </dd>
              </>
            ) : null}
          </dl>

          {helper && !helper.built ? (
            <p className="mt-2 rounded-[4px] border border-line bg-surface-inset px-2.5 py-2 text-[10.5px] leading-relaxed text-secondary">
              The probe helper has not been built on this machine. Run{' '}
              <span className="font-mono">npm run tablebase:install</span> — it fetches
              Fathom&rsquo;s MIT-licensed decoder and compiles it. A machine with no C compiler
              cannot build it, and Kingfisher will keep using the remote tablebase.
            </p>
          ) : null}
          {helper?.reason ? (
            <p className="mt-2 text-[10.5px] leading-relaxed text-caution">{helper.reason}</p>
          ) : null}

          <label className="mt-3 block text-2xs text-tertiary">
            Syzygy directory
            <input
              value={directory}
              onChange={(event) => setDirectory(event.target.value)}
              placeholder={data?.path ?? '/Users/you/syzygy/3-4-5'}
              className="mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2.5 font-mono text-[11px] text-primary outline-none placeholder:text-tertiary/60 focus:border-accent/60"
            />
          </label>
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            {data?.path ? (
              <Button variant="danger" onClick={() => configure.mutate('')}>
                Clear
              </Button>
            ) : null}
            <Button
              onClick={() => void test.mutate()}
              disabled={!data?.canProbe || test.isPending}
              title="Probe a position whose answer is known: a rook against a bare king"
            >
              {test.isPending ? 'Testing…' : 'Test'}
            </Button>
            <Button
              variant="accent"
              disabled={!directory.trim() || configure.isPending}
              onClick={() => configure.mutate(directory.trim())}
            >
              {configure.isPending ? 'Opening…' : 'Use this directory'}
            </Button>
          </div>
          {probe ? (
            <p className="mt-2 text-[10.5px] leading-relaxed text-secondary" role="status">
              {probe}
            </p>
          ) : null}

          {data && data.maxPieces > 0 ? (
            <p className="mt-2 text-[10px] leading-relaxed text-tertiary">
              Material present: {data.wdl.slice(0, 12).join(', ')}
              {data.wdl.length > 12 ? ` and ${data.wdl.length - 12} more` : ''}.
              {data.dtz.length < data.wdl.length
                ? ` ${data.wdl.length - data.dtz.length} of these have no DTZ table, so distance-to-zero is unavailable for them.`
                : ''}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
