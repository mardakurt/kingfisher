'use client';

/**
 * Tablebase results for the position on the board.
 *
 * Kept beside the engine rather than inside it, because the two are different
 * kinds of claim. An engine says what it currently believes; a tablebase says
 * what is true. Mixing them into one number would let a user compare a proof
 * with an estimate, so they stay in separate panels with separate vocabulary.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { positionFeatures } from '@/chess/features';
import { parseFen } from '@/chess/fen';
import { moveIntent } from '@/chess/moves';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { cn } from '@/lib/cn';
import { defaultTablebaseProvider } from '@/tablebase/registry';
import {
  chooseTablebaseProvider,
  CompanionTablebaseProvider,
  EMPTY_STATUS,
} from '@/tablebase/companion';
import { describeCategory, type TablebaseCategory } from '@/tablebase/types';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

import { useAnalysisPosition } from './useAnalysisPosition';

/**
 * One instance for the session.
 *
 * It carries the machine's capability, which is a property of the machine and
 * not of a component, and creating it per render would re-scan on every move.
 */
const localProvider = new CompanionTablebaseProvider();

export function TablebasePanel() {
  const { node, position } = useAnalysisPosition();
  const play = useAnalysis((state) => state.play);
  const notify = useUi((state) => state.notify);
  const remote = defaultTablebaseProvider();

  const pieceCount = useMemo(() => {
    const parsed = parseFen(node.fen);
    return parsed.ok ? positionFeatures(parsed.value).pieceCount : 32;
  }, [node.fen]);

  /*
    What this machine can answer locally, read from the companion's own scan of
    the tablebase directory. Cached for the session: a download finishing
    mid-session is rare, and re-scanning on every position would put a
    filesystem walk behind every move.
  */
  const localStatus = useQuery({
    queryKey: ['tablebase', 'local-status'],
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: () => localProvider.refresh(),
  });

  const choice = useMemo(
    () =>
      chooseTablebaseProvider(pieceCount, localProvider, remote, localStatus.data ?? EMPTY_STATUS),
    [pieceCount, remote, localStatus.data],
  );
  const provider = choice?.provider ?? remote;
  const eligible = choice !== null;

  const probe = useQuery({
    queryKey: ['tablebase', provider.id, node.fen],
    enabled: eligible,
    retry: false,
    staleTime: 60 * 60 * 1000,
    queryFn: ({ signal }) => provider.probe(node.fen, signal),
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader>
        Tablebase
        <span className="normal-case tracking-normal">{provider.name}</span>
      </PanelHeader>
      <PanelBody>
        {!eligible ? (
          <EmptyState
            title={`${pieceCount} pieces on the board.`}
            description={`Tablebases answer positions of ${provider.maxPieces} pieces or fewer. This one is decided by analysis, not by proof.`}
          />
        ) : probe.isPending ? (
          <p className="px-3 py-4 text-2xs text-tertiary">Asking the tablebase…</p>
        ) : probe.isError ? (
          <EmptyState
            title="No tablebase answer."
            description={probe.error instanceof Error ? probe.error.message : 'The lookup failed.'}
          />
        ) : (
          <>
            <section className="border-b border-line-subtle px-3 py-3">
              <p className={cn('text-sm font-medium', tone(probe.data.category))}>
                {describeCategory(probe.data.category)}
              </p>
              <p className="mt-1 text-2xs text-tertiary tabular">
                {probe.data.dtz !== null ? `DTZ ${probe.data.dtz}` : 'DTZ —'}
                {probe.data.dtm !== null ? ` · DTM ${probe.data.dtm}` : ''}
              </p>
              <p className="mt-1.5 text-[10px] leading-relaxed text-tertiary">
                Proved, not evaluated. DTZ counts plies to the next capture or pawn move; DTM counts
                plies to mate where the source knows it.
              </p>
              {/*
                Where the proof came from, stated rather than implied. A user
                who has installed local tables is entitled to know whether they
                are being used, and a user who has not is entitled to know a
                request left the machine.
              */}
              {choice ? (
                <p className="mt-1 text-[10px] leading-relaxed text-tertiary">{choice.reason}</p>
              ) : null}
            </section>

            {probe.data.moves.length > 0 ? (
              <table className="w-full border-collapse text-[10.5px]">
                <thead>
                  <tr className="border-b border-line-subtle text-left text-[9.5px] uppercase tracking-wide text-tertiary">
                    <th className="px-3 py-1.5 font-medium">Move</th>
                    <th className="px-2 py-1.5 font-medium">Result</th>
                    <th className="px-3 py-1.5 text-right font-medium">DTZ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {probe.data.moves.map((move) => (
                    <tr key={move.uci}>
                      <td className="px-3 py-1.5">
                        <button
                          type="button"
                          className="font-medium text-primary hover:text-accent"
                          onClick={() => {
                            const played = position.playUci(move.uci);
                            if (!played.ok) return;
                            const result = play(moveIntent(played.value));
                            if (!result.ok)
                              notify({ tone: 'error', message: result.error.message });
                          }}
                        >
                          {move.san}
                        </button>
                      </td>
                      {/* Stated from the mover's side: a move that "loses" for
                          the opponent is the move that wins. */}
                      <td className={cn('px-2 py-1.5', tone(invert(move.category)))}>
                        {describeCategory(invert(move.category))}
                      </td>
                      <td className="px-3 py-1.5 text-right text-secondary tabular">
                        {move.dtz ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </>
        )}
      </PanelBody>
    </div>
  );
}

/** A move's category is the opponent's; flip it to speak for the mover. */
const invert = (category: TablebaseCategory): TablebaseCategory => {
  switch (category) {
    case 'win':
      return 'loss';
    case 'loss':
      return 'win';
    case 'cursed-win':
      return 'blessed-loss';
    case 'blessed-loss':
      return 'cursed-win';
    default:
      return category;
  }
};

const tone = (category: TablebaseCategory): string => {
  if (category === 'win' || category === 'checkmate') return 'text-positive';
  if (category === 'loss') return 'text-negative';
  return 'text-secondary';
};
