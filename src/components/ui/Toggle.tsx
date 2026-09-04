'use client';

/**
 * A switch.
 *
 * Extracted from Settings when the data catalog needed the same control: a
 * source's row and a preference row are the same interaction, and two switches
 * that look slightly different is the sort of thing that makes an application
 * feel assembled rather than designed.
 */
export function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (value: boolean) => void;
  readonly disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-4 w-7 shrink-0 rounded-full transition-colors disabled:opacity-40"
      style={{ background: checked ? 'var(--accent)' : 'var(--border-strong)' }}
    >
      <span
        className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all"
        style={{ left: checked ? '14px' : '2px' }}
      />
    </button>
  );
}
