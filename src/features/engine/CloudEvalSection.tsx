'use client';

/**
 * The Lichess cloud evaluation, beside the engine and never inside it.
 *
 * A separate section with its own name, because it is a separate claim: a
 * result somebody else's machine stored, at a depth this machine did not
 * reach. Nothing here feeds the evaluation bar, the engine's lines, the
 * arrows or a saved evaluation (`src/engine/cloud-eval.ts` says why).
 *
 * Off by default. The switch is here rather than in Settings because the
 * person deciding whether to send a position to Lichess is looking at the
 * position; the preference is `engineCloudEval`.
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { formatScore } from '@/chess/evaluation';
import type { Fen } from '@/chess/types';
import { describeVariation } from '@/engine/pv';
import { CLOUD_EVAL_MAX_LINES, fetchCloudEval, type CloudEval } from '@/engine/cloud-eval';
import { Plus } from '@/components/icons';
import { IconButton } from '@/components/ui/Button';
import { usePreferences } from '@/stores/preferences-store';

/** A position is looked up after the board has rested on it this long. */
const SETTLE_MS = 350;

function useSettled(fen: Fen): Fen {
  const [settled, setSettled] = useState(fen);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(fen), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [fen]);
  return settled;
}

const formatNodes = (knodes: number): string => {
  const nodes = knodes * 1000;
  if (nodes >= 1e9) return `${(nodes / 1e9).toFixed(1)}B`;
  if (nodes >= 1e6) return `${Math.round(nodes / 1e6)}M`;
  return `${Math.round(nodes / 1e3)}k`;
};

export function CloudEvalSection({
  fen,
  onInsert,
}: {
  readonly fen: Fen;
  readonly onInsert: (moves: readonly string[]) => void;
}) {
  const enabled = usePreferences((state) => state.engineCloudEval);
  const lines = usePreferences((state) => state.engineMultiPv);
  const lineLength = usePreferences((state) => state.engineLineLength);
  const setPreference = usePreferences((state) => state.set);
  const settled = useSettled(fen);
  const count = Math.min(CLOUD_EVAL_MAX_LINES, Math.max(1, lines));

  const query = useQuery<CloudEval>({
    queryKey: ['cloud-eval', settled, count],
    queryFn: ({ signal }) => fetchCloudEval(settled, count, signal),
    enabled: enabled && settled === fen,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: false,
  });
  const result = query.data?.fen === fen ? query.data : undefined;

  return (
    <section
      className="border-t border-line-subtle px-2.5 py-1.5 text-[10.5px]"
      aria-label="Lichess cloud evaluation"
      data-cloud-eval={enabled ? (result?.kind ?? 'loading') : 'off'}
    >
      <label className="flex items-center gap-2 text-tertiary">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setPreference('engineCloudEval', event.target.checked)}
          className="h-3 w-3 accent-[var(--accent)]"
        />
        <span>Lichess cloud evaluation</span>
        {!enabled ? (
          <span className="text-tertiary/80">· off; on sends this position to Lichess</span>
        ) : null}
      </label>

      {enabled ? (
        !result ? (
          <p className="mt-1 text-tertiary">Asking Lichess…</p>
        ) : result.kind === 'none' ? (
          <p className="mt-1 text-secondary">Lichess has no stored evaluation of this position.</p>
        ) : result.kind === 'rate-limited' ? (
          <p className="mt-1 text-caution">
            Lichess asked Kingfisher to wait
            {result.retryAfterMs ? ` ${Math.ceil(result.retryAfterMs / 1000)} seconds` : ''}; the
            engine on this machine is unaffected.
          </p>
        ) : result.kind === 'unavailable' ? (
          <p className="mt-1 text-caution">{result.message}</p>
        ) : (
          <div className="mt-1">
            <p className="text-tertiary tabular" data-cloud-eval-provenance>
              Stored by Lichess · depth {result.depth} · {formatNodes(result.knodes)} nodes · not a
              search on this machine
            </p>
            <ol className="mt-0.5 divide-y divide-line-subtle">
              {result.lines.map((line, index) => {
                const san = describeVariation(fen, line.moves, lineLength);
                return (
                  <li
                    key={`${index}-${line.moves[0]}`}
                    className="flex items-baseline gap-2 py-1"
                    data-cloud-eval-line={index + 1}
                  >
                    <span className="w-[52px] shrink-0 rounded-[5px] border border-line px-1 py-0.5 text-center font-medium text-secondary tabular">
                      {formatScore(line.score)}
                    </span>
                    <span className="min-w-0 flex-1 text-secondary [overflow-wrap:anywhere]">
                      {san.length > 0 ? san.join(' ') : line.moves.join(' ')}
                    </span>
                    <IconButton
                      label="Insert this cloud line into the game"
                      className="h-6 w-6 shrink-0"
                      disabled={san.length === 0}
                      onClick={() => onInsert(line.moves.slice(0, Math.max(1, san.length)))}
                    >
                      <Plus />
                    </IconButton>
                  </li>
                );
              })}
            </ol>
          </div>
        )
      ) : null}
    </section>
  );
}
