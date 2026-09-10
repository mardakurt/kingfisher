import type { Metadata } from 'next';
import { TermsPage } from './TermsPage';

export const metadata: Metadata = {
  title: 'Terms',
  description:
    'The human-readable summary of what you can and cannot expect from Kingfisher. The MIT licence applies.',
  alternates: { canonical: '/terms' },
  robots: { index: true, follow: true },
};

export default function TermsRoute() {
  return <TermsPage />;
}
