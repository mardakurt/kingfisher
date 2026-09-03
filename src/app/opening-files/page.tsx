import { OpeningFilesWorkspace } from '@/features/opening-files/OpeningFilesWorkspace';
import { AppShell } from '@/features/shell/AppShell';

export default function OpeningFilesPage() {
  return (
    <AppShell>
      <OpeningFilesWorkspace />
    </AppShell>
  );
}
