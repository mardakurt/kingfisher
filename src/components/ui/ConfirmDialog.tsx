'use client';

/**
 * Confirmation for destructive work.
 *
 * Deleting a study, a chapter or a game destroys analysis that cannot be
 * recovered, so it goes through the application's own accessible dialog rather
 * than `window.confirm`, which cannot be styled, cannot be tested, and blocks
 * the whole tab. The dialog stays open while the action runs and reports a
 * failure in place instead of closing over it.
 */

import { useState } from 'react';

import { Button } from './Button';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly confirmLabel?: string;
  readonly danger?: boolean;
  readonly onConfirm: () => void | Promise<void>;
  readonly onCancel: () => void;
  readonly children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  danger = true,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onCancel}
      title={title}
      {...(description ? { description } : {})}
      width="w-[440px]"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'accent'}
            onClick={() => void run()}
            disabled={busy}
            className={danger ? 'border border-negative/40' : undefined}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {error && <p className="mt-2 text-2xs text-negative">{error}</p>}
    </Dialog>
  );
}
