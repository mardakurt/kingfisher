import { RecentWorkspace } from '@/features/recent/RecentWorkspace';
import { AppShell } from '@/features/shell/AppShell';

export default function RecentPage() {
  return (
    <AppShell>
      <RecentWorkspace />
    </AppShell>
  );
}
