'use client';

/**
 * "Check for Updates" panel for the desktop application.
 *
 * Renders only inside the desktop shell (the bridge is required).
 * Renders nothing in a browser. The directive is explicit: this
 * is for the macOS Preview, where Gatekeeper and notarisation
 * mean silent binary replacement is unsafe today, and where the
 * user is in front of a real menu they can open at any time.
 *
 * The check is one fetch to the public Kingfisher release
 * metadata, validated by `evaluateUpdate`. The verdict is shown
 * to the user; a "newer available" verdict offers a button that
 * opens the verified release page in their default browser.
 */

import { useState } from 'react';

import { desktop } from '@/desktop/bridge';
import { Button } from '@/components/ui/Button';

import { APP_VERSION } from '@/lib/version';
import { publicUrl } from './public-urls';
import { evaluateUpdate, type UpdateVerdict } from './update-check';

type Status = { status: 'idle' } | { status: 'checking' } | UpdateVerdict;

export function UpdateCheckSection() {
  const bridge = typeof window === 'undefined' ? null : desktop();
  const [status, setStatus] = useState<Status>({ status: 'idle' });

  if (!bridge) return null;

  const arch = (bridge.os === 'darwin' ? 'arm64' : 'x64') as 'arm64' | 'x64';

  const onCheck = async () => {
    setStatus({ status: 'checking' });
    try {
      const verdict = await fetchAndEvaluate(arch);
      setStatus(verdict);
    } catch (err) {
      setStatus({
        status: 'unable-to-check',
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <section className="update-check-section">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-tertiary">
        Application updates
      </h3>
      <div className="mt-1 space-y-2 border-y border-line-subtle py-3">
        <p className="text-xs text-primary">Kingfisher {APP_VERSION} · macOS Preview</p>
        <VerdictLine status={status} />
        <div className="flex items-center gap-2">
          <Button variant="accent" onClick={onCheck} disabled={status.status === 'checking'}>
            {status.status === 'checking' ? 'Checking…' : 'Check for updates'}
          </Button>
          {status.status === 'newer-available' ? (
            <Button
              variant="subtle"
              onClick={() => {
                window.open(status.releasePageUrl, '_blank', 'noopener,noreferrer');
              }}
            >
              View {status.latestVersion} on GitHub
            </Button>
          ) : null}
        </div>
        <p className="text-[10px] text-tertiary">
          The check is manual. Nothing is sent from Kingfisher unless you click the button.
          Auto-update is not implemented; the verified release is opened in your browser, you
          download the DMG, and you replace the app in Applications.{' '}
          <a
            href={`${publicUrl.repository}/releases`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Releases
          </a>
        </p>
      </div>
    </section>
  );
}

function VerdictLine({ status }: { status: Status }) {
  if (status.status === 'idle') {
    return (
      <p className="text-xs text-tertiary">
        Last check: never. Click <em>Check for updates</em> to ask the public release metadata
        whether a newer build is published.
      </p>
    );
  }
  if (status.status === 'checking') {
    return <p className="text-xs text-tertiary">Reaching the release host…</p>;
  }
  if (status.status === 'up-to-date') {
    return <p className="text-xs text-positive">You are up to date.</p>;
  }
  if (status.status === 'newer-available') {
    return (
      <p className="text-xs text-primary">
        A newer Kingfisher version is available: <strong>{status.latestVersion}</strong>. Your
        build: <code>{status.currentVersion}</code>.
      </p>
    );
  }
  return <p className="text-xs text-caution">Unable to check right now. {status.reason}</p>;
}

async function fetchAndEvaluate(arch: 'arm64' | 'x64'): Promise<UpdateVerdict> {
  const url = `${publicUrl.repository}/releases/latest/download/kingfisher-release-manifest.json`;
  const response = await fetch(url, {
    redirect: 'manual',
    headers: { accept: 'application/json' },
  });
  if (response.status >= 300 && response.status < 400) {
    return { status: 'unable-to-check', reason: 'Release metadata URL redirected.' };
  }
  if (!response.ok) {
    return {
      status: 'unable-to-check',
      reason: `Release host returned ${response.status} ${response.statusText}.`,
    };
  }
  const body = (await response.json()) as unknown;
  return evaluateUpdate({ currentVersion: APP_VERSION, manifest: body, arch });
}
