'use client';

import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { useAnalysis } from '@/stores/analysis-store';

import { ConversionPanel } from './ConversionPanel';

/**
 * The conversion panel, seeded from whatever position the workspace is on.
 *
 * A separate host so the panel itself takes a FEN and knows nothing about the
 * workspace: that is what lets the same component be driven from a saved
 * endgame, from the current board, or from a test.
 */
export function ConversionHost() {
  const { node } = useAnalysisPosition();
  const document = useAnalysis((state) => state.document);
  return (
    <ConversionPanel
      fen={node.fen}
      title={document.kind === 'untitled' ? 'This position' : (document.title ?? 'Endgame')}
    />
  );
}
