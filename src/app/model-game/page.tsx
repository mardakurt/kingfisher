import { AnalysisWorkspace } from '@/features/analysis/AnalysisWorkspace';
import { AppShell } from '@/features/shell/AppShell';

export default function ModelGamePage() {
  return (
    <AppShell>
      <AnalysisWorkspace modelGameStudy />
    </AppShell>
  );
}
