import { describeMacosDownload, macosDownload } from '@/release/macos-download';
import { publicUrl } from '@/release/public-urls';
import { InstallPage } from './InstallPage';

const name = describeMacosDownload(macosDownload);
const trust = macosDownload.signature.notarized
  ? 'Apple Silicon, signed and notarised.'
  : 'Apple Silicon, code-signed, not notarised. Right-click → Open on first launch.';

export const metadata = {
  title: 'Install Kingfisher on macOS',
  description: `The honest install guide for ${name} on macOS. ${trust}`,
  alternates: { canonical: '/install' },
};

export default function InstallRoute() {
  return <InstallPage downloadUrl={publicUrl.macosDmg} download={macosDownload} />;
}
