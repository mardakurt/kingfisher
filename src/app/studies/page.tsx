import { Suspense } from 'react';

import { StudiesWorkspace } from '@/features/studies/StudiesWorkspace';
import { AppShell } from '@/features/shell/AppShell';

export default function StudiesPage() {
  return (
    <AppShell>
      {/* `useSearchParams` in the workspace needs this boundary; see the training page. */}
      <Suspense fallback={null}>
        <StudiesWorkspace />
      </Suspense>
    </AppShell>
  );
}
