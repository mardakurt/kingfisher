'use client';

/**
 * "Safari may delete your work" — said once, with the three ways to stop it.
 *
 * The decision is `persistence/storage-risk.ts`; this is the row above the
 * workspace that says it, beside the update and recovery notices. It names
 * what keeps the work: installing (which WebKit exempts), an account (which
 * keeps a copy of the authored work), and a backup file (which keeps
 * everything, games included, and is the person's own).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { isDesktop } from '@/desktop/bridge';
import { listBrowserCollections } from '@/persistence/browser-collections';
import { downloadWorkspaceBackup } from '@/persistence/backup';
import { getRepositories } from '@/persistence/repositories';
import { installInstruction, shouldWarnStorageRisk } from '@/persistence/storage-risk';
import { useStoragePersistence } from '@/persistence/use-storage-persistence';
import { useAccount } from '@/stores/account-store';
import { portablePreferences } from '@/stores/portable-preferences';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

const DISMISSED_KEY = 'kingfisher.storage-risk.dismissed';

function readDismissed(): number | null {
  try {
    const value = Number(localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

async function hasWork(): Promise<boolean> {
  const repositories = await getRepositories();
  const [studies, repertoires, games, collections] = await Promise.all([
    repositories.studies.list(),
    repositories.repertoires.list(),
    repositories.games.count(),
    listBrowserCollections().catch(() => []),
  ]);
  return studies.length + repertoires.length + games + collections.length > 0;
}

export function StorageRiskNotice() {
  const persistence = useStoragePersistence();
  const status = useAccount((state) => state.status);
  const notify = useUi((state) => state.notify);
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const persistent = persistence.status;

  useEffect(() => {
    if (persistent === 'pending' || status === 'loading') return;
    let cancelled = false;
    void hasWork()
      .catch(() => false)
      .then((work) => {
        if (cancelled) return;
        const standalone =
          window.matchMedia?.('(display-mode: standalone)').matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone === true;
        setShow(
          shouldWarnStorageRisk({
            userAgent: navigator.userAgent,
            maxTouchPoints: navigator.maxTouchPoints ?? 0,
            standalone,
            desktopApp: isDesktop(),
            persistent: persistent === 'persistent',
            signedIn: status === 'signed-in',
            hasWork: work,
            dismissedAt: readDismissed(),
            now: Date.now(),
          }),
        );
      });
    return () => {
      cancelled = true;
    };
    // Again when the page changes: a first study saved makes it worth saying.
  }, [pathname, persistent, status]);

  if (!show) return null;

  const dismiss = () => {
    const now = Date.now();
    try {
      localStorage.setItem(DISMISSED_KEY, String(now));
    } catch {
      // Private browsing refuses the write; the notice still goes for this visit.
    }
    setShow(false);
  };

  const backup = async () => {
    setSaving(true);
    const result = await downloadWorkspaceBackup({
      includeGames: true,
      preferences: portablePreferences(usePreferences.getState()),
    });
    setSaving(false);
    notify(
      result.ok
        ? { tone: 'success', message: 'Backup downloaded, with your games and collections.' }
        : { tone: 'error', message: `The backup could not be made: ${result.message}` },
    );
  };

  return (
    <div className="pwa-update-banner flex-wrap" role="status" data-storage-risk>
      <div className="pwa-update-banner__copy">
        <strong>Safari can delete this site’s data after seven days without a visit.</strong>{' '}
        <span>
          Keep your work: add Kingfisher with{' '}
          {installInstruction(navigator.userAgent, navigator.maxTouchPoints ?? 0)}, sign in to keep
          a copy in your account, or download a backup.
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/sign-in?next=${encodeURIComponent(pathname || '/analysis')}`}
          className="text-xs text-accent-ink underline-offset-2 hover:underline"
        >
          Sign in
        </Link>
        <Button onClick={() => void backup()} disabled={saving}>
          {saving ? 'Preparing…' : 'Download backup'}
        </Button>
        <Button variant="ghost" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </div>
  );
}
