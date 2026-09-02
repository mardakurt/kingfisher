import { DatabasesWorkspace } from '@/features/databases/DatabasesWorkspace';
import { AppShell } from '@/features/shell/AppShell';

export default function DatabasesPage() {
  return (
    <AppShell>
      <DatabasesWorkspace />
    </AppShell>
  );
}
