'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { cn } from '@/lib/cn';
import {
  bindingFromEvent,
  conflictsWith,
  formatBinding,
  type Binding,
} from '@/features/command/bindings';
import {
  ANNOTATION_HINTS,
  SHORTCUTS,
  shortcutById,
  type ShortcutGroup,
} from '@/features/command/shortcuts';
import { useShortcuts } from '@/stores/shortcuts-store';
import { useUi } from '@/stores/ui-store';

const GROUPS: readonly ShortcutGroup[] = ['Navigation', 'Analysis', 'Editing', 'Interface'];

/**
 * The shortcut reference, and the place they are rebound.
 *
 * Reference and editor are the same screen deliberately. A separate "customise
 * shortcuts" screen is a screen nobody finds, and it guarantees the two drift:
 * the reference would go on listing the defaults while the user's own bindings
 * lived somewhere else.
 */
export function ShortcutsDialog() {
  const open = useUi((state) => state.shortcutsOpen);
  const setOpen = useUi((state) => state.setShortcutsOpen);
  const overrides = useShortcuts((state) => state.overrides);
  const setBinding = useShortcuts((state) => state.setBinding);
  const resetBinding = useShortcuts((state) => state.resetBinding);
  const resetAll = useShortcuts((state) => state.resetAll);
  const bindings = useShortcuts((state) => state.bindings)();

  const [capturing, setCapturing] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    action: string;
    binding: Binding;
    holders: readonly string[];
  } | null>(null);

  const commit = (action: string, binding: Binding) => {
    const holders = conflictsWith(bindings, action, binding);
    setCapturing(null);
    /*
      §38: never two conflicting bindings without saying so. The assignment is
      held rather than refused — a rebind dialog that only refuses gives the
      user no way to make the swap they actually intended.
    */
    if (holders.length > 0) {
      setPending({ action, binding, holders });
      return;
    }
    setBinding(action, binding);
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        setCapturing(null);
        setPending(null);
        setOpen(false);
      }}
      title="Keyboard shortcuts"
      description="The workspace is built to be driven from the keyboard. Click a binding to change it."
      width="w-[620px]"
    >
      {pending ? (
        <div
          role="alertdialog"
          aria-label="Shortcut conflict"
          className="mb-3 rounded-[5px] border border-negative/40 bg-negative/10 p-3"
        >
          <p className="text-xs text-primary">
            {formatBinding(pending.binding)} is already assigned to{' '}
            {pending.holders.map((id) => shortcutById(id)?.label ?? id).join(', ')}.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                // The other action loses the binding rather than both holding
                // it: two actions on one key means one of them never fires.
                for (const holder of pending.holders) resetBindingToNothing(holder, setBinding);
                setBinding(pending.action, pending.binding);
                setPending(null);
              }}
            >
              Replace
            </Button>
            <Button size="sm" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-x-8 gap-y-5">
        {GROUPS.map((group) => (
          <section key={group}>
            <h3 className="mb-1.5 text-2xs font-medium uppercase tracking-[0.08em] text-tertiary">
              {group}
            </h3>
            <dl className="flex flex-col gap-1">
              {SHORTCUTS.filter((shortcut) => shortcut.group === group).map((shortcut) => {
                const editable = !shortcut.mouse && !shortcut.fixed;
                const binding = bindings[shortcut.id] ?? shortcut.defaultBinding;
                const changed = overrides[shortcut.id] !== undefined;
                return (
                  <div key={shortcut.id} className="flex items-baseline justify-between gap-3">
                    <dt className="text-xs text-secondary">{shortcut.label}</dt>
                    <dd className="flex shrink-0 items-center gap-1">
                      {editable ? (
                        <button
                          type="button"
                          aria-label={`Change the shortcut for ${shortcut.label}`}
                          onClick={() => setCapturing(shortcut.id)}
                          onKeyDown={(event) => {
                            if (capturing !== shortcut.id) return;
                            if (event.key === 'Escape' || event.key === 'Tab') return;
                            event.preventDefault();
                            event.stopPropagation();
                            if (['Shift', 'Meta', 'Control', 'Alt'].includes(event.key)) return;
                            commit(shortcut.id, bindingFromEvent(event));
                          }}
                          className={cn(
                            'rounded-[3px] border px-1.5 py-0.5 font-mono text-[10px]',
                            capturing === shortcut.id
                              ? 'border-accent bg-accent/15 text-primary'
                              : 'border-line bg-surface-2 text-tertiary hover:border-line-strong hover:text-primary',
                          )}
                        >
                          {capturing === shortcut.id ? 'Press a key…' : formatBinding(binding)}
                        </button>
                      ) : (
                        <kbd className="rounded-[3px] border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-tertiary">
                          {shortcut.mouse ? shortcut.defaultBinding : formatBinding(binding)}
                        </kbd>
                      )}
                      {changed ? (
                        <button
                          type="button"
                          aria-label={`Reset the shortcut for ${shortcut.label}`}
                          onClick={() => resetBinding(shortcut.id)}
                          className="text-[10px] text-tertiary hover:text-primary"
                        >
                          ↺
                        </button>
                      ) : null}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}

        <section className="col-span-2 border-t border-line-subtle pt-4">
          <h3 className="mb-1.5 text-2xs font-medium uppercase tracking-[0.08em] text-tertiary">
            Board annotation
          </h3>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-1">
            {ANNOTATION_HINTS.map((hint) => (
              <div key={hint.keys} className="flex items-baseline justify-between gap-3">
                <dt className="text-xs text-secondary">{hint.label}</dt>
                <dd>
                  <kbd className="rounded-[3px] border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-tertiary">
                    {hint.keys}
                  </kbd>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="col-span-2 flex items-center justify-between border-t border-line-subtle pt-3">
          <p className="text-2xs text-tertiary">
            Escape always closes dialogs and leaves focus mode, and cannot be reassigned.
          </p>
          <Button size="sm" onClick={resetAll}>
            Reset all shortcuts
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Take a binding away from the action that held it.
 *
 * An emptied override rather than a reset: resetting would restore the action's
 * default, which is the very binding being taken away, so "Replace" would
 * silently leave the conflict in place.
 */
function resetBindingToNothing(
  action: string,
  setBinding: (action: string, binding: Binding) => void,
): void {
  setBinding(action, '');
}
