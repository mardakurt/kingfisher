'use client';

/**
 * The dock's entry point into calculation.
 *
 * A thin wrapper so `CalculationPanel` stays a pure function of a position and
 * can be rendered anywhere — the analysis dock, a study, a review — without
 * each caller repeating the workspace lookup.
 */

import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { CalculationPanel } from './CalculationPanel';

export function CalculationHost() {
  const { node } = useAnalysisPosition();
  const sideToMove = node.fen.split(' ')[1] === 'b' ? 'b' : 'w';
  return <CalculationPanel fen={node.fen} sideToMove={sideToMove} />;
}
