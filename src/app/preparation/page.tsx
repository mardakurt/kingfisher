import { PreparationWorkspace } from '@/features/preparation/PreparationWorkspace';
import { AppShell } from '@/features/shell/AppShell';

export default async function PreparationPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly player?: string | readonly string[];
    readonly side?: string | readonly string[];
    readonly eco?: string | readonly string[];
  }>;
}) {
  const params = await searchParams;
  const initialPlayer = typeof params.player === 'string' ? params.player : '';
  const initialSide = params.side === 'w' || params.side === 'b' ? params.side : 'any';
  const initialEco = typeof params.eco === 'string' ? params.eco : '';
  return (
    <AppShell>
      <PreparationWorkspace
        initialPlayer={initialPlayer}
        initialSide={initialSide}
        initialEco={initialEco}
      />
    </AppShell>
  );
}
