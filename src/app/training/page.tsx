import { Suspense } from 'react';

import { AppShell } from '@/features/shell/AppShell';
import { TrainingWorkspace } from '@/features/training/TrainingWorkspace';

/**
 * The Suspense boundary is what lets the workspace read the query string.
 *
 * `?set=` and `?item=` are how a review session, a critical position and a
 * search result all hand the queue a subject, and the workspace used to read
 * them from `window.location` during its first render — which is correct after
 * a page load and wrong after a client navigation, where the address has not
 * changed yet. `useSearchParams` tracks the route instead, and on a
 * prerendered page it requires this boundary or the production build fails.
 */
export default function TrainingPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <TrainingWorkspace />
      </Suspense>
    </AppShell>
  );
}
