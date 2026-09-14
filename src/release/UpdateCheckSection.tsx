'use client';

/**
 * "Application updates" panel for the desktop application.
 *
 * Renders only inside the desktop shell (the bridge is required).
 * Renders nothing in a browser. The Settings page is the secondary
 * surface for updates: the macOS application menu's *Check for
 * Updates…* is the primary one. Both ask the same update service in
 * the main process, whose engine is Sparkle; Sparkle shows its own
 * window for the check, the download and the install, and the verdict
 * this panel renders is the service's account of where Sparkle is.
 *
 * What this panel offers: the current version, the latest verdict, and
 * a button that asks for a check. What it does *not* do: it does not
 * run its own network request. The renderer only draws; the main
 * process is the only surface that talks to the release feed.
 */

import { useEffect, useState } from 'react';

import { desktop } from '@/desktop/bridge';
import { Button } from '@/components/ui/Button';

import { APP_VERSION } from '@/lib/version';

/**
 * The verdicts the main process emits (`desktop/src/update-protocol.mjs`
 * `STATUS`), reduced to what this panel draws.
 */
type Verdict =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up-to-date' }
  | { status: 'available'; latestVersion: string; sizeBytes: number | null }
  | { status: 'downloading'; latestVersion: string }
  | { status: 'verifying'; latestVersion: string }
  | { status: 'ready'; latestVersion: string }
  | { status: 'installing'; latestVersion: string }
  | { status: 'preview'; build: number | null }
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

  const busy =
    verdict.status === 'checking' ||
    verdict.status === 'downloading' ||
    verdict.status === 'verifying' ||
    verdict.status === 'installing';

  return (
    <section className="update-check-section">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-tertiary">
        Application updates
      </h3>
      <div className="mt-1 space-y-2 border-y border-line-subtle py-3">
        <p className="text-xs text-primary">Kingfisher {APP_VERSION} for macOS</p>
        <VerdictLine verdict={verdict} />
        <div className="flex items-center gap-2">
          <Button variant="accent" disabled={busy} onClick={() => bridge.showUpdateDialog()}>
            {verdict.status === 'available' || verdict.status === 'ready'
              ? 'Show Update…'
              : 'Check for Updates…'}
          </Button>
        </div>
        <p className="text-[10px] text-tertiary">
          Updates are delivered by Sparkle. A check asks the release feed once; nothing is
          downloaded until you choose Install Update in its window, and the update is verified
          against Kingfisher’s signing key before it is installed.
        </p>
      </div>
    </section>
  );
}

function VerdictLine({ verdict }: { verdict: Verdict }) {
  switch (verdict.status) {
    case 'idle':
      return <p className="text-xs text-tertiary">Last check: never.</p>;
    case 'checking':
      return <p className="text-xs text-tertiary">Reaching the release host…</p>;
    case 'up-to-date':
      return <p className="text-xs text-positive">You are up to date.</p>;
    case 'available': {
      const size =
        verdict.sizeBytes && verdict.sizeBytes > 0
          ? ` · ${Math.round(verdict.sizeBytes / (1024 * 1024))} MB`
          : '';
      return (
        <p className="text-xs text-primary">
          Kingfisher <strong>{verdict.latestVersion}</strong> is available{size}.
        </p>
      );
    }
    case 'downloading':
      return (
        <p className="text-xs text-primary">Downloading Kingfisher {verdict.latestVersion}…</p>
      );
    case 'verifying':
      return <p className="text-xs text-primary">Verifying Kingfisher {verdict.latestVersion}…</p>;
    case 'ready':
      return (
        <p className="text-xs text-positive">
          Kingfisher {verdict.latestVersion} is ready to install.
        </p>
      );
    case 'installing':
      return <p className="text-xs text-primary">Installing Kingfisher {verdict.latestVersion}…</p>;
    case 'preview':
      return (
        <p className="text-xs text-tertiary">
          Preview build{verdict.build === null ? '' : ` ${verdict.build}`}: replaced by downloading
          the next one.
        </p>
      );
    case 'failed':
      return <p className="text-xs text-caution">{verdict.reason}</p>;
    default:
      return <p className="text-xs text-caution">Unable to check right now.</p>;
  }
}

/**
 * The main process's verdict, reduced to the fields this panel draws. An
 * unknown status is `idle` rather than a crash: the service may add a
 * stage before this file learns about it.
 */
function normalize(value: unknown): Verdict {
  if (!value || typeof value !== 'object') return { status: 'idle' };
  const v = value as Record<string, unknown> & { status?: string };
  const latestVersion = String(v.latestVersion ?? '');
  switch (v.status) {
    case 'checking':
      return { status: 'checking' };
    case 'up-to-date':
      return { status: 'up-to-date' };
    case 'available':
      return {
        status: 'available',
        latestVersion,
        sizeBytes: typeof v.sizeBytes === 'number' ? v.sizeBytes : null,
      };
    case 'downloading':
    case 'downloaded':
      return { status: 'downloading', latestVersion };
    case 'verifying':
      return { status: 'verifying', latestVersion };
    case 'ready':
      return { status: 'ready', latestVersion };
    case 'waiting-for-save':
    case 'installing':
    case 'restarting':
      return { status: 'installing', latestVersion };
    case 'preview':
      return { status: 'preview', build: typeof v.build === 'number' ? v.build : null };
    case 'failed':
      return { status: 'failed', reason: String(v.reason ?? 'The update did not complete.') };
    case 'unable-to-check':
      return { status: 'unable-to-check', reason: String(v.reason ?? '') };
    default:
      return { status: 'idle' };
  }
}
