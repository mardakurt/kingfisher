import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface PanelProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export const Panel = ({ children, className }: PanelProps) => (
  <section className={cn('flex min-h-0 flex-col bg-surface-1', className)}>{children}</section>
);

interface PanelHeaderProps {
  readonly children: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
}

export const PanelHeader = ({ children, actions, className }: PanelHeaderProps) => (
  <header
    className={cn(
      'flex h-8 shrink-0 items-center justify-between gap-2 border-b border-line-subtle px-2.5',
      className,
    )}
  >
    <div className="flex min-w-0 items-center gap-2 text-2xs font-medium uppercase tracking-[0.08em] text-tertiary">
      {children}
    </div>
    {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
  </header>
);

export const PanelBody = ({ children, className }: PanelProps) => (
  <div className={cn('min-h-0 flex-1 overflow-y-auto', className)}>{children}</div>
);

interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}

export const EmptyState = ({ title, description, action }: EmptyStateProps) => (
  <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
    <p className="text-xs font-medium text-secondary">{title}</p>
    {description && (
      <p className="max-w-[36ch] text-2xs leading-relaxed text-tertiary">{description}</p>
    )}
    {action && <div className="mt-1">{action}</div>}
  </div>
);
