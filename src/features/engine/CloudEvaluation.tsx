'use client';

/**
 * Lichess cloud evaluation, in the engine panel (Phase 84).
 *
 * Off until asked for: a position leaves the machine only while this is on,
 * and the off state says what turning it on sends. On, it follows the board
 * and shows what lichess.org has stored for each position — labelled as
 * stored analysis, with Lichess's own depth and node count, under the local
 * engine's lines and never mixed into them. Nothing here writes to the tree,
 * the evaluation bar or the arrows; a line can be inserted as moves, like any
 * variation the player chooses to keep.
 *
 * The switch lasts for the session. It is not a preference: a setting that
 * silently sent every position of every session to a third party is the
 * opposite of "third-party services are asked for, never assumed".
 */

import { useEffect, useState } from 'react';
import { create } from 'zustand';

import { formatScore } from '@/chess/evaluation';
import type { Fen } from '@/chess/types';
import { Plus } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/Button';
import { fetchCloudEvaluation, type CloudAnswer } from '@/engine/cloud-eval';
import { variationTokens } from '@/engine/pv';
import { cn } from '@/lib/cn';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

import { scoreTone } from './score-chip';

/** The session switch, shared by every engine panel that is mounted. */
export const useCloudEvaluation = create<{
  readonly enabled: boolean;
  setEnabled(enabled: boolean): void;
}>((set) => ({ enabled: false, setEnabled: (enabled) => set({ enabled }) }));

/** Answers already had this session, so stepping back through a game asks nothing twice. */
const answers = new Map<string, CloudAnswer>();
const REMEMBERED = 400;

function remember(fen: string, answer: CloudAnswer): void {
  if (answer.status === 'rate-limited' || answer.status === 'failed') return;
  answers.set(fen, answer);
  if (answers.size > REMEMBERED) answers.delete(answers.keys().next().value!);
}

const formatKnodes = (knodes: number): string =>
  knodes >= 1e6
    ? `${(knodes / 1e6).toFixed(1)} billion nodes`
    : knodes >= 1e3
      ? `${(knodes / 1e3).toFixed(0)} million nodes`
      : `${knodes} thousand nodes`;

export function CloudEvaluationSection({ fen, ply }: { readonly fen: Fen; readonly ply: number }) {
  const enabled = useCloudEvaluation((state) => state.enabled);
  const setEnabled = useCloudEvaluation((state) => state.setEnabled);
  const insertUciLine = useAnalysis((state) => state.insertUciLine);
  const notify = useUi((state) => state.notify);
  const [answer, setAnswer] = useState<{ fen: string; value: CloudAnswer } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (answers.has(fen)) return; // read during render, below
    const controller = new AbortController();
    // Stepping through a game quickly asks only for where it stops.
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetchCloudEvaluation(fen, { signal: controller.signal })
        .then((value) => {
          remember(fen, value);
          setAnswer({ fen, value });
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, fen]);

  const current =
    (answer?.fen === fen ? answer.value : null) ?? (enabled ? (answers.get(fen) ?? null) : null);

  return (
    <section className="border-t border-line-subtle" data-cloud-evaluation={enabled ? 'on' : 'off'}>
      <div className="flex items-center gap-2 px-2.5 pt-2 pb-1">
        <h3 className="text-[11px] font-semibold text-secondary">Lichess cloud</h3>
        {enabled ? (
          <span className="text-[10.5px] text-tertiary">stored analysis, not a search here</span>
        ) : null}
        <Button size="sm" className="ml-auto" variant="subtle" onClick={() => setEnabled(!enabled)}>
          {enabled ? 'Stop asking' : 'Ask Lichess'}
        </Button>
      </div>

      {!enabled ? (
        <p className="px-2.5 pb-2 text-[11px] leading-snug text-tertiary">
          Shows the deepest analysis lichess.org has stored for the position on the board. While it
          is on, each position you visit is sent to lichess.org, and nothing else.
        </p>
      ) : !current ? (
        <p className="px-2.5 pb-2 text-[11px] text-tertiary" aria-live="polite">
          {loading ? 'Asking lichess.org…' : 'Waiting for the board to settle…'}
        </p>
      ) : current.status === 'absent' ? (
        <p className="px-2.5 pb-2 text-[11px] text-tertiary" data-cloud-status="absent">
          Lichess has no stored analysis of this position.
        </p>
      ) : current.status === 'rate-limited' ? (
        <p className="px-2.5 pb-2 text-[11px] text-caution" data-cloud-status="rate-limited">
          lichess.org asked to slow down. It will be asked again when you move.
        </p>
      ) : current.status === 'failed' ? (
        <p className="px-2.5 pb-2 text-[11px] text-caution" data-cloud-status="failed">
          {current.message}
        </p>
      ) : (
        <div data-cloud-status="found">
          <p className="px-2.5 pb-1 text-[10.5px] text-tertiary tabular">
            lichess.org · depth {current.evaluation.depth} ·{' '}
            {formatKnodes(current.evaluation.knodes)}
          </p>
          <ol className="divide-y divide-line-subtle">
            {current.evaluation.lines.map((line, rank) => (
              <li
                key={rank}
                className="group flex items-baseline gap-2 px-2.5 py-1.5"
                data-cloud-line
              >
                <span
                  className={cn(
                    'w-[52px] shrink-0 rounded-[5px] px-1 py-0.5 text-center text-xs font-medium tabular',
                    scoreTone(line),
                  )}
                >
                  {formatScore(line.score)}
                </span>
                <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-secondary [overflow-wrap:anywhere]">
                  {variationTokens(ply, line.san).map((token, index) => (
                    <span
                      key={index}
                      className={cn(
                        'mr-1',
                        token.isMove ? 'text-primary' : 'text-tertiary tabular',
                      )}
                    >
                      {token.text}
                    </span>
                  ))}
                </span>
                <IconButton
                  label="Insert this cloud line into the game"
                  className="h-6 w-6 shrink-0"
                  onClick={() => {
                    const result = insertUciLine(line.uci);
                    if (!result.ok) {
                      notify({
                        tone: 'error',
                        message: 'That line no longer fits this position.',
                        detail: result.error.message,
                      });
                    }
                  }}
                >
                  <Plus />
                </IconButton>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
