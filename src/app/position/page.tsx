import { Suspense } from 'react';

import type { Metadata } from 'next';

import { AppShell } from '@/features/shell/AppShell';
import { PositionWorkspace } from '@/features/position/PositionWorkspace';

/**
 * The position page (`/position?fen=…`).
 *
 * One URL for everything Kingfisher knows about a position: your games from
 * it with results and clock facts, the studies and hand-ins holding it, the
 * repertoire's decision, each reference population in its own column, stored
 * engine evidence and the same-pawn-structure work. Position-keyed, never
 * move-sequence-keyed, so transpositions meet at the same address and counts
 * never split identity.
 *
 * `useSearchParams` must run under a Suspense boundary, as the search and
 * training pages already do; the query is read inside PositionWorkspace.
 */

export const metadata: Metadata = {
  title: 'Position page',
};

export default function PositionPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <PositionWorkspace />
      </Suspense>
    </AppShell>
  );
}
