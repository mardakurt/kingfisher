import type { Metadata } from 'next';

import { ForgotPasswordScreen } from '@/features/account/AuthScreens';

export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ForgotPasswordScreen />;
}
