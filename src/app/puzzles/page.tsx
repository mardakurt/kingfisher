import type { Metadata } from 'next';

import { PuzzlesWorkspace } from '@/features/puzzles/PuzzlesWorkspace';
import { AppShell } from '@/features/shell/AppShell';

export const metadata: Metadata = {
  title: 'Puzzles',
};

/** `/puzzles?puzzle=<id>` opens one puzzle; otherwise one is chosen near your rating. */
export default async function PuzzlesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly puzzle?: string | readonly string[] }>;
}) {
  const value = (await searchParams).puzzle;
  const id = typeof value === 'string' && /^[A-Za-z0-9]{3,12}$/.test(value) ? value : undefined;
  return (
    <AppShell>
      <PuzzlesWorkspace {...(id ? { initialPuzzleId: id } : {})} />
    </AppShell>
  );
}
