import type { Metadata } from 'next';

import { AuthCallbackScreen } from '@/features/account/AuthScreens';

export const metadata: Metadata = {
  title: 'Signing in',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AuthCallbackScreen />;
}
