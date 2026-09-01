import { OpeningsWorkspace } from '@/features/openings/OpeningsWorkspace';
import { AppShell } from '@/features/shell/AppShell';

export default function OpeningsPage() {
  return (
    <AppShell>
      <OpeningsWorkspace />
    </AppShell>
  );
}
