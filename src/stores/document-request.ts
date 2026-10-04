import { useAnalysis } from './analysis-store';

let request = 0;
let routeScope = 0;

/**
 * An asynchronous game load may replace the board only while it is still the
 * latest request and the player has not edited or replaced the document it
 * started from. Cursor navigation and orientation alone do not discard work.
 * Boot restoration belongs to the workspace and survives route changes; a
 * subsequent explicit document request still outranks it.
 */
export function beginDocumentRequest(scope: 'route' | 'workspace' = 'route'): () => boolean {
  request += 1;
  return observeDocumentRequest(scope);
}

/** Observe boot ownership without superseding an explicit request from a child route. */
export function observeDocumentRequest(scope: 'route' | 'workspace' = 'route'): () => boolean {
  const token = request;
  const route = routeScope;
  const { tree, generation, revision } = useAnalysis.getState();
  return () => {
    const current = useAnalysis.getState();
    return (
      token === request &&
      (scope === 'workspace' || route === routeScope) &&
      current.tree === tree &&
      current.generation === generation &&
      current.revision === revision
    );
  };
}

/** Leaving the requesting route invalidates its outstanding game loads. */
export function cancelDocumentRequests(): void {
  routeScope += 1;
}
