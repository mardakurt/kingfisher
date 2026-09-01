'use client';

import { outcomeAt, repetitionCount } from '@/chess/game';
import { moveNumberOfPly } from '@/chess/tree/types';
import { useAnalysis } from '@/stores/analysis-store';

import { useAnalysisPosition } from './useAnalysisPosition';

const OUTCOME_TEXT: Record<string, string> = {
  checkmate: 'Checkmate',
  stalemate: 'Stalemate',
  'insufficient-material': 'Draw — insufficient material',
  'fifty-move': 'Draw — fifty-move rule',
  'threefold-repetition': 'Draw — threefold repetition',
};

/**
 * The facts about the position that a player checks constantly: whose move it
 * is, where in the game we are, and whether the game is actually over.
 */
export function PositionSummary() {
  const { position, node, tree, currentId } = useAnalysisPosition();
  const orientation = useAnalysis((state) => state.orientation);

  const outcome = outcomeAt(tree, currentId);
  const repetitions = repetitionCount(tree, currentId);
  const material = position.materialBalance();

  return (
    <div className="flex min-w-0 items-center gap-2 text-2xs text-tertiary sm:gap-3">
      {outcome ? (
        <span className="font-medium text-primary">
          {OUTCOME_TEXT[outcome.kind] ?? 'Game over'}
          {outcome.kind === 'checkmate' && ` — ${outcome.winner === 'w' ? 'White' : 'Black'} wins`}
        </span>
      ) : (
        <span>
          <span className="text-secondary">
            {position.turn === 'w' ? 'White' : 'Black'} to play
          </span>
          {node.ply > 0 && <span className="ml-1.5 tabular">move {moveNumberOfPly(node.ply)}</span>}
        </span>
      )}

      {position.isCheck() && !outcome && <span className="text-caution">Check</span>}

      {repetitions >= 2 && !outcome && (
        <span className="hidden sm:inline" title="This position has occurred before in this line">
          repetition ×{repetitions}
        </span>
      )}

      {material !== 0 && (
        <span className="hidden tabular sm:inline" title="Material balance in pawns">
          {material > 0 ? '+' : '−'}
          {Math.abs(material)} {material > 0 ? 'White' : 'Black'}
        </span>
      )}

      <span className="hidden text-tertiary/70 sm:inline">
        {orientation === 'w' ? 'White view' : 'Black view'}
      </span>
    </div>
  );
}
