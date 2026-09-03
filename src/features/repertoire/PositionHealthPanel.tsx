'use client';

import { useMemo, useState } from 'react';

import { positionKey } from '@/chess/fen';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import {
  useModelGamesForPosition,
  useRepertoiresAtPosition,
  useTrainingItems,
} from '@/features/persistence/queries';
import { useOpeningFilesForPosition } from '@/features/preparation/queries';

import { relativeDays, soonestSchedule, summariseMoves } from './position-health';

/**
 * Everything Kingfisher knows about this position, in one panel.
 *
 * Phase 9 stored all of it and showed it in five places, which meant that
 * deciding whether a line was in good shape required visiting five tabs and
 * remembering what the first one said. See `position-health.ts` for why this
 * is a list of facts rather than a score.
 */
export function PositionHealthPanel() {
  const { node } = useAnalysisPosition();
  const key = positionKey(node.fen);
  const repertoires = useRepertoiresAtPosition(key);
  const training = useTrainingItems();
  const modelGames = useModelGamesForPosition(key);
  const openingFiles = useOpeningFilesForPosition(key);

  /*
    One reading of the clock per mount. "18 days ago" must not silently become
    "19 days ago" because an unrelated re-render happened to cross midnight,
    and a value read during render is not stable enough to be trusted for that.
  */
  const [now] = useState(() => Date.now());

  const decision = repertoires.data?.[0] ?? null;
  const moves = useMemo(() => summariseMoves(decision?.moves ?? []), [decision?.moves]);
  const schedule = useMemo(
    () =>
      soonestSchedule(
        (training.data ?? [])
          .filter((item) => item.positionKey === key)
          .map((item) => item.schedule),
      ),
    [key, training.data],
  );

  const loading =
    repertoires.isPending || training.isPending || modelGames.isPending || openingFiles.isPending;

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PanelHeader>Position health</PanelHeader>
        <p className="p-3 text-xs text-tertiary">Gathering what is known about this position…</p>
      </div>
    );
  }

  const nothingKnown =
    !decision &&
    !schedule &&
    (modelGames.data?.length ?? 0) === 0 &&
    (openingFiles.data?.length ?? 0) === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader>Position health</PanelHeader>
      <PanelBody>
        {nothingKnown ? (
          <EmptyState
            title="Nothing recorded here yet."
            description="Once you file a repertoire decision, schedule a review or link a model game, it is reported here."
          />
        ) : (
          <dl className="divide-y divide-line-subtle">
            <Row label="Repertoire">
              {decision ? (
                <>
                  <p className="text-sm text-primary">
                    {moves.mainResponse
                      ? `Main response: ${moves.mainResponse}`
                      : 'Recorded, with no move marked as the main response.'}
                  </p>
                  {moves.alternatives.length > 0 ? (
                    <p className="mt-0.5 text-xs text-secondary">
                      Also prepared: {moves.alternatives.join(', ')}
                    </p>
                  ) : null}
                  {moves.avoided.length > 0 ? (
                    <p className="mt-0.5 text-xs text-tertiary">
                      Decided against: {moves.avoided.join(', ')}
                    </p>
                  ) : null}
                  {decision.note ? (
                    <p className="mt-1 text-xs leading-relaxed text-tertiary">{decision.note}</p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-tertiary">No decision covers this position.</p>
              )}
            </Row>

            <Row label="Last reviewed">
              <p className="text-sm text-primary">
                {schedule?.lastReviewedAt
                  ? relativeDays(schedule.lastReviewedAt, now)
                  : 'Never reviewed.'}
              </p>
              {schedule && schedule.lapses > 0 ? (
                <p className="mt-0.5 text-xs text-tertiary tabular">
                  {schedule.reviewCount} reviews · {schedule.lapses} lapses
                </p>
              ) : null}
            </Row>

            <Row label="Training">
              <p className="text-sm text-primary">
                {schedule ? `Due ${relativeDays(schedule.dueAt, now)}` : 'Not scheduled.'}
              </p>
            </Row>

            <Row label="Model games">
              <p className="text-sm text-primary tabular">{modelGames.data?.length ?? 0}</p>
            </Row>

            <Row label="Preparation">
              <p className="text-sm text-primary">
                {(openingFiles.data?.length ?? 0) === 0
                  ? 'No opening file reaches this position.'
                  : `${openingFiles.data?.length} opening ${
                      openingFiles.data?.length === 1 ? 'file' : 'files'
                    } reach this position.`}
              </p>
            </Row>
          </dl>
        )}
      </PanelBody>
    </div>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="px-3 py-2.5">
      <dt className="text-2xs font-medium uppercase tracking-[0.08em] text-tertiary">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
