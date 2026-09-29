'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

type Variant = 'ghost' | 'subtle' | 'accent' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly size?: Size;
  readonly icon?: ReactNode;
  readonly active?: boolean;
}

const VARIANTS: Readonly<Record<Variant, string>> = {
  /*
    Press is its own state, one step past hover, on every variant.
    259 hover utilities existed against 5 press ones, so nothing in the
    application acknowledged a click between the pointer going down and the
    work arriving — on a desktop application where a click is the primary
    gesture, and on a slow one (a database query, a companion round trip)
    where the wait is exactly when a person wonders whether the press landed.
  */
  ghost: 'text-secondary hover:bg-surface-3 hover:text-primary active:bg-surface-press',
  subtle:
    'bg-surface-2 text-primary border border-line hover:bg-surface-3 active:bg-surface-press active:border-line-strong',
  accent:
    'bg-accent text-accent-contrast hover:bg-accent-hover font-medium active:bg-accent-hover active:brightness-95',
  danger: 'text-negative hover:bg-negative/12 active:bg-negative/20',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 gap-1.5 px-2 text-xs',
  md: 'h-9 gap-2 px-3 text-sm',
};

/*
  Firefox restores a form control's dynamic state — `disabled` included —
  when a page is reloaded, before React hydrates, and React does not patch an
  attribute that differs from the server's HTML. A header button disabled on
  the client ("Create a team first.") then hydrated with Firefox's restored
  state and a mismatch warning (the Firefox matrix, Phase 85).
  `autocomplete="off"` opts a control out of that restoration; a caller can
  still pass its own.
*/
const NOT_RESTORED = { autoComplete: 'off' } as const;

export function Button({
  variant = 'ghost',
  size = 'md',
  icon,
  active,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...NOT_RESTORED}
      className={cn(
        'inline-flex shrink-0 items-center rounded-[var(--radius-control)] whitespace-nowrap transition-colors duration-100',
        // A button given a width by its caller or stretched by a column keeps
        // its label on the centre line. `cn` does not merge conflicting
        // utilities, so a caller that wants a start-aligned row says so with
        // its own justify-* and the default steps aside.
        !/(?:^|\s)justify-/.test(className ?? '') && 'justify-center',
        'disabled:pointer-events-none disabled:opacity-40',
        SIZES[size],
        VARIANTS[variant],
        active && 'bg-accent-muted text-primary',
        className,
      )}
      {...props}
    >
      {icon && <span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly label: string;
  readonly active?: boolean;
  readonly tone?: 'default' | 'danger';
}

export function IconButton({
  label,
  active,
  tone = 'default',
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      {...NOT_RESTORED}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] transition-colors duration-100',
        'text-secondary hover:bg-surface-3 hover:text-primary active:bg-surface-press',
        'disabled:pointer-events-none disabled:opacity-35',
        active && 'bg-accent-muted text-accent-ink',
        tone === 'danger' && 'hover:text-negative',
        className,
      )}
      {...props}
    >
      <span className="[&>svg]:h-[18px] [&>svg]:w-[18px]">{children}</span>
    </button>
  );
}
