'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

import { Close } from '@/components/icons';
import { cn } from '@/lib/cn';

interface DialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly width?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'w-[520px]',
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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

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
          'max-h-[calc(100dvh-2rem)] max-w-full overflow-hidden rounded-[6px] border border-line-strong bg-surface-1 shadow-2xl animate-rise sm:max-w-[92vw]',
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

        <div className="max-h-[calc(100dvh-11rem)] overflow-y-auto px-4 py-3 sm:max-h-[56vh]">
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
