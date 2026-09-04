'use client';

/**
 * The opening book, which is not the opening explorer.
 *
 * Its own panel, deliberately. An explorer answers *what has been played
 * here*, from a population you can name and count; a book answers *what to
 * play here*, from somebody's weights. Putting a book move into the explorer's
 * table would present an opinion in a column of counts, which is exactly the
 * confusion this panel exists to prevent — so the book's numbers are its own,
 * and the line at the top always names the book they came from.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { moveIntent } from '@/chess/moves';
import { Notebook } from '@/components/icons';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { probeBooks } from '@/book/registry';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

export function BookPanel() {
  const { node, position } = useAnalysisPosition();
  const play = useAnalysis((state) => state.play);
  const notify = useUi((state) => state.notify);
  const openSettingsAt = useUi((state) => state.openSettingsAt);

  const book = useQuery({
    queryKey: ['opening-book', node.fen],
    retry: false,
    staleTime: 60_000,
    queryFn: () => probeBooks(node.fen),
  });

  /*
    SAN is resolved here rather than stored in the book: a Polyglot entry is
    UCI, and the same move is written differently depending on what else is on
    the board. Converting against the position in front of the user is the only
    way to get it right.
  */
  const moves = useMemo(() => {
    const result = book.data;
    if (!result) return [];
    return result.moves.map((move) => {
      const legal = position.playUci(move.uci);
      return { ...move, san: legal.ok ? legal.value.san : move.uci, legal: legal.ok };
    });
  }, [book.data, position]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader>Book</PanelHeader>
      <PanelBody>
        {book.isPending ? (
          <p className="px-3 py-5 text-2xs text-tertiary">Reading the books…</p>
        ) : !book.data ? (
          <EmptyState
            title="No book covers this position."
            description="Kingfisher's own book is derived from the installed reference sources, so it runs out where they do. Add a Polyglot .bin in Settings → Engine → Books to go deeper."
            action={
              <button
                type="button"
                onClick={() => openSettingsAt('engine')}
                className="text-xs text-accent underline-offset-2 hover:underline"
              >
                Manage books
              </button>
            }
          />
        ) : (
          <>
            <p className="flex items-center gap-1.5 border-b border-line-subtle px-2.5 py-1.5 text-[10.5px] text-tertiary">
              <Notebook className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{book.data.bookName}</span>
            </p>
            <table className="w-full text-[10.5px]">
              <thead>
                <tr className="border-b border-line-subtle text-left text-[9.5px] uppercase tracking-wide text-tertiary">
                  <th className="px-2.5 py-1.5 font-medium">Move</th>
                  <th className="px-1.5 py-1.5 text-right font-medium">Weight</th>
                  <th className="px-1.5 py-1.5 text-right font-medium">Share</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Games</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {moves.map((move) => (
                  <tr key={move.uci}>
                    <td className="px-2.5 py-1.5">
                      <button
                        type="button"
                        disabled={!move.legal}
                        className="font-medium text-primary hover:text-accent disabled:text-tertiary"
                        onClick={() => {
                          const legal = position.playUci(move.uci);
                          if (!legal.ok) {
                            notify({
                              tone: 'error',
                              message: `The book move ${move.uci} is not legal here.`,
                            });
                            return;
                          }
                          play(moveIntent(legal.value));
                        }}
                      >
                        {move.san}
                      </button>
                    </td>
                    <td className="px-1.5 py-1.5 text-right text-secondary tabular">
                      {move.weight.toLocaleString()}
                    </td>
                    <td className="px-1.5 py-1.5 text-right text-secondary tabular">
                      {Math.round(move.share * 100)}%
                    </td>
                    <td className="px-2.5 py-1.5 text-right text-tertiary tabular">
                      {move.games === undefined ? '—' : move.games.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-2.5 py-2 text-[10px] leading-relaxed text-tertiary">
              A book states a preference, not a count. Where the number of games is blank the book
              did not supply one — a Polyglot weight is its author&rsquo;s opinion and has no
              denominator.
            </p>
          </>
        )}
      </PanelBody>
    </div>
  );
}
