'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

import { Close } from '@/components/icons';
import { cn } from '@/lib/cn';
import { MODAL_HANDOFF_EVENT } from './modal-handoff';

interface DialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly width?: string;
  /** Replaces the body's padding and height limit, for a dialog that lays itself out. */
  readonly bodyClassName?: string;
  /** Window commands may replace information; editing forms retain their local work. */
  readonly allowCommandHandoff?: boolean;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'w-[520px]',
  bodyClassName,
  allowCommandHandoff = false,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const dialog = dialogRef.current;
    const handOff = () => onCloseRef.current();
    let backwards = false;
    const ends = () => {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      return { first: focusable?.[0], last: focusable?.[focusable.length - 1] };
    };
    if (allowCommandHandoff) dialog?.addEventListener(MODAL_HANDOFF_EVENT, handOff);

    const handleKeyDown = (event: KeyboardEvent) => {
      // Candidate selection belongs to the input method while composing.
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      backwards = event.shiftKey;

      const { first, last } = ends();
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    /*
      The browser's own Tab order is not ours to assume. Safari, by default,
      skips buttons and links ("Press Tab to highlight each item" is off), so
      Tab never reached the last button the keydown check waits for: it left
      the Settings dialog after its last text field and walked the page behind
      the modal — the title, the board, the engine selector (found by the
      WebKit run of accessibility.spec.ts). Wherever the browser sends focus,
      if it lands outside this dialog it comes back. Another dialog, a menu or
      a list popup opened from this one is left alone.
    */
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!dialog || !target || dialog.contains(target)) return;
      if (target.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'))
        return;
      const { first, last } = ends();
      (backwards ? last : first)?.focus();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      dialog?.removeEventListener(MODAL_HANDOFF_EVENT, handOff);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      previousFocus?.focus();
    };
  }, [open, allowCommandHandoff]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 p-3 pt-[5dvh] animate-fade-in sm:p-4 sm:pt-[10dvh]"
      onPointerDown={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'max-h-[calc(100dvh-2rem)] max-w-full overflow-hidden rounded-[var(--radius-panel)] border border-line-strong bg-surface-1 shadow-[var(--shadow-popover)] animate-rise sm:max-w-[92vw]',
          width,
        )}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line-subtle px-4 py-3">
          <div>
            <h2 id={titleId} className="text-[13px] font-semibold text-primary">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-0.5 text-2xs leading-relaxed text-tertiary">
                {description}
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="mt-0.5 text-tertiary transition-colors hover:text-primary"
          >
            <Close className="h-4 w-4" />
          </button>
        </header>

        <div
          className={
            bodyClassName ?? 'max-h-[calc(100dvh-11rem)] overflow-y-auto px-4 py-3 sm:max-h-[56vh]'
          }
        >
          {children}
        </div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line-subtle px-4 py-2.5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
