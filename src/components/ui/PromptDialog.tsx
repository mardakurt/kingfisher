'use client';

/**
 * A single-field dialog for naming things.
 *
 * Creating and renaming studies and chapters is the same interaction five
 * times over; writing it once keeps the focus handling, the ⌘↵ shortcut, the
 * empty-value rule and the failure message consistent everywhere.
 */

import { useState } from 'react';

import { Button } from './Button';
import { Dialog } from './Dialog';

interface PromptDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly label: string;
  readonly initialValue?: string;
  readonly placeholder?: string;
  readonly confirmLabel?: string;
  /** A second, optional multi-line field, for study descriptions. */
  readonly noteLabel?: string;
  readonly initialNote?: string;
  readonly onSubmit: (value: string, note: string) => void | Promise<void>;
  readonly onCancel: () => void;
}

export function PromptDialog({
  open,
  title,
  description,
  label,
  initialValue = '',
  placeholder,
  confirmLabel = 'Save',
  noteLabel,
  initialNote = '',
  onSubmit,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value.trim(), note.trim());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That did not work.');
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onCancel}
      title={title}
      {...(description ? { description } : {})}
      width="w-[460px]"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" onClick={() => void submit()} disabled={busy || !value.trim()}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <label className="block text-2xs text-tertiary">
        {label}
        <input
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void submit();
            }
          }}
          className="mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2.5 text-xs text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60"
        />
      </label>

      {noteLabel && (
        <label className="mt-3 block text-2xs text-tertiary">
          {noteLabel}
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
            }}
            className="mt-1 h-20 w-full resize-none rounded-[4px] border border-line bg-surface-inset px-2.5 py-2 text-xs leading-relaxed text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60"
          />
        </label>
      )}

      {error && <p className="mt-2 text-2xs text-negative">{error}</p>}
    </Dialog>
  );
}
