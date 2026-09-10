import { publicUrl } from '@/release/public-urls';
import { InstallPage } from './InstallPage';

export const metadata = {
  title: 'Install Kingfisher on macOS — Kingfisher',
  description:
    'The honest install guide for the Kingfisher 1.0.0 macOS Preview. Apple Silicon, code-signed, not notarised. Right-click → Open on first launch.',
  alternates: { canonical: '/install' },
};

export default function InstallRoute() {
  return <InstallPage downloadUrl={publicUrl.macosDmg} repositoryUrl={publicUrl.repository} />;
}
