import { Suspense } from 'react';

import { DatabasesWorkspace } from '@/features/databases/DatabasesWorkspace';
import { AppShell } from '@/features/shell/AppShell';

/*
 * The open database is read from `?db=` with `useSearchParams`, which must run
 * under a Suspense boundary for the page to stay statically rendered.
 */
export default function DatabasesPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <DatabasesWorkspace />
      </Suspense>
    </AppShell>
  );
}
