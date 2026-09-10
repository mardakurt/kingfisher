'use client';

/**
 * "Application updates" panel for the desktop application.
 *
 * Renders only inside the desktop shell (the bridge is required).
 * Renders nothing in a browser. The Settings page is the secondary
 * surface for updates: the macOS application menu's *Check for
 * Updates…* is the primary one, and clicking that opens a small
 * native dialog rather than this settings panel. The two surfaces
 * are wired into the same one update service in the main process,
 * so the verdict they show is the same verdict.
 *
 * What this panel *does* offer that the dialog does not:
 *
 *   - a permanent card that mentions the current version, the
 *     latest verdict, and a way to open the dialog;
 *   - a one-tap way for somebody reading the Settings page to
 *     jump to the dialog.
 *
 * What it does *not* do: it does not run its own network request.
 * The renderer is the only surface that draws; the main process
 * is the only surface that talks to GitHub.
 */

import { useEffect, useState } from 'react';

import { desktop } from '@/desktop/bridge';
import { Button } from '@/components/ui/Button';

import { APP_VERSION } from '@/lib/version';

type Verdict =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up-to-date' }
  | {
      status: 'newer-available';
      currentVersion: string;
      latestVersion: string;
      download: { arch: 'arm64' | 'x64'; bytes: number };
    }
  | { status: 'downloading'; latestVersion: string; receivedBytes: number; totalBytes: number }
  | { status: 'verifying'; latestVersion: string }
  | { status: 'ready'; latestVersion: string }
  | { status: 'canceled' }
  | { status: 'failed'; reason: string }
  | { status: 'unable-to-check'; reason: string };

export function UpdateCheckSection() {
  const bridge = typeof window === 'undefined' ? null : desktop();
  const [verdict, setVerdict] = useState<Verdict>({ status: 'idle' });

  useEffect(() => {
    if (!bridge) return undefined;
    let cancelled = false;
    bridge.updateStatus().then((initial) => {
      if (cancelled) return;
      if (initial && typeof initial === 'object') {
        setVerdict(normalize(initial));
      }
    });
    const off = bridge.subscribeUpdates((next) => {
      if (cancelled) return;
      if (next && typeof next === 'object') setVerdict(normalize(next));
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [bridge]);

  if (!bridge) return null;

  return (
    <section className="update-check-section">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-tertiary">
        Application updates
      </h3>
      <div className="mt-1 space-y-2 border-y border-line-subtle py-3">
        <p className="text-xs text-primary">Kingfisher {APP_VERSION} · macOS Preview</p>
        <VerdictLine verdict={verdict} />
        <div className="flex items-center gap-2">
          <Button variant="accent" onClick={() => bridge.showUpdateDialog()}>
            Check for Updates…
          </Button>
          {verdict.status === 'newer-available' ? (
            <Button
              variant="subtle"
              onClick={() => {
                // The dialog itself dispatches the download through its
                // own IPC; the Settings button's only job is to open
                // the dialog and let the user confirm there.
                bridge.showUpdateDialog();
              }}
            >
              Open Update Dialog
            </Button>
          ) : null}
        </div>
        <p className="text-[10px] text-tertiary">
          The check is manual. Nothing is sent from Kingfisher unless you click the button. Auto-update
          is not implemented; the verified DMG is opened from the dialog and you replace the app in
          Applications.
        </p>
      </div>
    </section>
  );
}

function VerdictLine({ verdict }: { verdict: Verdict }) {
  if (verdict.status === 'idle') {
    return <p className="text-xs text-tertiary">Last check: never.</p>;
  }
  if (verdict.status === 'checking') {
    return <p className="text-xs text-tertiary">Reaching the release host…</p>;
  }
  if (verdict.status === 'up-to-date') {
    return <p className="text-xs text-positive">You are up to date.</p>;
  }
  if (verdict.status === 'newer-available') {
    const mb = Math.round(verdict.download.bytes / (1024 * 1024));
    return (
      <p className="text-xs text-primary">
        Kingfisher <strong>{verdict.latestVersion}</strong> is available · {verdict.download.arch} ·{' '}
        {mb} MB.
      </p>
    );
  }
  if (verdict.status === 'downloading') {
    const rec = verdict.receivedBytes || 0;
    const tot = verdict.totalBytes || 0;
    const pct = tot ? Math.floor((rec / tot) * 100) : 0;
    return (
      <p className="text-xs text-primary">
        Downloading Kingfisher {verdict.latestVersion}… {pct}%
      </p>
    );
  }
  if (verdict.status === 'verifying') {
    return <p className="text-xs text-primary">Verifying download…</p>;
  }
  if (verdict.status === 'ready') {
    return (
      <p className="text-xs text-positive">
        Kingfisher {verdict.latestVersion} is ready to install.
      </p>
    );
  }
  if (verdict.status === 'canceled') {
    return <p className="text-xs text-tertiary">Download canceled.</p>;
  }
  if (verdict.status === 'failed') {
    return <p className="text-xs text-caution">Update could not be verified.</p>;
  }
  return <p className="text-xs text-caution">Unable to check right now.</p>;
}

/**
 * The main process emits verdicts with slightly different field names
 * than the historical `evaluateUpdate` shape (which is the public
 * contract the renderer used to call directly). Normalise into one
 * local view so the UI does not have to know.
 */
function normalize(value: unknown): Verdict {
  if (!value || typeof value !== 'object') return { status: 'idle' };
  const v = value as Record<string, unknown> & { status?: string };
  switch (v.status) {
    case 'checking':
      return { status: 'checking' };
    case 'up-to-date':
      return { status: 'up-to-date' };
    case 'newer-available': {
      const download = (v.download as { arch?: string; bytes?: number } | undefined) ?? {};
      return {
        status: 'newer-available',
        currentVersion: String(v.currentVersion ?? ''),
        latestVersion: String(v.latestVersion ?? ''),
        download: {
          arch: download.arch === 'x64' ? 'x64' : 'arm64',
          bytes: Number(download.bytes ?? 0),
        },
      };
    }
    case 'downloading': {
      return {
        status: 'downloading',
        latestVersion: String(v.latestVersion ?? ''),
        receivedBytes: Number(v.receivedBytes ?? 0),
        totalBytes: Number(v.totalBytes ?? 0),
      };
    }
    case 'verifying':
      return { status: 'verifying', latestVersion: String(v.latestVersion ?? '') };
    case 'ready':
      return { status: 'ready', latestVersion: String(v.latestVersion ?? '') };
    case 'canceled':
      return { status: 'canceled' };
    case 'failed':
      return { status: 'failed', reason: String(v.reason ?? '') };
    case 'unable-to-check':
      return { status: 'unable-to-check', reason: String(v.reason ?? '') };
    default:
      return { status: 'idle' };
  }
}
