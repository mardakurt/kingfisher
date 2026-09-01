import { AnalysisWorkspace } from '@/features/analysis/AnalysisWorkspace';
import { AppShell } from '@/features/shell/AppShell';

export default function AnalysisPage() {
  return (
    <AppShell>
      <AnalysisWorkspace />
    </AppShell>
  );
}
