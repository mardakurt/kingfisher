import type { Metadata } from 'next';

import { SignInScreen } from '@/features/account/AuthScreens';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <SignInScreen />;
}
