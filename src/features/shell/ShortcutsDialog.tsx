'use client';

import { Dialog } from '@/components/ui/Dialog';
import { ANNOTATION_HINTS, SHORTCUTS } from '@/features/command/shortcuts';
import { useUi } from '@/stores/ui-store';

const GROUPS = ['Navigation', 'Analysis', 'Editing', 'Interface'] as const;

export function ShortcutsDialog() {
  const open = useUi((state) => state.shortcutsOpen);
  const setOpen = useUi((state) => state.setShortcutsOpen);

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Keyboard shortcuts"
      description="The workspace is built to be driven from the keyboard."
      width="w-[560px]"
    >
      <div className="grid grid-cols-2 gap-x-8 gap-y-5">
        {GROUPS.map((group) => (
          <section key={group}>
            <h3 className="mb-1.5 text-2xs font-medium uppercase tracking-[0.08em] text-tertiary">
              {group}
            </h3>
            <dl className="flex flex-col gap-1">
              {SHORTCUTS.filter((shortcut) => shortcut.group === group).map((shortcut) => (
                <div key={shortcut.id} className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs text-secondary">{shortcut.label}</dt>
                  <dd>
                    <kbd className="rounded-[3px] border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-tertiary">
                      {shortcut.keys}
                    </kbd>
                  </dd>
                </div>
              ))}
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
      </div>
    </Dialog>
  );
}
