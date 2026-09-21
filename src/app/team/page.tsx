import { Suspense } from 'react';

import { AppShell } from '@/features/shell/AppShell';
import { TeamWorkspace } from '@/features/team/TeamWorkspace';

export default function TeamPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <TeamWorkspace />
      </Suspense>
    </AppShell>
  );
}
