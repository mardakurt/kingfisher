import { AppShell } from '@/features/shell/AppShell';
import { TrainingWorkspace } from '@/features/training/TrainingWorkspace';

export default function TrainingPage() {
  return (
    <AppShell>
      <TrainingWorkspace />
    </AppShell>
  );
}
