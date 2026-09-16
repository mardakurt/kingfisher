/**
 * The public install page renders the first-launch section from the
 * descriptor's trust state. Phase 49 found the page telling users of the
 * notarised 1.1.0 to right-click → Open — the section was hard-coded for
 * the preview while only the lede switched. Rendered server-side, as
 * production does, for both descriptor states.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { macosDownload, type MacosDownload } from '@/release/macos-download';

import { InstallPage } from './InstallPage';

const notarised: MacosDownload = {
  ...macosDownload,
  channel: 'stable',
  signature: { identity: 'Developer ID Application', notarized: true },
};
const preview: MacosDownload = {
  ...macosDownload,
  channel: 'preview',
  build: 999,
  filename: 'Kingfisher-1.1.0-preview-999-arm64.dmg',
  signature: { identity: 'Apple Development', notarized: false },
};

const render = (download: MacosDownload) =>
  renderToStaticMarkup(
    <InstallPage downloadUrl="https://example.invalid/x.dmg" download={download} />,
  );

describe('the install page follows the descriptor', () => {
  it("tells a notarised build's users to double-click, and never to right-click", () => {
    const html = render(notarised);
    expect(html).toContain('notarised by Apple');
    expect(html).toContain('downloaded from the Internet');
    expect(html).not.toMatch(/Right-click/);
    expect(html).not.toMatch(/Open Anyway/);
    expect(html).not.toContain('right-click → Open is');
    expect(html).not.toMatch(/not notarised/);
  });

  it("tells a preview's users the honest Gatekeeper path", () => {
    const html = render(preview);
    expect(html).toContain('code-signed but not notarised');
    expect(html).toMatch(/Right-click/);
  });

  it('states the macOS floor from the descriptor', () => {
    expect(render(notarised)).toContain('macOS 13 (Ventura)');
  });
});
