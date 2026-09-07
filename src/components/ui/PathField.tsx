'use client';

/**
 * A filesystem path, typed or chosen.
 *
 * Kingfisher asks for three absolute paths — a Syzygy folder, a custom engine,
 * an En Croissant database — and until Phase 20 all three were bare text
 * fields with a placeholder like `/Users/you/syzygy/3-4-5`. In a browser that
 * is the only thing they can be: a page cannot open a file picker that returns
 * a *path*, only one that returns content, and a path is precisely what the
 * companion needs.
 *
 * In the application it was the only thing left that read as a developer tool.
 * The shell has had `chooseFile` and `chooseDirectory` since Phase 19 — both
 * implemented, both on the bridge, both typed, and called from nowhere. This
 * is what calls them.
 *
 * The rule from `src/desktop/bridge.ts` holds: the desktop does not change
 * what a field *does*, it adds a second way to fill it. The input stays, and
 * stays editable, so a path can still be pasted in either identity and every
 * test that types into it is unaffected.
 */

import { useId, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { desktop } from '@/desktop/bridge';

export interface PathFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  /** A directory rather than a file. Chooses which dialog the shell opens. */
  readonly directory?: boolean;
  /** File extensions the dialog should offer, without dots. Files only. */
  readonly extensions?: readonly string[];
  /** Title for the native dialog. Defaults to the label. */
  readonly dialogTitle?: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function PathField({
  label,
  value,
  onChange,
  placeholder,
  directory = false,
  extensions,
  dialogTitle,
  disabled,
  className,
}: PathFieldProps) {
  const id = useId();
  const [choosing, setChoosing] = useState(false);

  /*
    Resolved on render rather than captured in state.

    `desktop()` is a function for the reason its own file gives — the module is
    imported during a server render, where there is no `window` — and the
    browser must render the same markup the server did or hydration warns. The
    button is therefore absent in a browser and absent in the SSR pass, and
    appears on the desktop's first client render.
  */
  const bridge = desktop();

  const choose = async () => {
    if (!bridge) return;
    setChoosing(true);
    try {
      const choice = directory
        ? await bridge.chooseDirectory({ title: dialogTitle ?? label })
        : await bridge.chooseFile({
            title: dialogTitle ?? label,
            ...(extensions ? { extensions } : {}),
          });
      // A cancelled dialog must leave what was typed alone, not clear it.
      if (choice.canceled || !choice.path) return;
      onChange(choice.path);
    } finally {
      setChoosing(false);
    }
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-2xs text-tertiary">
        {label}
      </label>
      <div className="flex gap-1.5">
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          className="h-8 min-w-0 flex-1 rounded-[4px] border border-line bg-surface-inset px-2.5 font-mono text-[11px] text-primary outline-none placeholder:text-tertiary/60 focus:border-accent/60 disabled:opacity-40"
        />
        {bridge ? (
          <Button
            variant="subtle"
            size="sm"
            className="h-8"
            disabled={disabled || choosing}
            onClick={() => void choose()}
          >
            {choosing ? 'Choosing…' : 'Browse…'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
