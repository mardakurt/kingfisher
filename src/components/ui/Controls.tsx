'use client';

/**
 * The small controls every Phase 83 page shares.
 *
 * A search field with a clear button, a segmented control, a removable filter
 * chip, a popover and a score ring — the vocabulary of the Library,
 * Preparation and Databases toolbars. One definition each, so the three pages
 * cannot drift into three dialects of the same control.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

import { Close, Search } from '@/components/icons';
import { cn } from '@/lib/cn';

// --- search field ------------------------------------------------------------

export function SearchField({
  value,
  onChange,
  onClear,
  className,
  trailing,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Defaults to emptying the field. */
  readonly onClear?: () => void;
  /** Controls inside the field's right edge, after the clear button. */
  readonly trailing?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex h-8 min-w-0 items-center gap-1.5 rounded-[8px] bg-surface-2 pl-2.5 pr-1 focus-within:ring-2 focus-within:ring-accent/40',
        className,
      )}
      data-search-field
    >
      <Search className="h-3.5 w-3.5 shrink-0 text-tertiary" aria-hidden />
      <input
        {...props}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-primary outline-none placeholder:text-tertiary [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => (onClear ? onClear() : onChange(''))}
          className="flex size-5 shrink-0 items-center justify-center rounded-full bg-tertiary/60 text-surface-1 hover:bg-tertiary"
        >
          <Close className="size-2.5" />
        </button>
      ) : null}
      {trailing}
    </div>
  );
}

// --- segmented control -------------------------------------------------------

export interface SegmentOption<T extends string> {
  readonly id: T;
  readonly label: ReactNode;
  readonly title?: string;
}

/**
 * A row of mutually exclusive choices, the selected one filled with the
 * accent. `role="radiogroup"`, so it reads as one control with one value.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  className,
}: {
  readonly options: readonly SegmentOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** The control's accessible name. */
  readonly label: string;
  readonly size?: 'sm' | 'md';
  readonly className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-[7px] bg-surface-2 p-[2px]',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title}
            onClick={() => onChange(option.id)}
            className={cn(
              'rounded-[5px] font-medium whitespace-nowrap transition-colors',
              size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-xs',
              selected
                ? 'bg-accent text-accent-contrast shadow-sm'
                : 'text-secondary hover:bg-black/[0.04] hover:text-primary dark:hover:bg-white/[0.06]',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// --- filter chip ---------------------------------------------------------------

/** One applied filter, named and removable: `Opponent  Nakamura  ×`. */
export function FilterChip({
  name,
  value,
  icon,
  onRemove,
}: {
  readonly name?: string;
  readonly value: ReactNode;
  readonly icon?: ReactNode;
  readonly onRemove: () => void;
}) {
  return (
    <span
      className="inline-flex h-6 max-w-full shrink-0 items-center gap-1.5 rounded-[6px] border border-line bg-surface-1 pl-2 pr-1 text-[11px]"
      data-filter-chip
    >
      {icon ? <span className="shrink-0 text-tertiary [&>svg]:h-3 [&>svg]:w-3">{icon}</span> : null}
      {name ? <span className="shrink-0 text-tertiary">{name}</span> : null}
      <span className="min-w-0 truncate font-medium text-primary">{value}</span>
      <button
        type="button"
        aria-label={`Remove ${name ? `${name} ` : ''}filter`}
        onClick={onRemove}
        className="flex size-4 shrink-0 items-center justify-center rounded-[4px] text-tertiary hover:bg-surface-3 hover:text-primary"
      >
        <Close className="size-2.5" />
      </button>
    </span>
  );
}

// --- popover -----------------------------------------------------------------

/**
 * A panel anchored under its trigger, dismissed by Escape or a click outside.
 *
 * For forms — the Library's filters — where a menu's roving focus would be
 * wrong. It keeps focus inside while open only in the sense that it does not
 * steal it: the first field is focused, and Tab moves on as it would anywhere.
 */
export function Popover({
  trigger,
  children,
  align = 'start',
  width = 300,
  label,
}: {
  readonly trigger: (props: {
    readonly open: boolean;
    readonly toggle: () => void;
    readonly id: string;
  }) => ReactNode;
  readonly children: ReactNode | ((close: () => void) => ReactNode);
  readonly align?: 'start' | 'end';
  readonly width?: number;
  readonly label: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    const trigger = wrapper.current?.getBoundingClientRect();
    if (trigger) setRoom(Math.max(200, window.innerHeight - trigger.bottom - 16));
    panel.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={wrapper} className="relative shrink-0">
      {trigger({ open, toggle: () => setOpen((value) => !value), id })}
      {open ? (
        <div
          ref={panel}
          role="dialog"
          aria-label={label}
          className={cn(
            'absolute top-full z-50 mt-1.5 overflow-y-auto overscroll-contain rounded-[10px] border border-line bg-surface-1 shadow-[0_12px_32px_rgb(0_0_0/0.14),0_0_0_0.5px_rgb(0_0_0/0.06)] animate-rise',
            align === 'end' ? 'right-0' : 'left-0',
          )}
          style={{ width, maxHeight: room ?? undefined }}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      ) : null}
    </div>
  );
}

/** A labelled group inside a popover: an icon, a name, the control, a hint. */
export function PopoverSection({
  icon,
  title,
  hint,
  children,
}: {
  readonly icon?: ReactNode;
  readonly title: string;
  readonly hint?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className="border-b border-line-subtle px-3.5 py-3 last:border-b-0">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary">
        {icon ? <span className="text-tertiary [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span> : null}
        {title}
      </h3>
      {children}
      {hint ? <p className="mt-1.5 text-[10.5px] leading-snug text-tertiary">{hint}</p> : null}
    </section>
  );
}

// --- score ring --------------------------------------------------------------

/**
 * Wins, draws and losses as one ring, with the score in the middle.
 *
 * The three arcs are the three counts, in proportion, so the ring cannot say
 * anything the legend beside it does not. Colours are the application's
 * positive, neutral and negative tokens.
 */
export function ScoreRing({
  wins,
  draws,
  losses,
  size = 96,
}: {
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  readonly size?: number;
}) {
  const total = wins + draws + losses;
  const score = total === 0 ? 0 : Math.round(((wins + draws / 2) / total) * 100);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const arcs = [
    { value: wins, color: 'var(--positive)' },
    { value: draws, color: 'var(--border-strong)' },
    { value: losses, color: 'var(--negative)' },
  ];
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} data-score-ring>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--surface-3)" strokeWidth="10" />
        {total > 0
          ? arcs.map((arc, index) => {
              const length = (arc.value / total) * circumference;
              const dash = (
                <circle
                  key={index}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth="10"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += length;
              return dash;
            })
          : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg leading-none font-semibold text-primary tabular">{score}%</span>
        <span className="mt-0.5 text-[10px] text-tertiary">Score</span>
      </div>
    </div>
  );
}
