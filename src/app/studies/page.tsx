import { StudiesWorkspace } from '@/features/studies/StudiesWorkspace';
import { AppShell } from '@/features/shell/AppShell';

export default function StudiesPage() {
  return (
    <AppShell>
      <StudiesWorkspace />
    </AppShell>
  );
}
