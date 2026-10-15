import type { Metadata } from 'next';

import { UpdatePasswordScreen } from '@/features/account/AuthScreens';

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <UpdatePasswordScreen />;
}
