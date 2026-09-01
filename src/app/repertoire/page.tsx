import { RepertoireWorkspace } from '@/features/repertoire/RepertoireWorkspace';
import { AppShell } from '@/features/shell/AppShell';

export default function RepertoirePage() {
  return (
    <AppShell>
      <RepertoireWorkspace />
    </AppShell>
  );
}
