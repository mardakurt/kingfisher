import { Suspense } from 'react';

import { HydratedDatabasesWorkspace } from '@/features/databases/DatabasesWorkspace';
import { AppShell } from '@/features/shell/AppShell';

/*
 * The open database is read from `?db=` with `useSearchParams`, which must run
 * under a Suspense boundary for the page to stay statically rendered — and a
 * boundary hydrates late, after the shell has filled the browser's query
 * cache and source registry, so the workspace is drawn after hydration only.
 */
export default function DatabasesPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <HydratedDatabasesWorkspace />
      </Suspense>
    </AppShell>
  );
}
