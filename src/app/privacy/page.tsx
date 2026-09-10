import type { Metadata } from 'next';
import { PrivacyPage } from './PrivacyPage';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What Kingfisher does with the data it touches, and what it does not. Local-first. No account. No telemetry. No cookies. No advertising.',
  alternates: { canonical: '/privacy' },
  robots: { index: true, follow: true },
};

export default function PrivacyRoute() {
  return <PrivacyPage />;
}
