import { ScoresheetWorkspace } from '@/features/scoresheet/ScoresheetWorkspace';
import { AppShell } from '@/features/shell/AppShell';

export default function ScoresheetPage() {
  return (
    <AppShell>
      <ScoresheetWorkspace />
    </AppShell>
  );
}
