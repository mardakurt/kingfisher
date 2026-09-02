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

const VARIANTS: Record<Variant, string> = {
  ghost: 'text-secondary hover:bg-surface-3 hover:text-primary',
  subtle: 'bg-surface-2 text-primary border border-line hover:bg-surface-3',
  accent: 'bg-accent text-accent-contrast hover:bg-accent-hover font-medium',
  danger: 'text-negative hover:bg-negative/12',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 gap-1.5 px-2 text-xs',
  md: 'h-9 gap-2 px-3 text-sm',
};

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
      className={cn(
        'inline-flex shrink-0 items-center rounded-[4px] whitespace-nowrap transition-colors duration-100',
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
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] transition-colors duration-100',
        'text-secondary hover:bg-surface-3 hover:text-primary',
        'disabled:pointer-events-none disabled:opacity-35',
        active && 'bg-accent-muted text-accent',
        tone === 'danger' && 'hover:text-negative',
        className,
      )}
      {...props}
    >
      <span className="[&>svg]:h-[18px] [&>svg]:w-[18px]">{children}</span>
    </button>
  );
}
