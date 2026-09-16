import type { Metadata } from 'next';
import { PrivacyPage } from './PrivacyPage';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What Kingfisher does with the data it touches, and what it does not. Local-first. No Kingfisher account. No cookies. No advertising. Lichess and Chess.com only see requests that come from a feature you opened. Page views and load times are counted, nothing else.',
  alternates: { canonical: '/privacy' },
  robots: { index: true, follow: true },
};

export default function PrivacyRoute() {
  return <PrivacyPage />;
}
