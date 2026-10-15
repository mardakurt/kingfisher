'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useAccount } from '@/stores/account-store';

import { describeSummary } from './sync-labels';

/**
 * The first-sign-in question: this device has work the account has never
 * seen. Nothing is uploaded until it is answered, and neither answer deletes
 * anything.
 */
export function ImportLocalWorkDialog() {
  const pending = useAccount((state) => state.pendingImport);
  const phase = useAccount((state) => state.phase);
  const decide = useAccount((state) => state.decideImport);
  const email = useAccount((state) => state.user?.email ?? null);
  const [busy, setBusy] = useState(false);
  const [later, setLater] = useState(false);

  const open = phase === 'awaiting-import' && pending !== null && !later;
  if (!pending) return null;
  const lines = describeSummary(pending.byStore);

  const answer = async (decision: 'imported' | 'declined') => {
    setBusy(true);
    try {
      await decide(decision);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => setLater(true)}
      title="Add this device’s work to your account?"
      description={`This device has work that is not in ${email ?? 'your account'} yet.`}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={() => void answer('declined')}>
            Keep it on this device only
          </Button>
          <Button variant="accent" disabled={busy} onClick={() => void answer('imported')}>
            {busy ? 'Working…' : 'Add to my account'}
          </Button>
        </>
      }
    >
      <ul className="list-disc space-y-1 pl-5 text-sm text-primary">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-4 text-[13px] leading-relaxed text-secondary">
        Adding uploads it and keeps it here; it then follows you to every device you sign in on.
        Something that already exists in your account with different content is not overwritten —
        the account’s version is used and this device’s is kept for you to review. Keeping it here
        leaves it on this device only; your account’s work still downloads alongside it.
      </p>
    </Dialog>
  );
}
