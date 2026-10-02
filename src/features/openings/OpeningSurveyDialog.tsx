'use client';

import { useEffect, useRef, useState } from 'react';
import type { Fen } from '@/chess/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useDatabaseProviders } from '@/database/use-database-providers';
import { buildOpeningSurvey, openingSurveyPgn, type OpeningSurvey } from '@/theory/opening-survey';
import { useUi } from '@/stores/ui-store';
import { SurveyHandoff } from './SurveyHandoff';

export function OpeningSurveyDialog({
  fen,
  sourceId,
  onClose,
}: {
  readonly fen: Fen;
  readonly sourceId: string;
  readonly onClose: () => void;
}) {
  const providers = useDatabaseProviders();
  const [selected, setSelected] = useState(sourceId);
  const [depth, setDepth] = useState(4);
  const [width, setWidth] = useState(3);
  const [running, setRunning] = useState(false);
  const [queries, setQueries] = useState(0);
  const [survey, setSurvey] = useState<OpeningSurvey | null>(null);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const notify = useUi((state) => state.notify);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  const provider = providers.find((item) => item.id === selected);
  const requiresPlayer = selected === 'lichess-player';
  const generate = async () => {
    if (!provider || requiresPlayer || running) return;
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    setSurvey(null);
    setError('');
    setQueries(0);
    try {
      const result = await buildOpeningSurvey({
        fen,
        source: provider,
        depth,
        width,
        signal: abort.signal,
        explore: (position, signal) => provider.explore({ fen: position }, signal),
        onProgress: (done) => {
          if (alive.current) setQueries(done);
        },
      });
      if (alive.current) setSurvey(result);
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (alive.current) setRunning(false);
    }
  };
  const pgn = survey ? openingSurveyPgn(survey) : '';
  return (
    <Dialog
      open
      onClose={onClose}
      title="Opening survey"
      description="Build a variation tree from one population's most-played moves. This is recorded practice, not a recommended repertoire."
    >
      <div className="flex flex-col gap-3 text-xs">
        <label>
          Survey source
          <select
            aria-label="Survey source"
            className="mt-1 block w-full rounded border border-line bg-surface-inset p-2"
            value={selected}
            disabled={running}
            onChange={(event) => {
              setSelected(event.target.value);
              setSurvey(null);
            }}
          >
            <option value="">Choose a source</option>
            {selected && !provider && <option value={selected}>Selected source unavailable</option>}
            {providers.map((item) => (
              <option key={item.id} value={item.id} disabled={item.id === 'lichess-player'}>
                {item.name}
                {item.id === 'lichess-player'
                  ? ' · requires player selection in Explorer'
                  : item.capabilities.offline
                    ? ' · offline'
                    : ' · online'}
              </option>
            ))}
          </select>
        </label>
        {requiresPlayer && (
          <p role="status">
            Player surveys need a username and colour. Use the player Explorer or choose another
            survey source.
          </p>
        )}
        <div className="flex gap-3">
          <label>
            Depth (plies)
            <input
              aria-label="Survey depth"
              type="number"
              min={1}
              max={8}
              value={depth}
              disabled={running}
              onChange={(event) => {
                setDepth(Number(event.target.value));
                setSurvey(null);
              }}
              className="mt-1 block w-20 rounded border border-line bg-surface-inset p-2"
            />
          </label>
          <label>
            Moves per position
            <input
              aria-label="Survey branches"
              type="number"
              min={1}
              max={5}
              value={width}
              disabled={running}
              onChange={(event) => {
                setWidth(Number(event.target.value));
                setSurvey(null);
              }}
              className="mt-1 block w-20 rounded border border-line bg-surface-inset p-2"
            />
          </label>
        </div>
        <p className="text-secondary">
          At most 40 source queries, using source defaults rather than Explorer filters. No
          populations are merged. Counts describe each position; an entire path may not have
          occurred in one game. A source may require sign-in; use an installed offline source for
          private preparation. Closing stops the survey.
        </p>
        <div className="flex gap-2">
          <Button
            variant="accent"
            size="sm"
            disabled={!provider || requiresPlayer || running}
            onClick={() => void generate()}
          >
            Generate survey
          </Button>
          {running && (
            <Button size="sm" onClick={() => controller.current?.abort()}>
              Stop survey
            </Button>
          )}
        </div>
        {running && <p role="status">Reading source… {queries} of at most 40 queries.</p>}
        {error && (
          <p role="alert" className="text-negative">
            {error}
          </p>
        )}
        {survey && (
          <>
            <p role="status">
              {survey.source.name} · {Object.keys(survey.tree.nodes).length - 1} moves ·{' '}
              {survey.queries} queries · {survey.cuts} bounded move lists · {survey.stopped}
            </p>
            <label>
              Survey PGN
              <textarea
                aria-label="Survey PGN"
                readOnly
                value={pgn}
                rows={8}
                className="mt-1 block w-full rounded border border-line bg-surface-inset p-2 font-mono"
              />
            </label>
            <SurveyHandoff key={pgn} tree={survey.tree} />
            <Button
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(pgn).then(
                  () => notify({ tone: 'success', message: 'Opening survey copied as PGN.' }),
                  () =>
                    notify({
                      tone: 'error',
                      message: 'Clipboard unavailable. Select the PGN text to copy it.',
                    }),
                );
              }}
            >
              Copy survey PGN
            </Button>
          </>
        )}
      </div>
    </Dialog>
  );
}
