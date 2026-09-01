import { PreparationWorkspace } from '@/features/preparation/PreparationWorkspace';
import { AppShell } from '@/features/shell/AppShell';

export default async function DatabasePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly player?: string | readonly string[] }>;
}) {
  const params = await searchParams;
  const initialPlayer = typeof params.player === 'string' ? params.player : '';
  return (
    <AppShell>
      <PreparationWorkspace initialPlayer={initialPlayer} />
    </AppShell>
  );
}
