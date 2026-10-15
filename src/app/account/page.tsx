import type { Metadata } from 'next';

import { AccountRoute } from '@/features/account/AccountRoute';
import { AppShell } from '@/features/shell/AppShell';

export const metadata: Metadata = {
  title: 'Account',
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <AppShell>
      <AccountRoute />
    </AppShell>
  );
}
