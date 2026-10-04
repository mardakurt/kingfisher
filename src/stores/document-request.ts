import { useAnalysis } from './analysis-store';

let request = 0;

/**
 * An asynchronous game load may replace the board only while it is still the
 * latest request and the player has not edited or replaced the document it
 * started from. Cursor navigation and orientation alone do not discard work.
 */
export function beginDocumentRequest(): () => boolean {
  const token = ++request;
  const { tree, generation, revision } = useAnalysis.getState();
  return () => {
    const current = useAnalysis.getState();
    return (
      token === request &&
      current.tree === tree &&
      current.generation === generation &&
      current.revision === revision
    );
  };
}

/** Leaving the requesting route invalidates its outstanding game loads. */
export function cancelDocumentRequests(): void {
  request += 1;
}
