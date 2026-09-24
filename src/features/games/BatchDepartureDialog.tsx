'use client';

/**
 * Where the selected games leave a source — ChessBase's Novelty Annotation
 * over a selection (Phase 85), with the rules of the one-game version
 * (`src/theory/departure.ts`): a departure is a fact about the population
 * named, never a "novelty", and the answers that are not departures are
 * reported as themselves.
 *
 * One job with progress and Stop. The report lists every game; the games that
 * left the source can be saved, with the fact written into each, as a new
 * study. The stored games are not changed — Kingfisher never rewrites a
 * stored game in place.
 */

import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useDatabaseProviders } from '@/database/use-database-providers';
import { useExplorerSource } from '@/features/explorer/useExplorerSource';
import { gameTitle } from '@/persistence/describe';
import { getRepositories } from '@/persistence/repositories';
import type { GameId } from '@/persistence/types';
import { useSourcesFor } from '@/reference/sources';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';
import { DEPARTURE_MOVE_LIMIT } from '@/theory/departure';
import {
  annotatedCopies,
  findDepartures,
  type BatchGame,
  type BatchReport,
} from '@/theory/departure-batch';

const KIND_LABEL = {
  left: 'left',
  uncertain: 'maybe left',
  'past-depth': 'past its depth',
  'not-in-source': 'not in source',
  followed: 'never left',
} as const;

export function BatchDepartureDialog({
  ids,
  onClose,
}: {
  readonly ids: readonly GameId[];
  readonly onClose: () => void;
}) {
  const notify = useUi((state) => state.notify);
  const queryClient = useQueryClient();
  const preferredId = usePreferences((state) => state.explorerSourceId);
  const chosen = useExplorerSource(preferredId);
  const providers = useDatabaseProviders();
  const sources = useSourcesFor('explorer');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const provider =
    providers.find((entry) => entry.id === sourceId) ??
    (chosen.kind === 'ready' ? chosen.provider : undefined);
  const depthLimit = sources.find((entry) => entry.id === provider?.id)?.maxPositionPly ?? null;

  const [games, setGames] = useState<readonly BatchGame[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<BatchReport | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const left = useMemo(() => (report ? annotatedCopies(games, report) : []), [games, report]);

  const run = async () => {
    if (!provider) return;
    setRunning(true);
    setReport(null);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const repositories = await getRepositories();
      const records = (await repositories.games.getMany(ids)).map((game) => ({
        id: game.id,
        title: gameTitle(game),
        tree: game.tree,
      }));
      setGames(records);
      setProgress({ done: 0, total: records.length });
      const result = await findDepartures({
        games: records,
        source: provider.name,
        depthLimit,
        signal: abort.signal,
        explore: (fen, signal) =>
          provider.explore({ fen, filters: {}, limit: DEPARTURE_MOVE_LIMIT }, signal),
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setReport(result);
    } catch (error) {
      notify({
        tone: 'error',
        message: `${provider.name} could not be read.`,
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRunning(false);
      controller.current = null;
    }
  };

  const save = async () => {
    if (!report || left.length === 0) return;
    setSaving(true);
    try {
      const repositories = await getRepositories();
      const study = await repositories.studies.create({
        title: `Where ${left.length === 1 ? 'a game leaves' : `${left.length} games leave`} ${report.source}`,
        description: `Each chapter is a copy of a stored game with the departure written in, against ${report.source}. The stored games are unchanged.`,
      });
      for (const game of left) {
        await repositories.studies.createChapter({
          studyId: study.id,
          title: game.title,
          tree: game.tree,
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['studies'] });
      notify({
        tone: 'success',
        message: `Saved ${left.length} annotated ${left.length === 1 ? 'copy' : 'copies'} as the study “${study.title}”.`,
      });
      onClose();
    } catch (error) {
      notify({
        tone: 'error',
        message: 'The study could not be saved.',
        detail: error instanceof Error ? error.message : String(error),
      });
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={running ? () => controller.current?.abort() : onClose}
      title="Where the games leave the source"
      description={`${ids.length} selected ${ids.length === 1 ? 'game' : 'games'}, walked against one population until each plays a move none of its games played. A departure is a fact about that source, not a novelty.`}
      width="w-[680px]"
      footer={
        <>
          {running ? (
            <Button onClick={() => controller.current?.abort()} data-batch-stop>
              Stop
            </Button>
          ) : (
            <Button onClick={onClose}>Close</Button>
          )}
          {report && left.length > 0 ? (
            <Button disabled={saving} onClick={() => void save()} data-batch-save>
              Save {left.length} annotated {left.length === 1 ? 'copy' : 'copies'} as a study
            </Button>
          ) : null}
          <Button
            variant="accent"
            disabled={running || !provider}
            onClick={() => void run()}
            data-batch-run
          >
            {report ? 'Run again' : 'Find departures'}
          </Button>
        </>
      }
    >
      <div className="space-y-3" data-batch-departure>
        <label className="block text-xs text-secondary">
          Against
          <select
            aria-label="Departure source"
            className="mt-1 h-8 w-full rounded-[6px] border border-line bg-surface-inset px-2 text-sm text-primary"
            value={provider?.id ?? ''}
            disabled={running}
            onChange={(event) => setSourceId(event.target.value)}
          >
            {provider ? null : <option value="">Loading sources…</option>}
            {providers.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        {progress && (running || report) ? (
          <p className="text-xs text-secondary tabular" data-batch-progress>
            {progress.done.toLocaleString()} of {progress.total.toLocaleString()} games read
            {report?.notRead ? ` · stopped; ${report.notRead.toLocaleString()} not read` : ''}
            {report
              ? ` · ${report.asked.toLocaleString()} positions asked of ${report.source}, ${report.reused.toLocaleString()} answered from earlier games in this job`
              : ''}
          </p>
        ) : null}
        {report ? (
          <>
            <p className="text-sm text-primary" data-batch-counts>
              {report.counts.left} left {report.source}
              {report.counts.uncertain ? `, ${report.counts.uncertain} maybe (a cut list)` : ''}
              {report.counts['past-depth']
                ? `, ${report.counts['past-depth']} went past its depth`
                : ''}
              {report.counts.followed ? `, ${report.counts.followed} never left` : ''}
              {report.counts['not-in-source']
                ? `, ${report.counts['not-in-source']} started outside it`
                : ''}
              .
            </p>
            <ol
              className="max-h-[320px] divide-y divide-line-subtle overflow-auto text-xs"
              data-batch-rows
            >
              {report.rows.map((row) => (
                <li key={row.id} className="flex gap-2 py-1.5" data-batch-row={row.departure.kind}>
                  <span className="w-28 shrink-0 text-tertiary">
                    {KIND_LABEL[row.departure.kind]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-primary">{row.title}</span>
                    <span className="block text-secondary">{row.summary}</span>
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
