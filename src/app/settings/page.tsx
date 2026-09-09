import { AppShell } from '@/features/shell/AppShell';
import { SettingsRoute } from '@/features/shell/SettingsRoute';

export const metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsRoute />
    </AppShell>
  );
}
