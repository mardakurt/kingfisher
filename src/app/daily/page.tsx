import type { Metadata } from 'next';

import { AppShell } from '@/features/shell/AppShell';
import { DailyWorkspace } from '@/features/daily/DailyWorkspace';

/**
 * `/daily` — the rehearsal the brief's other half needs.
 *
 * No URL parameter; the session is rebuilt from the stores every time,
 * because what is due is what is due. `useSearchParams` is not used here
 * because the workspace never needs to read the address.
 */

export const metadata: Metadata = {
  title: 'Daily session',
};

export default function DailyPage() {
  return (
    <AppShell>
      <DailyWorkspace />
    </AppShell>
  );
}