import { Suspense } from 'react';

import { SearchWorkspace } from '@/features/search/SearchWorkspace';
import { AppShell } from '@/features/shell/AppShell';

export default function SearchPage() {
  return (
    <AppShell>
      {/* `useSearchParams` needs a boundary, as the training page documents. */}
      <Suspense fallback={null}>
        <SearchWorkspace />
      </Suspense>
    </AppShell>
  );
}
