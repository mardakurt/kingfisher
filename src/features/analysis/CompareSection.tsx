'use client';

/**
 * Compare the position on the board with another one.
 *
 * The other position is one already on this line (where the game stood a
 * few moves ago) or any FEN pasted in — a repertoire position, the one an
 * opponent reached. Both diagrams are drawn with the squares that differ
 * tinted, and the structural facts are split three ways: true of both, only
 * here, only there (`src/position/compare.ts`). Facts the Features panel
 * already states, so nothing here is a judgement.
 */

import { useMemo, useState } from 'react';

import { parseFen } from '@/chess/fen';
import { nodePath } from '@/chess/tree/tree';
import { moveNumberOfPly } from '@/chess/tree/types';
import { SheetBoard } from '@/features/preparation/SheetBoard';
import { comparePositions } from '@/position/compare';
import { useAnalysis } from '@/stores/analysis-store';
import { plural } from '@/lib/plural';

import { useAnalysisPosition } from './useAnalysisPosition';

const PASTE = 'paste';

export function CompareSection() {
  const { node } = useAnalysisPosition();
  const tree = useAnalysis((state) => state.tree);
  const orientation = useAnalysis((state) => state.orientation);
  const [choice, setChoice] = useState('');
  const [pasted, setPasted] = useState('');

  // Earlier positions on the line to this one, nearest first.
  const earlier = useMemo(() => {
    const path = nodePath(tree, node.id);
    return path
      .slice(0, -1)
      .map((id) => tree.nodes[id]!)
      .reverse()
      .map((entry) => ({
        id: entry.id,
        fen: entry.fen,
        label: entry.move
          ? `After ${moveNumberOfPly(entry.ply)}${entry.ply % 2 === 1 ? '.' : '...'}${entry.move.san}`
          : 'Starting position',
      }));
  }, [tree, node.id]);

  const otherFen =
    choice === PASTE ? pasted.trim() : (earlier.find((entry) => entry.id === choice)?.fen ?? '');
  const pastedInvalid = choice === PASTE && pasted.trim() !== '' && !parseFen(pasted.trim()).ok;
  const comparison = otherFen && !pastedInvalid ? comparePositions(node.fen, otherFen) : null;
  const marked = useMemo(() => new Set<string>(comparison?.differingSquares ?? []), [comparison]);

  return (
    <section
      className="border-t border-line-subtle px-3 py-2.5 text-[11px]"
      aria-label="Compare positions"
      data-compare-positions
    >
      <h3 className="text-[10px] font-semibold text-tertiary">Compare with another position</h3>
      <select
        aria-label="Position to compare with"
        value={choice}
        onChange={(event) => setChoice(event.target.value)}
        className="mt-1.5 h-7 w-full rounded-[var(--radius-control)] border border-line bg-surface-inset px-1.5 text-[11px] text-secondary"
      >
        <option value="">Choose a position…</option>
        {earlier.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label}
          </option>
        ))}
        <option value={PASTE}>Paste a FEN…</option>
      </select>
      {choice === PASTE ? (
        <input
          aria-label="FEN to compare with"
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
          placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
          className="mt-1.5 h-7 w-full rounded-[var(--radius-control)] border border-line bg-surface-inset px-1.5 font-mono text-[10.5px] text-secondary"
        />
      ) : null}
      {pastedInvalid ? (
        <p className="mt-1 text-negative" role="alert">
          That is not a position Kingfisher can read.
        </p>
      ) : null}

      {comparison ? (
        <div className="mt-2" data-compare-result>
          <div className="grid grid-cols-2 gap-2">
            <figure>
              <SheetBoard
                fen={node.fen}
                orientation={orientation}
                marked={marked}
                className="w-full"
              />
              <figcaption className="mt-0.5 text-center text-[10px] text-tertiary">
                This position
              </figcaption>
            </figure>
            <figure>
              <SheetBoard
                fen={otherFen}
                orientation={orientation}
                marked={marked}
                className="w-full"
              />
              <figcaption className="mt-0.5 text-center text-[10px] text-tertiary">
                Compared
              </figcaption>
            </figure>
          </div>
          <p className="mt-1.5 text-secondary" data-compare-summary>
            {comparison.samePosition
              ? 'The same position.'
              : `${plural(comparison.differingSquares.length, 'square')} differ${comparison.differingSquares.length === 1 ? 's' : ''} (tinted)${comparison.sameSideToMove ? '' : '; the other side is to move'}.`}
          </p>
          <FactList title="Only here" facts={comparison.onlyFirst} testId="only-first" />
          <FactList
            title="Only in the compared position"
            facts={comparison.onlySecond}
            testId="only-second"
          />
          <FactList title="True of both" facts={comparison.shared} testId="shared" />
        </div>
      ) : null}
    </section>
  );
}

function FactList({
  title,
  facts,
  testId,
}: {
  readonly title: string;
  readonly facts: readonly string[];
  readonly testId: string;
}) {
  return (
    <div className="mt-1.5" data-compare-facts={testId}>
      <p className="text-[10px] font-semibold text-tertiary">{title}</p>
      {facts.length === 0 ? (
        <p className="text-tertiary">Nothing.</p>
      ) : (
        <ul className="text-secondary">
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
