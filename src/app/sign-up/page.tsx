import type { Metadata } from 'next';

import { SignUpScreen } from '@/features/account/AuthScreens';

export const metadata: Metadata = {
  title: 'Create an account',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <SignUpScreen />;
}
