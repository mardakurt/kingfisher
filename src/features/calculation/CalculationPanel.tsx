'use client';

/**
 * Calculation: the board, the tree, the answer, then the evidence.
 *
 * The panel is deliberately one column and one flow. A player calculating has
 * a single question in mind and every extra affordance is an invitation to
 * stop and look at something — which is exactly what this workspace exists to
 * prevent until they have committed.
 *
 * On submission it writes a `DecisionRecord`, the same record self-analysis
 * writes, with the calculation tree attached. That is not a convenience: it
 * means calculation sessions land in the same journal, get the same
 * frozen-at-reveal guarantee, and feed the same calibration and coverage
 * analytics as a review of a played game.
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { positionKey } from '@/chess/fen';
import { asSan, asUci, type Fen, type San, type Uci } from '@/chess/types';
import { Button, IconButton } from '@/components/ui/Button';
import { Close } from '@/components/icons';
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Tabs';
import { invalidateReview } from '@/features/persistence/queries';
import { BANDS } from '@/features/review/comparison';
import { ScheduleReview } from '@/features/review/ScheduleReview';
import { getRepositories } from '@/persistence/repositories';
import { useUi } from '@/stores/ui-store';
import { cn } from '@/lib/cn';

import { CalculationBoard } from './CalculationBoard';
import {
  calculationEstimate,
  hasCalculation,
  useCalculation,
  VISIBILITY_LABEL,
  type BoardVisibility,
} from './calculation-store';
import { branchAt, candidatesOf, countMoves, lines, maxDepth, movesAlong } from './tree';

const FIELD =
  'mt-1 w-full rounded-[4px] border border-line bg-surface-inset px-2.5 py-1.5 text-xs text-primary outline-none placeholder:text-tertiary/60 focus:border-accent/60';

const VISIBILITIES: readonly { id: BoardVisibility; label: string }[] = [
  { id: 'full', label: 'Board' },
  { id: 'pieces-hidden', label: 'No pieces' },
  { id: 'blank', label: 'Blank' },
];

export function CalculationPanel({
  fen,
  sideToMove,
  onSaved,
}: {
  readonly fen: Fen;
  readonly sideToMove: 'w' | 'b';
  readonly onSaved?: (decisionId: string) => void;
}) {
  const client = useQueryClient();
  const notify = useUi((state) => state.notify);
  const state = useCalculation();
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [reviewItemId, setReviewItemId] = useState<string | null>(null);

  const running = state.fen === fen;
  const key = positionKey(fen);
  const reviewItem = useQuery({
    queryKey: ['persistence', 'review-item', reviewItemId ?? ''],
    enabled: Boolean(reviewItemId),
    staleTime: 0,
    retry: false,
    queryFn: async () => (await getRepositories()).review.getReviewItem(reviewItemId!),
  });
  const summary = useMemo(
    () => ({
      moves: countMoves(state.tree.branches),
      depth: maxDepth(state.tree.branches),
      candidates: candidatesOf(state.tree.branches),
      lines: lines(state.tree.branches),
    }),
    [state.tree],
  );

  if (!running) {
    return (
      <Panel className="h-full">
        <PanelHeader>Calculation</PanelHeader>
        <PanelBody className="px-3 py-4">
          <p className="text-2xs leading-relaxed text-tertiary">
            Calculate this position with the engine, the explorer, the tablebase and the evaluation
            bar withheld. Enter the lines you actually look at, choose a move, then reveal.
          </p>
          <Button
            variant="accent"
            className="mt-3"
            onClick={() => useCalculation.getState().start(fen, key)}
          >
            Start calculation
          </Button>
        </PanelBody>
      </Panel>
    );
  }

  const current = branchAt(state.tree.branches, state.tree.path);
  const path = movesAlong(state.tree.branches, state.tree.path);

  const submit = async () => {
    if (!hasCalculation(state)) return;
    setSaving(true);
    try {
      const repositories = await getRepositories();
      const decision = await repositories.review.createDecision({
        positionKey: key,
        fen,
        sideToMove,
        candidates: summary.candidates.map((candidate) => ({
          uci: candidate.uci,
          san: candidate.san,
          ...(candidate.note ? { note: candidate.note } : {}),
          line: candidate.line,
        })),
        calculation: state.tree.branches,
        ...(state.chosenUci ? { chosenUci: state.chosenUci } : {}),
        ...(state.chosenSan ? { chosenSan: state.chosenSan } : {}),
        ...(calculationEstimate(state) ? { estimate: calculationEstimate(state) } : {}),
        ...(state.notes.trim() ? { calculationNotes: state.notes.trim() } : {}),
      });
      // Reveal is what submitting *means*: the record is now frozen, and the
      // evidence becomes available in the same action.
      await repositories.review.revealDecision(decision.id, decision.revision);
      /*
        A calculated position joins the review queue too.

        Without this the decision would be findable only by searching the
        journal — and the whole loop Phase 8 built, where a position you thought
        hard about comes back weeks later, would apply to games you played and
        not to positions you studied. Marked rather than suggested: the player
        chose to calculate here, which is the strongest signal there is.
      */
      const item = await repositories.review.upsertReviewItem({
        positionKey: key,
        fen,
        sideToMove,
        source: 'marked',
        category: 'calculation',
      });
      await repositories.review.updateReviewItem(item.id, item.revision, {
        status: 'reviewed',
        decisionId: decision.id,
      });
      useCalculation.getState().reveal();
      setSavedId(decision.id);
      setReviewItemId(item.id);
      invalidateReview(client);
      onSaved?.(decision.id);
      notify({ tone: 'success', message: 'Calculation recorded. Evidence revealed.' });
    } catch (error) {
      notify({
        tone: 'error',
        message: 'Could not record the calculation.',
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel className="h-full">
      <PanelHeader
        actions={
          <IconButton label="End calculation" onClick={() => useCalculation.getState().stop()}>
            <Close className="h-3.5 w-3.5" />
          </IconButton>
        }
      >
        Calculation
        <span className="text-tertiary tabular">
          {summary.moves} moves · depth {summary.depth}
        </span>
      </PanelHeader>
      <PanelBody className="px-3 py-3">
        {!state.revealed ? (
          <p className="rounded-[4px] border border-line-subtle bg-surface-2 px-2.5 py-2 text-2xs leading-relaxed text-secondary">
            Engine, explorer, database, tablebase and repertoire are hidden while you calculate.
            Nothing is running.
          </p>
        ) : null}

        <div className="mt-3">
          <Segmented
            items={VISIBILITIES}
            value={state.visibility}
            onChange={(value) => useCalculation.getState().setVisibility(value)}
          />
          <span className="sr-only">{VISIBILITY_LABEL[state.visibility]}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-start gap-3">
          <div className="w-[220px] shrink-0">
            <CalculationBoard
              rootFen={fen}
              tree={state.tree}
              visibility={state.visibility}
              onPlay={(move) =>
                useCalculation.getState().play({ uci: asUci(move.uci), san: asSan(move.san) })
              }
            />
            <div className="mt-1.5 flex items-center gap-1.5">
              <Button
                disabled={state.tree.path.length === 0}
                onClick={() => useCalculation.getState().back()}
              >
                Back
              </Button>
              <Button
                disabled={state.tree.path.length === 0}
                onClick={() => useCalculation.getState().navigate([])}
              >
                To start
              </Button>
              <label className="ml-auto flex items-center gap-1 text-[10px] text-tertiary">
                <input
                  type="checkbox"
                  checked={state.hideMoves}
                  onChange={(event) => useCalculation.getState().setHideMoves(event.target.checked)}
                  className="accent-accent"
                />
                Hide lines
              </label>
            </div>
            {path.length > 0 && !state.hideMoves ? (
              <p className="mt-1 font-mono text-[10.5px] text-secondary">
                {path.map((move) => move.san).join(' ')}
              </p>
            ) : null}
          </div>

          <div className="min-w-[180px] flex-1">
            <h4 className="text-[9.5px] uppercase tracking-wide text-tertiary">Your lines</h4>
            {state.hideMoves ? (
              <p className="mt-1 text-[10.5px] text-tertiary">
                Lines hidden. {summary.moves} moves entered.
              </p>
            ) : summary.lines.length === 0 ? (
              <p className="mt-1 text-[10.5px] leading-relaxed text-tertiary">
                Play a move on the board to start a line. Play another to continue it; go back to
                start a second candidate.
              </p>
            ) : (
              <ul className="mt-1 flex flex-col gap-0.5">
                {summary.lines.map((line) => (
                  <li key={line.branchId} className="flex items-baseline gap-1.5">
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left font-mono text-[10.5px] text-primary hover:text-accent"
                      onClick={() =>
                        useCalculation.getState().navigate(line.moves.map((move) => move.id))
                      }
                    >
                      {line.moves.map((move) => move.san).join(' ')}
                    </button>
                    <IconButton
                      label={`Remove ${line.moves.at(-1)?.san ?? 'line'}`}
                      onClick={() => useCalculation.getState().remove(line.moves.at(-1)!.id)}
                    >
                      <Close className="h-3 w-3" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}

            {current ? (
              <label className="mt-2 block text-[10px] text-tertiary">
                Note on {current.san}
                <input
                  value={current.note ?? ''}
                  onChange={(event) =>
                    useCalculation
                      .getState()
                      .annotateBranch(current.id, { note: event.target.value })
                  }
                  className={FIELD}
                  placeholder="Why you rejected or liked it"
                />
              </label>
            ) : null}
          </div>
        </div>

        <fieldset className="mt-3">
          <legend className="text-[9.5px] uppercase tracking-wide text-tertiary">
            The move you would play
          </legend>
          <div className="mt-1 flex flex-wrap gap-1">
            {summary.candidates.length === 0 ? (
              <span className="text-[10.5px] text-tertiary">Enter a candidate first.</span>
            ) : null}
            {summary.candidates.map((candidate) => (
              <button
                key={candidate.uci}
                type="button"
                aria-pressed={state.chosenUci === candidate.uci}
                onClick={() =>
                  useCalculation.getState().choose(candidate.uci as Uci, candidate.san as San)
                }
                className={cn(
                  'rounded-[4px] border px-2 py-0.5 font-mono text-[11px]',
                  state.chosenUci === candidate.uci
                    ? 'border-accent bg-accent-muted text-primary'
                    : 'border-line text-secondary hover:border-accent/50',
                )}
              >
                {candidate.san}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-3">
          <legend className="text-[9.5px] uppercase tracking-wide text-tertiary">
            Your evaluation
          </legend>
          <div className="mt-1 flex flex-col gap-0.5">
            {BANDS.map((band) => (
              <label key={band.id} className="flex items-center gap-1.5 text-[11px] text-primary">
                <input
                  type="radio"
                  name="calculation-band"
                  checked={state.band === band.id}
                  onChange={() => useCalculation.getState().setBand(band.id)}
                  className="accent-accent"
                />
                {band.label}
              </label>
            ))}
          </div>
          <label className="mt-1.5 block text-[10px] text-tertiary">
            In pawns (optional)
            <input
              aria-label="Evaluation estimate in pawns"
              inputMode="decimal"
              value={state.pawns}
              onChange={(event) => useCalculation.getState().setPawns(event.target.value)}
              className={FIELD}
              placeholder="0.3"
            />
          </label>
        </fieldset>

        <label className="mt-3 block text-[10px] text-tertiary">
          Notes
          <textarea
            aria-label="Calculation notes"
            rows={2}
            value={state.notes}
            onChange={(event) => useCalculation.getState().setNotes(event.target.value)}
            className={cn(FIELD, 'resize-y leading-relaxed')}
            placeholder="What you were weighing"
          />
        </label>

        {state.revealed ? (
          <>
            <p className="mt-3 rounded-[4px] border border-line-subtle bg-surface-2 px-2.5 py-2 text-2xs leading-relaxed text-secondary">
              Recorded and frozen. The evidence tools are usable now; what you wrote above cannot be
              edited, which is what makes it worth reading in a month.
              {savedId ? ' Saved to the decision journal.' : ''}
            </p>
            {reviewItem.data ? <ScheduleReview item={reviewItem.data} /> : null}
          </>
        ) : (
          <Button
            variant="accent"
            className="mt-3"
            disabled={saving || !hasCalculation(state)}
            onClick={() => void submit()}
          >
            {saving ? 'Recording…' : 'Submit and reveal'}
          </Button>
        )}
      </PanelBody>
    </Panel>
  );
}
