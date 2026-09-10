import type { Metadata } from 'next';
import { publicUrl } from '@/release/public-urls';
import { SecurityPage } from './SecurityPage';

export const metadata: Metadata = {
  title: 'Security',
  description:
    'What the Kingfisher product actually does to protect the data you keep in it. The controls that exist in code, the private reporting path, and the supported versions.',
  alternates: { canonical: '/security' },
  robots: { index: true, follow: true },
};

export default function SecurityRoute() {
  return <SecurityPage issuesUrl={publicUrl.issues} />;
}
