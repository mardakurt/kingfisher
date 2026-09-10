import type { Metadata } from 'next';
import { DataLicencesPage } from './DataLicencesPage';

export const metadata: Metadata = {
  title: 'Data & licences',
  description:
    'Every third-party data source Kingfisher ships, installs, or queries — and the licence each one is used under.',
  alternates: { canonical: '/data-licences' },
  robots: { index: true, follow: true },
};

export default function DataLicencesRoute() {
  return <DataLicencesPage />;
}
