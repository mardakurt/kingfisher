'use client';

import { cn } from '@/lib/cn';

export interface TabItem<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly badge?: string;
}

interface TabsProps<T extends string> {
  readonly items: readonly TabItem<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly className?: string;
}

export function Tabs<T extends string>({ items, value, onChange, className }: TabsProps<T>) {
  return (
    <div role="tablist" className={cn('flex h-10 items-stretch gap-0', className)}>
      {items.map((item, index) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === 'ArrowRight') next = (index + 1) % items.length;
              else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = items.length - 1;
              else return;

              event.preventDefault();
              const target = items[next];
              if (!target) return;
              onChange(target.id);
              const buttons = event.currentTarget.parentElement?.querySelectorAll('button');
              buttons?.[next]?.focus();
            }}
            className={cn(
              'relative flex min-w-0 shrink-0 items-center gap-1.5 px-3 text-xs font-medium tracking-wide transition-colors',
              selected ? 'text-primary' : 'text-tertiary hover:text-secondary',
            )}
          >
            {item.label}
            {item.badge && (
              <span className="rounded-sm bg-surface-3 px-1 text-[10px] text-tertiary tabular">
                {item.badge}
              </span>
            )}
            {selected && <span className="absolute inset-x-2 bottom-0 h-px bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  readonly items: readonly TabItem<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly className?: string;
}

export function Segmented<T extends string>({
  items,
  value,
  onChange,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      className={cn(
        'inline-flex max-w-full overflow-x-auto rounded-[4px] border border-line bg-surface-2 p-0.5',
        className,
      )}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          aria-pressed={item.id === value}
          className={cn(
            'shrink-0 rounded-[3px] px-2 py-0.5 text-2xs transition-colors',
            item.id === value ? 'bg-surface-3 text-primary' : 'text-tertiary hover:text-secondary',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
